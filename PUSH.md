# 从零上线到 Render（无需懂代码）

> 目标：把你这台 Mac 上的工作台变成一个**固定 https 地址、永远在线、数据不丢**的云端 App。
> 前提：本地代码已整理好（见 `git log`，密钥已排除，可直接推送）。

---

## 第 1 步：注册 GitHub（免费，2 分钟）

1. 打开 https://github.com → 点 **Sign up**。
2. 填用户名、邮箱、密码 → 验证邮箱（收一封邮件点一下）。
3. 注册完**先登录着**，后面第 5 步要用 GitHub 登录 Render。

## 第 2 步：新建一个空仓库

1. 右上角 **+** → **New repository**。
2. Repository name 填：`bikini-workbench`
3. 选 **Public** 或 **Private** 都行（代码里没密钥，Public 也没事）。
4. **不要**勾 "Add a README file" 等任何选项，保持空仓库。
5. 点 **Create repository**。
6. 创建后页面会显示仓库地址，复制 **HTTPS** 那行，形如：
   `https://github.com/你的用户名/bikini-workbench.git`

## 第 3 步：生成推送令牌（GitHub 不用密码推送）

1. 点头像 → **Settings** → 左栏最下 **Developer settings**。
2. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**。
3. Note 随便填（如 `render-push`），Expiration 选 30 days 或 No expiration。
4. 勾选 **repo**（全选 repo 那一组）。
5. 拉到底点 **Generate token**。
6. **复制生成的令牌**（只显示这一次！）。形如 `ghp_xxxxxxxxxxxx`。

## 第 4 步：把代码传上 GitHub（你不用跑命令）

> ⚠️ 你这台 Mac 的网络把 `github.com` 的 Git 推送通道挡掉了，所以"在终端敲 git push"会连不上、失败。
> 我已准备好改用 GitHub 接口直接传，你完全不用碰终端黑框。

你只需做完第 1–3 步（都是网页上点，不用打字），然后把这两样发给我：
- 你的 **GitHub 用户名**
- 第 3 步复制的 **令牌（PAT）**

我收到后用接口把 19 个文件一次性传上去，并告诉你仓库地址。
（推完你在 GitHub → Settings → Developer settings → Personal access tokens 里把那个令牌删掉/作废即可，安全无虞。）

传送成功后，刷新你的 GitHub 仓库页面，能看到 `server.js`、`render.yaml` 等文件即成功。

## 第 5 步：用 Render 一键部署

1. 打开 https://render.com → 点 **Sign Up** → 选 **Continue with GitHub**（用第 1 步的号登录，授权 Render 访问你的仓库）。
2. 登录后右上 **New** → **Blueprint**。
3. 选 `bikini-workbench` 这个仓库 → Render 会读取仓库里的 `render.yaml` 自动配置。
4. 确认配置：服务名 `bikini-workbench`、运行 `node server.js`、挂 1GB 持久盘。
   - ⚠️ **`plan: starter`（约 $7/月）才能挂持久盘保住数据**；免费档数据会丢。
   - Render 会要求绑定一张信用卡（仅验证，不扣费，可随时删服务停止收费）。
5. 点 **Apply / Deploy**。等待几分钟，状态变绿。
6. 部署完成后拿到你的固定地址，形如：
   `https://bikini-workbench.onrender.com`

## 第 6 步：填令牌 + 导入数据

1. 打开上一步的地址 → 进 **设置**。
2. 在 Render Dashboard → 该服务 → **Environment** 里找到 `ACCESS_TOKEN`（自动生成的随机串）复制。
3. App 设置页 → **云端访问令牌** → 粘贴保存。（不填会 401 同步失败）
4. （可选）在 Render Environment 的 `AI_API_KEY` 填入你的 DeepSeek key，AI 副驾即可用。
5. **导入你现有的数据**：本机工作台「设置 → 导出备份」→ 云端打开后「设置 → 导入数据」。

完成！手机/电脑任何网络打开那个 `onrender.com` 地址，就是完整版，数据自动同步。

---

## 常见问题

- **首屏打开很慢？** starter 档不会休眠；若是免费档，15 分钟没人用会"睡着"，首次打开等十几秒唤醒。
- **地址会变吗？** 不会，`onrender.com` 是固定域名。
- **数据会丢吗？** starter 档挂了持久盘，重启/重新部署都不丢。
- **想换地址/删服务？** Render Dashboard 里直接删服务即可，不收费。
