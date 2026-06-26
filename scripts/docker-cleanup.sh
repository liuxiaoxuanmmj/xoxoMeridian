#!/usr/bin/env bash
set -euo pipefail

# Docker 清理脚本 — 释放构建缓存、停止的容器、悬空镜像和无用卷
# 用法: ./scripts/docker-cleanup.sh [--aggressive]

AGGRESSIVE=false
if [[ "${1:-}" == "--aggressive" ]]; then
  AGGRESSIVE=true
  echo "⚠  aggressive 模式：将删除所有未使用的镜像（不仅仅是悬空镜像）"
fi

before=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "?")

echo "=== 清理前 ==="
docker system df 2>/dev/null || true
echo ""

# 1. 构建缓存（最大头）
echo ">>> 清理构建缓存..."
docker builder prune -af 2>/dev/null || true

# 2. 停止的容器
echo ">>> 清理停止的容器..."
docker container prune -f 2>/dev/null || true

# 3. 悬空镜像
echo ">>> 清理悬空镜像..."
docker image prune -f 2>/dev/null || true

# 4. 无用 volume
echo ">>> 清理无用卷..."
docker volume prune -f 2>/dev/null || true

# 5. 无用网络
echo ">>> 清理无用网络..."
docker network prune -f 2>/dev/null || true

# aggressive: 额外清理所有未使用的镜像
if $AGGRESSIVE; then
  echo ">>> 清理所有未使用的镜像..."
  docker image prune -af 2>/dev/null || true
fi

echo ""
echo "=== 清理后 ==="
docker system df 2>/dev/null || true

after=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "?")

echo ""
echo "清理完毕。当前总占用: $after"
