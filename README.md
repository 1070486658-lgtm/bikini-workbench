# 比奇堡工作台 (Bikini Workbench)

一个个人工作台 Web App：每日任务、摄影复盘、爆款客片灵感、基金记账、AI 副驾、热点聚合。

- 前端零构建（原生 HTML/JS/CSS）
- 后端零依赖（`node server.js` 即起）
- 跨设备同步（服务端为唯一真源）
- 支持 Render Blueprint / Docker 一键部署

## 快速本地运行

```bash
node server.js          # 默认 http://localhost:56170
```

## 部署

见 `DEPLOY.md`（Render / 国内轻量云 / Docker 三种方式）。

> 密钥（DeepSeek key、访问令牌）一律走环境变量或 `config.json`（已 gitignore），不要提交进仓库。
