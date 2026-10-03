"""Regression tests for injecting the desktop dev version into a build tree."""

import json
import subprocess
import sys
from pathlib import Path

import pytest
import tomllib

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "apply-dev-version.py"
WORKSPACE_MANIFESTS = {
    "cortana": "Cargo.toml",
    "cortana-core": "crates/core/Cargo.toml",
    "cortana-mcp": "crates/mcp/Cargo.toml",
    "cortana-retrieval": "crates/retrieval/Cargo.toml",
    "cortana-server": "crates/server/Cargo.toml",
}


def build_tree(directory: Path) -> tuple[Path, ...]:
    conf = directory / "apps/desktop/src-tauri/tauri.conf.json"
    conf.parent.mkdir(parents=True)
    conf.write_text(
        json.dumps(
            {
                "version": "0.66.1",
                "bundle": {"active": True, "createUpdaterArtifacts": True, "targets": "all"},
            }
        )
        + "\n"
    )

    workspace_manifests = []
    for package_name, relative_path in WORKSPACE_MANIFESTS.items():
        manifest = directory / relative_path
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(f'[package]\nname = "{package_name}"\nversion = "0.66.1"\n')
        workspace_manifests.append(manifest)

    workspace_lock = directory / "Cargo.lock"
    workspace_lock.write_text(
        "".join(
            f'[[package]]\nname = "{package_name}"\n'
            'version = "0.66.1" # x-release-please-version\n\n'
            for package_name in WORKSPACE_MANIFESTS
        )
        + '[[package]]\nname = "unrelated-package"\nversion = "1.2.3"\n'
    )

    desktop_manifest = directory / "apps/desktop/src-tauri/Cargo.toml"
    desktop_manifest.write_text('[package]\nname = "cortana-desktop"\nversion = "0.66.1"\n')
    desktop_lock = directory / "apps/desktop/src-tauri/Cargo.lock"
    desktop_lock.write_text(
        '[[package]]\nname = "cortana-desktop"\n'
        'version = "0.66.1" # x-release-please-version\n'
        'dependencies = ["cortana-core"]\n\n'
        '[[package]]\nname = "cortana-core"\nversion = "0.66.1"\n\n'
        '[[package]]\nname = "unrelated-package"\nversion = "1.2.3"\n'
    )
    return (
        conf,
        *workspace_manifests,
        workspace_lock,
        desktop_manifest,
        desktop_lock,
    )


def run_version_override(directory: Path, version: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), version],
        cwd=directory,
        capture_output=True,
        check=False,
        text=True,
    )


def test_dev_override_preserves_semver_and_sets_numeric_msi_version(tmp_path: Path) -> None:
    files = build_tree(tmp_path)
    conf_path = files[0]
    workspace_manifests = files[1 : 1 + len(WORKSPACE_MANIFESTS)]
    workspace_lock, desktop_manifest, desktop_lock = files[-3:]

    result = run_version_override(tmp_path, "0.66.0-dev.4")

    assert result.returncode == 0, result.stderr
    conf = json.loads(conf_path.read_text())
    assert conf["version"] == "0.66.0-dev.4"
    assert conf["bundle"]["windows"]["wix"]["version"] == "0.66.0.4"
    assert conf["bundle"]["targets"] == "all"
    for manifest in [*workspace_manifests, desktop_manifest]:
        assert tomllib.loads(manifest.read_text())["package"]["version"] == "0.66.0-dev.4"
    for lock in (workspace_lock, desktop_lock):
        lock_text = lock.read_text()
        assert 'name = "cortana-core"\nversion = "0.66.0-dev.4"' in lock_text
        assert 'version = "1.2.3"' in lock_text
    assert 'name = "cortana"\nversion = "0.66.0-dev.4" # x-release-please-version' in (
        workspace_lock.read_text()
    )
    assert 'name = "cortana-desktop"\nversion = "0.66.0-dev.4" # x-release-please-version' in (
        desktop_lock.read_text()
    )


def test_dev_counter_at_msi_limit_is_accepted(tmp_path: Path) -> None:
    conf_path = build_tree(tmp_path)[0]

    result = run_version_override(tmp_path, "0.66.0-dev.65535")

    assert result.returncode == 0, result.stderr
    conf = json.loads(conf_path.read_text())
    assert conf["version"] == "0.66.0-dev.65535"
    assert conf["bundle"]["windows"]["wix"]["version"] == "0.66.0.65535"


@pytest.mark.parametrize(
    ("version", "error"),
    [
        ("0.66.0-dev.65536", "MSI dev counter version component must be at most 65535"),
        ("0.66.1", "version must have the form"),
    ],
)
def test_invalid_override_fails_before_mutating_build_inputs(
    tmp_path: Path, version: str, error: str
) -> None:
    files = build_tree(tmp_path)
    original = tuple(path.read_bytes() for path in files)

    result = run_version_override(tmp_path, version)

    assert result.returncode != 0
    assert error in result.stderr
    assert tuple(path.read_bytes() for path in files) == original
