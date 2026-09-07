#!/usr/bin/env bash

xoxo_configure_node22_path() {
  local script_dir repo_root required_node required_npm expected_node
  local current_node candidate_node candidate_version node_dir actual_npm

  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "$script_dir/.." && pwd)"
  required_node="$(tr -d '[:space:]' < "$repo_root/.node-version")"
  expected_node="v${required_node}"

  if [[ ! "$required_node" =~ ^22\.[0-9]+\.[0-9]+$ ]]; then
    echo "无效的 .node-version：必须固定 Node.js 22 的完整版本。" >&2
    return 1
  fi

  current_node="$(command -v node 2>/dev/null || true)"
  candidate_node="${XOXO_NODE22_BIN:-$current_node}"
  candidate_version=""
  if [[ -n "$candidate_node" && -x "$candidate_node" ]]; then
    candidate_version="$("$candidate_node" --version 2>/dev/null || true)"
  fi

  if [[ "$candidate_version" != "$expected_node" ]]; then
    candidate_node="${HOME:-/home/dadalv}/.local/node-v${required_node}/bin/node"
    if [[ ! -x "$candidate_node" ]]; then
      echo "需要 Node.js ${required_node}；当前 PATH 为 ${candidate_version:-未找到 Node.js}，且 ${candidate_node} 不存在。" >&2
      return 1
    fi
  fi

  node_dir="$(dirname "$candidate_node")"
  export PATH="$node_dir:$PATH"
  hash -r

  if [[ "$(node --version)" != "$expected_node" ]]; then
    echo "Node.js PATH 恢复失败：期望 ${expected_node}，实际为 $(node --version)。" >&2
    return 1
  fi

  required_npm="$(
    node -e '
      const pkg = require(process.argv[1]);
      process.stdout.write(pkg.packageManager.replace(/^npm@/, ""));
    ' "$repo_root/package.json"
  )"

  if ! command -v npm >/dev/null 2>&1; then
    echo "Node.js ${required_node} 的 npm 不可用。" >&2
    return 1
  fi
  actual_npm="$(npm --version)"
  if [[ "$actual_npm" != "$required_npm" ]]; then
    echo "需要 npm ${required_npm}，当前为 ${actual_npm}。" >&2
    return 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  xoxo_configure_node22_path

  if [[ "$#" -eq 0 ]]; then
    printf 'node=%s %s\n' "$(command -v node)" "$(node --version)"
    printf 'npm=%s %s\n' "$(command -v npm)" "$(npm --version)"
    exit 0
  fi

  exec "$@"
fi
