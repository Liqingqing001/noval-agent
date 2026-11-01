# NovelAgent 架构文档

> 当前实现（2026-11-01）：普通应用与 Pages 共用创作组件、模型协议、结构化解析、六项快捷操作和多格式导出。Pages 使用独立浏览器存储和公开示例，普通应用保留登录与后端同步；Pages 不运行 Express 或数据库。模型层支持 OpenAI Chat Completions、Responses、Anthropic Messages 和 Gemini 四种协议。以下流程示意与历史示例请结合当前源码阅读。

> 目的：帮助你快速掌握整个仓库的"骨架"和"血液流向"，理解每个模块的作用和相互关系。

---

## 📌 仓库速览

| 项目 | 说明 |
|-----|------|
| **架构** | Monorepo (npm workspaces) |
| **前端** | React 19 + TypeScript + Vite + Tailwind CSS v3.4.4 |
| **后端** | Express + TypeScript + Prisma ORM + SQLite |
| **认证** | JWT (7天有效) + bcrypt 密码哈希 |
| **状态管理** | Zustand (带 persist 持久化) |
| **富文本编辑器** | Tiptap (基于 ProseMirror) |
| **UI 组件** | shadcn/ui 风格 (Radix UI 原语) |
| **Markdown 渲染** | react-markdown + remark-gfm |
| **AI 调用** | SSE 流式，OpenAI 兼容协议 |
| **数据流** | 本地乐观更新 + 异步云同步 |

---

## 🏛️ 第一部分：分层架构

整个应用可以理解为 **5 层蛋糕**：

```
┌────────────────────────────────────────────────────────────┐
│  第 1 层：入口层                                            │
│  ─────────────────────────────────────────────────────────│
│  main.tsx          应用启动，挂载 React 根节点              │
│  App.tsx           三栏布局、路由、登录态检测、迁移向导      │
│  index.css         Tailwind 入口、CSS 变量、全局样式        │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  第 2 层：布局层 (三栏式 UI 框架)                            │
│  ─────────────────────────────────────────────────────────│
│  Sidebar.tsx       左侧 240px | 书架 + 小说列表 + 视图导航  │
│  MainContent.tsx   中间自适应 | 根据视图切换不同业务组件     │
│  AgentPanel.tsx    右侧 320-480px | AI 对话面板 (可拖拽)   │
└────────────────────────────────────────────────────────────┘
          ↓                    ↓                    ↓
┌────────────────────────────────────────────────────────────┐
│  第 3 层：业务视图层 (每个面板 = 一个组件)                    │
│  ─────────────────────────────────────────────────────────│
│  chapters/         ChapterList + ChapterEditor + Tiptap   │
│  outline/          OutlineView + ChapterOutline + 伏笔面板 │
│  characters/       CharactersView + CharacterEditor       │
│  world/            WorldSettingsView + WorldSettingEditor │
│  settings/         SettingsView (AI 配置)                  │
│  auth/             LoginPage + MigrationWizard            │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  第 4 层：逻辑层 (真正在干活的地方)                           │
│  ─────────────────────────────────────────────────────────│
│  stores/                                                           │
│    ├─ novelStore.ts    核心数据 store，所有小说/章节/角色... │
│    ├─ authStore.ts     登录状态、用户信息                     │
│    └─ settingsStore.ts AI API 配置、模型参数                  │
│  services/                                                         │
│    └─ deepseek.ts      AI 流式调用封装 (OpenAI 兼容协议)      │
│  lib/                                                              │
│    ├─ autoSync.ts      AI 输出解析 → 自动同步到 store         │
│    └─ utils.ts         工具函数 (cn 类名合并等)               │
│  api/                                                              │
│    ├─ client.ts        fetch 封装 + JWT 自动附加 + 401 处理   │
│    ├─ sync.ts          云同步：拉取、迁移、导入               │
│    └─ novels.ts 等     各资源的 CRUD API 封装                │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  第 5 层：基础层                                             │
│  ─────────────────────────────────────────────────────────│
│  types/            TypeScript 类型定义                       │
│    ├─ index.ts     Novel, Chapter, Character 等核心类型     │
│    └─ agents.ts    AgentType 枚举 + 系统提示词              │
│  components/ui/    shadcn/ui 基础组件 (button, dialog...)   │
└────────────────────────────────────────────────────────────┘
```

---

## 📂 第二部分：完整目录结构

