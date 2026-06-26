#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# dev-init.sh — WSL2 本地开发环境一键初始化
# =============================================================================
# 用途: 首次在 WSL2 中搭建 xoxoMeridian 本地开发环境
# 用法: ./scripts/dev-init.sh [--docker-db|--local-db]
#
# 选项:
#   --docker-db  使用 Docker 运行 PostgreSQL（默认，只需 Docker）
#   --local-db   使用 WSL2 本地安装的 PostgreSQL（需先 sudo apt install postgresql）
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DB_MODE="${1:---docker-db}"
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
# 1. 前置检查
# ---------------------------------------------------------------------------
step "检查前置依赖"

if ! command -v node &>/dev/null; then
    err "未找到 Node.js，请先安装 Node.js >= 20"
    echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
    echo "  或使用 nvm/fnm 管理 Node 版本"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    err "Node.js 版本过低 ($(node -v))，需要 >= 20"
    exit 1
fi

log "Node.js $(node -v) ✓"
log "npm $(npm -v) ✓"

# ---------------------------------------------------------------------------
# 2. PostgreSQL 准备
# ---------------------------------------------------------------------------
step "PostgreSQL 准备"

setup_docker_db() {
    log "使用 Docker 运行 PostgreSQL..."

    if ! command -v docker &>/dev/null; then
        err "未找到 Docker，请先安装 Docker Desktop 或在 WSL2 中安装 Docker Engine"
        echo "  或使用 --local-db 选项连接本地 PostgreSQL"
        exit 1
    fi

    # 生成随机密码（如果用户没有手动设置）
    PG_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"

    # 如果已有同名容器在运行，跳过创建
    if docker ps --format '{{.Names}}' | grep -q '^xoxo-meridian-postgres$'; then
        log "PostgreSQL 容器已在运行，跳过创建"
    elif docker ps -a --format '{{.Names}}' | grep -q '^xoxo-meridian-postgres$'; then
        log "启动已有的 PostgreSQL 容器..."
        docker start xoxo-meridian-postgres
    else
        log "创建并启动 PostgreSQL 容器..."
        docker run -d \
            --name xoxo-meridian-postgres \
            --restart unless-stopped \
            -e POSTGRES_USER=xoxo \
            -e "POSTGRES_PASSWORD=${PG_PASSWORD}" \
            -e POSTGRES_DB=xoxo_meridian \
            -p 127.0.0.1:5432:5432 \
            -v xoxo-meridian-pgdata:/var/lib/postgresql/data \
            postgres:16-alpine
    fi

    # 等待 PostgreSQL 就绪
    log "等待 PostgreSQL 就绪..."
    for i in $(seq 1 30); do
        if docker exec xoxo-meridian-postgres pg_isready -U xoxo -d xoxo_meridian &>/dev/null; then
            log "PostgreSQL 已就绪 ✓"
            break
        fi
        sleep 1
    done

    echo "$PG_PASSWORD"
}

setup_local_db() {
    log "使用本地 PostgreSQL..."

    if ! command -v psql &>/dev/null; then
        err "未找到 psql，请先安装 PostgreSQL: sudo apt install postgresql"
        exit 1
    fi

    # 确保服务在运行
    if ! pg_isready &>/dev/null; then
        log "启动本地 PostgreSQL 服务..."
        sudo service postgresql start
    fi

    PG_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"

    # 创建用户和数据库（如果不存在）
    sudo -u postgres psql -tc \
        "SELECT 1 FROM pg_roles WHERE rolname='xoxo'" 2>/dev/null | grep -q 1 || \
        sudo -u postgres psql -c "CREATE USER xoxo WITH PASSWORD '${PG_PASSWORD}';"

    sudo -u postgres psql -tc \
        "SELECT 1 FROM pg_database WHERE datname='xoxo_meridian'" 2>/dev/null | grep -q 1 || \
        sudo -u postgres psql -c "CREATE DATABASE xoxo_meridian OWNER xoxo;"

    log "本地 PostgreSQL 已就绪 ✓"
    echo "$PG_PASSWORD"
}

if [ "$DB_MODE" = "--local-db" ]; then
    PG_PASSWORD=$(setup_local_db)
    DB_HOST="127.0.0.1"
elif [ "$DB_MODE" = "--docker-db" ]; then
    PG_PASSWORD=$(setup_docker_db)
    DB_HOST="127.0.0.1"
else
    err "无效参数: $DB_MODE，支持 --docker-db 或 --local-db"
    exit 1
fi

DATABASE_URL="postgresql://xoxo:${PG_PASSWORD}@${DB_HOST}:5432/xoxo_meridian?schema=public"

# ---------------------------------------------------------------------------
# 3. 环境变量配置
# ---------------------------------------------------------------------------
step "环境变量配置"

