"""Inject a dev version into the desktop build inputs.

Dev releases carry tag versions the app source never names (v0.65.3-dev.7
while Cargo.toml still says 0.65.3 until the next Release Please bump). The
bundler names artifacts and the updater manifest from the configured version,
so the build inputs must agree with the tag or the manifest references assets
that do not exist. Applied to a throwaway checkout by the dev build lane
(`dev-build.yml` dispatches `release-assets.yml` with `version_override`);
never run on a committed tree.
"""

import json
import re
import sys
from pathlib import Path

CONF = Path("apps/desktop/src-tauri/tauri.conf.json")
CARGO_TOML = Path("apps/desktop/src-tauri/Cargo.toml")
CARGO_LOCK = Path("apps/desktop/src-tauri/Cargo.lock")
PACKAGE_NAME = "cortana-desktop"
DEV_VERSION = re.compile(
    r"(?P<major>0|[1-9][0-9]*)\."
    r"(?P<minor>0|[1-9][0-9]*)\."
    r"(?P<patch>0|[1-9][0-9]*)-dev\."
    r"(?P<build>0|[1-9][0-9]*)"
)
MSI_COMPONENT_LIMITS = (255, 255, 65_535, 65_535)


def msi_version_for_dev(version: str) -> str:
    """Map a dev SemVer to a valid four-part MSI version without changing app identity."""
    match = DEV_VERSION.fullmatch(version)
    if match is None:
        raise ValueError("version must have the form <major>.<minor>.<patch>-dev.<number>")

    components = tuple(int(match[name]) for name in ("major", "minor", "patch", "build"))
    for name, component, maximum in zip(
        ("major", "minor", "patch", "dev counter"), components, MSI_COMPONENT_LIMITS, strict=True
    ):
        if component > maximum:
            raise ValueError(f"MSI {name} version component must be at most {maximum}")
    return ".".join(str(component) for component in components)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: apply-dev-version.py <version>", file=sys.stderr)
        return 1
    version = sys.argv[1]
    try:
        msi_version = msi_version_for_dev(version)
    except ValueError as error:
        print(f"invalid dev version: {error}", file=sys.stderr)
        return 1

    conf = json.loads(CONF.read_text())
    conf["version"] = version
    # Tauri keeps the app SemVer here and uses WixConfig.version only for MSI.
    wix = conf.setdefault("bundle", {}).setdefault("windows", {}).setdefault("wix", {})
    wix["version"] = msi_version
    CONF.write_text(json.dumps(conf, indent=2) + "\n")

    out: list[str] = []
    in_package = False
    for line in CARGO_TOML.read_text().splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("["):
            in_package = stripped == "[package]"
        if in_package and stripped.startswith("version ="):
            line = f'version = "{version}"\n'
        out.append(line)
    CARGO_TOML.write_text("".join(out))

    out = []
    in_package_entry = False
    name_matched = False
    for line in CARGO_LOCK.read_text().splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("[["):
            in_package_entry = True
            name_matched = False
        elif stripped.startswith("["):
            in_package_entry = False
        if in_package_entry and stripped.startswith("name ="):
            name_matched = stripped == f'name = "{PACKAGE_NAME}"'
        if in_package_entry and name_matched and stripped.startswith("version ="):
            line = f'version = "{version}"\n'
        out.append(line)
    CARGO_LOCK.write_text("".join(out))

    print(
        f"Applied dev version {version} (MSI {msi_version}) to "
        f"{CONF.name}, {CARGO_TOML.name}, {CARGO_LOCK.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
