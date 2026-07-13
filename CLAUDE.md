# CLAUDE.md

StockHelper — A股 AI 研究助手。npm workspaces monorepo：Next.js 15 前端（`apps/web`）+ Koa/TypeScript 后端（`apps/server`）+ 共享类型（`packages/shared`），数据存 PostgreSQL，AI 回答通过 Chrome 扩展（`apps/extension`）驱动 DeepSeek 抓取。

> `apps/web/AGENTS.md` 另有前端专属说明（Next.js 版本较新，写代码前先查 `node_modules/next/dist/docs/`）。

## 常用命令

从**仓库根目录**运行（workspaces）：

```bash
npm install                 # 安装所有 workspace 依赖

# 开发
npm run dev                 # 同时起后端(3001)+前端(3000)
npm run dev:web             # 只起前端  → http://localhost:3000
npm run dev:server          # 只起后端  → http://localhost:3001

# 数据库（Docker）
npm run db:up               # 启动 PostgreSQL 容器
npm run db:down             # 停止
npm run db:migrate          # 建表 / 增量迁移（幂等，用 IF NOT EXISTS）

# 构建
npm run build               # 构建所有 workspace
npm run build --workspace=apps/web      # 只构建前端 (next build)
npm run build --workspace=apps/server   # 只构建后端 (tsc → dist/)

# Lint（仅前端配置了 ESLint）
npm run lint --workspace=apps/web        # eslint (next core-web-vitals + typescript)
```

### 类型检查（提交前的主要门禁）

本项目**没有配置测试框架**——用类型检查 + lint 作为质量门禁，UI 改动用浏览器预览人工验证。

```bash
cd apps/web && npx tsc --noEmit      # 前端类型检查
cd apps/server && npx tsc --noEmit   # 后端类型检查
```

### 后端 Docker 部署（生产/本机容器）

后端跑在 `stockhelper-server` 容器里（宿主 3011 → 容器 3001），用 `tsx` 直接执行 TS。改完后端代码后重建：

```bash
# 注意：buildx/bake 有时"构建成功"却不把新镜像加载进本地镜像库，导致 up 仍用旧镜像。
# 用 legacy builder 强制重建 + 重建容器，最可靠：
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 \
  docker compose --env-file apps/server/.env build server
docker compose --env-file apps/server/.env up -d --force-recreate server

curl http://localhost:3011/health        # 应返回 {"ok":true}
```

改了数据库 schema 后，别忘了 `npm run db:migrate`（或对运行中的库执行等价 `ALTER ... IF NOT EXISTS`）。

## 代码风格

**通用（TS 全栈）**
- TypeScript strict；**不写分号**；**单引号**；**2 空格**缩进。
- 优先箭头函数与 `const`；模块级用具名导出。
- 注释写「为什么」，不复述「做什么」；与周围代码保持同样的注释密度和命名习惯。
- 面向用户的文案用中文；标识符、类型名、代码注释用英文（既有中文注释可沿用）。
- 机密（`apps/server/.env`：`TUSHARE_TOKEN` / `API_SECRET` / `CLOUDFLARE_TUNNEL_TOKEN`）已 gitignore，**绝不提交**。

**前端（apps/web）**
- React 函数组件 + Hooks；客户端组件顶部加 `'use client'`。
- 样式用 Tailwind；复用 `components/ui/*`（shadcn/ui）；类名合并用 `lib/utils` 的 `cn()`。
- 用 `useSearchParams` 的组件必须包在 `<Suspense>` 里（否则 Vercel 构建报错）。
- **不要在 `useState(initializer)` 里读 `localStorage`**——服务端/客户端首屏不一致会导致 hydration mismatch 白屏；改在 `useEffect` 里加载持久化值。
- 所有后端请求走 `lib/api` 的 `apiFetch(path, init)`（自动带 `X-API-Key` 与 base URL）。
- 路径别名 `@/` 指向 `apps/web`。

**后端（apps/server）**
- Koa + `@koa/router`，路由按域拆分在 `src/routes/*`，统一 `prefix`。
- 请求体用 **Zod** schema 校验（`z.object(...).parse(ctx.request.body)`）。
- 直接用 `pg` 参数化查询（`$1, $2`）访问 `src/db/pool` 的连接池；迁移写在 `src/db/migrate.ts`，一律 `IF NOT EXISTS` 保持幂等。
- 返回体约定 `{ success: true, ... }`；错误设 `ctx.status` + `{ error }`。

## 目录结构

```
apps/
  web/        Next.js 15 (App Router) 前端；页面在 app/*，组件在 components/*
  server/     Koa + TS 后端；routes/ services/ db/
  extension/  Chrome MV3 扩展（background.js / content.js / app-bridge.js / popup.*）
packages/
  shared/     跨端共享的 TS 类型
docker-compose.yml   PostgreSQL / server / cloudflared 隧道
```
