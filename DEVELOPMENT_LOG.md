# NovelAgent 开发日志

> 记录开发过程、问题解决方案和迭代计划

---

## 📋 项目概述

**产品**: NovelAgent - AI驱动的小说创作助手  
**启动日期**: 2026-06-10  
**当前阶段**: v0.2 MVP迭代版  

---

## 2026-06-11: 5个核心问题修复

### 用户反馈的问题

1. **子Agent团队没意义** - 单独对话逻辑不清晰
2. **章节命名多余** - "第一章 觉醒" 应该只保留 "觉醒"
3. **主题颜色** - 希望是嫩绿色和深绿色
4. **上下文满了怎么办** - 没有管理机制
5. **书架字数为0** - 没有正确统计章节字数

---

### 解决方案

#### 1. 简化Agent结构

**改动**：
- 移除"子Agent团队"UI
- 只保留单一"创作助手"
- 简化交互流程

```typescript
// 之前：6个Agent角色
export enum AgentType {
  MASTER, OUTLINE, CHARACTER, STYLE, LOGIC, WORLD
}

// 现在：只有主Agent
export enum AgentType {
  MASTER = 'master',
}
```

#### 2. 章节命名格式

**改动**：更新AI提示词

```
**重要：章节标题不要加"第一章"前缀，直接写标题名称**

【章节】
标题：觉醒     ← 正确
标题：第一章 觉醒  ← 错误
```

#### 3. 嫩绿色和深绿色主题

**改动**：更新 `src/index.css`

```css
:root {
  --primary: 142 70% 35%;     /* 深绿色主色 */
  --accent: 142 60% 50%;      /* 嫩绿色强调色 */
  --background: 140 30% 98%;  /* 浅绿色背景 */
}
```

#### 4. 上下文管理机制

**改动**：自动压缩历史消息

```typescript
const MAX_MESSAGES = 20; // 保留最近20条

// 当消息超过20条时，将旧消息压缩为摘要
const summaryMessage = {
  content: `【历史对话摘要】\n${oldMessages}...\n（已压缩X条历史消息）`
};
```

#### 5. 书架字数统计

**改动**：章节变化时自动更新小说总字数

```typescript
// addChapter / updateChapter / deleteChapter
const novelWordCount = newChapters
  .filter(c => c.novelId === novelId)
  .reduce((sum, c) => sum + c.wordCount, 0);

updateNovel(novelId, { wordCount: novelWordCount });
```

---

### 修改的文件

| 文件 | 修改内容 |
|------|----------|
| `src/types/agents.ts` | 简化为单Agent，更新提示词 |
| `src/components/layout/AgentPanel.tsx` | 移除子AgentUI，添加上下文压缩 |
| `src/index.css` | 嫩绿色和深绿色主题 |
| `src/stores/novelStore.ts` | 章节字数同步到小说总字数 |

---

## 2026-06-11: 可编辑面板 & 弹窗组件

### 新增文件

```
src/components/
├── characters/
│   └── CharacterEditor.tsx    # 角色编辑弹窗
└── world/
    └── WorldSettingEditor.tsx # 世界观编辑弹窗
```

### 功能

- **人物面板**：点击卡片编辑，支持姓名/性格/背景/外貌/描述
- **世界观面板**：点击卡片编辑，支持分类/名称/内容
- **大纲面板**：已有编辑功能
- **章节编辑**：Tiptap富文本编辑器

---

## 2026-06-11: AI引导 + 实时同步功能

### 同步机制

| AI 输出格式 | 同步目标 |
|------------|----------|
| 【基本信息】 | 顶部栏（题材、简介） |
| 【大纲】 | 左侧"大纲"面板 |
| 【角色】 | 左侧"人物"面板 |
| 【世界观】 | 左侧"世界观"面板 |
| 【章节】 | 左侧"章节"列表 |

### 自动同步逻辑

1. AI 响应完成时，解析结构化内容
2. 自动提取并同步到对应 store
3. 左侧面板实时更新
4. 用户可在左侧修改，AI 下次读取最新内容

---

## 技术栈

- React 19 + TypeScript + Vite
- shadcn/ui + Tailwind CSS v3.4.4
- Tiptap 富文本编辑器
- Zustand 状态管理 + persist
- DeepSeek API

---

## 2026-06-15: 问题修复 & 新功能迭代

### 用户反馈的问题

| 序号 | 类型 | 问题 | 解决方案 |
|------|------|------|----------|
| 1 | Bug | Sidebar 导航按钮点不动 | 补充缺失的 `handleViewChange` 函数 |
| 2 | Bug | AI输入框无法多行输入 | 改为 textarea + Shift+Enter换行逻辑 |
| 3 | Bug | AI修改内容时追加而非更新 | autoSync.ts 添加同名检查，更新而非新增 |
| 4 | Bug | 刷新后面板宽度重置 | localStorage 持久化 + 默认25%宽度 |
| 5 | 需求 | Agent自定义提示词 | 每本书独立提示词，附加到system prompt |