```
novel-agent/
├── packages/
│   │
│   │
│   │  ════════════════════════════════════════════════════
│   │  FRONTEND (React 19 + Vite)
│   │  ════════════════════════════════════════════════════
│   │
│   ├── frontend/
│   │   ├── src/
│   │   │   │
│   │   │   ├── api/                          # API 客户端层
│   │   │   │   ├── client.ts                 # Axios 实例 + JWT 管理
│   │   │   │   │   - getToken() / setToken() # localStorage: novel-agent-auth-token
│   │   │   │   │   - 401 自动派发 'auth:logout' 事件
│   │   │   │   ├── sync.ts                   # 云同步核心逻辑
│   │   │   │   │   - fetchAllFromBackend()   # 全量拉取
│   │   │   │   │   - checkHasLocalData()     # 检测本地是否有旧数据
│   │   │   │   │   - importLocalData()       # 导入到后端
│   │   │   │   ├── novels.ts                 # 小说 CRUD
│   │   │   │   ├── chapters.ts               # 章节 CRUD
│   │   │   │   ├── characters.ts             # 角色 CRUD
│   │   │   │   ├── worldSettings.ts          # 世界观 CRUD
│   │   │   │   ├── plotCards.ts              # 大纲/情节点 CRUD
│   │   │   │   ├── foreshadowings.ts         # 伏笔 CRUD
│   │   │   │   ├── migrate.ts                # 数据迁移 API
│   │   │   │   └── auth.ts                   # 登录/注册
│   │   │   │
│   │   │   ├── components/
│   │   │   │   │
│   │   │   │   ├── layout/                   # 布局组件
│   │   │   │   │   ├── Sidebar.tsx           # 左侧书架 + 导航
│   │   │   │   │   ├── MainContent.tsx       # 中间主内容区
│   │   │   │   │   └── AgentPanel.tsx        # 右侧 AI 对话面板 ⭐核心
│   │   │   │   │       - handleSend()        # 发送消息主逻辑
│   │   │   │   │       - getCreationStage()  # 判断创作阶段
│   │   │   │   │       - getTimelineContext()# 提取时间线防重叠
│   │   │   │   │       - getTrimmedMessages()# 消息压缩
│   │   │   │   │       - formatAIResponse()  # 格式化 AI 输出
│   │   │   │   │
│   │   │   │   ├── chapter/                  # 章节管理
│   │   │   │   │   ├── ChapterList.tsx       # 章节列表（左侧）
│   │   │   │   │   └── ChapterEditor.tsx     # 章节编辑器（右侧）
│   │   │   │   │
│   │   │   │   ├── outline/                  # 大纲视图 ⭐重要
│   │   │   │   │   ├── OutlineView.tsx       # 大纲主视图
│   │   │   │   │   ├── ChapterOutline.tsx    # 卷/章节大纲组件
│   │   │   │   │   │   - 支持卷拖拽排序
│   │   │   │   │   │   - 支持卷收缩/展开
│   │   │   │   │   ├── PlotCardEditor.tsx    # 大纲编辑弹窗
│   │   │   │   │   │   - 状态选择器 (待写作/已完成)
│   │   │   │   │   │   - 关联已写章节
│   │   │   │   │   └── ForeshadowingPanel.tsx# 伏笔面板
│   │   │   │   │
│   │   │   │   ├── characters/               # 人物管理
│   │   │   │   │   └── CharacterEditor.tsx   # 角色编辑弹窗
│   │   │   │   │
│   │   │   │   ├── world/                    # 世界观管理
│   │   │   │   │   └── WorldSettingEditor.tsx
│   │   │   │   │
│   │   │   │   ├── settings/                 # 设置页面
│   │   │   │   │   └── SettingsView.tsx      # AI API 配置
│   │   │   │   │
│   │   │   │   ├── auth/                     # 认证相关
│   │   │   │   │   ├── LoginPage.tsx         # 登录/注册页
│   │   │   │   │   └── MigrationWizard.tsx   # 数据迁移向导
│   │   │   │   │
│   │   │   │   └── ui/                       # shadcn/ui 基础组件
│   │   │   │       ├── button.tsx
│   │   │   │       ├── dialog.tsx
│   │   │   │       ├── input.tsx
│   │   │   │       └── ...
│   │   │   │
│   │   │   ├── stores/                       # Zustand 状态管理
│   │   │   │   ├── novelStore.ts             # ⭐核心数据 store
│   │   │   │   │   - novels, chapters, characters, worldSettings
│   │   │   │   │   - plotCards, foreshadowings, sessions
│   │   │   │   │   - 持久化: novel-agent-storage
│   │   │   │   │   - 所有 CRUD 方法
│   │   │   │   │   - 乐观更新 + 异步云同步
│   │   │   │   │
│   │   │   │   ├── authStore.ts              # 认证状态
│   │   │   │   │   - user, isAuthenticated
│   │   │   │   │   - 持久化: novel-agent-auth
│   │   │   │   │
│   │   │   │   └── settingsStore.ts          # AI 配置
│   │   │   │       - apiKey, baseUrl, model
│   │   │   │       - temperature, maxTokens
│   │   │   │       - 持久化: novel-agent-settings
│   │   │   │
│   │   │   ├── services/
│   │   │   │   └── deepseek.ts               # AI 调用服务
│   │   │   │       - chat() 非流式
│   │   │   │       - chatStream() 流式 (SSE)
│   │   │   │
│   │   │   ├── lib/
│   │   │   │   ├── autoSync.ts               # ⭐AI 输出解析核心
│   │   │   │   │   - parseBasicInfo()        # 基本信息
│   │   │   │   │   - parseVolumeContent()    # 卷大纲
│   │   │   │   │   - parseChapterOutlineContent() # 章节大纲
│   │   │   │   │   - parseCharacterContent() # 角色
│   │   │   │   │   - parseWorldContent()     # 世界观
│   │   │   │   │   - parseChapterContent()   # 章节内容
│   │   │   │   │   - parseModifyInstructions() # 修改指令
│   │   │   │   │   - parseDeleteInstructions() # 删除指令
│   │   │   │   │   - autoSyncContent()       # 统一入口
│   │   │   │   │
│   │   │   │   └── utils.ts                  # 工具函数
│   │   │   │
│   │   │   ├── types/
│   │   │   │   ├── index.ts                  # 核心类型定义
│   │   │   │   │   - Novel, Chapter, Character
│   │   │   │   │   - WorldSetting, PlotCard, Foreshadowing
│   │   │   │   │   - Session, Message, ViewType
│   │   │   │   │
│   │   │   │   └── agents.ts                 # Agent 配置
│   │   │   │       - AgentType 枚举
│   │   │   │       - AGENT_CONFIGS 系统提示词
│   │   │   │
│   │   │   ├── App.tsx                       # 应用主组件
│   │   │   ├── main.tsx                      # 入口文件
│   │   │   └── index.css                     # 全局样式
│   │   │
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   └── tsconfig.json
│   │
│   │
│   │  ════════════════════════════════════════════════════
│   │  BACKEND (Express + Prisma + SQLite)
│   │  ════════════════════════════════════════════════════
│   │
│   └── backend/
│       ├── src/
│       │   ├── index.ts                      # Express 入口
│       │   │   - CORS + JSON body + 日志
│       │   │   - /api/health 健康检查
│       │   │   - 路由挂载
│       │   │   - 404 + 错误处理
│       │   │
│       │   ├── routes/                       # API 路由
│       │   │   ├── auth.ts                   # /api/auth/*
│       │   │   │   - POST /register
│       │   │   │   - POST /login
│       │   │   │   - GET /me
│       │   │   │
│       │   │   ├── novels.ts                 # /api/novels
│       │   │   ├── chapters.ts               # /api/novels/:novelId/chapters
│       │   │   ├── characters.ts             # /api/novels/:novelId/characters
│       │   │   ├── worldSettings.ts          # /api/novels/:novelId/world-settings
│       │   │   ├── plotCards.ts              # /api/novels/:novelId/plot-cards
│       │   │   ├── foreshadowings.ts         # /api/novels/:novelId/foreshadowings
│       │   │   │
│       │   │   └── migrate.ts                # /api/migrate/import
│       │   │       - Prisma transaction 一次性导入
│       │   │
│       │   ├── middlewares/
│       │   │   ├── auth.ts                   # JWT 校验中间件
│       │   │   │   - 验证 Authorization: Bearer xxx
│       │   │   │   - 写入 req.userId
│       │   │   │
│       │   │   └── error.ts                  # 全局错误处理
│       │   │
│       │   ├── lib/
│       │   │   └── prisma.ts                 # Prisma Client 单例
│       │   │
│       │   └── types/
│       │       └── express.d.ts              # Express Request 扩展
│       │           - interface Request { userId?: string }
│       │
│       ├── prisma/
│       │   ├── schema.prisma                 # 数据库模型定义
│       │   ├── dev.db                        # SQLite 数据库文件
│       │   └── migrations/                   # 迁移历史
│       │
│       ├── package.json
│       └── tsconfig.json
│
├── CLAUDE.md                     # 项目开发指南
├── ARCHITECTURE.md               # 本文件
├── DEVELOPMENT_LOG.md            # 开发日志
└── package.json                  # Monorepo 配置
```

