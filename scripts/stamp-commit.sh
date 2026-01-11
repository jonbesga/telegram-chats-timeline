#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
index_file="${repo_root}/index.html"

if [[ ! -f "${index_file}" ]]; then
    echo "index.html not found at ${index_file}" >&2
    exit 1
fi

commit_sha="$(git -C "${repo_root}" rev-parse HEAD)"

if ! command -v sed >/dev/null 2>&1; then
    echo "sed is required to update index.html" >&2
    exit 1
fi

sed -i.bak -E "s/data-commit=\"[^\"]+\"/data-commit=\"${commit_sha}\"/" "${index_file}"
rm -f "${index_file}.bak"

echo "Stamped commit ${commit_sha} into ${index_file}"
