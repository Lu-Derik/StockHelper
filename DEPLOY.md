# StockHelper 部署手册（个人版）

个人版架构：**前端跑在 Vercel（公网）**，**后端 + 数据库 + Chrome 扩展全部留在本机**，
两者通过 **Cloudflare Tunnel** 用 HTTPS 打通。只有你本人通过 `stock.unibuy.fun` 远程访问。

```
浏览器 (你)
  └─ https://stock.unibuy.fun       → Vercel 静态前端 (Next.js)
        └─ fetch X-API-Key ───────→ https://stock-api.unibuy.fun
                                        └─ Cloudflare Tunnel "Stock" (Docker)
                                              └─ server:3001 (compose 网络内)
                                                    └─ postgres :5435
本机 Chrome 扩展 ─ 直连 http://localhost:3011 → 容器 3001 (豁免密钥)
```

> 端口说明：容器内部恒为 3001；本机映射用 **3011**（`3011:3001`），避开 n8n 隧道
> 已占用的 `localhost:3001`（liaozai-api）。隧道走 `server:3001`（容器网络），不碰本机端口。

关键安全点：
- 数据库**永不**对公网开放，只有后端容器连它。
- 公网经隧道进来的 `/api` 请求必须带 `X-API-Key`（= `API_SECRET`）。
- 本机 `localhost` 请求（Chrome 扩展）豁免密钥校验，照常工作。
- `apps/server/.env` 已 gitignore，含 `TUSHARE_TOKEN` / `API_SECRET`，**不要提交**。

---

## 一、前端部署到 Vercel（自动部署）

   1. 在 https://vercel.com 新建项目，导入这个 Git 仓库。
   2. **Root Directory** 设为 `apps/web`（Vercel 会自动识别 Next.js）。
   3. 配置环境变量（Production & Preview）：
      | 名称 | 值 |
      | --- | --- |
      | `NEXT_PUBLIC_API_URL` | `https://stock-api.unibuy.fun` |
      | `NEXT_PUBLIC_API_KEY` | `apps/server/.env` 里的 `API_SECRET` 值 |
   4. 部署。之后**每次 push 到默认分支，Vercel 会自动重新构建上线**（问题①解决）。

   ### 绑定子域名 stock.unibuy.fun
   - Vercel 项目 → Settings → Domains → 添加 `stock.unibuy.fun`。
   - Cloudflare DNS 加一条记录：
   - 类型 `CNAME`，名称 `stock`，目标 `cname.vercel-dns.com`，**Proxy 关闭（DNS only，灰云）**。
   - 回 Vercel 等待证书签发完成。

   ---

## 二、后端 + 数据库跑在本机 Docker

   `apps/server/.env` 确认包含（已存在）：
   ```
   DATABASE_URL=postgresql://stockhelper:stockhelper2024@localhost:5435/stockhelper
   PORT=3001
   TUSHARE_TOKEN=...
   ALLOWED_ORIGINS=http://localhost:3000,https://stock.unibuy.fun
   API_SECRET=...                # 公网密钥，前端 NEXT_PUBLIC_API_KEY 用同一个值
   CLOUDFLARE_TUNNEL_TOKEN=      # 见第三步填入
   ```
   > 注意：compose 里 server 容器内部用 `stockhelper-db:5432` 连库（已在 compose 覆盖），
   > `.env` 里的 `localhost:5435` 仅供本机直接 `npm run dev` 时使用。

   启动数据库 + 后端：
   ```bash
   docker compose --env-file apps/server/.env up -d --build stockhelper-db server
   ```

   首次需要建表（迁移）。在宿主机执行（连 5435 端口）：
   ```bash
   npm run db:migrate
   ```

   验证后端：
   ```bash
   curl http://localhost:3011/health        # {"ok":true}
   ```

   ---

## 三、用 Cloudflare Tunnel 暴露本地后端（HTTPS）

   远程前端是 HTTPS，浏览器禁止它调用 HTTP 的本地地址（混合内容），所以需要隧道给后端一个 HTTPS 入口。

   > 用**独立的** "Stock" 隧道（不复用本机已有的 n8n cloudflared），与 n8n 完全隔离。

   1. 已建好名为 **Stock** 的隧道。复制它的 **tunnel token**（`eyJ...` 那串），
      填入 `apps/server/.env` 的 `CLOUDFLARE_TUNNEL_TOKEN=`。
   2. 在 Stock 隧道的 **Routes → Add route → Published application** 配置：
      - Subdomain `stock-api`，Domain `unibuy.fun`，Path 空。
      - Service：`HTTP`，URL `server:3001`（容器间用服务名，**不是** localhost）。
      - 保存后 Cloudflare 会自动给 `stock-api.unibuy.fun` 建 DNS。
      - 注意别用 `api`（被 n8n 占用）。
   3. 启动隧道容器：
   ```bash
   docker compose --env-file apps/server/.env up -d cloudflared
   docker compose logs -f cloudflared      # 看到 "Registered tunnel connection" 即成功
   ```
   4. 验证（带密钥）：
   ```bash
   curl -H "X-API-Key: <API_SECRET>" https://stock-api.unibuy.fun/api/stocks
   ```

   6. How to set **Public hostname** for a tunnel:
      a. 点开 **"Add route"**:
      b. 选择 **“Published application”**
      c. 填入：
         Subdomain:        stock-api
         Domain:           下拉选 unibuy.fun
         Path:             留空
         Service URL:      http://server:3001
      d. 验证：
         curl -H "X-API-Key: <你的API_SECRET>" https://api.unibuy.fun/api/stocks


      至此远程前端即可访问本地后端与本地数据库（问题②③解决）。

      ### （推荐）再加一层 Cloudflare Access
      个人版只有你用，建议把 `stock.unibuy.fun` 和 `api.unibuy.fun` 用 Zero Trust → Access
      建一个策略，限定只有你的邮箱（`ldru0519@gmail.com`）能登录，双保险。

      ---

   ## 四、Chrome 扩展

   扩展只在你本机跑，直连 `http://localhost:3011`（已随端口改动更新 background.js /
   offscreen.js / manifest.json）。**无需分发**（个人版不对外）。它命中 localhost，
   后端豁免密钥校验。

   > 改了扩展文件后，去 `chrome://extensions` 点 StockHelper 的「重新加载」按钮使其生效。

---

## 五、日常更新流程

- **改前端**：push → Vercel 自动部署。
- **改后端**：
```bash
docker compose --env-file apps/server/.env up -d --build server
```
- **改了数据库结构**：`npm run db:migrate`。
- **停服**：`docker compose down`（数据卷保留）。

---

## 六、之后要对外开放时（暂不实现）

当前“AI”是你本人的 DeepSeek 会话 + 你的扩展驱动，真正多用户需要：
每个用户各自的 AI 凭据、查询排队与隔离、扩展改为多账号、用户体系与鉴权。
属于较大改造，留待后续。
