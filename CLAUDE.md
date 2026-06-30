# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

NovelAgent 是一个 AI 小说创作工作空间，目前是 npm workspaces monorepo：

- `packages/frontend`：React 19 + TypeScript + Vite 前端，使用 Tailwind CSS/shadcn 风格组件、Tiptap 富文本编辑器、Zustand 状态管理。
- `packages/backend`：Express + TypeScript 后端 API，使用 Prisma ORM、SQLite、本地邮箱密码登录、JWT/bcrypt 鉴权。

应用核心是三栏式写作界面：左侧书架/导航，中间主编辑和管理视图，右侧 AI 助手面板。

## 常用命令

除非特别说明，命令都在仓库根目录执行。

### 安装与开发启动

```powershell
npm install
npm run dev              # 同时启动后端和前端
npm run dev:backend      # 只启动后端，默认 http://localhost:3001
npm run dev:frontend     # 只启动前端，默认 http://localhost:5173
```

前端 API 默认请求 `http://localhost:3001/api`；需要改地址时使用 `VITE_API_URL`。

### 构建与检查

```powershell
npm run build            # 先构建 backend，再构建 frontend
npm run build:backend
npm run build:frontend
npm run lint --workspace=frontend
```

当前仓库没有根级 `test` 脚本，也没有已提交的应用测试套件。不要编造测试命令；在测试脚本加入前，优先使用 build/lint 加手动冒烟检查。

### 数据库 / Prisma

```powershell
npm run db:generate      # 在 backend workspace 执行 prisma generate
npm run db:migrate       # 在 backend workspace 执行 prisma migrate dev
npm run db:studio        # 打开 Prisma Studio
npm run db:reset         # 重置本地 SQLite 数据库，会删除本地数据
```

后端环境变量文件是 `packages/backend/.env`。默认 `DATABASE_URL="file:./dev.db"`，对应 Prisma 使用的本地 SQLite 数据库 `packages/backend/prisma/dev.db`。

### 手动冒烟检查

