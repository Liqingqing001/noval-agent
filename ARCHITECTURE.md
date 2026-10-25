# NovelAgent 架构文档

> 目的：30 分钟掌握整个仓库的"骨架"和"血液流向"，避免被文件数量吓到。

---

## 📌 仓库速览

- **Monorepo 结构**：npm workspaces，`packages/frontend` + `packages/backend`
- **前端**：React 19 + TypeScript + Vite + Tailwind CSS
- **后端**：Express + TypeScript + Prisma + SQLite
- **认证**：JWT + bcrypt，本地邮箱密码登录
- **数据流**：本地乐观更新 + 异步云同步
- **AI 调用走 SSE 流式**：OpenAI 兼容协议

---

## 🏛️ 第一部分：分层架构

整个应用可以理解为 **5 层蛋糕**：

```
┌────────────────────────────────────────────────────────┐
│  第 1 层：入口层（启动整个应用）                            │
│   main.tsx · App.tsx                                    │
└────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────┐
│  第 2 层：布局层（三栏式 UI 框架）                         │
│   Sidebar.tsx │ MainContent.tsx │ AgentPanel.tsx         │
└────────────────────────────────────────────────────────┘
        ↓                  ↓                 ↓
┌────────────────────────────────────────────────────────┐
│  第 3 层：业务视图层（每个面板 = 一个组件）                  │
│   chapters │ outline │ characters │ world │ settings     │
└────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────┐
│  第 4 层：逻辑层（真正在干活的地方）                        │
│   stores/ · lib/ · services/ · api/                     │
└────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────┐
│  第 5 层：基础层（类型 + 工具 + UI 组件）                   │
│   types/ · lib/utils.ts · components/ui/                │
└────────────────────────────────────────────────────────┘
```

---

## 📂 第二部分：目录结构

```
novel-agent/
├── packages/
│   ├── frontend/                 # 前端 React 应用
│   │   ├── src/
│   │   │   ├── api/              # API 客户端
│   │   │   │   ├── client.ts     # Axios 封装 + JWT 管理
│   │   │   │   ├── sync.ts       # 云同步逻辑
│   │   │   │   ├── novels.ts     # 小说 CRUD
│   │   │   │   ├── chapters.ts   # 章节 CRUD
│   │   │   │   ├── characters.ts # 角色 CRUD
│   │   │   │   └── ...
│   │   │   ├── components/
│   │   │   │   ├── layout/       # 三栏布局
│   │   │   │   ├── chapter/      # 章节列表 + 编辑器
│   │   │   │   ├── outline/      # 大纲视图
│   │   │   │   ├── characters/   # 人物管理
│   │   │   │   ├── world/        # 世界观管理
│   │   │   │   └── ui/           # shadcn 组件
│   │   │   ├── stores/
│   │   │   │   ├── novelStore.ts # 主数据 store
│   │   │   │   ├── authStore.ts  # 认证状态
│   │   │   │   └── settingsStore.ts
│   │   │   ├── services/
│   │   │   │   └── deepseek.ts   # AI 流式调用
│   │   │   ├── lib/
│   │   │   │   ├── autoSync.ts   # AI 输出解析
│   │   │   │   └── utils.ts
│   │   │   └── types/            # TypeScript 类型
│   │   └── ...
│   │
│   └── backend/                  # 后端 Express 应用
│       ├── src/
│       │   ├── index.ts          # Express 入口
│       │   ├── routes/           # API 路由
│       │   │   ├── auth.ts       # 注册/登录/me
│       │   │   ├── novels.ts
│       │   │   ├── chapters.ts
│       │   │   ├── characters.ts
│       │   │   ├── worldSettings.ts
│       │   │   ├── plotCards.ts
│       │   │   ├── foreshadowings.ts
│       │   │   └── migrate.ts    # 数据迁移
│       │   └── middlewares/
│       │       └── auth.ts       # JWT 校验
│       └── prisma/
│           ├── schema.prisma     # 数据库模型
│           └── dev.db            # SQLite 数据库
│
├── CLAUDE.md                     # 项目指南
├── ARCHITECTURE.md               # 本文件
└── package.json                  # Monorepo 配置
```

---

## 🗄️ 第三部分：数据库模型 (Prisma)

