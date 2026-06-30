# NovelAgent - 项目技术说明文档

> 一款以书为中心、AI 驱动的小说创作工作空间

---

## 1. 技术栈 (Tech Stack)

### 1.1 语言层
| 技术 | 版本 | 说明 |
|------|------|------|
| TypeScript | ~6.0.2 | 主要开发语言 |
| Node.js | 18+ | 运行环境要求 |

### 1.2 框架层
| 技术 | 版本 | 说明 |
|------|------|------|
| React | ^19.2.6 | 前端框架 |
| Vite | ^8.0.12 | 构建工具 |
| Electron | 计划中 | 桌面端支持 |

### 1.3 工具库层
| 技术 | 版本 | 用途 |
|------|------|------|
| Tailwind CSS | ^3.4.4 | 样式框架 |
| shadcn/ui | - | UI 组件库 |
| Tiptap | ^3.26.0 | 富文本编辑器 |
| Zustand | ^5.0.14 | 状态管理 |
| Lucide React | ^1.17.0 | 图标库 |
| react-markdown | ^10.1.0 | Markdown 渲染 |
| @dnd-kit | ^6.3.1 | 拖拽排序 |

### 1.4 基础设施层
| 技术 | 说明 |
|------|------|
| DeepSeek API | 默认 LLM 提供商 |
| OpenAI API | 可选支持 |
| 腾讯云混元 API | 可选支持 |
| localStorage | 浏览器持久化存储 |

---

## 2. 项目结构 (Project Structure)

### 2.1 目录树

```
novel-agent/
├── src/
│   ├── main.tsx                 # 应用入口
│   ├── App.tsx                  # 主应用组件（三栏布局）
│   ├── App.css                  # 全局样式
│   │
│   ├── components/
│   │   ├── ui/                  # shadcn/ui 基础组件
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── slider.tsx
│   │   │   └── dialog.tsx
│   │   │
│   │   ├── layout/              # 布局组件
│   │   │   ├── Sidebar.tsx      # 左侧书架栏
│   │   │   ├── MainContent.tsx  # 中间主内容区
│   │   │   └── AgentPanel.tsx   # 右侧 AI 面板
│   │   │
│   │   ├── editor/              # 编辑器组件
│   │   │   └── ChapterEditor.tsx  # Tiptap 章节编辑器
│   │   │
│   │   ├── chapter/             # 章节管理
│   │   │   └── ChapterList.tsx  # 章节列表
│   │   │
│   │   ├── outline/             # 大纲视图
│   │   │   ├── OutlineView.tsx    # 大纲主视图
│   │   │   ├── PlotCard.tsx       # 情节卡片
│   │   │   ├── PlotCardEditor.tsx # 卡片编辑弹窗
│   │   │   ├── ChapterOutline.tsx # 章节大纲
│   │   │   ├── ThreeActStructure.tsx # 三幕式结构
│   │   │   └── ForeshadowingPanel.tsx # 伏笔管理
│   │   │
│   │   ├── characters/          # 角色管理
│   │   │   └── CharacterEditor.tsx
│   │   │
│   │   ├── world/                # 世界观管理
│   │   │   └── WorldSettingEditor.tsx
│   │   │
│   │   ├── settings/             # 设置页面
│   │   │   └── SettingsView.tsx
│   │   │
│   │   └── cards/                # 结构化卡片
│   │       └── StructuredCardRenderer.tsx
│   │
│   ├── stores/                   # Zustand 状态管理
│   │   ├── novelStore.ts         # 小说数据存储
│   │   └── settingsStore.ts      # API 配置存储
│   │
│   ├── services/                 # API 服务
│   │   └── deepseek.ts           # LLM API 封装
│   │
│   ├── lib/                       # 工具函数
│   │   ├── utils.ts              # 通用工具
│   │   ├── cardParser.ts         # 卡片解析器
│   │   ├── cardSync.ts           # 卡片同步
│   │   └── autoSync.ts           # 自动同步逻辑
│   │
│   ├── types/                     # 类型定义
│   │   ├── index.ts              # 核心数据类型
│   │   ├── agents.ts             # Agent 配置类型
│   │   └── cards.ts              # 卡片类型
│   │
│   └── assets/                    # 静态资源
│       └── hero.png
│
├── public/
│   └── favicon.svg
│
├── index.html                     # HTML 入口
├── vite.config.ts                 # Vite 配置
├── tsconfig.json                  # TypeScript 配置
├── package.json                   # 依赖配置
└── README.md                      # 项目说明
```