---

## 🗄️ 第三部分：数据库模型 (Prisma)

### ER 图

```
┌──────────────────┐
│      User        │  用户表
│ ──────────────── │
│ id        String │  @id @default(cuid())
│ email     String │  @unique
│ passwordHash    │  bcrypt 哈希后的密码
│ nickname  String?│
│ createdAt DateTime│
│ updatedAt DateTime│
└────────┬─────────┘
         │ 1:N (onDelete: Cascade)
         ↓
┌──────────────────┐
│      Novel       │  小说表
│ ──────────────── │
│ id        String │
│ userId    String │  外键 → User.id
│ title     String │
│ cover     String?│  封面图片 (base64)
│ wordCount Int    │  总字数
│ status    String │  draft | writing | completed
│ genre     String?│  题材
│ summary   String?│  简介
│ agentPrompt String?│ 自定义 AI 提示词
│ lastOpenedChapterId String?│
│ createdAt DateTime│
│ updatedAt DateTime│
└────────┬─────────┘
         │ 1:N (onDelete: Cascade)
         │
    ┌────┴────┬────────────┬────────────┬────────────┐
    ↓         ↓            ↓            ↓            ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Chapter │ │Character│ │WorldSet│ │PlotCard│ │Foreshad│
│────────│ │────────│ │────────│ │────────│ │────────│
│id      │ │id      │ │id      │ │id      │ │id      │
│novelId │ │novelId │ │novelId │ │novelId │ │novelId │
│title   │ │name    │ │category│ │type    │ │title   │
│content │ │aliases │ │title   │ │  volume│ │desc    │
│wordCount│ │description│ │content│ │  chapter│ │status  │
│sequence│ │role    │ │        │ │title   │ │planted │
│        │ │appearance│ │        │ │summary │ │resolved│
│        │ │personality│ │        │ │sequence│ │ChapterId│
│        │ │background│ │        │ │volumeId│ │        │
│        │ │sequence │ │        │ │chapterId│ │        │
│        │ │         │ │        │ │status  │ │        │
└────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

### 核心表详解

#### PlotCard (大纲/情节点)

```typescript
type PlotCard = {
  id: string;
  novelId: string;
  type: 'volume' | 'chapter';  // 卷大纲 或 章节大纲
  title: string;               // 卷标题 或 章节标题
  summary: string;             // 情节概要
  sequence: number;            // 排序（卷之间或卷内章节）
  volumeId?: string;           // 章节大纲所属的卷ID
  chapterId?: string;          // 关联的已写章节ID
  status: 'pending' | 'completed';  // 写作状态
  createdAt: number;
  updatedAt: number;
}
```

**卷与章节大纲的关系**：
```
卷大纲 (type='volume')
  ├─ 章节大纲 (type='chapter', volumeId=卷ID)
  ├─ 章节大纲 (type='chapter', volumeId=卷ID)
  └─ 章节大纲 (type='chapter', volumeId=卷ID)