```
┌──────────────┐
│    User      │  用户
│ ─────────── │
│ id           │
│ email        │  唯一
│ password     │  bcrypt 哈希
│ createdAt    │
└──────┬───────┘
       │ 1:N
       ↓
┌──────────────┐
│    Novel     │  小说
│ ─────────── │
│ id           │
│ userId       │  外键
│ title        │
│ genre        │
│ description  │
│ status       │
│ coverImage   │  封面图片 (base64)
│ agentPrompt  │  自定义 AI 提示词
└──────┬───────┘
       │ 1:N
       ├──────────────────┬──────────────────┐
       ↓                  ↓                  ↓
┌───────────┐      ┌───────────┐      ┌───────────┐
│ Chapter   │      │ Character │      │ WorldSet. │
│ ──────── │      │ ──────── │      │ ──────── │
│ id        │      │ id        │      │ id        │
│ novelId   │      │ novelId   │      │ novelId   │
│ title     │      │ name      │      │ category  │
│ content   │      │ role      │      │ title     │
│ wordCount │      │ sequence  │      │ content   │
│ sequence  │      │ aliases[] │      └───────────┘
└───────────┘      │ description│
       ↑           └───────────┘
       │ 1:N (opt)
       ↓
┌───────────┐      ┌──────────────┐
│ PlotCard  │      │ Foreshadow.  │
│ ──────── │      │ ────────    │
│ id        │      │ id           │
│ novelId   │      │ novelId      │
│ title     │      │ title        │
│ summary   │      │ description  │
│ actNumber │      │ status       │
│ sequence  │      │ chapterId    │
│ status    │      └──────────────┘
│ chapterId │
└───────────┘
```

### Character 角色定位

| role 值 | 显示名称 | 排序权重 |
|---------|---------|---------|
| `protagonist` | 主角 | 最高（显示在最前）|
| `supporting` | 配角 | 中间 |
| `minor` | 龙套 | 最低 |

---

## 🔄 第四部分：认证与数据流

### 登录流程

```
用户输入邮箱密码
       ↓
POST /api/auth/login
       ↓
bcrypt 验证密码
       ↓
生成 JWT token (7天有效期)
       ↓
前端存到 localStorage: novel-agent-auth-token
       ↓
api/client.ts 自动附加 Authorization: Bearer ...
```

### 数据同步模式

**本地优先 + 云端备份**

```
┌─────────────────────────────────────────────────────────┐
│                    前端 novelStore                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │  localStorage: novel-agent-storage              │   │
│  │  - 乐观更新（立即反馈）                           │   │
│  │  - 临时 ID（创建时）                             │   │
│  └──────────────────────┬──────────────────────────┘   │
└─────────────────────────┼──────────────────────────────┘
                          │
                          │ 异步同步（有 JWT 时）
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    后端 API                              │
│  POST /api/novels        → 创建成功返回真实 ID            │
│  PUT  /api/novels/:id    → 更新                          │
│  DELETE /api/novels/:id  → 删除                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    SQLite 数据库                         │
│  packages/backend/prisma/dev.db                         │
└─────────────────────────────────────────────────────────┘
```

### 迁移流程

首次登录时检测旧 localStorage 数据：

```
App.tsx 检测 novel-agent-migrated 标记
       ↓
未迁移 + 有旧数据 → 显示 MigrationWizard
       ↓
用户确认迁移 → POST /api/migrate/import
       ↓
Prisma transaction 一次性导入
       ↓
成功 → 设置 novel-agent-migrated = true
失败 → 提示用户，保留本地数据
```

---

## 🤖 第五部分：AI 对话全流程

```
   ┌─────────────────┐
   ① 用户点击发送     │  AgentPanel.tsx
   │ handleSend()    │
   └────────┬────────┘
            ↓
   ┌─────────────────────────┐
   ② 构造消息列表             │  AgentPanel.tsx
   │ · system prompt         │  (含 agentPrompt 增强)
   │ · 历史对话（已压缩）     │  getTrimmedMessages()
   │ · 小说上下文            │  大纲/章节/角色/世界观
   │ · 当前用户输入          │
   └────────┬────────────────┘
            ↓
   ┌─────────────────────────┐
   ③ 调用 AI API             │  services/deepseek.ts
   │ POST /chat/completions  │  (SSE 流式)
   │ + Bearer Token          │  用户配置的 API Key
   └────────┬────────────────┘
            ↓
   ┌─────────────────────────┐
   ④ 流式接收 AI 输出         │  services/deepseek.ts
   │ onStream(chunk)         │  → streamingContent
   │ 实时显示到聊天框         │
   └────────┬────────────────┘
            ↓
   ┌─────────────────────────┐
   ⑤ AI 响应完成              │  AgentPanel.tsx
   │ · 保存消息到 session    │  updateSession()
   │ · 解析结构化内容         │  lib/autoSync.ts
   │ · 写入 novelStore       │  addPlotCard() etc.
   │ · 异步同步到云端        │  API calls
   └────────┬────────────────┘
            ↓
   ┌─────────────────────────┐
   ⑥ 左侧面板自动更新         │  Zustand 订阅触发
   └─────────────────────────┘
```

---

## 🏷️ 第六部分：autoSync.ts 解析规则

### 支持的 7 种标签