### 2.2 核心模块说明

#### 入口文件
| 文件 | 说明 |
|------|------|
| `src/main.tsx` | React 应用入口，挂载到 `#root` |
| `src/App.tsx` | 主应用组件，实现三栏式布局和面板拖拽 |
| `index.html` | HTML 模板 |

#### 状态管理
| 文件 | 说明 |
|------|------|
| `src/stores/novelStore.ts` | 核心数据存储：小说、章节、角色、世界观、大纲、会话 |
| `src/stores/settingsStore.ts` | API 配置：提供商、密钥、模型、参数 |

#### 服务层
| 文件 | 说明 |
|------|------|
| `src/services/deepseek.ts` | LLM API 封装，支持流式响应 |

---

## 3. 如何运行 (Getting Started)

### 3.1 环境前置要求

- Node.js 18+
- npm 9+
- 现代浏览器（Chrome/Firefox/Edge 最新版）

### 3.2 依赖安装

```bash
cd novel-agent
npm install
```

### 3.3 环境变量配置

本项目不需要 `.env` 文件，所有配置通过应用内设置页面完成：

1. 启动应用后，点击左侧 **"设置"** 按钮
2. 选择 API 提供商（DeepSeek / OpenAI / 腾讯云 / 自定义）
3. 输入 API Key
4. 选择或输入模型名称
5. 调整 Temperature 和 MaxTokens 参数

**配置存储位置**: 浏览器 localStorage
- `novel-agent-settings`: API 配置
- `novel-agent-storage`: 小说数据

### 3.4 本地开发启动

```bash
npm run dev
```

应用将运行在: http://localhost:5173

### 3.5 生产构建

```bash
npm run build    # 构建生产版本
npm run preview  # 预览生产版本
```

### 3.6 代码检查

```bash
npm run lint     # ESLint 检查
```

### 3.7 常见问题排查

| 问题 | 解决方案 |
|------|----------|
| 面板宽度异常 | 清除 localStorage 中的 `novel-agent-sidebar-width` 和 `novel-agent-panel-width` |
| 数据丢失 | 检查浏览器 localStorage 是否被清除 |
| API 调用失败 | 检查 API Key 是否正确、Base URL 是否可访问 |
| 刷新后状态丢失 | 确保 localStorage 未被禁用或清除 |

---

## 4. Agent 技术体系 (Agent Architecture)

### 4.1 涉及的 Agent 相关技术清单

| 技术分类 | 具体实现 | 代码位置 |
|----------|----------|----------|
| **LLM 调用** | OpenAI 兼容 API（DeepSeek/OpenAI/腾讯云） | `src/services/deepseek.ts` |
| **Prompt 工程** | 结构化输出格式 + Few-shot 示例 | `src/types/agents.ts` |
| **Memory 机制** | 短期记忆（会话）+ 自动压缩 | `src/components/layout/AgentPanel.tsx` |
| **Tool Use** | 结构化指令解析 → 自动同步 | `src/lib/autoSync.ts` |
| **RAG** | 简化实现：上下文注入 | `src/components/layout/AgentPanel.tsx` |
| **Planning** | 隐式规划（单 Agent） | - |
| **Multi-Agent** | 已移除（v0.2 简化） | - |
| **评估与可观测** | Console 日志 | `src/services/deepseek.ts` |

### 4.2 每项技术的具体作用

#### 4.2.1 LLM 调用方式

**文件**: `src/services/deepseek.ts`

**作用**: 封装 LLM API 调用，支持流式响应

**实现细节**:
- 使用 OpenAI 兼容的 `/chat/completions` 端点
- 支持 SSE（Server-Sent Events）流式输出
- 自动处理 API 错误和超时