---

### 解决方案详解

#### 1. Sidebar 导航按钮修复

**问题**：`Sidebar.tsx` 第201行调用 `handleViewChange(item.id)`，但函数未定义

**修复**：
```typescript
const handleViewChange = (view: ViewType) => {
  setCurrentView(view);
};
```

#### 2. AI输入框多行支持

**修复**：`AgentPanel.tsx` 将 `<input>` 改为 `<textarea>`

```typescript
onKeyDown={(e) => {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // Shift+Enter: 手动插入换行符
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = input.substring(0, start) + '\n' + input.substring(end);
      setInput(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      });
    } else {
      // Enter: 发送消息
      e.preventDefault();
      handleSend();
    }
  }
}}
```

#### 3. AI修改内容追加问题

**问题**：AI生成同名角色/章节时会追加新的，而不是更新已有的

**修复**：`autoSync.ts` 添加同名检查逻辑

```typescript
// 同步角色 - 检查是否已存在同名角色
const existingChar = store.characters.find(
  c => c.novelId === novelId && c.name.trim() === (char.name || '').trim()
);

if (existingChar) {
  // 更新已有的角色
  store.updateCharacter(existingChar.id, {...});
} else {
  // 添加新角色
  store.addCharacter({...});
}
```

#### 4. 面板宽度持久化

**修复**：`App.tsx` 使用 localStorage 存储

```typescript
const STORAGE_KEY_AGENT = 'novel-agent-panel-width';

const getDefaultAgentWidth = () => {
  const saved = localStorage.getItem(STORAGE_KEY_AGENT);
  if (saved) return parseInt(saved, 10);
  return Math.max(320, Math.min(600, window.innerWidth * 0.25)); // 默认25%
};

// 拖拽时保存
setAgentPanelWidth(newWidth);
localStorage.setItem(STORAGE_KEY_AGENT, newWidth.toString());
```

#### 5. Agent自定义提示词

**需求**：每本书可设置独立的Agent提示词，如"每章2000字"、"禁止现实地名"

**实现**：

1. 数据结构：`Novel.agentPrompt?: string`
2. UI：Agent面板右上角齿轮按钮 + 编辑对话框
3. 发送逻辑：附加到 system prompt

```typescript
// AgentPanel.tsx
let enhancedSystemPrompt = AGENT_CONFIGS[activeAgent].systemPrompt;

if (currentNovel?.agentPrompt) {
  enhancedSystemPrompt += `\n\n【用户自定义要求】\n${currentNovel.agentPrompt}`;
}
```

---

### 修改的文件

| 文件 | 修改内容 |
|------|----------|
| `src/components/layout/Sidebar.tsx` | 补充 `handleViewChange` 函数 |
| `src/components/layout/AgentPanel.tsx` | textarea输入框 + 提示词对话框 |
| `src/lib/autoSync.ts` | 同名内容检查逻辑 + 精准修改指令 |
| `src/App.tsx` | 面板宽度持久化 |
| `src/types/index.ts` | Novel 添加 `agentPrompt` 字段 |
| `src/types/agents.ts` | 新增【修改】【删除】指令格式说明 |

---

### 新增功能：精准修改指令

用户说"改第二章某个情节"，AI只修改指定内容，不追加、不重写。

**重要区分**：

| 需求 | 格式 | 说明 |
|------|------|------|
| 扩写/重写整个章节 | 【章节】 | 输出完整内容，系统自动替换同名章节 |
| 精准修改某段落 | 【修改】 | 只替换指定段落，需提供原内容匹配 |

**指令格式**：

```
【章节】
标题：觉醒
内容：
（完整章节内容，可以是2000字、3000字等）
【/章节】

【修改】
目标：章节
标题：觉醒
原内容：林风走在山路上，夕阳的余晖洒在他略显疲惫的身影上。
新内容：林风快步走在山路上，心中盘算着今晚的修炼计划。
【/修改】

【删除】
目标：章节
标题：觉醒
【/删除】
```

**修改的文件**：
| 文件 | 修改内容 |
|------|----------|
| `src/types/agents.ts` | 明确扩写用【章节】、精准修改用【修改】的区别 |
| `src/components/editor/ChapterEditor.tsx` | AI同步后更新编辑器wordCount状态 |

#### 6. 字数统计实时更新

**问题**：AI写完章节后，正文左下角的字数没有实时更新，显示的还是旧字数。

**修复**：`ChapterEditor.tsx` 在外部更新（AI同步）时，同步更新 `wordCount` 状态。

```typescript
// 只在内容真正不同时更新
if (contentToSet !== currentEditorContent) {
  lastSavedContentRef.current = contentToSet;
  editor.commands.setContent(contentToSet, false);
  // 同步更新字数（从 store 的 wordCount 或重新计算）
  setWordCount(chapter.wordCount || contentToSet.replace(/<[^>]*>/g, '').length);
}
```