启动 `npm run dev` 后可检查：

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3001/api/health"
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:5173"
```

## 高层架构

### 前端数据模型与持久化

核心领域类型在 `packages/frontend/src/types/index.ts`，包括 `Novel`、`Chapter`、`Character`、`WorldSetting`、`PlotCard`、`Foreshadowing`、`Session`、`Message`。

`packages/frontend/src/stores/novelStore.ts` 是主要 Zustand store。它把创作数据持久化到 localStorage 的 `novel-agent-storage`，并采用“先本地乐观更新，再异步同步云端”的模式。只要存在 JWT token，新增/更新/删除小说、章节、角色、世界观、大纲、伏笔时会同时调用对应后端 API；服务端创建成功后会把临时本地 ID 替换为服务端 ID。

重要数据规则：修改版本时千万不要丢已有数据。尤其要小心 `novel-agent-storage`、迁移逻辑、后端同步逻辑、Prisma migration、数据库 reset 等可能影响用户创作内容的地方。

### 登录、迁移与同步流程

`packages/frontend/src/stores/authStore.ts` 持久化登录状态到 `novel-agent-auth`。JWT token 由 `packages/frontend/src/api/client.ts` 管理，localStorage key 是 `novel-agent-auth-token`。API 客户端会自动附加 `Authorization: Bearer ...`；遇到 401 会清除 token 并派发 `auth:logout` 事件。

`packages/frontend/src/App.tsx` 是登录态入口：

1. 已登录时先执行 `fetchMe()`。
2. 如果发现旧 localStorage 数据且 `novel-agent-migrated` 未设置，先显示 `MigrationWizard`，避免直接拉取空云端数据覆盖本地创作数据。
3. 已迁移或本地无旧数据时，再调用 `fetchAllFromBackend({ preserveLocalIfRemoteEmpty: true })`。

`packages/frontend/src/api/sync.ts` 负责从后端全量拉取数据、检查本地是否有可迁移数据、把 localStorage 数据导入后端。`packages/backend/src/routes/migrate.ts` 使用 Prisma transaction 做一次性导入，确保全部成功才提交。

### 后端 API 结构

`packages/backend/src/index.ts` 组装 Express 应用：CORS、JSON body、请求日志、`/api/health`、业务路由、404 和错误处理。

后端路由按资源放在 `packages/backend/src/routes/`：

- `auth.ts`：`/api/auth/register`、`/api/auth/login`、`/api/auth/me`
- `novels.ts`：`/api/novels`
- `chapters.ts`：`/api/novels/:novelId/chapters`、`/api/chapters/:id`
- `characters.ts`、`worldSettings.ts`、`plotCards.ts`、`foreshadowings.ts`
- `migrate.ts`：`/api/migrate/import`

受保护路由使用 `packages/backend/src/middlewares/auth.ts` 校验 JWT，并把 `req.userId` 写入请求对象。`packages/backend/src/types/express.d.ts` 为 Express Request 补充了这个类型。

`packages/backend/prisma/schema.prisma` 是数据库结构的权威来源。`User` 拥有多本 `Novel`；`Novel` 级联关联章节、角色、世界观、大纲卡片和伏笔。SQLite 中 `Character.aliases` 存为 JSON 字符串，前端同步代码会转换成数组。

### 前端视图组织

`packages/frontend/src/App.tsx` 负责三栏布局、左右面板宽度持久化、登录页和迁移弹窗。

`packages/frontend/src/components/layout/MainContent.tsx` 根据 `ViewType` 切换中间主视图：

- `chapters`：`ChapterList` + `ChapterEditor`
- `outline`：`OutlineView` 和大纲/伏笔相关组件
- `characters`：人物管理与编辑弹窗
- `world`：世界观管理与编辑弹窗
- `settings`：AI API 提供商、模型和参数设置

`packages/frontend/src/components/layout/Sidebar.tsx` 管理书架、小说选择、视图导航和退出登录。`packages/frontend/src/components/layout/AgentPanel.tsx` 是右侧 AI 对话面板。

### AI 助手流程

AI 配置保存在 `packages/frontend/src/stores/settingsStore.ts` 的 `novel-agent-settings`。内置提供商预设包括 DeepSeek、OpenAI 兼容接口、腾讯云混元、自定义。虽然服务文件名是 `packages/frontend/src/services/deepseek.ts`，它实际按 OpenAI-compatible `/chat/completions` 格式请求用户配置的 Base URL、模型、API Key、temperature 和 max tokens。用户的大模型 API Key 仍保留在前端。

`AgentPanel` 发送消息前会构建增强上下文，包括当前小说信息、大纲、章节列表、当前章节片段，以及每本书独立的 `agentPrompt`。AI 响应通过 `DeepSeekService.chatStream` 流式返回，保存到本地会话后，如果内容包含结构化标记，会调用 `autoSyncContent` 自动同步到左侧面板。

`packages/frontend/src/lib/autoSync.ts` 解析 AI 输出中的结构化标记：`【基本信息】`、`【大纲】`、`【角色】`、`【世界观】`、`【章节】`、`【修改】`、`【删除】`。同步时会优先更新同名/同标题内容，避免重复追加；也支持精确修改和删除指令。

Agent 面板内置本地斜杠命令：`/clear`、`/status`、`/help`、`/export`、`/compact`。

## 项目维护约定

- 修改代码后同步更新 `DEVELOPMENT_LOG.md`，记录问题、方案、设计决策和验证结果。
- 保持 Windows/PowerShell 命令写法；如果需要 Python，使用 `py`，不要使用 `python` 或 `uv`。
- 旧 README/历史日志中可能仍有纯前端时期的路径（如根 `src/`）；当前实现以 `packages/frontend` 和 `packages/backend` 为准。
- 对会删除或覆盖数据的操作（例如 `npm run db:reset`、删除 localStorage 数据、修改迁移逻辑）必须先确认影响范围。
