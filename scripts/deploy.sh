#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_repo="${IMAGE_REPO:-pdr.jonbesga.com/telegram-chats-timeline}"
k8s_dir="${repo_root}/k8s"
index_file="${repo_root}/index.html"
app_yaml="${k8s_dir}/app.yaml"

if [[ ! -f "${app_yaml}" ]]; then
    echo "k8s/app.yaml not found at ${app_yaml}" >&2
    exit 1
fi

if [[ -n "$(git -C "${repo_root}" status --porcelain)" ]]; then
    echo "Working tree is dirty. Commit or stash changes before deploying." >&2
    exit 1
fi

deploy_ref="${DEPLOY_REF:-deploy-$(date -u +%Y%m%d%H%M%S)}"
image_tag="${IMAGE_TAG:-${deploy_ref}}"
image_ref="${image_repo}:${image_tag}"

if git -C "${repo_root}" rev-parse "${deploy_ref}" >/dev/null 2>&1; then
    echo "Deploy ref ${deploy_ref} already exists. Set DEPLOY_REF to a new value." >&2
    exit 1
fi

"${repo_root}/scripts/stamp-commit.sh" "${deploy_ref}"

docker build -t "${image_ref}" "${repo_root}"
docker push "${image_ref}"

sed -i.bak -E "s|image: .*|image: ${image_ref}|" "${app_yaml}"
rm -f "${app_yaml}.bak"

git -C "${repo_root}" add "${index_file}" "${app_yaml}"
git -C "${repo_root}" commit -m "Deploy ${deploy_ref}"
git -C "${repo_root}" tag -a "${deploy_ref}" -m "Deploy ${deploy_ref}"
git -C "${repo_root}" push
git -C "${repo_root}" push --tags

kubectl apply -f "${k8s_dir}"

echo "Deployed ${image_ref}"
