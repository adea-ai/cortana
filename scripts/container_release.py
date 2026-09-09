#!/usr/bin/env python3
"""Measure BuildKit vertices and verify published multi-platform release evidence."""

import argparse
import json
import math
import os
import re
import subprocess
import tarfile
from datetime import datetime
from pathlib import Path

DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
STAGE = re.compile(r"\[(?:(linux/\S+)\s+)?([\w.-]+)\s+\d+/\d+\]")
MANIFEST_MEDIA_TYPES = {
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
}


def verify_index(index: dict, platforms: set[str]) -> None:
    """Require exactly the expected runnable platforms and linked attestations."""
    if (
        not isinstance(index, dict)
        or index.get("schemaVersion") != 2
        or not isinstance(index.get("manifests"), list)
    ):
        raise ValueError("Expected an OCI index or Docker manifest list")
    runnable = {}
    attested = set()
    for manifest in index["manifests"]:
        if not isinstance(manifest, dict):
            raise ValueError("Invalid manifest descriptor")
        digest = manifest.get("digest", "")
        if not DIGEST.fullmatch(digest):
            raise ValueError("Invalid manifest digest")
        annotations = manifest.get("annotations", {})
        if not isinstance(annotations, dict):
            raise ValueError("Invalid manifest annotations")
        if annotations.get("vnd.docker.reference.type") == "attestation-manifest":
            subject = annotations.get("vnd.docker.reference.digest", "")
            if not DIGEST.fullmatch(subject):
                raise ValueError("Invalid attestation subject")
            attested.add(subject)
            continue
        platform = manifest.get("platform", {})
        if not isinstance(platform, dict):
            raise ValueError("Invalid manifest platform")
        name = f"{platform.get('os', '')}/{platform.get('architecture', '')}"
        if name not in platforms or name in runnable:
            raise ValueError(f"Unexpected or duplicate runnable platform: {name}")
        runnable[name] = digest
    if set(runnable) != platforms:
        raise ValueError(f"Missing runnable platforms: {platforms - set(runnable)}")
    if not set(runnable.values()) <= attested:
        raise ValueError("A runnable manifest has no linked attestation")
    if not attested <= set(runnable.values()):
        raise ValueError("Attestation references an unknown runnable manifest")


def verify_manifest(manifest: dict) -> None:
    """Validate a single-platform manifest returned for a platform digest."""
    if (
        not isinstance(manifest, dict)
        or manifest.get("schemaVersion") != 2
        or manifest.get("mediaType") not in MANIFEST_MEDIA_TYPES
        or not isinstance(manifest.get("config"), dict)
        or not isinstance(manifest.get("layers"), list)
    ):
        raise ValueError("Expected a single-platform OCI image manifest")
    config = manifest["config"]
    if not DIGEST.fullmatch(config.get("digest", "")):
        raise ValueError("Invalid image config digest")
    for layer in manifest["layers"]:
        if not isinstance(layer, dict) or not DIGEST.fullmatch(layer.get("digest", "")):
            raise ValueError("Invalid image layer digest")


def verify_evidence(provenance: dict, sbom: dict, platforms: set[str]) -> None:
    """Check fetched predicates, not merely the presence of unknown/unknown entries."""
    if not isinstance(provenance, dict) or not isinstance(sbom, dict):
        raise ValueError("Invalid attestation response")
    for platform in platforms:
        # Buildx returns direct predicates for a single-platform image.
        slsa = (
            provenance
            if len(platforms) == 1 and "SLSA" in provenance
            else provenance.get(platform, {})
        )
        spdx = sbom if len(platforms) == 1 and "SPDX" in sbom else sbom.get(platform, {})
        if not isinstance(slsa, dict) or not isinstance(spdx, dict):
            raise ValueError(f"Missing attestation payload for {platform}")
        predicate = slsa.get("SLSA")
        if not isinstance(predicate, dict) or not (
            predicate.get("buildType") or predicate.get("buildDefinition", {}).get("buildType")
        ):
            raise ValueError(f"Missing SLSA provenance for {platform}")
        document = spdx.get("SPDX")
        if not isinstance(document, dict) or not str(document.get("spdxVersion", "")).startswith(
            "SPDX-"
        ):
            raise ValueError(f"Missing SPDX SBOM for {platform}")


