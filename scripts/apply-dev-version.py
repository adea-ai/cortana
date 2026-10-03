"""Inject a dev version into the desktop build inputs.

Dev releases carry tag versions the app source never names (v0.65.3-dev.7
while release source files still say 0.65.3). The core and desktop binaries,
bundler artifacts, and updater manifest must all agree with the tag. The
connector wheel is a separate PEP 440 package and retains its own version.
Applied to a throwaway checkout by the dev build lane (`dev-build.yml`
dispatches `release-assets.yml` with `version_override`); never run on a
committed tree.
"""

import json
import re
import sys
from pathlib import Path

CONF = Path("apps/desktop/src-tauri/tauri.conf.json")
WORKSPACE_MANIFESTS = {
    "cortana": Path("Cargo.toml"),
    "cortana-core": Path("crates/core/Cargo.toml"),
    "cortana-mcp": Path("crates/mcp/Cargo.toml"),
    "cortana-retrieval": Path("crates/retrieval/Cargo.toml"),
    "cortana-server": Path("crates/server/Cargo.toml"),
}
WORKSPACE_PACKAGES = frozenset(WORKSPACE_MANIFESTS)
WORKSPACE_LOCK = Path("Cargo.lock")
DESKTOP_MANIFEST = Path("apps/desktop/src-tauri/Cargo.toml")
DESKTOP_LOCK = Path("apps/desktop/src-tauri/Cargo.lock")
DESKTOP_PACKAGE = "cortana-desktop"
DEV_VERSION = re.compile(
    r"(?P<major>0|[1-9][0-9]*)\."
    r"(?P<minor>0|[1-9][0-9]*)\."
    r"(?P<patch>0|[1-9][0-9]*)-dev\."
    r"(?P<build>0|[1-9][0-9]*)"
)
MSI_COMPONENT_LIMITS = (255, 255, 65_535, 65_535)
VERSION_LINE = re.compile(r'^(\s*version\s*=\s*)"[^"]+"')


def update_manifest(source: str, package_name: str, version: str) -> str:
    """Update one Cargo package version without changing other manifest data."""
    section = ""
    found_name: str | None = None
    version_count = 0
    out: list[str] = []
    for line in source.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("["):
            section = stripped
        if section == "[package]":
            name_match = re.match(r'name\s*=\s*"([^"]+)"', stripped)
            if name_match:
                found_name = name_match.group(1)
            if stripped.startswith("version ="):
                match = VERSION_LINE.match(line)
                if match is None:
                    raise ValueError(f"invalid package version field for {package_name}")
                line = f'{match.group(1)}"{version}"{line[match.end() :]}'
                version_count += 1
        out.append(line)

    if found_name != package_name:
        raise ValueError(f"expected Cargo package {package_name}, found {found_name or 'none'}")
    if version_count != 1:
        raise ValueError(f"expected one package version field for {package_name}")
    return "".join(out)


def update_lockfile(
    source: str,
    package_names: frozenset[str],
    required_packages: frozenset[str],
    version: str,
) -> str:
    """Update selected Cargo.lock package entries while preserving comments."""
    in_package = False
    package_name: str | None = None
    found: set[str] = set()
    out: list[str] = []
    for line in source.splitlines(keepends=True):
        stripped = line.strip()
        if stripped == "[[package]]":
            in_package = True
            package_name = None
        elif stripped.startswith("["):
            in_package = False
            package_name = None
        if in_package and stripped.startswith("name ="):
            name_match = re.match(r'name\s*=\s*"([^"]+)"', stripped)
            package_name = name_match.group(1) if name_match else None
        if in_package and package_name in package_names and stripped.startswith("version ="):
            match = VERSION_LINE.match(line)
            if match is None:
                raise ValueError(f"invalid Cargo.lock version field for {package_name}")
            line = f'{match.group(1)}"{version}"{line[match.end() :]}'
            found.add(package_name)
        out.append(line)

    missing = sorted(required_packages.difference(found))
    if missing:
        raise ValueError("Cargo.lock is missing package entries: " + ", ".join(missing))
    return "".join(out)


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

    try:
        replacements: dict[Path, str] = {}
        conf = json.loads(CONF.read_text())
        conf["version"] = version
        # Tauri keeps the app SemVer here and uses WixConfig.version only for MSI.
        wix = conf.setdefault("bundle", {}).setdefault("windows", {}).setdefault("wix", {})
        wix["version"] = msi_version
        replacements[CONF] = json.dumps(conf, indent=2) + "\n"

        for package_name, path in WORKSPACE_MANIFESTS.items():
            replacements[path] = update_manifest(path.read_text(), package_name, version)
        replacements[WORKSPACE_LOCK] = update_lockfile(
            WORKSPACE_LOCK.read_text(), WORKSPACE_PACKAGES, WORKSPACE_PACKAGES, version
        )

        replacements[DESKTOP_MANIFEST] = update_manifest(
            DESKTOP_MANIFEST.read_text(), DESKTOP_PACKAGE, version
        )
        replacements[DESKTOP_LOCK] = update_lockfile(
            DESKTOP_LOCK.read_text(),
            WORKSPACE_PACKAGES | {DESKTOP_PACKAGE},
            frozenset({DESKTOP_PACKAGE}),
            version,
        )
    except (OSError, ValueError) as error:
        print(f"unable to apply dev version: {error}", file=sys.stderr)
        return 1

    # Build every replacement before writing so a missing/malformed input
    # cannot leave only some build tools using the Dev identity.
    for path, contents in replacements.items():
        path.write_text(contents)

    print(f"Applied dev version {version} (MSI {msi_version}) to desktop and core Rust inputs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