| 标签 | 作用 | 业务操作 |
|------|------|---------|
| `【基本信息】` | 题材、简介 | `updateNovel()` |
| `【大纲】` | 情节点列表 | `addPlotCard()` / `updatePlotCard()` |
| `【角色】` | 角色信息 | `addCharacter()` / `updateCharacter()` |
| `【世界观】` | 世界观设定 | `addWorldSetting()` / `updateWorldSetting()` |
| `【章节】` | 章节内容 | `addChapter()` / `updateChapter()` |
| `【修改】` | 精准修改 | 按"原内容→新内容"替换 |
| `【删除】` | 删除内容 | `deleteChapter()` etc. |

### 智能特性

1. **同名检查**：避免 AI 重复输出时产生重复数据
2. **未闭合兜底**：AI 输出被截断时也能解析（≥ 50 字才同步）
3. **章节号容错**：`第一章 觉醒` 和 `觉醒` 视为同一章节
4. **精准修改**：可以只改某一段，不用重写整章

---

## 🎨 第七部分：UI 关键特性

### 三栏布局

| 区域 | 组件 | 宽度 | 特性 |
|-----|------|-----|------|
| 左侧 | Sidebar.tsx | 固定 240px | 书架 + 导航 |
| 中间 | MainContent.tsx | 自适应 | 章节列表 + 编辑器（可拖拽分隔）|
| 右侧 | AgentPanel.tsx | 可拖拽 320-480px | AI 对话面板 |

### 可拖拽分隔条

- 章节列表与编辑器之间：`MainContent.tsx` 的 `chapterListWidth` 状态
- 右侧 AI 面板宽度：`App.tsx` 的 `agentPanelWidth` 状态
- 实现方式：mousedown → document mousemove → document mouseup

### 章节编号

使用中文数字：第一章、第二章...第十章、第十一章...

---

## 🔧 第八部分：常用命令

```powershell
# 开发
npm run dev              # 同时启动前后端
npm run dev:backend      # 只启动后端 :3001
npm run dev:frontend     # 只启动前端 :5173

# 构建
npm run build

# 数据库
npm run db:generate      # prisma generate
npm run db:migrate       # prisma migrate dev
npm run db:studio        # 打开 Prisma Studio
npm run db:reset         # 重置数据库（删除数据）
```

---

## 🎯 第九部分：关键文件速查表

| 想了解什么 | 看哪个文件 |
|----------|----------|
| 应用启动 | `frontend/src/main.tsx` + `App.tsx` |
| 数据模型 | `frontend/src/types/index.ts` |
| 数据库结构 | `backend/prisma/schema.prisma` |
| 认证流程 | `backend/src/routes/auth.ts` + `frontend/src/stores/authStore.ts` |
| API 客户端 | `frontend/src/api/client.ts` |
| 云同步逻辑 | `frontend/src/api/sync.ts` |
| 用户点发送后发生了什么 | `frontend/src/components/layout/AgentPanel.tsx` 的 `handleSend` |
| AI 是怎么调用的 | `frontend/src/services/deepseek.ts` |
| AI 输出怎么变成数据 | `frontend/src/lib/autoSync.ts` |
| 数据怎么存 | `frontend/src/stores/novelStore.ts` |
| 角色拖拽排序 | `frontend/src/components/layout/MainContent.tsx` 的 CharactersView |

---

*最后更新: 2026-06-30*

## 2026-10-25 模型设置架构更新

模型配置与多协议请求的权威实现为：

- `packages/frontend/src/lib/modelConfig.ts`：ModelConfig、12 类服务商预设、四种协议、地址规范化、校验和旧配置迁移。
- `packages/frontend/src/stores/settingsStore.ts`：当前启用配置和按服务商保存的 profiles，统一 saveConfig，持久化版本为 1。
- `packages/frontend/src/services/modelService.ts`：协议请求、SSE 与 JSON 正文解析、认证、超时/取消、模型列表及连接测试。
- `packages/frontend/src/services/deepseek.ts`：保留 DeepSeekService 名称以兼容既有调用，内部委托通用 ModelService，名称不再代表仅支持 DeepSeek。
- SettingsView 编辑草稿；保存并启用后才更新实际写作配置。测试直接使用草稿，通过同一 ModelService 发起请求。
- AgentPanel 使用完整配置有效性判断，不再仅以 API Key 非空判断；本地模型支持免认证，并可停止生成。

数据路径：设置草稿 → 校验 / 模型发现 / 连接测试 → saveConfig → novel-agent-settings（version 1）→ 写作面板 → ModelService → 用户配置的服务端点。

仍由浏览器直接请求模型服务，未引入后端代理或服务端密钥存储。支持范围、限制和迁移规则见 [模型设置升级说明](docs/MODEL_SETTINGS.md)。
