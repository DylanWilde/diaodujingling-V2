#!/bin/bash
# 调度精灵 V8 — 腾讯云服务器部署脚本
# 使用方法: bash deploy.sh

set -e

echo "══════════════════════════════════════════"
echo "  调度精灵 V8 一键部署脚本"
echo "══════════════════════════════════════════"

APP_DIR="/opt/dispatch-hub"
VENV_DIR="$APP_DIR/venv"

# 1. 安装系统依赖
echo "[1/6] 安装系统依赖..."
apt update -y
apt install -y python3 python3-pip python3-venv nginx supervisor git

# 2. 创建应用目录
echo "[2/7] 创建应用目录..."
mkdir -p $APP_DIR/backend $APP_DIR/frontend
cp -r *.py requirements.txt $APP_DIR/backend/
cp -r routers $APP_DIR/backend/
cp -r tests $APP_DIR/backend/

# 前端文件部署
FRONTEND_SRC="${0%/*}/.."  # 脚本在backend/下，前端在上层
if [ -d "$FRONTEND_SRC" ]; then
  cp "$FRONTEND_SRC/index.html" $APP_DIR/frontend/
  cp -r "$FRONTEND_SRC/css" $APP_DIR/frontend/ 2>/dev/null || true
  cp -r "$FRONTEND_SRC/js" $APP_DIR/frontend/ 2>/dev/null || true
  cp -r "$FRONTEND_SRC/data" $APP_DIR/frontend/ 2>/dev/null || true
fi

# 3. 虚拟环境 + Python依赖
echo "[3/7] 安装 Python 依赖..."
python3 -m venv $VENV_DIR
source $VENV_DIR/bin/activate
pip install -r $APP_DIR/backend/requirements.txt

# 4. 生成 JWT 密钥
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
echo "JWT_SECRET=$JWT_SECRET" > $APP_DIR/backend/.env

# 5. 配置 Supervisor
echo "[5/7] 配置 Supervisor 守护进程..."
cat > /etc/supervisor/conf.d/dispatch.conf << SUPERVISOREOF
[program:dispatch]
directory=$APP_DIR/backend
command=$VENV_DIR/bin/gunicorn -w 2 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 main:app
environment=JWT_SECRET="$JWT_SECRET"
autostart=true
autorestart=true
stdout_logfile=/var/log/dispatch.log
stderr_logfile=/var/log/dispatch_error.log
SUPERVISOREOF

supervisorctl reread
supervisorctl update
supervisorctl start dispatch

# 6. 配置 Nginx
echo "[6/7] 配置 Nginx 反向代理..."
cat > /etc/nginx/sites-available/dispatch << NGINXEOF
server {
    listen 80;
    server_name _;

    # API 转发到 FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    # 前端静态文件
    location / {
        root $APP_DIR/frontend;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/dispatch /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# 7. 放行端口
echo "[7/7] 放行防火墙端口..."
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 22/tcp
ufw --force enable

echo ""
echo "══════════════════════════════════════════"
echo "  ✅ 部署完成！"
echo "  API 地址: http://$(hostname -I | awk '{print $1}')/api/health"
echo "  管理后台: http://$(hostname -I | awk '{print $1}')"
echo "  ⚠️  请在腾讯云控制台安全组中放行 TCP 80 端口"
echo "══════════════════════════════════════════"