**支持的目标**：
- 章节：通过标题定位，替换内容
- 大纲：通过标题定位，替换摘要
- 角色：通过姓名+字段定位
- 世界观：通过标题定位

#### 7. 连续生成多个章节不写入左侧

**问题**：AI 连续生成多个章节（如第三章、第四章、第五章），内容没有自动同步到左侧平台，用户需要手动复制。

**原因**：
1. `parseChapterContent` 正则匹配 `(?:【|$)` 在连续章节时匹配失败
2. AI 可能没有正确使用【章节】标签格式

**修复**：

`autoSync.ts`：
```typescript
// 解析内容 - 从"内容："后面开始，到块结束
const contentMatch = block.match(/内容[：:]\s*([\s\S]+)$/);
if (contentMatch) {
  chapterContent = contentMatch[1].trim();
  // 移除末尾可能的【字符残留
  if (chapterContent.endsWith('【')) {
    chapterContent = chapterContent.slice(0, -1).trim();
  }
}
```

`agents.ts`：
```
连续多个章节（每个章节单独包裹）：
【章节】标题：图书馆内容：...【/章节】

【章节】标题：喝茶内容：...【/章节】

【章节】标题：邀请内容：...【/章节】
```

---

### 新增功能：导出小说

用户可导出所有章节为一个 txt 文件，格式适合小说阅读器识别。

**功能特点**：
- 导出按钮位于顶部右侧（原字数统计位置）
- txt 格式，UTF-8 编码
- 以书名命名文件
- 章节格式：`第X章 标题`，章间空行分隔

**导出格式示例**：
```
书名

简介：故事简介...

第1章 觉醒

章节内容...


第2章 入门

章节内容...
```

**修改的文件**：
| 文件 | 修改内容 |
|------|----------|
| `src/components/layout/MainContent.tsx` | 添加 exportNovelAsTxt 函数，替换字数为导出按钮 |

#### 8. AI完整控制左侧面板

**问题**：AI不会删除左侧面板的章节，需要用户手动操作。

**需求**：AI必须能完成用户对左侧面板的一切操作（增删改查）。

**修复**：更新 system prompt，明确告诉 AI 可以执行增删改查操作：

```
## 核心能力：完全控制左侧面板

### 增 - 新增内容
【章节】标题：图书馆内容：...【/章节】

### 删 - 删除内容
【删除】目标：章节标题：图书馆【/删除】

### 改 - 修改内容
【修改】目标：章节标题：图书馆原内容：...新内容：...【/修改】

### 查 - 查看内容
AI 自动读取左侧面板内容
```

**示例**：用户说"删掉第三章、第四章、第五章，重新写"

AI 应输出：
```
【删除】目标：章节标题：图书馆【/删除】
【删除】目标：章节标题：喝茶【/删除】
【删除】目标：章节标题：邀请【/删除】

【章节】标题：图书馆内容：...【/章节】
【章节】标题：喝茶内容：...【/章节】
【章节】标题：邀请内容：...【/章节】
```

#### 9. AI不再提示用户手动复制

**问题**：AI 输出后一直提示"请逐一复制到左侧面板"，但内容已自动同步。

**原因**：system prompt 中没有明确告诉 AI 内容会自动同步。

**修复**：
- system prompt 明确说明"内容会自动同步，无需用户手动操作"
- 明确禁止 AI 输出"请复制"、"已同步"等提示
- 简化输出流程，输出完指令后直接开始下一个任务

#### 10. 上下文压缩改进

**问题**：压缩丢失关键信息，AI 不知道之前生成了什么章节。

**修复**：`AgentPanel.tsx` 改进压缩逻辑：
- 同时压缩用户和助手的关键内容
- 提取已生成章节、大纲、角色等关键信息
- 摘要末尾提示"当前大纲和章节已保存在左侧面板"

```typescript
// 检查是否有章节、大纲等关键内容
if (content.includes('【章节】')) {
  const chapters = chapterMatches.map(m => m.replace(/标题[：:]\s*/, '').trim());
  summaryParts.push(`已生成章节: ${chapters.join(', ')}`);
}
```

#### 11. 刷新后保持状态

**问题**：刷新页面后，输入框里的内容消失，原先打开的章节也不再打开。

**修复**：

1. `novelStore.ts`：将 `currentChapterId` 添加到持久化字段
```typescript
partialize: (state) => ({
  // ...
  currentChapterId: state.currentChapterId,  // 新增
})
```

2. `AgentPanel.tsx`：输入框内容保存到 localStorage
```typescript
// 初始化时读取
const [input, setInput] = useState(() => localStorage.getItem(INPUT_DRAFT_KEY) || '');

// 输入时保存（防抖）
onChange={(e) => {
  setInput(e.target.value);
  saveInputDraft(e.target.value);
}}

// 发送后清空
localStorage.removeItem(INPUT_DRAFT_KEY);
```

