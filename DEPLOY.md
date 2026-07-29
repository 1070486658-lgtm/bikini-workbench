# 比奇堡工作台 · 云端部署指南（真·完整版）

> 这是带 Node 后端的**完整版**：跨设备同步、AI 副驾、热点自动抓取全部可用，数据存服务器。
> 前端零构建、后端零依赖（`node server.js` 即起），部署极简。

---

## 一、两种部署方式（任选）

| 方式 | 适合 | 成本 | 持久化 | HTTPS |
|------|------|------|--------|-------|
| **A. Render（Blueprint）** | 不想碰服务器、要自动 HTTPS | 约 $7/月起（starter，含持久盘） | 挂持久盘，不掉 | 自动 |
| **B. 国内轻量云 + Docker** | 人在国内、要稳、数据合规 | ¥50–80/月 | 云盘本就持久 | 用宝塔/Nginx 反代配 |
| C. VPS 裸跑 | 会 Linux | 可变 | 磁盘持久 | 自配证书 |

---

## 二、方式 A：Render 一键部署

1. 把本目录推到你的 GitHub（**不要**提交 `config.json` 和 `data/`，`.gitignore` 已排除）。
2. 打开 https://render.com → New → **Blueprint** → 选这个仓库。
3. Render 会按 `render.yaml` 自动建：
   - Web 服务（`node server.js`，自动 HTTPS + 常驻）
   - 1GB 持久盘（挂到 `/data`，`DATA_DIR` 已指向它，重启不丢数据）
   - 自动生成 `ACCESS_TOKEN`（安全令牌）
4. 部署完成后：
   - 记下 Render 给你的域名，如 `https://bikini-workbench.onrender.com`
   - 在 Render Dashboard → 该服务 → **Environment** 里能看到 `ACCESS_TOKEN` 的值
   - （可选）在 `AI_API_KEY` 填入你的 DeepSeek key，AI 副驾即可用
5. 打开域名 → 设置页 → 把 `ACCESS_TOKEN` 填进「云端访问令牌」保存，即可同步。

> 免费档（已对新建账号取消）无法挂持久盘；要数据不丢请用 starter 及以上。

---

## 三、方式 B：国内轻量云（腾讯云/阿里云）Docker 部署

1. 买一台轻量应用服务器（系统选 **Ubuntu 22.04**），装 Docker：
   ```bash
   curl -fsSL https://get.daocloud.io/docker | sh   # 或官方 get.docker.com
   ```
2. 把本目录传到服务器（`scp -r . root@<你的IP>:/opt/workbench`），进入目录构建：
   ```bash
   cd /opt/workbench
   docker build -t bikini-workbench .
   ```
3. 运行（数据挂到名为 `workbench-data` 的卷，持久）：
   ```bash
   docker run -d --restart=always -p 8080:56170 \
     -v workbench-data:/data \
     -e ACCESS_TOKEN=$(openssl rand -hex 16) \
     -e AI_API_KEY=你的DeepSeekKey \
     --name workbench bikini-workbench
   ```
4. 浏览器开 `http://<服务器IP>:8080` 即可。
5. （强烈建议）用宝塔面板 / Nginx 反代到 80/443 并配免费证书，这样「添加到主屏幕」才是全屏 PWA、且地址好看。
6. App 设置页填入第 3 步生成的 `ACCESS_TOKEN`，完成同步。

---

## 四、环境变量说明（优先级：环境变量 > config.json）

| 变量 | 作用 | 默认 |
|------|------|------|
| `PORT` | 监听端口 | `config.port` / 56170 |
| `DATA_DIR` | 数据目录（state/hot/inbox） | `./data` |
| `ACCESS_TOKEN` | 访问令牌；设了就强制校验，所有 `/api/*` 必须带 | 空=不校验 |
| `AI_API_KEY` | DeepSeek key | `config.ai.apiKey` |
| `AI_ENDPOINT` / `AI_MODEL` | AI 接口地址 / 模型 | DeepSeek 官方 |
| `HOT_ENDPOINT` / `HOT_APIKEY` | 第三方热点接口 | `config.hot.*` |

> 把密钥放环境变量，就**不需要**提交 `config.json`，仓库可公开。

---

## 五、客户端怎么用

- 手机/电脑浏览器打开你的域名 → 数据自动从服务器同步（服务端为唯一真源）。
- 若部署时设了 `ACCESS_TOKEN`：设置页 → 云端访问令牌 → 填入保存，否则同步/AI 会 401。
- 同一份数据可在任意设备打开，加「添加到主屏幕」即为全屏 App（需 HTTPS）。

## 六、从本机现有数据迁移

两种方式任选：
1. **导出导入**：本机工作台「设置 → 导出备份」→ 云端打开后「导入数据」。
2. **搬文件**：把本机 `data/state.json` 拷到服务器的 `DATA_DIR/state.json`（Docker 即 `workbench-data` 卷），重启容器。