```

#### Character (角色)

```typescript
type Character = {
  id: string;
  novelId: string;
  name: string;
  aliases: string[];           // 别名数组 (SQLite 存为 JSON 字符串)
  description: string;         // 简介
  appearance?: string;         // 外貌
  personality?: string;        // 性格
  background?: string;         // 背景
  firstAppearanceChapterId?: string;  // 首次出场章节
  role?: 'protagonist' | 'supporting' | 'minor';  // 角色定位
  sequence?: number;           // 排序
}
```

| role 值 | 显示名称 | 排序权重 |
|---------|---------|---------|
| `protagonist` | 主角 | 最高（显示在最前）|
| `supporting` | 配角 | 中间 |
| `minor` | 龙套 | 最低 |

---

## 🔄 第四部分：认证与数据流

### 4.1 认证流程

```
┌─────────────────────────────────────────────────────────────┐
│                        登录流程                              │
└─────────────────────────────────────────────────────────────┘

用户输入邮箱密码
       │
       ↓
POST /api/auth/login
       │
       ↓
后端 bcrypt.compare(password, user.passwordHash)
       │
       ↓
验证通过 → jwt.sign({ userId }, SECRET, { expiresIn: '7d' })
       │
       ↓
返回 { token, user }
       │
       ↓
前端 localStorage.setItem('novel-agent-auth-token', token)
       │
       ↓