def inspect_image(image: str, platforms: set[str]) -> None:
    if "@" not in image or not DIGEST.fullmatch(image.rsplit("@", 1)[1]):
        raise ValueError("Verification requires an immutable image@sha256 reference")

    def inspect(*arguments: str) -> dict:
        result = subprocess.run(
            ["docker", "buildx", "imagetools", "inspect", image, *arguments],
            check=True,
            capture_output=True,
            text=True,
            timeout=180,
        )
        return json.loads(result.stdout)

    raw = inspect("--raw")
    if not isinstance(raw, dict):
        raise ValueError("Expected an OCI image response")
    if "manifests" in raw:
        verify_index(raw, platforms)
        verify_evidence(
            inspect("--format", "{{json .Provenance}}"),
            inspect("--format", "{{json .SBOM}}"),
            platforms,
        )
    elif len(platforms) == 1:
        # Registry APIs return the child manifest for image@platform-digest;
        # attestations are linked only by the eventual multi-platform index.
        verify_manifest(raw)
    else:
        raise ValueError("Expected an OCI index or Docker manifest list")


def timestamp(value: str) -> float:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def _merge_progress_event(vertices: dict, event: dict) -> None:
    identifier = event.get("digest") or event.get("vertex")
    if not identifier:
        return
    vertex = vertices.setdefault(identifier, {})
    if event.get("name") and not vertex.get("name"):
        vertex["name"] = event["name"]
    if "cached" in event:
        vertex["cached"] = bool(vertex.get("cached")) or bool(event["cached"])
    if "error" in event:
        vertex["error"] = event["error"]
    for bound in ("started", "completed"):
        value = event.get(bound)
        if not value:
            continue
        previous = vertex.get(bound)
        if not previous:
            vertex[bound] = value
        elif bound == "started":
            vertex[bound] = value if timestamp(value) < timestamp(previous) else previous
        else:
            vertex[bound] = value if timestamp(value) > timestamp(previous) else previous


def _progress_vertices(lines: list[str]) -> dict:
    vertices = {}
    for line in lines:
        if not line.strip():
            continue
        event = json.loads(line)
        if not isinstance(event, dict):
            continue
        if isinstance(event.get("vertexes"), list):
            for vertex in event["vertexes"]:
                if isinstance(vertex, dict):
                    _merge_progress_event(vertices, vertex)
            statuses = event.get("statuses", [])
            if isinstance(statuses, list):
                for status in statuses:
                    if isinstance(status, dict):
                        _merge_progress_event(vertices, status)
        else:
            _merge_progress_event(vertices, event)
    return vertices


def summarize_progress(lines: list[str], wall_seconds: float) -> dict:
    """Summarize Buildx history JSON and raw progress event streams."""
    if not math.isfinite(wall_seconds) or wall_seconds < 0:
        raise ValueError("Wall time must be finite and nonnegative")
    vertices = _progress_vertices(lines)
    if not vertices:
        raise ValueError("No BuildKit vertices found in progress log")
    stages = {}
    steps = []
    for vertex in vertices.values():
        name = vertex.get("name", "")
        if not vertex.get("started") or not vertex.get("completed"):
            continue
        started = timestamp(vertex["started"])
        completed = timestamp(vertex["completed"])
        if completed < started:
            raise ValueError(f"Negative duration: {name}")
        match = STAGE.search(name)
        if match:
            stage = ":".join(part for part in match.groups() if part)
        elif "exporting cache" in name:
            stage = "cache-export"
        else:
            stage = "export" if "exporting" in name else "internal"
        row = stages.setdefault(stage, {"work_seconds": 0.0, "cached": 0, "executed": 0})
        cached = bool(vertex.get("cached"))
        elapsed = completed - started
        row["cached" if cached else "executed"] += 1
        if not cached:
            row["work_seconds"] += elapsed
        steps.append(
            {
                "name": name,
                "seconds": round(elapsed, 3),
                "cached": cached,
                "error": vertex.get("error"),
            }
        )
    if not steps:
        raise ValueError("No completed BuildKit vertices found in progress log")
    for row in stages.values():
        row["work_seconds"] = round(row["work_seconds"], 3)
    return {
        "schema_version": 1,
        "wall_seconds": round(wall_seconds, 3),
        "stages": stages,
        "steps": steps,
    }


