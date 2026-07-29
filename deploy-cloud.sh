#!/bin/bash
# ============================================================
#  比奇堡工作台 · 腾讯云轻量服务器 一键部署脚本
#  用法：把整个 workbench-app 目录传到服务器后，在目录内执行：
#        bash deploy-cloud.sh
#  需要 root 权限（或用 sudo bash deploy-cloud.sh）
# ============================================================
set -e

# 进入脚本所在目录（即 workbench-app）
cd "$(dirname "$0")"
echo "▶ 当前目录: $(pwd)"

# 1) 检查并安装 Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "▶ 未检测到 Docker，开始安装（使用国内镜像源）..."
  curl -fsSL https://get.daocloud.io/docker | bash
  systemctl enable --now docker
else
  echo "▶ Docker 已安装，跳过"
fi

# 2) 让当前用户免 sudo 用 docker（可选，方便后续管理）
if [ "$(id -u)" != "0" ]; then
  echo "提示：当前非 root，请确保用 sudo 运行本脚本"
fi

# 3) 构建镜像
echo "▶ 构建 Docker 镜像 bikini-workbench ..."
docker build -t bikini-workbench .

# 4) 启动容器（端口 8080，数据持久化到卷 workbench-data）
TOKEN="${ACCESS_TOKEN:-changeme123}"
echo "▶ 使用访问令牌: $TOKEN （部署后请在 App『设置』里填入相同令牌）"
docker rm -f workbench 2>/dev/null || true
docker run -d --restart=always -p 8080:56170 \
  -v workbench-data:/data \
  -e ACCESS_TOKEN="$TOKEN" \
  -e AI_API_KEY="${AI_API_KEY:-}" \
  --name workbench bikini-workbench

echo ""
echo "✅ 部署完成！"
echo "   浏览器打开:  http://<你的服务器公网IP>:8080"
echo "   别忘了去腾讯云控制台『防火墙』放通 8080 端口（TCP）。"
echo "   首次进入 App 后，到『设置 → 云端访问令牌』填入: $TOKEN"
echo "   如需让 AI 可用，在上方启动时加 -e AI_API_KEY=你的DeepSeekKey 重新 run。"