api/client.ts 拦截器自动附加：
  headers: { Authorization: `Bearer ${token}` }
       │
       ↓
遇到 401 → 派发 'auth:logout' 事件 → 清除 token → 跳转登录页
```

### 4.2 数据同步模式：本地优先 + 云端备份

```
┌─────────────────────────────────────────────────────────────┐
│                     前端 novelStore                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  localStorage: 'novel-agent-storage'                │   │
│  │  ─────────────────────────────────────────────────  │   │
│  │  • 乐观更新：用户操作立即生效，无需等待网络            │   │
│  │  • 临时 ID：创建时生成临时 ID，如 'temp-xxx'          │   │
│  │  • 数据持久化：页面刷新后数据不丢失                   │   │
│  └──────────────────────┬──────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          │ 异步同步（存在 JWT 时）
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                      后端 API                                │
│  ──────────────────────────────────────────────────────────│
│  POST /api/novels        → 创建成功返回真实 ID              │
│  PUT  /api/novels/:id    → 更新                             │
│  DELETE /api/novels/:id  → 删除                             │
│  GET  /api/novels        → 拉取用户所有小说                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                     SQLite 数据库                            │
│              packages/backend/prisma/dev.db                 │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 关键代码：乐观更新 + ID 替换

```typescript
// novelStore.ts - addNovel 示例
addNovel: (novel) => {
  // 1. 立即生成临时 ID，本地先显示
  const newNovel: Novel = {
    ...novel,
    id: generateId(),  // 临时 ID
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 2. 立即更新本地状态（乐观更新）
  set((state) => ({ novels: [...state.novels, newNovel] }));

  // 3. 异步同步到云端
  if (isCloudEnabled()) {
    novelsApi.create(novel).then(({ novel: saved }) => {
      // 4. 服务端返回真实 ID，替换临时 ID
      set((state) => ({
        novels: state.novels.map((n) =>
          n.id === newNovel.id ? { ...saved, id: saved.id } : n
        ),
      }));
    });
  }

  return newNovel;
}
```

### 4.4 迁移流程（首次登录）

```
App.tsx 检测 localStorage.getItem('novel-agent-migrated')
       │
       ↓
┌─────────────────────────────────────────┐
│ 未迁移 && 有旧数据 (checkHasLocalData)   │
└─────────────────────────────────────────┘
       │
       ↓
显示 MigrationWizard 组件
       │
       ↓
用户确认迁移
       │
       ↓
POST /api/migrate/import
       │
       ↓
后端 Prisma.$transaction(() => {
  // 一次性导入所有数据
  // 全部成功才 commit，失败则 rollback
})
       │
       ↓
成功 → localStorage.setItem('novel-agent-migrated', 'true')
失败 → 提示用户，保留本地数据
```

---

## 🤖 第五部分：AI 对话全流程（核心！）

### 5.1 完整流程图