```typescript
// 核心方法签名
async chatStream(options: ChatOptions): Promise<void>

// 请求格式
{
  model: "deepseek-chat",
  messages: [
    { role: "system", content: "..." },
    { role: "user", content: "..." }
  ],
  temperature: 0.7,
  max_tokens: 4096,
  stream: true
}
```

**交互关系**: 被 `AgentPanel.tsx` 调用，发送增强后的消息

---

#### 4.2.2 Prompt 工程

**文件**: `src/types/agents.ts`

**作用**: 定义 Agent 的 System Prompt，规范 AI 输出格式

**实现细节**:
- 结构化输出标签：`【章节】【大纲】【角色】【世界观】【修改】【删除】`
- Few-shot 示例：演示正确格式
- 严格规则：禁止输出多余提示、必须遵守用户自定义要求

```typescript
// System Prompt 核心结构
`
## 输出格式
【章节】标题：...内容：...【/章节】

## 必须遵守的规则
1. 禁止输出"已同步到左侧面板"
2. 输出结构化内容后直接结束
3. 严格遵守用户自定义要求（字数、风格等）
`
```

**交互关系**: 作为 system message 发送给 LLM

---

#### 4.2.3 Memory 机制

**文件**: `src/components/layout/AgentPanel.tsx`

**作用**: 管理对话历史，防止上下文溢出

**实现细节**:
- **短期记忆**: 保留最近 15 条消息
- **自动压缩**: 超过 15 条时，将旧消息压缩为摘要
- **关键信息保留**: 摘要中包含已生成章节、大纲等关键内容

```typescript
const MAX_MESSAGES = 15;

const getTrimmedMessages = (msgs: Message[]) => {
  if (msgs.length <= MAX_MESSAGES) return msgs;
  
  const recentMessages = msgs.slice(-MAX_MESSAGES);
  const oldMessages = msgs.slice(0, -MAX_MESSAGES);
  
  // 压缩旧消息为摘要
  const summaryMessage = {
    content: `【历史对话摘要】\n...（已压缩${oldMessages.length}条历史消息）`
  };
  
  return [summaryMessage, ...recentMessages];
};
```

**交互关系**: 在发送消息前处理，避免超出 LLM token 限制

---

#### 4.2.4 Tool Use / 自动同步

**文件**: `src/lib/autoSync.ts`

**作用**: 解析 AI 输出中的结构化指令，自动同步到左侧面板

**实现细节**:
- 支持的指令类型：
  - `【章节】` → 同步到章节列表
  - `【大纲】` → 同步到大纲面板
  - `【角色】` → 同步到人物面板
  - `【世界观】` → 同步到世界观面板
  - `【修改】` → 精准修改指定内容
  - `【删除】` → 删除指定内容
- 智能匹配：同名内容更新而非新增

```typescript
// 核心同步函数
export function autoSyncContent(content: string, novelId: string) {
  // 优先处理修改指令
  const modifyInstructions = parseModifyInstructions(content);
  
  // 处理删除指令
  const deleteInstructions = parseDeleteInstructions(content);
  
  // 同步章节内容（同名更新）
  const chapters = parseChapterContent(content);
  chapters.forEach(chap => {
    const existing = findExistingChapter(novelId, chap.title);
    if (existing) {
      updateChapter(existing.id, { content: chap.content });
    } else {
      addChapter({ ...chap, novelId });
    }
  });
}
```

**交互关系**: 在 AI 响应完成时自动调用，更新 `novelStore`

---

#### 4.2.5 RAG（简化实现）

**文件**: `src/components/layout/AgentPanel.tsx`

**作用**: 将当前小说的上下文信息注入到消息中

**实现细节**:
- 自动注入内容：
  - 小说基本信息（书名、状态）
  - 当前列表（大纲、章节列表）
  - 当前编辑章节的内容片段

