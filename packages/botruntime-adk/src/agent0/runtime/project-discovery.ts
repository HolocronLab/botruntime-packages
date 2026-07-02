import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { platform } from 'node:os'
import { join } from 'node:path'
import type { Agent0ProjectPaths } from '../types.js'

export const AGENT0_PROJECT_ID_CACHE_GUARD_ENV = 'OPENCODE_AGENT0_DISABLE_PROJECT_ID_CACHE'

const GIT_SHIM_MODE = 0o700

// Coupled to pinned opencode-ai@1.15.10 behavior: OpenCode currently caches its
// project id by running `git rev-list --max-parents=0 HEAD`, then writing the
// result to `.git/opencode`. Revalidate this shim whenever the pin changes.
const POSIX_GIT_SHIM = `#!/bin/sh

if [ "\${OPENCODE_AGENT0_DISABLE_PROJECT_ID_CACHE:-}" = "1" ] \\
  && [ "$#" -eq 3 ] \\
  && [ "$1" = "rev-list" ] \\
  && [ "$2" = "--max-parents=0" ] \\
  && [ "$3" = "HEAD" ]; then
  parent_comm=$(ps -p "$PPID" -o comm= 2>/dev/null || true)
  parent_base=\${parent_comm##*/}
  case "$parent_base" in
    sh|bash|zsh|fish|dash|ksh|tcsh|csh|pwsh|powershell|powershell.exe|cmd|cmd.exe)
      ;;
    *)
      exit 1
      ;;
  esac
fi

if [ -n "\${AGENT0_REAL_GIT:-}" ]; then
  exec "$AGENT0_REAL_GIT" "$@"
fi

real_git=
self_dir=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && pwd -P)
old_ifs=$IFS
IFS=:
for dir in \${PATH:-}; do
  [ -n "$dir" ] || dir=.
  resolved=$(CDPATH= cd "$dir" 2>/dev/null && pwd -P || true)
  [ "$resolved" = "$self_dir" ] && continue
  candidate=$dir/git
  if [ -x "$candidate" ]; then
    real_git=$candidate
    break
  fi
done
IFS=$old_ifs

if [ -z "$real_git" ]; then
  echo "Agent(0) git shim could not locate the real git executable" >&2
  exit 127
fi

exec "$real_git" "$@"
`

const WINDOWS_GIT_SHIM = `@echo off
setlocal EnableExtensions DisableDelayedExpansion

if "%OPENCODE_AGENT0_DISABLE_PROJECT_ID_CACHE%"=="1" (
  if "%~1"=="rev-list" if "%~2"=="--max-parents=0" if "%~3"=="HEAD" if "%~4"=="" (
    exit /b 1
  )
)

if not "%AGENT0_REAL_GIT%"=="" (
  "%AGENT0_REAL_GIT%" %*
  exit /b %ERRORLEVEL%
)

for /f "delims=" %%G in ('where.exe git 2^>nul') do (
  if /I not "%%~fG"=="%~f0" (
    "%%~fG" %*
    exit /b %ERRORLEVEL%
  )
)

echo Agent(0) git shim could not locate the real git executable 1>&2
exit /b 127
`

export function getAgent0ProjectDiscoveryGitShimFilename(targetPlatform: NodeJS.Platform = platform()): string {
  return targetPlatform === 'win32' ? 'git.cmd' : 'git'
}

export async function ensureAgent0ProjectDiscoveryGitShim(paths: Agent0ProjectPaths): Promise<string> {
  const targetPlatform = platform()
  const shimPath = join(paths.engineBinDir, getAgent0ProjectDiscoveryGitShimFilename(targetPlatform))
  const shimContent = targetPlatform === 'win32' ? WINDOWS_GIT_SHIM : POSIX_GIT_SHIM
  await mkdir(paths.engineBinDir, { recursive: true, mode: GIT_SHIM_MODE })
  await chmod(paths.engineBinDir, GIT_SHIM_MODE)
  await writeFile(shimPath, shimContent, { mode: GIT_SHIM_MODE })
  await chmod(shimPath, GIT_SHIM_MODE)
  return shimPath
}
