#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

source "$repo_root/scripts/run-node22.sh"
xoxo_configure_node22_path

if [[ ! -d node_modules ]]; then
  npm ci
fi

if [[ ! -f .env ]]; then
  echo "提示：尚未创建 .env；涉及数据库或运行服务前请从 .env.example 创建。"
fi

npm run db:generate
npm run check:quick