```
┌─────────────────────────────────────────────────────────────┐
│ ① 用户点击发送                                               │
│    AgentPanel.tsx - handleSend()                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ② 构造增强消息 (enhancedContent)                             │
│    ─────────────────────────────────────────────────────── │
│    【小说信息】书名、题材、简介、状态                         │
│    【当前大纲】卷结构 + 章节大纲 + 状态                      │
│    【人物设定】主角 > 配角 > 龙套                            │
│    【世界观设定】分类 + 内容                                 │
│    【章节列表】第N章: 标题 (字数)                            │
│    【最近章节内容】前 3 章完整正文（用于续写参考）            │
│    【时间线提醒】从最近章节提取时间表达，防止重叠             │
│    【创作阶段】空白/设定/大纲缺失/大纲不完整/写作/创作中       │
│    【大纲完整性要求】必须建立大纲才能写作                     │
│    【字数硬性要求】默认 3000-4000 字，或用户指定             │
│    【用户自定义要求】agentPrompt 字段                        │
│    【用户的问题】原始输入                                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ③ 消息压缩 (getTrimmedMessages)                             │
│    ─────────────────────────────────────────────────────── │
│    MAX_MESSAGES = 15                                        │
│    超过时：旧消息 → 压缩为摘要                               │
│    例："用户: 续写一章" + "已生成章节: 第一章, 第二章"       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ④ 调用 AI API                                               │
│    services/deepseek.ts - chatStream()                      │
│    ─────────────────────────────────────────────────────── │
│    POST ${baseUrl}/chat/completions                         │
│    Headers: Authorization: Bearer ${apiKey}                 │
│    Body: { model, messages, temperature, max_tokens }       │
│    Stream: true (SSE)                                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ⑤ 流式接收 (onStream)                                       │
│    ─────────────────────────────────────────────────────── │
│    收到 chunk → accumulatedContent += content               │
│    → setStreamingContent(accumulatedContent)                │
│    → React 重新渲染，实时显示                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ⑥ AI 响应完成 (onComplete)                                  │
│    ─────────────────────────────────────────────────────── │
│    1. 保存消息到 session: updateSession()                   │
│    2. 检查可同步内容: hasSyncableContent()                  │
│    3. 解析并同步: autoSyncContent(content, novelId)         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ⑦ autoSync.ts 解析结构化内容                                │
│    ─────────────────────────────────────────────────────── │
│    解析标签：                                                │
│    【基本信息】→ updateNovel()                               │
│    【卷】→ addPlotCard() / updatePlotCard()                 │
│    【章节大纲】→ addPlotCard() / updatePlotCard()           │
│    【角色】→ addCharacter() / updateCharacter()             │
│    【世界观】→ addWorldSetting() / updateWorldSetting()     │
│    【章节】→ addChapter() / updateChapter()                 │
│    【修改】→ 精准修改指定内容                                 │
│    【删除】→ deleteChapter() / deleteCharacter() 等         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ⑧ 左侧面板自动更新                                          │
│    Zustand 订阅触发 React 重新渲染                           │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 创作阶段判断逻辑

```typescript
// AgentPanel.tsx - getCreationStage()
const getCreationStage = () => {
  const volumes = plotCards.filter(c => c.type === 'volume');
  const chapterOutlines = plotCards.filter(c => c.type === 'chapter');
  const incompleteChapters = chapterOutlines.filter(c => !c.summary?.trim());
  const hasBasicSetting = currentNovel?.summary || characters.length > 0 || worldSettings.length > 0;

  // 阶段判断
  if (!hasBasicSetting && chapters.length === 0) {
    return '空白阶段：小说刚创建，尚未建立任何设定';
  }
  if (chapterOutlines.length === 0) {
    return '大纲缺失：尚未建立章节大纲';
  }
  if (incompleteChapters.length > 0) {
    return `大纲不完整：${incompleteChapters.length} 个章节缺少情节概要`;
  }
  if (chapters.length === 0) {
    return `准备写作：大纲完整（${volumes.length} 卷，${chapterOutlines.length} 章）`;
  }
  return `创作中：已写 ${chapters.length} 章`;
};
```

### 5.3 时间线防重叠机制

```typescript
// AgentPanel.tsx - getTimelineContext()
const getTimelineContext = () => {
  if (chapters.length === 0) return '';

  // 从最近 3 章提取时间表达
  const recentChapters = chapters.slice(-3);
  const timePatterns = [
    /第[一二三四五六七八九十\d]+天/,
    /次[日晨早]/,
    /傍晚|清晨|中午|晚上/,
    /周[一二三四五六日]/,
    // ...
  ];

  // 提取并发送给 AI
  return `
【时间线提醒 - 防止重叠】
以下是已写章节的时间线，新章节必须接续这个时间线：
  - 第一章：第一天 → 傍晚
  - 第二章：次日 → 清晨
⚠️ 新章节必须发生在上述时间之后，禁止时间回退！
  `;
};
```

---

## 🏷️ 第六部分：autoSync.ts 解析规则

### 6.1 支持的标签

| 标签 | 作用 | 解析函数 | 业务操作 |
|------|------|---------|---------|
| `【基本信息】` | 题材、简介 | `parseBasicInfo()` | `updateNovel()` |
| `【卷】` | 卷大纲 | `parseVolumeContent()` | `addPlotCard()` / `updatePlotCard()` |
| `【章节大纲】` | 章节大纲（带卷关联） | `parseChapterOutlineContent()` | `addPlotCard()` |
| `【大纲】` | 旧版大纲 | `parseOutlineContent()` | `addPlotCard()` |
| `【角色】` | 角色信息 | `parseCharacterContent()` | `addCharacter()` / `updateCharacter()` |
| `【世界观】` | 世界观设定 | `parseWorldContent()` | `addWorldSetting()` |
| `【章节】` | 章节正文 | `parseChapterContent()` | `addChapter()` / `updateChapter()` |
| `【修改】` | 精准修改 | `parseModifyInstructions()` | 按原内容→新内容替换 |
| `【删除】` | 删除内容 | `parseDeleteInstructions()` | `deleteChapter()` 等 |
| `【插入章节】` | 指定位置插入 | `parseInsertChapterInstructions()` | `insertChapterAtPosition()` |
| `【替换】` | 整体替换 | `parseReplaceInstructions()` | `replaceContent()` |
| `【合并章节】` | 多合一 | `parseMergeChaptersInstructions()` | `mergeChapters()` |
| `【拆分章节】` | 一分多 | `parseSplitChapterInstructions()` | `splitChapter()` |
| `【调整顺序】` | 重排序 | `parseReorderInstructions()` | `reorderItems()` |

### 6.2 标签格式示例

```
【基本信息】
题材：都市奇幻
简介：一个普通大学生意外获得超能力...
【/基本信息】