```typescript
let enhancedContent = `【小说信息】\n书名: ${novel.title}`;

// 注入大纲上下文
enhancedContent += getOutlineContext(); // 大纲列表

// 注入章节列表
enhancedContent += getChaptersContext(); // 章节列表

// 注入当前章节内容（前800字）
if (currentChapter) {
  enhancedContent += `\n\n【当前章节】\n${currentChapter.content.slice(0, 800)}`;
}

// 用户问题
enhancedContent += `\n\n【用户的问题】\n${userInput}`;
```

**交互关系**: 每次用户发送消息时自动构建增强内容

---

#### 4.2.6 结构化卡片（高级 Tool Use）

**文件**: `src/lib/cardParser.ts`, `src/components/cards/StructuredCardRenderer.tsx`

**作用**: 解析 AI 输出的 JSON 表单，引导用户填写结构化信息

**实现细节**:
- AI 输出 ` ```json-card ``` ` 代码块
- 前端解析为动态表单
- 用户填写后自动同步

```typescript
// 卡片格式
{
  "type": "novel_info",
  "title": "小说基本信息",
  "fields": [
    { "id": "genre", "label": "题材", "type": "select", "options": ["玄幻", "都市"] },
    { "id": "summary", "label": "简介", "type": "textarea" }
  ],
  "actions": [
    { "type": "sync_novel", "label": "保存" }
  ]
}
```

**交互关系**: 解析后的卡片渲染在 Agent 面板底部

---

### 4.3 架构与技术栈关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面层                                │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────┐               │
│  │ Sidebar  │  │ MainContent  │  │ AgentPanel  │               │
│  │ (书架)    │  │ (编辑器/列表) │  │ (AI对话)    │               │
│  └────┬─────┘  └──────┬───────┘  └──────┬──────┘               │
└───────┼───────────────┼─────────────────┼───────────────────────┘
        │               │                 │
        ▼               ▼                 ▼
┌───────────────────────────────────────────────────────────────┐
│                       状态管理层 (Zustand)                      │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │   novelStore     │  │  settingsStore   │                    │
│  │ (小说/章节/角色)  │  │ (API配置/参数)    │                    │
│  └────────┬─────────┘  └────────┬─────────┘                    │
└───────────┼─────────────────────┼───────────────────────────────┘
            │                     │
            ▼                     ▼
┌───────────────────────────────────────────────────────────────┐
│                        服务层                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                 DeepSeekService                         │   │
│  │  • chat() 非流式调用                                    │   │
│  │  • chatStream() 流式调用 (SSE)                          │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                      Agent 核心逻辑                            │
│                                                                │
│  用户输入                                                      │
│      │                                                         │
│      ▼                                                         │
│  ┌──────────────────────────────────────┐                     │
│  │ 上下文增强 (RAG 简化版)                │                     │
│  │ • 注入小说信息                        │                     │
│  │ • 注入大纲/章节列表                   │                     │
│  │ • 注入当前章节内容                    │                     │
│  │ • 附加用户自定义提示词                │                     │
│  └──────────────────────────────────────┘                     │
│      │                                                         │
│      ▼                                                         │
│  ┌──────────────────────────────────────┐                     │
│  │ System Prompt + Few-shot 示例         │                     │
│  │ • 结构化输出格式说明                   │                     │
│  │ • 增删改查指令说明                     │                     │
│  │ • 禁止输出的内容                      │                     │
│  └──────────────────────────────────────┘                     │
│      │                                                         │
│      ▼                                                         │
│  ┌──────────────────────────────────────┐                     │
│  │ Memory 管理 (上下文压缩)              │                     │
│  │ • 保留最近 15 条消息                  │                     │
│  │ • 旧消息压缩为摘要                   │                     │
│  └──────────────────────────────────────┘                     │
│      │                                                         │
│      ▼                                                         │
│  ┌──────────────────────────────────────┐                     │
│  │ LLM API 调用 (流式响应)               │                     │
│  │ • DeepSeek / OpenAI / 腾讯云         │                     │
│  └──────────────────────────────────────┘                     │
│      │                                                         │
│      ▼                                                         │
│  ┌──────────────────────────────────────┐                     │
│  │ AI 响应 → 结构化指令解析              │                     │
│  │ • 【章节】→ 新增/更新章节             │                     │
│  │ • 【大纲】→ 新增/更新大纲             │                     │
│  │ • 【角色】→ 新增/更新角色             │                     │
│  │ • 【修改】→ 精准修改指定内容          │                     │
│  │ • 【删除】→ 删除指定内容              │                     │
│  │ • ```json-card``` → 渲染动态表单      │                     │
│  └──────────────────────────────────────┘                     │
│      │                                                         │
│      ▼                                                         │
│  ┌──────────────────────────────────────┐                     │
│  │ 自动同步到左侧面板 (Tool Use)          │                     │
│  │ • 同名内容更新而非新增                │                     │
│  │ • 更新 novelStore 状态               │                     │
│  └──────────────────────────────────────┘                     │
│      │                                                         │
│      ▼                                                         │
│  用户可见更新：左侧面板实时刷新                               │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

