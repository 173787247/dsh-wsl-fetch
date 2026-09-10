#!/usr/bin/env bash
# Run dsh-wsl-fetch stress using the live dsh web proxy env when possible.
set -euo pipefail
export PATH="/usr/local/bin:${HOME}/.local/bin:/usr/bin:/bin:${PATH}"
PID="$(pgrep -n -f 'node.*/dsh web' || true)"
if [[ -n "${PID}" ]]; then
  while IFS= read -r line; do
    case "$line" in
      HTTPS_PROXY=*|https_proxy=*|HTTP_PROXY=*|http_proxy=*|NODE_USE_ENV_PROXY=*|NO_PROXY=*|no_proxy=*) export "$line" ;;
    esac
  done < <(tr '\0' '\n' < "/proc/${PID}/environ")
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
if [[ ! -f "${ROOT}/scripts/stress.mjs" ]]; then
  ROOT="/mnt/c/Users/rchua/Desktop/AIFullStackDevelopment/dsh-wsl-fetch"
fi
echo "dsh_pid=${PID:-none} NODE_USE_ENV_PROXY=${NODE_USE_ENV_PROXY:-unset}"
node "${ROOT}/scripts/stress.mjs"
