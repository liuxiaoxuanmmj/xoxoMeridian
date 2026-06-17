# Nginx 反代部署要点

XOXO Meridian 设计为 **应用 + Nginx + Let's Encrypt** 的部署形态。Nginx
负责 TLS 终止、HTTP/HTTPS 跳转、SSE 长连接调优；Next.js 应用监听
`127.0.0.1:3000`（在 `docker-compose.yml` 已经配置成只绑定 loopback）。

## 1. 必要前置

- `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` 必须等于对外 HTTPS 域名（例如
  `https://meridian.example.com`），否则 CSRF Origin 校验会拒绝所有 POST。
- 证书：用 Certbot 申请 `meridian.example.com` 的证书。

## 2. 站点配置示例

`/etc/nginx/sites-available/xoxo-meridian.conf`：

```nginx
# Upstream with keepalive to avoid per-request TCP churn → 502 under load.
upstream xoxo_web {
    server 127.0.0.1:3000;
    keepalive 32;
    keepalive_timeout 60s;
}

server {
    listen 80;
    listen [::]:80;
    server_name meridian.example.com;

    # ACME challenge passthrough
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name meridian.example.com;

    ssl_certificate     /etc/letsencrypt/live/meridian.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meridian.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Hardening
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    client_max_body_size 5m;

    # 关键：把客户端真实 IP 透传给应用，限流和审计依赖这个 header
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE 长连接：禁用缓冲并放宽超时
    location ~ ^/api/rooms/[^/]+/stream$ {
        proxy_pass http://xoxo_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 普通路径：走 keepalive upstream，空 Connection 头触发连接复用。
    # 不要写 Connection "upgrade" —— 那是 WebSocket 专用，普通 HTTP 用了会让
    # 上游误以为这是协议升级请求，在高并发下偶发 502。
    location / {
        proxy_pass http://xoxo_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

### 用 IP 直连时的最小配置

如果暂时没有域名 / 证书，用 `http://<IP>/` 直连（例如 `http://154.12.28.37/`），
至少需要这一份 HTTP 配置来避免 502；同时应用层 `APP_BASE_URL` 要设为对应的
`http://<IP>`（或改为允许多源，见下文）：

```nginx
upstream xoxo_web {
    server 127.0.0.1:3000;
    keepalive 32;
    keepalive_timeout 60s;
}

server {
    listen 80;
    server_name _;

    client_max_body_size 5m;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location ~ ^/api/rooms/[^/]+/stream$ {
        proxy_pass http://xoxo_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    location / {
        proxy_pass http://xoxo_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_read_timeout 120s;
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/xoxo-meridian.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 3. 证书续期

```bash
sudo certbot --nginx -d meridian.example.com
sudo systemctl enable --now certbot.timer
```

## 4. 健康检查

部署完毕后：

```bash
curl -fsS https://meridian.example.com/api/health
```

期望返回 200 + `{"ok":true,"db":true,...}`。

## 5. 防火墙建议

只开 80 / 443 / SSH：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

PostgreSQL 容器 **不向公网暴露**（compose 已经移除 `5432:5432`），
应用容器同样仅绑定 `127.0.0.1:3000`，外部全部由 Nginx 处理。

## 6. 完整推荐配置

**独立 Nginx 部署**（需在 `nginx.conf` 的 `http {}` 块中预先定义 `upstream` 和 `map`）：

`/etc/nginx/nginx.conf` 的 `http {}` 块中追加：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream xoxo_web {
    server 127.0.0.1:3000;
    keepalive 32;
    keepalive_timeout 60s;
}
```

`/etc/nginx/sites-available/xoxo-meridian.conf`（站点配置）：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name meridian.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name meridian.example.com;

    ssl_certificate     /etc/letsencrypt/live/meridian.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meridian.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    client_max_body_size 5m;

    # ============================
    # Next.js 静态资源：长缓存
    # ============================
    location ^~ /_next/static/ {
        proxy_pass http://xoxo_web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # ============================
    # SSE 长连接：禁用缓冲和缓存
    # ============================
    location ~ ^/api/rooms/[^/]+/stream$ {
        proxy_pass http://xoxo_web;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    # ============================
    # 普通路径：keepalive upstream
    # ============================
    location / {
        proxy_pass http://xoxo_web;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header REMOTE-HOST $remote_addr;
        proxy_set_header Connection "";

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

**宝塔面板部署**（反代配置文件被 include 到面板生成的 server 块内，只能写 location 和部分指令，不能出现 `server` / `map` / `upstream`）：

宝塔「网站 → 设置 → 反向代理」中直接粘贴以下内容（替换原有的 `#PROXY-START/` … `#PROXY-END/` 区域）：

```nginx
#PROXY-START/

client_max_body_size 5m;

# ============================
# Next.js 静态资源：长缓存
# ============================
location ^~ /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    expires 30d;
    add_header Cache-Control "public, max-age=2592000, immutable";
}

# ============================
# SSE 长连接：禁用缓冲和缓存
# ============================
location ~ ^/api/rooms/[^/]+/stream$ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}

# ============================
# 普通路径
# ============================
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header REMOTE-HOST $remote_addr;
    proxy_set_header Connection "";

    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}

#PROXY-END/
```

## 两种部署模式对比

| 模式 | `map` / `upstream` | `proxy_pass` |
|------|-------------------|--------------|
| 独立 Nginx | 在 `nginx.conf` 的 `http {}` 块定义 | `http://xoxo_web` |
| 宝塔面板 | 不可用（反代文件被 include 到 server 块内） | `http://127.0.0.1:3000` |

关键设计决策：

- **无 `proxy_cache`** — 应用层通过中间件和路由精确控制 Cache-Control，nginx 不越权缓存
- **无 `proxy_ignore_headers`** — 尊重应用返回的缓存头，避免登录态数据泄露到共享缓存
- **`/_next/static/` 前缀 location** — 优先级高于 `/`，为指纹化 JS/CSS 提供 30 天强缓存
- **SSE location 使用正则** — 与 `^~ /_next/static/` 不冲突
- **主 location 使用 `Connection ""`** — 触发 keepalive 连接复用
- **`client_max_body_size 5m`** — 与应用的 `ATLAS_MAX_FILE_SIZE` (5MB) 对齐