#### 12. 用户自定义提示词没生效

**问题**：用户在 Agent 面板设置了"每章写三千字"的自定义提示词，但 AI 生成的章节只有2000字。

**根本原因**：`deepseek.ts` 中**覆盖了传入的 system prompt**！

```typescript
// ❌ 错误代码
const systemPrompt = AGENT_CONFIGS[options.agentType].systemPrompt;  // 用原始的
const messages = [
  { role: 'system', content: systemPrompt },  // 覆盖了传入的 enhancedSystemPrompt
  ...options.messages,
];
```

**AgentPanel.tsx** 中正确构建了包含用户自定义提示词的 `enhancedSystemPrompt`：

```typescript
if (currentNovel?.agentPrompt) {
  enhancedSystemPrompt += `\n\n【用户自定义要求】\n${currentNovel.agentPrompt}`;
}
```

但 `DeepSeekService.chatStream` 又重新取了原始的 system prompt，把增强版丢弃了！

**修复**：`deepseek.ts` 直接使用传入的 messages

```typescript
// ✅ 修复后的代码
const messages: ChatMessage[] = options.messages;  // 直接用传入的
```

#### 13. 加强 system prompt 让 AI 遵守规则

**问题**：
1. AI 不遵守用户自定义的字数要求（要求3000字，只写1842字）
2. AI 输出多余的话"请复制到左侧"（虽然系统已自动同步）

**修复**：

`agents.ts`：
```
## 必须遵守的规则

1. **禁止输出以下内容**：
   - ❌ "已同步到左侧面板"
   - ❌ "请复制到左侧"
   - ❌ "请您逐一复制"
   
2. **输出结构化内容后直接结束**

3. **严格遵守用户自定义要求**
   - 如果要求写3000字，必须写到3000字
```

`AgentPanel.tsx`：加强用户自定义要求的显示
```typescript
enhancedSystemPrompt += `
========================================
【必须遵守的用户自定义要求】
以下是用户为本书设定的专属要求，你必须严格遵守：
========================================
${currentNovel.agentPrompt}
========================================
以上要求必须100%遵守，特别是字数要求！
========================================
`;
```

#### 14. 完善API配置支持多种提供商

**需求**：兼容市面上常见的 API 配置，如腾讯云 CodingPlan、OpenAI 等。

**实现**：

`settingsStore.ts`：
```typescript
// API 提供商类型
export type APIProvider = 'deepseek' | 'openai' | 'tencent' | 'custom';

// 预设配置
export const API_PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', models: [...] },
  openai: { baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', ...] },
  tencent: { baseUrl: 'https://api.hunyan.tencent.com/v1', models: [...] },
  custom: { baseUrl: '', models: [] },
};
```

`SettingsView.tsx`：
- 提供商选择卡片（DeepSeek / OpenAI / 腾讯云 / 自定义）
- API Key 输入
- Base URL 输入（自定义时可编辑）
- 模型选择下拉框
- 参数配置（Temperature / MaxTokens）
- 常见 API 配置帮助说明

---

### 新增文件

| 文件 | 用途 |
|------|------|
| `ISSUES.md` | 问题追踪文档（用户反馈记录） |

---

## 技术栈

- React 19 + TypeScript + Vite
- shadcn/ui + Tailwind CSS v3.4.4
- Tiptap 富文本编辑器
- Zustand 状态管理 + persist
- DeepSeek API

---

## 2026-06-17: 保守代码清理

### 清理原则

用户反馈 `components` 目录代码看起来混乱，要求在保证系统可用的前提下清理代码，且不要误删重要文件。

本次采用保守清理策略：只删除确定未使用的导入、简化局部变量声明，不删除任何业务文件、不删除导出函数、不改核心同步逻辑。

### 修改内容

