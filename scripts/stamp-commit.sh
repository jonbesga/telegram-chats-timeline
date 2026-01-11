#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
index_file="${repo_root}/index.html"

if [[ ! -f "${index_file}" ]]; then
    echo "index.html not found at ${index_file}" >&2
    exit 1
fi

deploy_ref="${1:-${DEPLOY_REF:-}}"
if [[ -z "${deploy_ref}" ]]; then
    echo "Usage: $0 <deploy-ref> or set DEPLOY_REF" >&2
    exit 1
fi

if ! command -v sed >/dev/null 2>&1; then
    echo "sed is required to update index.html" >&2
    exit 1
fi

sed -i.bak -E "s/data-commit=\"[^\"]+\"/data-commit=\"${deploy_ref}\"/" "${index_file}"
sed -i.bak -E "s|timeline\\.js\\?v=[^\"]+|timeline.js?v=${deploy_ref}|" "${index_file}"
rm -f "${index_file}.bak"

echo "Stamped deploy ref ${deploy_ref} into ${index_file}"
