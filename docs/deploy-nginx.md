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
    client_max_body_size 1m;

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

    client_max_body_size 1m;

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