| 文件 | 修改内容 |
|------|----------|
| `novel-agent/src/App.tsx` | 移除未使用的 `useRef` 导入 |
| `novel-agent/src/components/cards/StructuredCardRenderer.tsx` | 移除未使用的 `ChevronRight` 图标导入 |
| `novel-agent/src/components/layout/AgentPanel.tsx` | 移除未使用的 `hasStructuredCard` 导入 |
| `novel-agent/src/lib/autoSync.ts` | 移除大纲/章节同步循环中未使用的 `index` 参数，将 `processedContent` 改为 `const` |
| `novel-agent/src/services/deepseek.ts` | 将未使用的 `catch (e)` 改为 `catch`，保留错误忽略行为 |
| `novel-agent/tsconfig.app.json` | 添加 `ignoreDeprecations: "6.0"`，关闭 `erasableSyntaxOnly` 以兼容现有 enum 语法 |
| `novel-agent/src/components/chapter/ChapterList.tsx` | 移除未使用的 `GripVertical` 导入 |
| `novel-agent/src/components/editor/ChapterEditor.tsx` | 使用 `ReturnType<typeof setTimeout>` 替代 `NodeJS.Timeout`，并适配 Tiptap `setContent` 参数类型 |
| `novel-agent/src/components/layout/AgentPanel.tsx` | 移除未使用状态/选择器，避免跨 `AgentType` 定义索引 `AGENT_CONFIGS` |
| `novel-agent/src/components/layout/Sidebar.tsx` | 移除未使用的列表索引参数 |
| `novel-agent/src/components/outline/ChapterOutline.tsx` | 移除未使用的 `displayIndex` 参数 |
| `novel-agent/src/components/settings/SettingsView.tsx` | 为调试数据 map 参数补充显式类型 |
| `novel-agent/src/stores/novelStore.ts` | 让 `addCharacter`、`addWorldSetting` 返回新实体，匹配 `cardSync` 现有调用方式 |
| `novel-agent/src/lib/cardSync.ts` | 为视图跳转和三幕式编号补充类型约束 |
| `novel-agent/src/lib/autoSync.ts` | 标记精准修改角色中未使用的原内容参数 |
| `novel-agent/src/hooks/` | 删除空的预留源码目录 |
| `novel-agent/src/components/agent/` | 删除空的历史遗留 Agent 组件目录 |

### 明确未处理项

- 未删除 `src/types/agents.ts`：仍被 `deepseek.ts` 和 `AgentPanel.tsx` 使用。
- 未删除 `processStreamLines`：已确认在流结束处理 buffer 时仍被调用。
- 未删除 `cardParser.ts` 中导出的解析函数：避免破坏潜在调用。
- 未清理调试日志：当前 AI 同步问题排查仍依赖控制台日志。

### 验证结果

- `npm --prefix "D:\\trae\\noval-agent\\novel-agent" run build`：通过，成功生成 `dist`。
- `npm --prefix "D:\\trae\\noval-agent\\novel-agent" run lint`：仍失败，剩余 35 个既有 ESLint 问题，主要为 `any` 类型、React setState-in-effect 规则、shadcn/ui Fast Refresh 规则、`autoSync.ts` switch case 声明等；这些属于较大范围清理，本次按保守原则未继续重构。

---

## 2026-06-17: Agent 面板斜杠命令

### 新增功能

在 Agent 面板输入框中添加斜杠命令支持，用户可通过 `/命令名` 执行快捷操作。

### 支持的命令

| 命令 | 功能 |
|------|------|
| `/clear` | 清空当前会话历史 |
| `/status` | 显示上下文用量和模型配置状态 |
| `/help` | 显示所有可用命令 |
| `/export` | 导出当前会话为文本文件 |
| `/compact` | 手动压缩历史消息 |

### 实现细节

```typescript
// 斜杠命令定义
const SLASH_COMMANDS: Record<string, SlashCommand> = {
  clear: { name: '/clear', description: '清空当前会话历史', ... },
  status: { name: '/status', description: '显示当前上下文用量和模型状态', ... },
  help: { name: '/help', description: '显示所有可用命令', ... },
  export: { name: '/export', description: '导出当前会话为文本', ... },
  compact: { name: '/compact', description: '手动压缩历史消息', ... },
};

// 在 handleSend 中检测斜杠命令
if (sendContent.startsWith('/')) {
  handleSlashCommand(sendContent);
  return;
}
```

### UI 变化

- 输入框提示更新为 `输入需求... (/help 查看命令)`
- 底部状态栏显示当前对话条数
- 命令执行结果显示在绿色提示条中
- 错误命令显示蓝色提示条

### 修改的文件

| 文件 | 修改内容 |
|------|----------|
| `src/components/layout/AgentPanel.tsx` | 添加斜杠命令解析和执行逻辑 |

---

## 2026-06-19: 全栈后端改造 MVP

### 改造目标

用户要求项目必须成为全栈项目，且小说创作数据非常重要，不能只依赖浏览器 localStorage。本次将 NovelAgent 从纯前端本地存储应用改造为前后端分离的全栈项目。

### 技术选型

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Zustand |
| 后端 | Node.js + Express + TypeScript |
| ORM | Prisma |
| 数据库 | SQLite |
| 认证 | JWT + bcrypt 邮箱密码登录 |
| 项目结构 | npm workspaces monorepo |

### 新项目结构

```
noval-agent/
├── package.json              # 根 workspace 配置
├── packages/
│   ├── frontend/             # 原前端项目
│   └── backend/              # 新增 Express 后端
│       ├── prisma/schema.prisma
│       └── src/
│           ├── index.ts
│           ├── routes/
│           ├── middlewares/
│           └── lib/prisma.ts
```

### 新增后端能力