if [ -f ".env.local" ]; then
    warn ".env.local 已存在，跳过创建"
    log "如需重新生成，请先删除 .env.local"
else
    log "从 .env.example 生成 .env.local（本地开发专用）..."

    # 生成安全的随机值
    SESSION_SECRET=$(openssl rand -base64 48)
    INVITE_CODE="${INVITE_CODE:-dev-invite}"

    cat > .env.local << EOF
# =============================================================================
# .env.local — WSL2 本地开发环境（由 dev-init.sh 自动生成）
# =============================================================================
# 此文件仅用于本地开发，不会被 git 追踪
# 服务器生产环境使用 .env + docker-compose
# =============================================================================

# --- 数据库 ---
DATABASE_URL=${DATABASE_URL}
DIRECT_URL=${DATABASE_URL}

# --- 应用 ---
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
SESSION_SECRET=${SESSION_SECRET}
SESSION_MAX_AGE_SECONDS=604800
INVITE_CODE=${INVITE_CODE}
PASSWORD_MIN_LENGTH=8
DEMO_ROOM_SLUG=our-room

# --- CSRF ---
ALLOWED_ORIGINS=http://localhost:3000

# --- LLM ---
LLM_PROVIDER=openai-compatible
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_TIMEOUT_MS=20000

# --- Weather ---
WEATHER_PROVIDER=mock
WEATHER_API_KEY=
WEATHER_BASE_URL=
QWEATHER_API_HOST=devapi.qweather.com
QWEATHER_GEOAPI_HOST=geoapi.qweather.com

# --- Email ---
EMAIL_PROVIDER=mock
EMAIL_API_KEY=
EMAIL_FROM=noreply@localhost

# --- Search ---
TAVILY_API_KEY=

# --- Agent ---
# 本地开发建议开启内联模式，无需单独运行 worker
AGENT_TASK_INLINE_RUN=true
AGENT_WORKER_POLL_MS=3000
AGENT_DEBUG_ENABLED=true

# --- Atlas 存储 ---
ATLAS_STORAGE_PROVIDER=local
ATLAS_UPLOAD_DIR=data/atlas-uploads

# --- 登录页视觉 ---
LOGIN_VISUALS_MANIFEST_URL=
LOGIN_VISUALS_CACHE_TTL_SECONDS=300
LOGIN_VISUALS_IMAGE_SRC=
EOF

    log ".env.local 已创建 ✓"
    warn "请编辑 .env.local 填入你的 LLM_API_KEY 等真实配置"
fi

# ---------------------------------------------------------------------------
# 4. 依赖安装
# ---------------------------------------------------------------------------
step "安装项目依赖"

if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
    log "node_modules 已存在，检查是否需要更新..."
    npm install --prefer-offline
else
    log "安装依赖（首次可能需要几分钟）..."
    npm install
fi

log "依赖安装完成 ✓"

# ---------------------------------------------------------------------------
# 5. Prisma 初始化
# ---------------------------------------------------------------------------
step "数据库初始化"

log "生成 Prisma Client..."
npx prisma generate

log "执行数据库迁移..."
DATABASE_URL="${DATABASE_URL}" npx prisma migrate deploy

log "填充种子数据..."
DATABASE_URL="${DATABASE_URL}" npx tsx prisma/seed.ts

log "数据库初始化完成 ✓"

# ---------------------------------------------------------------------------
# 6. 创建数据目录
# ---------------------------------------------------------------------------
step "创建本地数据目录"

mkdir -p data/chat-logs
mkdir -p data/atlas-uploads

log "数据目录已就绪 ✓"

# ---------------------------------------------------------------------------
# 完成
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           本地开发环境初始化完成！                           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  启动开发服务器:"
echo -e "    ${CYAN}npm run dev${NC}"
echo ""
echo "  启动 agent worker（如果关闭了内联模式）:"
echo -e "    ${CYAN}npm run agent:worker${NC}"
echo ""
echo "  运行测试:"
echo -e "    ${CYAN}npm test${NC}"
echo ""
echo "  常用 Prisma 命令:"
echo -e "    ${CYAN}npx prisma studio${NC}          # 数据库管理界面"
echo -e "    ${CYAN}npx prisma migrate dev${NC}     # 创建新迁移（开发时）"
echo -e "    ${CYAN}npx prisma db push${NC}         # 快速同步 schema（不创建迁移文件）"
echo ""
echo -e "  ${YELLOW}提示:${NC} 如果用 Docker 管理 PostgreSQL:"
echo -e "    docker start xoxo-meridian-postgres   # 启动"
echo -e "    docker stop xoxo-meridian-postgres    # 停止"
echo ""
