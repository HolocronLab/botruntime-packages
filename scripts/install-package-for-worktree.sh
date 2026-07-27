#!/usr/bin/env bash
set -euo pipefail

readonly REQUIRED_BUN_VERSION="1.3.14"
readonly REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  echo "Usage: $0 <package-name>" >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 64
fi

readonly PACKAGE_NAME="$1"
if [[ ! "$PACKAGE_NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "error: package name must contain only lowercase letters, digits, and hyphens" >&2
  exit 64
fi

readonly PACKAGE_DIR="$REPOSITORY_ROOT/packages/$PACKAGE_NAME"
readonly PACKAGE_MANIFEST="$PACKAGE_DIR/package.json"
readonly PACKAGE_LOCKFILE="$PACKAGE_DIR/bun.lock"
readonly PATCHES_PATH="$PACKAGE_DIR/patches"
readonly SHARED_PATCHES_PATH="$REPOSITORY_ROOT/packages/botruntime-llmz/patches"

if [ ! -f "$PACKAGE_MANIFEST" ] || [ ! -f "$PACKAGE_LOCKFILE" ]; then
  echo "error: packages/$PACKAGE_NAME must contain package.json and bun.lock" >&2
  exit 66
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "error: Bun $REQUIRED_BUN_VERSION is required but bun is not installed" >&2
  exit 1
fi

readonly ACTUAL_BUN_VERSION="$(bun --version)"
if [ "$ACTUAL_BUN_VERSION" != "$REQUIRED_BUN_VERSION" ]; then
  echo "error: this repository requires Bun $REQUIRED_BUN_VERSION; found $ACTUAL_BUN_VERSION" >&2
  exit 1
fi

readonly STATE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/botruntime-worktree-install.XXXXXX")"
readonly MANIFEST_BEFORE="$STATE_DIR/package.json"
readonly LOCKFILE_BEFORE="$STATE_DIR/bun.lock"
cp "$PACKAGE_MANIFEST" "$MANIFEST_BEFORE"
cp "$PACKAGE_LOCKFILE" "$LOCKFILE_BEFORE"

linked_patches=0
cleanup() {
  if [ "$linked_patches" -eq 1 ] && [ -L "$PATCHES_PATH" ]; then
    unlink "$PATCHES_PATH" || true
  fi
  rm -f "$MANIFEST_BEFORE" "$LOCKFILE_BEFORE" || true
  rmdir "$STATE_DIR" || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ ! -e "$PATCHES_PATH" ] && [ ! -L "$PATCHES_PATH" ]; then
  if [ ! -d "$SHARED_PATCHES_PATH" ]; then
    echo "error: shared patches directory is missing: $SHARED_PATCHES_PATH" >&2
    exit 66
  fi
  (
    cd "$PACKAGE_DIR"
    ln -s ../botruntime-llmz/patches patches
  )
  linked_patches=1
fi

install_status=0
(
  cd "$PACKAGE_DIR"
  bun install --no-save --ignore-scripts
) || install_status=$?

if ! cmp -s "$PACKAGE_MANIFEST" "$MANIFEST_BEFORE" ||
  ! cmp -s "$PACKAGE_LOCKFILE" "$LOCKFILE_BEFORE"; then
  echo "error: dependency installation changed package.json or bun.lock" >&2
  exit 1
fi

if [ "$install_status" -ne 0 ]; then
  exit "$install_status"
fi

echo "Installed packages/$PACKAGE_NAME dependencies without changing its manifests."