| 能力 | 说明 |
|------|------|
| 用户认证 | `/api/auth/register`、`/api/auth/login`、`/api/auth/me` |
| 小说 CRUD | `/api/novels` |
| 章节 CRUD | `/api/novels/:novelId/chapters`、`/api/chapters/:id` |
| 角色 CRUD | `/api/novels/:novelId/characters`、`/api/characters/:id` |
| 世界观 CRUD | `/api/novels/:novelId/world-settings`、`/api/world-settings/:id` |
| 大纲 CRUD | `/api/novels/:novelId/plot-cards`、`/api/plot-cards/:id` |
| 伏笔 CRUD | `/api/novels/:novelId/foreshadowings`、`/api/foreshadowings/:id` |
| 数据迁移 | `/api/migrate/import` 从 localStorage 一次性导入 |
| 健康检查 | `/api/health` |

### 前端改造

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/api/client.ts` | 新增统一 fetch 封装，自动携带 JWT |
| `packages/frontend/src/api/*.ts` | 新增 auth/novels/chapters/characters/worldSettings/plotCards/foreshadowings/migrate/sync API 模块 |
| `packages/frontend/src/stores/authStore.ts` | 新增登录状态管理 |
| `packages/frontend/src/stores/novelStore.ts` | 保留本地体验，同时登录后异步同步 CRUD 到后端 |
| `packages/frontend/src/components/auth/LoginPage.tsx` | 新增登录/注册页 |
| `packages/frontend/src/components/auth/MigrationWizard.tsx` | 新增首次登录数据迁移向导 |
| `packages/frontend/src/App.tsx` | 加入登录态判断、后端数据拉取和迁移弹窗 |
| `packages/frontend/src/components/layout/Sidebar.tsx` | 显示当前用户和退出登录入口 |

### 关键设计决策

1. **AI API Key 继续保留在前端**
   - 用户自带 Key，避免后端成为大模型代理，降低成本和法律风险。

2. **核心创作数据迁移到后端**
   - Novel、Chapter、Character、WorldSetting、PlotCard、Foreshadowing 全部服务端持久化。

3. **AI 会话仍可留在前端**
   - Session/Message 属于临时交互历史，避免占用数据库空间。

4. **乐观更新 + 异步云端同步**
   - 前端先更新 Zustand，保持体验流畅；登录状态下异步调用后端 API。

5. **首次登录迁移向导**
   - 检测已有 localStorage 数据，提示用户导入到云端。

### 验证结果

- `npx prisma generate`：通过。
- `npx prisma migrate dev --name init`：通过，生成 SQLite `dev.db` 和 migration。
- `npm run build --workspace=backend`：通过。
- `npm run build --workspace=frontend`：通过（仅有 Vite chunk 体积提示）。
- 后端 `/api/health`：返回 `status: ok`。
- 后端注册、创建小说、创建章节 API：已手动测试通过。

---

## 2026-06-29: 书架品牌与封面图片

### 用户反馈

- 左上角应显示“我的书架”。
- Logo 希望更简洁，不要彩色，最好只有一个图案。
- 书籍可以选择添加书本封面图片。

### 修改内容

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/components/layout/Sidebar.tsx` | 顶部标题改为“我的书架”，Logo 改为单色线框书本图案 |
| `packages/frontend/src/components/layout/Sidebar.tsx` | 书籍卡片增加封面预览、添加/更换封面按钮、移除封面操作 |
| `packages/backend/src/routes/novels.ts` | 创建小说时支持接收并保存 `cover` 字段 |

### 设计说明

- 封面图片使用浏览器 `FileReader` 转为 data URL，复用已有 `Novel.cover` 字段，不新增数据库结构，避免影响已有数据。
- 书籍没有封面时显示简洁的单色占位书本图案。
- 已登录状态下，`updateNovel` 会继续走原有乐观更新 + 云端同步流程。

---

## 2026-06-29: 单色图标与章节目录宽度调整

### 用户反馈

- 书架、章节目录、章节序号、云同步等位置的绿色/彩色图标需要改为普通单色 icon。
- 章节列表里每一章前面的数字需要显示为“第一章”这类格式。
- 章节目录和正文编辑区之间需要可拖拽分界栏，因为章节目录默认占比太大。

### 修改内容

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/components/layout/Sidebar.tsx` | 移除导航、选中指示、创建新书、云同步区域的绿色/彩色图标样式，统一为单色图标 |
| `packages/frontend/src/components/chapter/ChapterList.tsx` | 章节目录标题图标、章节选中状态、空状态和统计区域改为单色样式 |
| `packages/frontend/src/components/chapter/ChapterList.tsx` | 章节序号从数字改为“第一章/第二章/第三章...”格式 |
| `packages/frontend/src/components/layout/MainContent.tsx` | 在章节目录和正文编辑器之间新增可拖拽分界栏，并把宽度保存到 localStorage |

### 设计说明

- 章节目录默认宽度从原来的 `w-72` 调整为 240px，可拖拽范围为 180px 到 360px。
- 拖拽宽度保存到 `novel-agent-chapter-list-width`，刷新后保留用户调整。
- 不修改章节数据本身，只改变列表显示标签，避免影响已有章节标题和导出内容。

---

## 2026-06-30: 大纲视图交互修复

### 用户反馈的问题

1. **卷不能删除** - 卷标题区域没有删除按钮
2. **删除卷需要弹窗确认** - 当卷下有章节大纲时，删除卷应弹出确认弹窗，提示连带删除
3. **新建按钮重复** - "新建卷"和"新建章节大纲"按钮在 toolbar 和章节大纲组件中重复出现

### 解决方案

1. 在卷标题区域添加删除按钮（hover 显示），点击触发确认弹窗
2. 实现删除确认弹窗：无章节时提示不可撤销，有章节时警告将连带删除
3. 移除 `OutlineView.tsx` toolbar 中的重复按钮，保留 `ChapterOutline.tsx` header 中的按钮

### 修改内容

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/components/outline/ChapterOutline.tsx` | 添加 `onCreateVolume` prop 到接口和解构；卷标题区域添加编辑和删除按钮（hover 显示）；添加删除卷确认弹窗 UI；header 区域添加"新建卷"按钮 |
| `packages/frontend/src/components/outline/OutlineView.tsx` | 移除 toolbar 中"新建卷"和"新建章节大纲"按钮；移除未使用的 `Plus`、`BookOpen` 和 `Button` 导入 |

### 4. AI 支持对卷的增删改查

#### 用户需求

AI 助手要能对"卷"进行创建、读取、更新、删除操作。

#### 解决方案

扩展 `autoSync.ts` 中的指令解析和处理逻辑，添加对"卷"类型的支持。

#### 修改内容

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/lib/autoSync.ts` | 修改指令接口 `ModifyInstruction` 和 `DeleteInstruction` 添加 `'卷'` 类型；更新正则匹配支持"卷"；新增 `modifyVolume` 函数处理修改卷逻辑；更新 `deleteContent` 函数支持删除卷（含级联删除章节大纲）；更新 `autoSyncContent` switch case 处理"卷"类型；更新 `hasSyncableContent` 添加 `【卷】` 和 `【章节大纲】` 标签检测 |

#### 使用示例

AI 可以通过以下格式操作卷：

```
【卷】
标题：第一卷
概要：故事的开端，主角觉醒...
【/卷】

【修改】
目标：卷
标题：第一卷
原内容：主角觉醒能力
新内容：主角觉醒神秘血脉
【/修改】

【删除】
目标：卷
标题：第一卷
【/删除】
```

---

### 5. AI 提示词改进：引导式创作流程

#### 问题背景

用户反馈 AI 提示词封装不够好，导致：
- 用户说完大概需求后，AI 直接输出世界观和角色，然后就开始写第一章
- 大纲还没建立就写章节
- 没有引导用户完善创作基础设定

#### 解决方案

1. **系统提示词重构**：在 `agents.ts` 中加入创作阶段判断逻辑和引导规则
2. **创作阶段上下文**：在 `AgentPanel.tsx` 中动态计算当前创作阶段并传递给 AI
3. **大纲完整性检查**：AI 在大纲缺失或不完整时必须拒绝写章节请求

#### 创作阶段划分

| 阶段 | 判断条件 | AI 行为 |
|------|----------|---------|
| 空白阶段 | 无设定、无章节 | 问 3-5 个关键问题，禁止直接生成内容 |
| 设定阶段 | 有设定但无大纲 | 帮用户建立世界观、角色，禁止写章节 |
| 大纲缺失 | 有设定但无章节大纲 | 引导建立卷结构和章节大纲，禁止写章节 |
| 大纲不完整 | 有章节大纲但缺少情节概要 | 帮用户补充概要，禁止写章节 |
| 写作阶段 | 大纲完整（每章都有概要） | 按大纲顺序写作 |

#### 修改内容

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/types/agents.ts` | 重写 `systemPrompt`，添加创作阶段判断规则、引导规则、禁止规则、对话示例 |
| `packages/frontend/src/components/layout/AgentPanel.tsx` | 新增 `getCreationStage` 函数判断创作阶段和大纲完整性；在 `enhancedContent` 中添加【创作阶段】和【大纲完整性要求】上下文；更新依赖数组 |

#### 使用效果

- 新小说：AI 会先问问题而不是直接生成内容
- 大纲缺失时：AI 拒绝写章节请求，引导建立大纲
- 大纲完整时：AI 按大纲顺序写作

---

### 6. 角色定位解析修复 + AI 提示词专业化重构

#### 问题背景

1. AI 生成角色时全部标为配角，没有主角
2. 主角人物卡片过于简单，缺乏深度
3. AI 提示词不够专业，不像真正的文学创作指导者

#### 解决方案

**问题 1 & 2：角色定位解析**

修改 `autoSync.ts`：
- `parseCharacterContent` 新增解析"定位"/"角色类型"字段
- 支持"主角"/"配角"/"龙套"三种定位
- 新增解析"内心冲突"、"成长弧线"等深度字段
- `autoSyncContent` 同步角色时传递 `role` 字段

**问题 3：提示词专业化**

重写 `agents.ts` 系统提示词，新增：

| 模块 | 内容 |
|------|------|
| **文学创作核心原则** | 人物塑造（内心冲突、成长弧线、弱点）、剧情设计（三幕结构、伏笔转折） |
| **角色定位强制要求** | 每个角色必须有"定位"字段，主角必须有内心冲突和成长弧线 |
| **引导示例优化** | 要求用户回答更具体的主角信息，而不是泛泛而谈 |
| **绝对禁止列表** | 新增禁止生成没有定位的角色、禁止主角只有简单描述 |

#### 修改内容

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/lib/autoSync.ts` | `parseCharacterContent` 添加定位字段解析；`autoSyncContent` 同步角色时传递 `role` |
| `packages/frontend/src/types/agents.ts` | 重写系统提示词，添加文学创作原则、角色深度要求、定位字段格式 |

#### 角色输出格式示例

```
【角色】
定位：主角
姓名：林逸
性格：表面内敛温和，内心却有一股不服输的劲头
背景：普通高中生，父母离异，与母亲相依为命
外貌：清瘦身材，黑色短发，眼神中有一种超出年龄的沉稳
内心冲突：渴望被认可，却又害怕被关注
成长弧线：从逃避责任 → 被迫面对 → 主动承担 → 成为真正的守护者
弱点：过度在意他人看法，关键时刻会犹豫
简介：一个看似普通的高中生，却因陨石事件觉醒了神秘力量
【/角色】
```

---

### 7. 界面精简：简介只在大纲页显示并可编辑

#### 问题背景

1. 大纲页面的小说信息区与 ChapterOutline 的统计信息重复
2. 简介在多个位置显示（MainContent Top Bar + OutlineView）
3. 简介不能编辑

#### 解决方案

1. **MainContent.tsx**：Top Bar 中的简介只在非大纲视图时显示
2. **OutlineView.tsx**：小说信息区添加编辑功能（题材+简介），点击编辑按钮进入编辑模式
3. **ChapterOutline.tsx**：删除重复的标题和统计信息，只保留操作按钮和状态筛选

#### 修改内容

| 文件 | 修改内容 |
|------|----------|
| `packages/frontend/src/components/layout/MainContent.tsx` | 简介 section 添加条件 `currentView !== 'outline'`，大纲视图时不显示 |
| `packages/frontend/src/components/outline/OutlineView.tsx` | 导入 `Pencil`、`X`、`Check` 图标和 `Button`；添加 `editingNovelInfo`、`editGenre`、`editSummary` 状态；添加编辑/保存/取消函数；小说信息区添加编辑按钮和编辑表单 |
| `packages/frontend/src/components/outline/ChapterOutline.tsx` | 删除 Header 区域的"章节大纲"标题和统计信息，只保留操作按钮区 |

#### 界面效果

- **大纲视图**：顶部显示小说信息（题材、简介），可点击编辑按钮修改
- **其他视图**：Top Bar 显示小说标题、状态、题材和简介
- **ChapterOutline**：简洁，只有新建按钮和状态筛选卡片

---

*最后更新: 2026-06-30*

## 2026-10-25：模型设置与多协议兼容升级

- 新增 12 类模型服务预设，并将服务商选择与接口协议解耦，支持 OpenAI Chat Completions / Responses、Claude Messages、Gemini 原生文本接口。
- 设置页增加模型列表获取、手动模型 ID、连接测试、独立服务商配置、保存并启用、密钥显隐、请求超时和取消操作。
- 支持本地模型无需密钥、认证方式选择、关闭 temperature、Token 参数切换、非流式输出、附加 JSON 参数及请求头。
- 提取 ModelService 作为测试与实际写作的共用请求层，修复 SSE 末尾文本丢失；增加流内错误、异常断流、截断和空响应识别，移除密钥前缀日志。
- 写作面板按完整配置检测可用性，支持免认证本地模型、停止生成和切换小说时取消请求。
- 设置存储升级至 version 1，保留旧地址、密钥、模型及生成参数，避免升级覆盖已有配置。
- 新增 `npm run test:models` 协议回归测试，使用模拟网络；页面冒烟覆盖迁移、模型列表、流式测试、保存刷新、服务商密钥隔离和本地模型配置。
- 完整配置指南、兼容范围、开发结构及验证方式见 [模型设置升级说明](docs/MODEL_SETTINGS.md)。未使用真实密钥逐家付费验证；浏览器直连仍取决于 CORS、网络与服务权限。
