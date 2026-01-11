#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_repo="${IMAGE_REPO:-pdr.jonbesga.com/telegram-chats-timeline}"
k8s_dir="${repo_root}/k8s"
app_yaml="${k8s_dir}/app.yaml"

if [[ ! -f "${app_yaml}" ]]; then
    echo "k8s/app.yaml not found at ${app_yaml}" >&2
    exit 1
fi

commit_sha="$(git -C "${repo_root}" rev-parse HEAD)"
image_tag="${IMAGE_TAG:-${commit_sha}}"
image_ref="${image_repo}:${image_tag}"

"${repo_root}/scripts/stamp-commit.sh"

docker build -t "${image_ref}" "${repo_root}"
docker push "${image_ref}"

sed -i.bak -E "s|image: .*|image: ${image_ref}|" "${app_yaml}"
rm -f "${app_yaml}.bak"

kubectl apply -f "${k8s_dir}"

echo "Deployed ${image_ref}"