【卷】
标题：第一卷 觉醒篇
概要：主角发现能力，加入组织，首次任务...
【/卷】

【章节大纲】
卷：第一卷 觉醒篇
第1章 陨石坠落 - 校园突现陨石，主角被波及
第2章 异变开始 - 主角身体出现异常变化
第3章 神秘力量 - 主角发现自己获得特殊能力
【/章节大纲】

【角色】
定位：主角
姓名：林逸
性格：表面内敛温和，内心有一股不服输的劲头
背景：普通高中生，父母离异
外貌：清瘦身材，黑色短发
内心冲突：渴望被认可，却又害怕被关注
成长弧线：从逃避责任 → 被迫面对 → 主动承担
弱点：过度在意他人看法
简介：一个看似普通的高中生
【/角色】

【章节】
标题：第一章 觉醒
内容：
林风走在山路上，突然一道光芒从天而降...
（完整正文）
【/章节】

【修改】
目标：章节
标题：第一章 觉醒
原内容：林风走在山路上
新内容：林风快步走在山路上
【/修改】

【删除】
目标：章节
标题：图书馆
【/删除】
```

### 6.3 智能特性

1. **同名检查**：AI 重复输出同名角色/章节时，更新而不是追加
2. **未闭合兜底**：AI 输出被截断时也能解析（≥ 50 字才同步）
3. **章节号容错**：`第一章 觉醒` 和 `觉醒` 视为同一章节
4. **精准修改**：只改某一段，不用重写整章
5. **角色定位解析**：自动识别主角/配角/龙套

---

## 🎨 第七部分：UI 关键特性

### 7.1 三栏布局

| 区域 | 组件 | 宽度 | 特性 |
|-----|------|-----|------|
| 左侧 | `Sidebar.tsx` | 固定 240px | 书架 + 小说列表 + 视图导航 |
| 中间 | `MainContent.tsx` | 自适应 | 章节列表 + 编辑器（可拖拽分隔）|
| 右侧 | `AgentPanel.tsx` | 可拖拽 320-480px | AI 对话面板 |

### 7.2 可拖拽分隔条

```typescript
// App.tsx - 右侧面板宽度
const [agentPanelWidth, setAgentPanelWidth] = useState(() => {
  const saved = localStorage.getItem('novel-agent-panel-width');
  return saved ? parseInt(saved) : 380;
});

// MainContent.tsx - 章节列表宽度
const [chapterListWidth, setChapterListWidth] = useState(280);

// 实现方式：mousedown → document mousemove → document mouseup
```

### 7.3 章节编号

使用中文数字：第一章、第二章...第十章、第十一章...

### 7.4 卷拖拽排序

```typescript
// ChapterOutline.tsx
const [draggedVolumeIndex, setDraggedVolumeIndex] = useState<number | null>(null);

const handleVolumeDrop = (e: React.DragEvent, dropIndex: number) => {
  // 更新卷的 sequence
  newVolumes.forEach((vol, index) => {
    updatePlotCard(vol.id, { sequence: index });
  });
};
```

### 7.5 卷收缩/展开

```typescript
// ChapterOutline.tsx
const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(new Set());

// 点击卷标题左侧箭头切换
<button onClick={() => toggleCollapse(volume.id)}>
  {isCollapsed ? '▶' : '▼'}
