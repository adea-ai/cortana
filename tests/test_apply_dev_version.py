"""Regression tests for injecting the desktop dev version into a build tree."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "apply-dev-version.py"


def build_tree(directory: Path) -> tuple[Path, Path, Path]:
    conf = directory / "apps/desktop/src-tauri/tauri.conf.json"
    cargo_toml = directory / "apps/desktop/src-tauri/Cargo.toml"
    cargo_lock = directory / "apps/desktop/src-tauri/Cargo.lock"
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
    cargo_toml.write_text('[package]\nname = "cortana-desktop"\nversion = "0.66.1"\n')
    cargo_lock.write_text(
        '[[package]]\nname = "cortana-desktop"\nversion = "0.66.1"\n\n'
        '[[package]]\nname = "unrelated-package"\nversion = "1.2.3"\n'
    )
    return conf, cargo_toml, cargo_lock


def run_version_override(directory: Path, version: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), version],
        cwd=directory,
        capture_output=True,
        check=False,
        text=True,
    )


def test_dev_override_preserves_semver_and_sets_numeric_msi_version(tmp_path: Path) -> None:
    conf_path, cargo_toml, cargo_lock = build_tree(tmp_path)

    result = run_version_override(tmp_path, "0.66.0-dev.4")

    assert result.returncode == 0, result.stderr
    conf = json.loads(conf_path.read_text())
    assert conf["version"] == "0.66.0-dev.4"
    assert conf["bundle"]["windows"]["wix"]["version"] == "0.66.0.4"
    assert conf["bundle"]["targets"] == "all"
    assert 'version = "0.66.0-dev.4"' in cargo_toml.read_text()
    assert 'version = "0.66.0-dev.4"' in cargo_lock.read_text()
    assert 'version = "1.2.3"' in cargo_lock.read_text()


def test_dev_counter_at_msi_limit_is_accepted(tmp_path: Path) -> None:
    conf_path, _, _ = build_tree(tmp_path)

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
