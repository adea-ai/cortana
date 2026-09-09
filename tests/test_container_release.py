"""Release evidence and BuildKit diagnostics must fail closed on missing data."""

import copy
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "container_release", ROOT / "scripts/container_release.py"
)
assert SPEC and SPEC.loader
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
PLATFORMS = {"linux/amd64", "linux/arm64"}


def digest(number: int) -> str:
    return "sha256:" + f"{number:064x}"


def image_index() -> dict:
    manifests = []
    for number, arch in enumerate(("amd64", "arm64"), 1):
        manifests.append(
            {"digest": digest(number), "platform": {"os": "linux", "architecture": arch}}
        )
        manifests.append(
            {
                "digest": digest(number + 10),
                "platform": {"os": "unknown", "architecture": "unknown"},
                "annotations": {
                    "vnd.docker.reference.type": "attestation-manifest",
                    "vnd.docker.reference.digest": digest(number),
                },
            }
        )
    return {"schemaVersion": 2, "manifests": manifests}


class EvidenceTests(unittest.TestCase):
    def test_both_platforms_and_linked_attestations(self):
        release.verify_index(image_index(), PLATFORMS)

    def test_single_platform_index(self):
        index = image_index()
        index["manifests"] = index["manifests"][:2]
        release.verify_index(index, {"linux/amd64"})

    def test_missing_architecture(self):
        index = image_index()
        index["manifests"] = index["manifests"][:2]
        with self.assertRaisesRegex(ValueError, "Missing runnable"):
            release.verify_index(index, PLATFORMS)

    def test_unexpected_architecture(self):
        index = image_index()
        index["manifests"][0]["platform"]["architecture"] = "386"
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            release.verify_index(index, PLATFORMS)

    def test_duplicate_platform(self):
        index = image_index()
        index["manifests"].append(copy.deepcopy(index["manifests"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            release.verify_index(index, PLATFORMS)

    def test_attestation_cannot_point_to_other_image(self):
        index = image_index()
        index["manifests"][1]["annotations"]["vnd.docker.reference.digest"] = digest(99)
        with self.assertRaises(ValueError):
            release.verify_index(index, PLATFORMS)

    def test_unknown_platform_is_not_enough_without_annotations(self):
        index = image_index()
        index["manifests"][1].pop("annotations")
        with self.assertRaises(ValueError):
            release.verify_index(index, PLATFORMS)

    def test_invalid_digest(self):
        index = image_index()
        index["manifests"][0]["digest"] = "sha256:invalid"
        with self.assertRaisesRegex(ValueError, "Invalid manifest"):
            release.verify_index(index, PLATFORMS)

    def test_missing_index(self):
        with self.assertRaisesRegex(ValueError, "Expected an OCI index"):
            release.verify_index({"schemaVersion": 2}, PLATFORMS)

    def test_verifies_both_predicates(self):
        provenance = {
            p: {"SLSA": {"buildType": "https://mobyproject.org/buildkit@v1"}} for p in PLATFORMS
        }
        sbom = {p: {"SPDX": {"spdxVersion": "SPDX-2.3"}} for p in PLATFORMS}
        release.verify_evidence(provenance, sbom, PLATFORMS)
        for missing in PLATFORMS:
            with self.assertRaisesRegex(ValueError, "SBOM"):
                release.verify_evidence(
                    provenance, {p: v for p, v in sbom.items() if p != missing}, PLATFORMS
                )
            with self.assertRaisesRegex(ValueError, "provenance"):
                release.verify_evidence(
                    {p: v for p, v in provenance.items() if p != missing}, sbom, PLATFORMS
                )

    def test_single_platform_slsa_v1(self):
        release.verify_evidence(
            {"SLSA": {"buildDefinition": {"buildType": "https://mobyproject.org/buildkit@v1"}}},
            {"SPDX": {"spdxVersion": "SPDX-2.3"}},
            {"linux/amd64"},
        )

    def test_single_platform_manifest_digest_is_inspectable(self):
        manifest = {
            "schemaVersion": 2,
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "config": {"digest": digest(30), "size": 10},
            "layers": [{"digest": digest(31), "size": 100}],
        }
        with patch.object(release.subprocess, "run") as run:
            run.return_value = release.subprocess.CompletedProcess([], 0, json.dumps(manifest))
            release.inspect_image("ghcr.io/example/image@" + digest(20), {"linux/amd64"})
            run.assert_called_once()

    def test_inspection_rejects_mutable_tag_without_running_docker(self):
        with patch.object(release.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "immutable"):
                release.inspect_image("ghcr.io/example/image:latest", PLATFORMS)
            run.assert_not_called()

    def test_remote_inspection_fetches_actual_predicates(self):
        values = [
            image_index(),
            {p: {"SLSA": {"buildType": "buildkit"}} for p in PLATFORMS},
            {p: {"SPDX": {"spdxVersion": "SPDX-2.3"}} for p in PLATFORMS},
        ]
        with patch.object(release.subprocess, "run") as run:
            run.side_effect = [
                release.subprocess.CompletedProcess([], 0, json.dumps(value)) for value in values
            ]
            release.inspect_image("ghcr.io/example/image@" + digest(20), PLATFORMS)
            self.assertEqual(run.call_count, 3)
            self.assertEqual(run.call_args_list[-1].args[0][-1], "{{json .SBOM}}")


class TimingTests(unittest.TestCase):
    def test_incremental_vertices_cache_hits_and_overlapping_architectures(self):
        events = [
            {
                "digest": "a",
                "name": "[linux/amd64 rust-builder 4/4] RUN cargo",
                "started": "2026-09-08T12:00:00Z",
            },
            {"vertex": "a", "data": "a log message"},
            {"id": "download", "vertex": "a", "current": 2, "total": 3},
            {"digest": "a", "completed": "2026-09-08T12:00:10Z"},
            {
                "digest": "b",
                "name": "[linux/arm64 rust-builder 4/4] RUN cargo",
                "started": "2026-09-08T12:00:00Z",
                "completed": "2026-09-08T12:00:20Z",
            },
            {
                "digest": "c",
                "name": "[web-builder 3/6] RUN bun install",
                "started": "2026-09-08T12:00:00Z",
                "completed": "2026-09-08T12:00:01Z",
                "cached": True,
            },
        ]
        report = release.summarize_progress([json.dumps(event) for event in events], 21)
        self.assertEqual(report["wall_seconds"], 21)
        self.assertEqual(report["stages"]["linux/amd64:rust-builder"]["work_seconds"], 10)
        self.assertEqual(report["stages"]["linux/arm64:rust-builder"]["work_seconds"], 20)
        self.assertEqual(report["stages"]["web-builder"]["cached"], 1)
        self.assertEqual(report["stages"]["web-builder"]["work_seconds"], 0)
        self.assertEqual(len(report["steps"]), 3)

    def test_history_record_statuses_are_summarized(self):
        record = {
            "vertexes": [
                {"digest": "sha256:a", "name": "[runtime 1/1] RUN pip"},
                {"digest": "sha256:b", "name": "exporting to image"},
            ],
            "statuses": [
                {
                    "vertex": "sha256:a",
                    "started": "2026-09-08T12:00:00Z",
                    "completed": "2026-09-08T12:00:04Z",
                },
                {
                    "vertex": "sha256:b",
                    "started": "2026-09-08T12:00:03Z",
                    "completed": "2026-09-08T12:00:05Z",
                },
            ],
        }
        report = release.summarize_progress([json.dumps(record)], 5)
        self.assertEqual(report["stages"]["runtime"]["work_seconds"], 4)
        self.assertEqual(report["stages"]["export"]["work_seconds"], 2)
        self.assertEqual(len(report["steps"]), 2)

    def test_cache_export_and_incomplete_vertex(self):
        events = [
            {
                "digest": "a",
                "name": "exporting cache to GitHub Actions Cache",
                "started": "2026-09-08T12:00:00Z",
                "completed": "2026-09-08T12:00:02Z",
            },
            {
                "digest": "b",
                "name": "[runtime 4/5] RUN pip",
                "started": "2026-09-08T12:00:00Z",
            },
        ]
        report = release.summarize_progress([json.dumps(event) for event in events], 3)
        self.assertEqual(report["stages"]["cache-export"]["work_seconds"], 2)
        self.assertEqual(len(report["steps"]), 1)

    def test_invalid_wall_time(self):
        for seconds in (-1, float("nan"), float("inf")):
            with self.subTest(seconds=seconds), self.assertRaises(ValueError):
                release.summarize_progress([], seconds)

    def test_empty_or_malformed_logs_fail(self):
        for lines in ([], ["not json"], ['{"foo":"bar"}']):
            with self.subTest(lines=lines), self.assertRaises(ValueError):
                release.summarize_progress(lines, 1)

    def test_negative_vertex_duration_fails(self):
        event = {
            "digest": "a",
            "started": "2026-09-08T12:00:02Z",
            "completed": "2026-09-08T12:00:00Z",
        }
        with self.assertRaisesRegex(ValueError, "Negative"):
            release.summarize_progress([json.dumps(event)], 1)


class SizeTests(unittest.TestCase):
    def test_nested_oci_index_and_per_platform_blob_sizes(self):
        nested = image_index()
        objects = {
            "index.json": {"manifests": [{"digest": digest(100)}]},
            "blobs/sha256/" + digest(100)[7:]: nested,
        }
        for descriptor in nested["manifests"]:
            objects["blobs/sha256/" + descriptor["digest"][7:]] = {
                "config": {"digest": digest(90), "size": 10},
                "layers": [{"digest": digest(91), "size": 100}],
            }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "image.tar"
            with tarfile.open(path, "w") as archive:
                for name, value in objects.items():
                    data = json.dumps(value).encode()
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
            report = release.image_sizes(path)
            self.assertEqual(report["image_blob_bytes"], {p: 110 for p in PLATFORMS})
            self.assertEqual(report["oci_archive_bytes"], path.stat().st_size)


class ConfigurationTests(unittest.TestCase):
    def test_native_runners_and_gated_promotion(self):
        workflow = (ROOT / ".github/workflows/container.yml").read_text()
        build, publish = workflow.split("  publish:\n")
        self.assertIn("runner: ubuntu-24.04-arm", build)
        self.assertIn("runner: ubuntu-24.04\n", build)
        self.assertNotIn("setup-qemu", build)
        self.assertIn("push-by-digest=true", build)
        self.assertIn("needs: image", publish)
        conformance = build.split("      - name: Run self-hosted provider conformance\n")[1].split(
            "      - name:"
        )[0]
        self.assertNotIn("if:", conformance)
        self.assertNotIn("continue-on-error", conformance)
        self.assertIn("CORTANA_CONFORMANCE_IMAGE:", conformance)
        self.assertLess(publish.index("verify --index"), publish.index('--tag "$IMAGE:latest"'))
        self.assertLess(
            publish.index('verify --image "$IMAGE@$DIGEST"'),
            publish.index('Path("release-image.json")'),
        )

    def test_container_trigger_only_covers_image_inputs(self):
        workflow = (ROOT / ".github/workflows/container.yml").read_text()
        pull_request_paths = workflow.split("    paths:\n", 1)[1].split("  push:\n", 1)[0]
        self.assertIn("      - .github/workflows/container.yml", pull_request_paths)
        self.assertNotIn("container*.yml", pull_request_paths)
        self.assertNotIn("tests/test_", pull_request_paths)
        self.assertNotIn("uv.lock", pull_request_paths)
        self.assertNotIn("scripts/container_release.py", pull_request_paths)
        self.assertNotIn("apps/desktop", pull_request_paths)

    def test_caches_and_benchmark_do_not_publish_or_grow_per_ref(self):
        workflow = (ROOT / ".github/workflows/container.yml").read_text()
        benchmark = (ROOT / ".github/workflows/container-benchmark.yml").read_text()
        self.assertNotIn("cache-to:", workflow)
        self.assertIn("scope=container-native-v1-${{ matrix.arch }}", workflow)
        self.assertIn("inputs.cache == 'cold'", benchmark)
        self.assertIn("github.event.repository.default_branch", benchmark)
        self.assertIn("push: false", benchmark)
        self.assertIn("provenance: mode=max", benchmark)
        self.assertIn("sbom: true", benchmark)
        self.assertNotIn("packages: write", benchmark)
        self.assertIn("retention-days: 7", benchmark)
        self.assertIn("2> reports/build.jsonl", benchmark)

    def test_web_platform_and_late_version_metadata(self):
        dockerfile = (ROOT / "Dockerfile").read_text()
        self.assertIn("FROM --platform=$BUILDPLATFORM oven/bun:1.4.0-slim AS bun-runtime", dockerfile)
        self.assertIn("FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web-builder", dockerfile)
        self.assertNotIn("COPY apps/desktop/package.json", dockerfile)
        dockerignore = (ROOT / ".dockerignore").read_text()
        self.assertIn("apps/desktop/*", dockerignore)
        self.assertIn("!apps/desktop/package.json", dockerignore)
        self.assertLess(dockerfile.index("pip install"), dockerfile.index("ARG CORTANA_VERSION"))
        self.assertIn("id=cargo-registry-${TARGETARCH}", dockerfile)
        self.assertIn("mkdir -p cargo-skeleton/src", dockerfile)
        self.assertIn("[workspace]", dockerfile)
        self.assertIn("cargo build --release --locked --bin cortana", dockerfile)
        self.assertNotIn("id=cargo-target-${TARGETARCH}", dockerfile)
        self.assertIn("USER 10001:10001", dockerfile)
        self.assertIn("bun install --frozen-lockfile", dockerfile)


if __name__ == "__main__":
    unittest.main()
