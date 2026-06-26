#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# dev-redeploy.sh — 本地开发环境快速重部署
# =============================================================================
# 用途: 拉取最新代码后快速刷新本地开发环境
# 用法: ./scripts/dev-redeploy.sh [选项]
#
# 选项:
#   --no-pull     跳过 git pull
#   --clean       清理 .next 缓存后重新构建（用于遇到奇怪的构建问题时）
#   --restart-db  重启 PostgreSQL 容器（Docker 模式下）
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

NO_PULL=false
CLEAN_BUILD=false
RESTART_DB=false

for arg in "$@"; do
    case "$arg" in
        --no-pull)     NO_PULL=true ;;
        --clean)       CLEAN_BUILD=true ;;
        --restart-db)  RESTART_DB=true ;;
        *)             echo "未知参数: $arg"; exit 1 ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }
step() { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ---------------------------------------------------------------------------
# 0. 检查是否在项目目录
# ---------------------------------------------------------------------------
if [ ! -f "package.json" ]; then
    err "请在项目根目录运行此脚本"
    exit 1
fi

# 加载环境变量
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
    warn ".env.local 不存在，使用 .env"
    ENV_FILE=".env"
fi
set -a; source "$ENV_FILE"; set +a

# ---------------------------------------------------------------------------
# 1. Git 拉取
# ---------------------------------------------------------------------------
if [ "$NO_PULL" = false ] && [ -d ".git" ]; then
    step "拉取最新代码"

    CURRENT_BRANCH=$(git branch --show-current)
    log "当前分支: $CURRENT_BRANCH"

    if [ -n "$(git status --porcelain)" ]; then
        warn "工作区有未提交的更改，跳过 git pull"
        git status --short
    else
        git pull --ff-only origin "$CURRENT_BRANCH" 2>/dev/null && log "已拉取最新代码 ✓" || warn "git pull 失败，继续执行..."
    fi
fi

# ---------------------------------------------------------------------------
# 2. 重启数据库（可选）
# ---------------------------------------------------------------------------
if [ "$RESTART_DB" = true ]; then
    step "重启 PostgreSQL"

    if docker ps --format '{{.Names}}' | grep -q '^xoxo-meridian-postgres$'; then
        log "重启 Docker PostgreSQL 容器..."
        docker restart xoxo-meridian-postgres
        # 等待就绪
        for i in $(seq 1 20); do
            if docker exec xoxo-meridian-postgres pg_isready -U xoxo -d xoxo_meridian &>/dev/null; then
                log "PostgreSQL 已就绪 ✓"
                break
            fi
            sleep 1
        done
    else
        warn "未找到 Docker PostgreSQL 容器，跳过"
    fi
fi

# ---------------------------------------------------------------------------
# 3. 依赖更新
# ---------------------------------------------------------------------------
step "更新依赖"

if [ -f "package-lock.json" ]; then
    log "检查依赖变更..."
    npm install --prefer-offline
else
    npm install
fi

log "依赖更新完成 ✓"

# ---------------------------------------------------------------------------
# 4. Prisma
# ---------------------------------------------------------------------------
step "数据库迁移"

log "重新生成 Prisma Client..."
npx prisma generate

log "执行待应用的迁移..."
npx prisma migrate deploy

log "数据库同步完成 ✓"

# ---------------------------------------------------------------------------
# 5. 清理 .next 缓存（可选）
# ---------------------------------------------------------------------------
if [ "$CLEAN_BUILD" = true ]; then
    step "清理构建缓存"
    rm -rf .next
    log ".next 缓存已清理 ✓"
fi

# ---------------------------------------------------------------------------
# 6. 生产构建（可选，仅当不使用 npm run dev 时需要）
# ---------------------------------------------------------------------------
step "验证构建"

log "运行 build 检查（不影响 dev 模式）..."
npm run build 2>&1 | tail -5

log "构建验证通过 ✓"

# ---------------------------------------------------------------------------
# 完成
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           本地环境已刷新！                                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  启动开发服务器:"
echo -e "    ${CYAN}npm run dev${NC}"
echo ""
echo "  如果使用了 AGENT_TASK_INLINE_RUN=false，还需启动 worker:"
echo -e "    ${CYAN}npm run agent:worker${NC}"
echo ""

# 检查是否有 .next 目录（standalone 构建），如有则提示可用生产模式
if [ -d ".next/standalone" ]; then
    echo "  或使用生产模式启动（无热更新）:"
    echo -e "    ${CYAN}npm start${NC}"
    echo ""
fi