</button>
```

---

## 🔧 第八部分：常用命令

```powershell
# 开发
npm run dev              # 同时启动前后端
npm run dev:backend      # 只启动后端 :3001
npm run dev:frontend     # 只启动前端 :5173

# 构建
npm run build            # 构建 backend + frontend
npm run build:backend
npm run build:frontend
npm run lint --workspace=frontend

# 数据库
npm run db:generate      # prisma generate
npm run db:migrate       # prisma migrate dev
npm run db:studio        # 打开 Prisma Studio
npm run db:reset         # 重置数据库（删除数据！）

# 健康检查
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3001/api/health"
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:5173"
```

---

## 🎯 第九部分：关键文件速查表

| 想了解什么 | 看哪个文件 |
|----------|----------|
| 应用启动 | `frontend/src/main.tsx` + `App.tsx` |
| 三栏布局 | `frontend/src/App.tsx` |
| 数据模型 (TS) | `frontend/src/types/index.ts` |
| 数据库结构 | `backend/prisma/schema.prisma` |
| 认证流程 | `backend/src/routes/auth.ts` + `frontend/src/stores/authStore.ts` |
| API 客户端 | `frontend/src/api/client.ts` |
| 云同步逻辑 | `frontend/src/api/sync.ts` |
| **用户点发送后发生了什么** | `frontend/src/components/layout/AgentPanel.tsx` 的 `handleSend` |
| **AI 是怎么调用的** | `frontend/src/services/deepseek.ts` |
| **AI 输出怎么变成数据** | `frontend/src/lib/autoSync.ts` |
| **数据怎么存** | `frontend/src/stores/novelStore.ts` |
| **系统提示词** | `frontend/src/types/agents.ts` |
| **大纲视图** | `frontend/src/components/outline/ChapterOutline.tsx` |
| **章节编辑器** | `frontend/src/components/editor/ChapterEditor.tsx` |
| 数据迁移 | `frontend/src/components/auth/MigrationWizard.tsx` |

---

## 🔟 第十部分：技术栈详解

### 10.1 前端技术栈

| 技术 | 版本 | 用途 |
|-----|------|------|
| React | 19.2.6 | UI 框架 |
| TypeScript | ~6.0.2 | 类型安全 |
| Vite | 8.0.12 | 构建工具 |
| Tailwind CSS | 3.4.4 | 原子化 CSS |
| Zustand | 5.0.14 | 状态管理 (轻量) |
| Tiptap | 3.26.0 | 富文本编辑器 |
| react-markdown | 10.1.0 | Markdown 渲染 |
| remark-gfm | - | GitHub Flavored Markdown |
| Lucide React | 1.17.0 | 图标库 |
| Radix UI | 各版本 | UI 原语 (无样式组件) |

### 10.2 后端技术栈

| 技术 | 版本 | 用途 |
|-----|------|------|
| Express | - | Web 框架 |
| TypeScript | - | 类型安全 |
| Prisma | - | ORM |
| SQLite | - | 数据库 |
| bcrypt | - | 密码哈希 |
| jsonwebtoken | - | JWT 认证 |

### 10.3 为什么选择这些技术？

| 选择 | 原因 |
|-----|------|
| Zustand (非 Redux) | 轻量、API 简单、内置 persist |
| Tiptap (非 Slate) | 开箱即用、生态好、基于 ProseMirror |
| Tailwind v3 (非 v4) | shadcn/ui 兼容性 |
| SQLite | 轻量、无需安装、开发方便 |
| Prisma | 类型安全、自动生成类型、迁移方便 |

---

## 📝 第十一部分：开发规范

### 11.1 代码风格

- 使用 TypeScript，所有类型定义放在 `types/` 目录
- 组件使用函数组件 + hooks
- 样式使用 Tailwind CSS，自定义样式放在 `index.css`
- 状态管理使用 Zustand，持久化 key 格式：`novel-agent-xxx`

### 11.2 命名约定

| 类型 | 命名方式 | 示例 |
|-----|---------|------|
| 组件 | PascalCase | `ChapterList.tsx` |
| 函数 | camelCase | `handleSend()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_MESSAGES` |
| 类型 | PascalCase | `Novel`, `Chapter` |
| localStorage key | kebab-case | `novel-agent-storage` |

### 11.3 文件组织

```
components/
  功能模块/
    XxxView.tsx      # 主视图组件
    XxxEditor.tsx    # 编辑弹窗
    XxxList.tsx      # 列表组件
```

---

*最后更新: 2026-07-01*

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