---

## 5. 数据模型 (Data Models)

### 5.1 核心类型定义

```typescript
// 小说
interface Novel {
  id: string;
  title: string;
  cover?: string;
  wordCount: number;
  status: 'draft' | 'writing' | 'completed';
  genre?: string;        // 题材
  summary?: string;      // 简介
  agentPrompt?: string;  // 自定义 Agent 提示词
  createdAt: number;
  updatedAt: number;
  lastOpenedChapterId?: string;
}

// 章节
interface Chapter {
  id: string;
  novelId: string;
  title: string;
  content: string;       // HTML 格式
  wordCount: number;
  sequence: number;
  createdAt: number;
  updatedAt: number;
}

// 角色
interface Character {
  id: string;
  novelId: string;
  name: string;
  aliases: string[];     // 别名/称号
  description: string;
  appearance?: string;
  personality?: string;
  background?: string;
  firstAppearanceChapterId?: string;
}

// 世界观设定
interface WorldSetting {
  id: string;
  novelId: string;
  category: string;
  title: string;
  content: string;
}

// 情节卡片（大纲）
interface PlotCard {
  id: string;
  novelId: string;
  actNumber: 1 | 2 | 3;  // 三幕式结构
  title: string;
  summary: string;
  sequence: number;
  chapterId?: string;
  status: 'planned' | 'writing' | 'completed';
  createdAt: number;
  updatedAt: number;
}

// 伏笔
interface Foreshadowing {
  id: string;
  novelId: string;
  title: string;
  description: string;
  plantedChapterId?: string;
  resolvedChapterId?: string;
  plantedPlotCardId?: string;
  resolvedPlotCardId?: string;
  status: 'planted' | 'hinted' | 'resolved';
  createdAt: number;
  updatedAt: number;
}

// 会话
interface Session {
  id: string;
  novelId: string;
  agentType: AgentType;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// 消息
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentType?: AgentType;
}
```

---

## 6. API 配置说明

### 6.1 支持的提供商

| 提供商 | Base URL | 默认模型 |
|--------|----------|----------|
| DeepSeek | `https://api.deepseek.com/v1` | deepseek-chat |
| OpenAI | `https://api.openai.com/v1` | gpt-4o |
| 腾讯云混元 | `https://api.hunyuan.tencent.com/v1` | 需人工输入 |
| 自定义 | 用户填写 | 用户填写 |

### 6.2 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| Temperature | 0.7 | 输出随机性（0-2） |
| MaxTokens | 4096 | 最大输出长度 |

---

## 7. 待实现功能

根据开发计划，以下功能待实现：

1. **接入更多 AI 模型** - Claude API / 本地模型
2. **大纲视图增强** - 情节卡片可视化、伏笔追踪
3. **知识库系统** - 角色/世界观管理增强
4. **导入导出** - Markdown/Word 格式支持
5. **Electron 桌面版** - 离线使用支持

---

## 8. 开发日志

详细的开发记录请参阅：
- [DEVELOPMENT_LOG.md](./DEVELOPMENT_LOG.md) - 问题记录、解决方案、迭代计划
- [CLAUDE.md](./CLAUDE.md) - 项目开发规范

---

*文档生成日期: 2026-06-16*
*项目版本: v0.2 MVP迭代版*
