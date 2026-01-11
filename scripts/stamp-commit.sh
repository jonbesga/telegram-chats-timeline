#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_file="${repo_root}/build.json"

commit_ref="${1:-}"
if [[ -z "${commit_ref}" ]]; then
    commit_ref="$(git -C "${repo_root}" rev-parse HEAD)"
fi

printf '{"commit":"%s"}\n' "${commit_ref}" > "${build_file}"
echo "Wrote ${build_file} with commit ${commit_ref}"
