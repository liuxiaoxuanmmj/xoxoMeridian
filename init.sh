#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "22" ]]; then
  echo "需要 Node.js 22，当前为 $(node --version)。" >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci
fi

if [[ ! -f .env ]]; then
  echo "提示：尚未创建 .env；涉及数据库或运行服务前请从 .env.example 创建。"
fi

npm run db:generate
npm run check:quick
