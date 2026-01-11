#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image_repo="${IMAGE_REPO:-pdr.jonbesga.com/telegram-chats-timeline}"
k8s_dir="${repo_root}/k8s"
app_yaml="${k8s_dir}/app.yaml"
k8s_namespace="${K8S_NAMESPACE:-jon}"

if [[ ! -f "${app_yaml}" ]]; then
    echo "k8s/app.yaml not found at ${app_yaml}" >&2
    exit 1
fi

if [[ -n "$(git -C "${repo_root}" status --porcelain)" ]]; then
    echo "Working tree is dirty. Commit or stash changes before deploying." >&2
    exit 1
fi

commit_sha="$(git -C "${repo_root}" rev-parse HEAD)"
image_tag="${IMAGE_TAG:-${commit_sha}}"
image_ref="${image_repo}:${image_tag}"

docker build --build-arg BUILD_COMMIT="${commit_sha}" -t "${image_ref}" "${repo_root}"
docker push "${image_ref}"

kubectl apply -f "${k8s_dir}/app.yaml"
kubectl apply -f "${k8s_dir}/ingress.yaml"
kubectl set image deployment/chat-timeline chat-timeline="${image_ref}" -n "${k8s_namespace}"

echo "Deployed ${image_ref}"
