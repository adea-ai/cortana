#!/usr/bin/env bash
# One-shot environment setup for a fresh checkout or git worktree.
# Installs JS/Python/Rust dependencies, links the shared build caches, and
# reports optional local tooling (sccache, cargo-nextest).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> bun install"
bun install --frozen-lockfile

echo "==> uv sync (python dev env)"
uv sync --frozen

echo "==> cargo fetch"
cargo fetch --locked

# Every worktree gets its own target/ by default, so a fresh worktree cold-builds
# ~290 dependency crates at the dev profile's opt-level 2 (~45 min measured).
# Dependency artifacts are keyed by the shared registry path, so they are
# identical across worktrees: symlink target/ to a per-repo shared directory
# and cold worktree builds collapse to compiling the workspace crates only.
# Local crates still rebuild per worktree (dep-info embeds absolute paths) and
# incremental state stays intact inside each crate's own fingerprint.
CACHE_ROOT="${CORTANA_BUILD_CACHE:-$HOME/.cache/cortana}"
link_target() {
  local link_path="$1" dest="$2"
  if [ -L "$link_path" ]; then
    : # already linked
  elif [ -e "$link_path" ]; then
    echo "    $link_path already exists as a real directory; leaving it alone"
  else
    mkdir -p "$dest" "$(dirname "$link_path")"
    ln -s "$dest" "$link_path"
    echo "    $link_path -> $dest"
  fi
}

echo "==> shared build caches ($CACHE_ROOT)"
link_target "target" "$CACHE_ROOT/target"
link_target "apps/desktop/src-tauri/target" "$CACHE_ROOT/target-tauri"
mkdir -p "$CACHE_ROOT/target" "$CACHE_ROOT/target-tauri"

# sccache only caches non-incremental compiles (dev profile keeps incremental
# on for fast local iteration), so its payoff here is release/desktop builds.
if command -v sccache >/dev/null 2>&1; then
  echo "==> sccache detected: $(sccache --version)"
  if ! grep -q 'rustc-wrapper' "${CARGO_HOME:-$HOME/.cargo}/config.toml" 2>/dev/null; then
    cat <<'EOF'
    sccache is installed but not enabled. Add to ~/.cargo/config.toml to share
    release-mode artifacts across worktrees:

      [build]
      rustc-wrapper = "sccache"

EOF
  else
    echo "    rustc-wrapper already configured"
  fi
else
  echo "    sccache not installed (brew install sccache)"
fi

if command -v cargo-nextest >/dev/null 2>&1; then
  echo "==> cargo-nextest detected: $(cargo-nextest --version | head -1)"
  echo "    use 'cargo nextest run' for parallel Rust tests"
else
  echo "    cargo-nextest not installed (brew install cargo-nextest)"
fi

echo "==> done"
