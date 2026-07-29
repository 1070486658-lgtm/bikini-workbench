# 轻量云 / 任意 Docker 主机部署用
# 构建：docker build -t bikini-workbench .
# 运行：docker run -d --restart=always -p 8080:56170 \
#        -v workbench-data:/data \
#        -e ACCESS_TOKEN=你的令牌 \
#        -e AI_API_KEY=你的DeepSeekKey \
#        --name workbench bikini-workbench
# 然后访问 http://<服务器IP>:8080  （如用 Nginx/宝塔反代 + HTTPS 更佳）
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 56170
CMD ["node", "server.js"]