def write_timings(args: argparse.Namespace) -> None:
    report = summarize_progress(
        args.log.read_text().splitlines(),
        float(args.finished.read_text()) - float(args.started.read_text()),
    )
    report.update(
        {
            "strategy": args.strategy,
            "platforms": args.platforms,
            "dockerfile": args.dockerfile,
            "cache_requested": args.cache,
            "sha": os.environ.get("GITHUB_SHA"),
            "ref": os.environ.get("GITHUB_REF"),
            "run_id": os.environ.get("GITHUB_RUN_ID"),
            "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        }
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    summary = [
        f"## Container build: {args.strategy} / {args.platforms} / {args.cache}",
        f"\nBuild action wall time (including cache export): **{report['wall_seconds']:.1f}s**.",
        "\nStage work can overlap; its sum is not build wall time. "
        "Warm is a request, not proof of a cache hit.",
        "\n| Stage | Active work (s) | Cached vertices | Executed vertices |",
        "| --- | ---: | ---: | ---: |",
    ]
    for stage, row in sorted(report["stages"].items()):
        summary.append(
            f"| {stage} | {row['work_seconds']:.1f} | {row['cached']} | {row['executed']} |"
        )
    markdown = "\n".join(summary) + "\n"
    args.output.with_suffix(".md").write_text(markdown)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
            stream.write(markdown)


def image_sizes(archive_path: Path) -> dict:
    """Measure unique compressed layer/config bytes per exported runnable platform."""
    sizes = {}
    with tarfile.open(archive_path) as archive:

        def read_json(name: str) -> dict:
            stream = archive.extractfile(name)
            if stream is None:
                raise ValueError(f"Missing OCI object: {name}")
            with stream:
                return json.load(stream)

        def visit(index: dict) -> None:
            for descriptor in index.get("manifests", []):
                digest = descriptor.get("digest", "")
                if not DIGEST.fullmatch(digest):
                    raise ValueError("Invalid OCI descriptor digest")
                manifest = read_json("blobs/" + digest.replace(":", "/"))
                if "manifests" in manifest:
                    visit(manifest)
                    continue
                platform = descriptor.get("platform", {})
                if platform.get("os") != "linux":
                    continue
                name = f"linux/{platform['architecture']}"
                blobs = {item["digest"]: item["size"] for item in manifest["layers"]}
                blobs[manifest["config"]["digest"]] = manifest["config"]["size"]
                sizes[name] = sum(blobs.values())

        visit(read_json("index.json"))
    if not sizes:
        raise ValueError("No runnable images found in OCI archive")
    return {"oci_archive_bytes": archive_path.stat().st_size, "image_blob_bytes": sizes}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    verify = commands.add_parser("verify")
    source = verify.add_mutually_exclusive_group(required=True)
    source.add_argument("--image")
    source.add_argument("--index", type=Path)
    verify.add_argument("--platforms", default="linux/amd64,linux/arm64")
    timings = commands.add_parser("timings")
    timings.add_argument("--log", type=Path, required=True)
    timings.add_argument("--started", type=Path, required=True)
    timings.add_argument("--finished", type=Path, required=True)
    timings.add_argument("--output", type=Path, required=True)
    timings.add_argument("--platforms", required=True)
    timings.add_argument("--strategy", choices=("native", "qemu"), required=True)
    timings.add_argument("--dockerfile", choices=("baseline", "current"), default="current")
    timings.add_argument("--cache", choices=("cold", "warm"), required=True)
    size = commands.add_parser("sizes")
    size.add_argument("--oci", type=Path, required=True)
    size.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "timings":
        write_timings(args)
    elif args.command == "sizes":
        args.output.write_text(json.dumps(image_sizes(args.oci), indent=2) + "\n")
    elif args.image:
        inspect_image(args.image, set(args.platforms.split(",")))
    else:
        verify_index(json.loads(args.index.read_text()), set(args.platforms.split(",")))


if __name__ == "__main__":
    main()
