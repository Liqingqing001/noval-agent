import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Bot, Send, Sparkles, User, AlertCircle, Settings2, X, Check, Trash2, Info, HelpCircle, Download, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNovelStore } from '@/stores/novelStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { API_PRESETS, isModelConfigured } from '@/lib/modelConfig';
import type { GenerationPhase } from '@/services/modelService';
import { GenerationStatus } from './GenerationStatus';
import { AssistantReply } from './AssistantReply';
import { extractContentBlocks } from '@/lib/structuredContent';
import { syncFeedback } from '@/lib/syncFeedback';
import { hasModificationInstructions } from '@/lib/modificationInstructions';
import { DeepSeekService } from '@/services/deepseek';
import { AgentType, AGENT_CONFIGS } from '@/types/agents';
import type { Message, ViewType } from '@/types';
import ReactMarkdown from 'react-markdown';
import { autoSyncContent, hasSyncableContent } from '@/lib/autoSync';

// Markdown options are static at each call site; history text does not change on stream updates.
const MemoMarkdown = memo(ReactMarkdown, (previous, next) => previous.children === next.children);

interface AgentPanelProps {
  currentView: ViewType;
}

// localStorage key for input draft
const INPUT_DRAFT_KEY = 'novel-agent-input-draft';

// 斜杠命令定义
interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  icon: typeof Bot;
  action: (args?: string) => string;
}

const SLASH_COMMANDS: Record<string, SlashCommand> = {
  clear: {
    name: '/clear',
    description: '清空当前会话历史',
    usage: '/clear',
    icon: Trash2,
    action: () => 'CLEAR_SESSION',
  },
  status: {
    name: '/status',
    description: '显示当前上下文用量和模型状态',
    usage: '/status',
    icon: Info,
    action: () => 'SHOW_STATUS',
  },
  help: {
    name: '/help',
    description: '显示所有可用命令',
    usage: '/help',
    icon: HelpCircle,
    action: () => 'SHOW_HELP',
  },
  export: {
    name: '/export',
    description: '导出当前会话为文本',
    usage: '/export',
    icon: Download,
    action: () => 'EXPORT_SESSION',
  },
  compact: {
    name: '/compact',
    description: '手动压缩历史消息',
    usage: '/compact',
    icon: Layers,
    action: () => 'COMPACT_MESSAGES',
  },
};

export function AgentPanel({ currentView: _currentView }: AgentPanelProps) {
  const [input, setInput] = useState(() => localStorage.getItem(INPUT_DRAFT_KEY) || '');
  const [activeAgent] = useState<AgentType>(AgentType.MASTER);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('connecting');
  const [generationStartedAt, setGenerationStartedAt] = useState(0);
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [slashCommandHint, setSlashCommandHint] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamingContentRef = useRef('');
  const generationRef = useRef<AbortController | null>(null);
  const inputSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  useEffect(() => () => generationRef.current?.abort(), [currentNovelId]);
  const allSessions = useNovelStore((state) => state.sessions);
  const addSession = useNovelStore((state) => state.addSession);
  const updateSession = useNovelStore((state) => state.updateSession);
  const apiKey = useSettingsStore((state) => state.apiKey);
  const modelConfigured = useSettingsStore(isModelConfigured);
  const apiProvider = useSettingsStore((state) => state.apiProvider);
  const model = useSettingsStore((state) => state.model);
  const temperature = useSettingsStore((state) => state.temperature);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const updateNovel = useNovelStore((state) => state.updateNovel);

  const currentNovel = useNovelStore((state) => state.getCurrentNovel());
  const allChapters = useNovelStore((state) => state.chapters);
  const allPlotCards = useNovelStore((state) => state.plotCards);
  const currentChapterId = useNovelStore((state) => state.currentChapterId);
  const allCharacters = useNovelStore((state) => state.characters);
  const allWorldSettings = useNovelStore((state) => state.worldSettings);

  // 保存输入框内容到 localStorage（防抖）
  const saveInputDraft = useCallback((value: string) => {
    if (inputSaveTimeoutRef.current) {
      clearTimeout(inputSaveTimeoutRef.current);
    }
    inputSaveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(INPUT_DRAFT_KEY, value);
    }, 300);
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (inputSaveTimeoutRef.current) {
        clearTimeout(inputSaveTimeoutRef.current);
      }
    };
  }, []);

  const plotCards = useMemo(() => {
    if (!currentNovelId) return [];
    return allPlotCards.filter((c) => c.novelId === currentNovelId).sort((a, b) => a.sequence - b.sequence);
  }, [allPlotCards, currentNovelId]);

  const chapters = useMemo(() => {
    if (!currentNovelId) return [];
    return allChapters.filter((c) => c.novelId === currentNovelId).sort((a, b) => a.sequence - b.sequence);
  }, [allChapters, currentNovelId]);

  const characters = useMemo(() => {
    if (!currentNovelId) return [];
    const roleOrder: Record<string, number> = { protagonist: 0, supporting: 1, minor: 2 };
    return allCharacters
      .filter((c) => c.novelId === currentNovelId)
      .sort((a, b) => (roleOrder[a.role || 'supporting'] ?? 1) - (roleOrder[b.role || 'supporting'] ?? 1));
  }, [allCharacters, currentNovelId]);

  const worldSettings = useMemo(() => {
    if (!currentNovelId) return [];
    return allWorldSettings.filter((w) => w.novelId === currentNovelId);
  }, [allWorldSettings, currentNovelId]);

  const currentChapter = useMemo(() => {
    if (!currentChapterId) return null;
    return chapters.find((c) => c.id === currentChapterId);
  }, [chapters, currentChapterId]);

  const activeSession = useMemo(() => {
    return allSessions.find((s) => s.novelId === currentNovelId && s.agentType === activeAgent);
  }, [allSessions, currentNovelId, activeAgent]);

  const messages = useMemo(() => activeSession?.messages || [], [activeSession?.messages]);
  const syncableMessageIds = useMemo(() => new Set(messages.filter(message => message.role === 'assistant' && message.syncStatus?.state !== 'partial' && (extractContentBlocks(message.content).some(block => block.body.trim()) || hasModificationInstructions(message.content))).map(message => message.id)), [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: isLoading ? 'instant' : 'smooth' });
    }
  }, [messages.length, streamingContent, isLoading]);

  useEffect(() => () => { if (streamTimerRef.current) clearTimeout(streamTimerRef.current); }, []);

  const getOutlineContext = useCallback(() => {
    if (plotCards.length === 0) return '';

    // 分卷显示大纲
    const volumes = plotCards.filter(c => c.type === 'volume').sort((a, b) => a.sequence - b.sequence);
    const chapters = plotCards.filter(c => c.type === 'chapter');

    let text = '';
    volumes.forEach((vol, i) => {
      text += `\n第${i + 1}卷：${vol.title}\n情节概要：${vol.summary || '暂无'}\n`;
      // 该卷下的章节大纲
      const volChapters = chapters.filter(c => c.volumeId === vol.id).sort((a, b) => a.sequence - b.sequence);
      volChapters.forEach((ch, j) => {
        text += `  第${j + 1}章：${ch.title}\n    状态: ${ch.status === 'completed' ? '✅ 已完成' : '⏳ 待写作'}\n    情节: ${ch.summary || '暂无'}\n`;
      });
    });

    // 如果没有卷结构，直接显示章节大纲
    if (volumes.length === 0 && chapters.length > 0) {
      text = chapters.sort((a, b) => a.sequence - b.sequence).map((c, i) =>
        `第${i + 1}章：${c.title}\n  状态: ${c.status === 'completed' ? '✅ 已完成' : '⏳ 待写作'}\n  情节: ${c.summary || '暂无'}`).join('\n');
    }

    return `\n\n【当前大纲】\n${text}`;
  }, [plotCards]);

  const getChaptersContext = useCallback(() => {
    if (chapters.length === 0) return '';
    const text = chapters.map((c, i) => `第${i + 1}章: ${c.title} (${c.wordCount}字)`).join('\n');
    return `\n\n【章节列表】\n${text}`;
  }, [chapters]);

  // 人物上下文（按角色定位排序：主角 > 配角 > 龙套）
  const getCharactersContext = useCallback(() => {
    if (characters.length === 0) return '';
    const text = characters.map((c) => {
      const roleLabel = c.role === 'protagonist' ? '主角' : c.role === 'supporting' ? '配角' : '龙套';
      return `【${roleLabel}】${c.name}\n性格: ${c.personality || '暂无'}\n背景: ${c.background || '暂无'}\n外貌: ${c.appearance || '暂无'}\n简介: ${c.description || '暂无'}`;
    }).join('\n\n');
    return `\n\n【人物设定】\n${text}`;
  }, [characters]);

  // 世界观上下文
  const getWorldContext = useCallback(() => {
    if (worldSettings.length === 0) return '';
    const text = worldSettings.map((w) => `【${w.category}】${w.title}\n${w.content}`).join('\n\n');
    return `\n\n【世界观设定】\n${text}`;
  }, [worldSettings]);

  // 前N章完整内容（用于续写参考）
  const getPreviousChaptersContent = useCallback((count: number = 3) => {
    const prevChapters = chapters.slice(-count);
    if (prevChapters.length === 0) return '';
    const text = prevChapters.map((c) => `【${c.title}】（${c.wordCount}字）\n${c.content}`).join('\n\n---\n\n');
    return `\n\n【最近章节内容】\n${text}`;
  }, [chapters]);

  // 创作阶段和大纲完整性判断
  const getCreationStage = useCallback(() => {
    // 检查大纲完整性
    const volumes = plotCards.filter(c => c.type === 'volume');
    const chapterOutlines = plotCards.filter(c => c.type === 'chapter');

    // 判断大纲是否完整
    const incompleteChapters = chapterOutlines.filter(c => !c.summary || c.summary.trim() === '');
    const hasIncompleteOutline = incompleteChapters.length > 0;
    const hasEmptyOutline = chapterOutlines.length === 0;

    // 判断是否有基础设定
    const hasBasicSetting = currentNovel?.summary || characters.length > 0 || worldSettings.length > 0;

    if (!hasBasicSetting && chapters.length === 0) {
      return '空白阶段：小说刚创建，尚未建立任何设定。你需要引导用户建立世界观和角色设定。';
    }
    if (hasEmptyOutline) {
      return '大纲缺失：尚未建立章节大纲。你必须引导用户先建立卷结构和章节大纲，禁止直接写章节内容。';
    }
    if (hasIncompleteOutline) {
      const incompleteTitles = incompleteChapters.map(c => c.title).join('、');
      return `大纲不完整：以下章节缺少情节概要：${incompleteTitles}。你必须帮用户补充这些概要，禁止直接写章节内容。`;
    }
    if (chapters.length === 0) {
      return `准备写作：大纲完整（${volumes.length} 卷，${chapterOutlines.length} 章），可以开始写作。请按大纲顺序写作。`;
    }
    const writtenCount = chapters.length;
    const pendingOutlines = chapterOutlines.filter(c => c.status === 'pending');
    return `创作中：已写 ${writtenCount} 章，大纲共 ${chapterOutlines.length} 章。待写作章节：${pendingOutlines.length} 章。请按大纲顺序继续写作。`;
  }, [plotCards, chapters, characters, worldSettings, currentNovel]);

  // Formatting must never claim that a store write succeeded.
  const formatAIResponse = useCallback((content: string): string => content
    .replace(/【(基本信息|角色|人物|世界观|卷|大纲|章节大纲|章节)】/g, '\n**$1**\n')
    .replace(/【\/(基本信息|角色|人物|世界观|卷|大纲|章节大纲|章节)】/g, '\n'), []);

  const retrySync = useCallback((message: Message) => {
    if (!currentNovelId || !activeSession || isLoading) return;
    let status: NonNullable<Message['syncStatus']>;
    try { status = syncFeedback(autoSyncContent(message.content, currentNovelId, { contentOnly: true, retryModifications: true })); }
    catch { status = { state: 'error', message: '同步未完成，可能有部分内容已写入；请检查面板后重试。' }; }
    const latest = useNovelStore.getState().sessions.find(s => s.id === activeSession.id);
    if (latest) updateSession(latest.id, { messages: latest.messages.map(m => m.id === message.id ? { ...m, syncStatus: status } : m) });
  }, [currentNovelId, activeSession, isLoading, updateSession]);

  // 上下文管理：限制消息数量，避免超出token限制
  const MAX_MESSAGES = 15; // 保留最近15条消息

  const getTrimmedMessages = useCallback((msgs: Message[]) => {
    if (msgs.length <= MAX_MESSAGES) return msgs;

    // 保留最新的消息，将旧消息压缩为摘要
    const recentMessages = msgs.slice(-MAX_MESSAGES);
    const oldMessages = msgs.slice(0, -MAX_MESSAGES);

    // 创建一个摘要消息替代旧消息（包含用户和助手的关键内容）
    const summaryParts: string[] = [];

    oldMessages.forEach(m => {
      if (m.role === 'user') {
        // 保留用户请求的关键内容
        const content = m.content.slice(0, 150);
        summaryParts.push(`用户: ${content}`);
      } else if (m.role === 'assistant') {
        // 提取结构化内容的关键信息
        const content = m.content;
        // 检查是否有章节、大纲等关键内容
        if (content.includes('【章节】')) {
          const chapterMatches = content.match(/标题[：:]\s*(.+?)(?:\n|内容)/g);
          if (chapterMatches) {
            const chapters = chapterMatches.map(m => m.replace(/标题[：:]\s*/, '').trim());
            summaryParts.push(`已生成章节: ${chapters.join(', ')}`);
          }
        } else if (content.includes('【大纲】')) {
          summaryParts.push('已生成大纲');
        } else if (content.includes('【角色】')) {
          summaryParts.push('已生成角色');
        } else if (content.includes('【删除】')) {
          summaryParts.push('已执行删除操作');
        } else if (content.includes('【修改】')) {
          summaryParts.push('已执行修改操作');
        } else {
          // 普通回复，保留前100字符
          summaryParts.push(`AI: ${content.slice(0, 100)}`);
        }
      }
    });

    const summaryContent = summaryParts.slice(-10).join('\n'); // 只保留最近10条摘要

    if (summaryContent) {
      const summaryMessage: Message = {
        id: 'summary-' + Date.now(),
        role: 'assistant',
        content: `【历史对话摘要】\n${summaryContent}\n（已压缩${oldMessages.length}条历史消息，当前大纲和章节已保存在左侧面板）`,
        timestamp: oldMessages[oldMessages.length - 1]?.timestamp || Date.now(),
        agentType: activeAgent,
      };
      return [summaryMessage, ...recentMessages];
    }

    return recentMessages;
  }, [activeAgent]);

  // 处理斜杠命令 - 命令和结果显示在对话中，不发送给AI
  const handleSlashCommand = useCallback((cmd: string): boolean => {
    const commandName = cmd.slice(1).toLowerCase(); // 去掉 / 并转小写
    const command = SLASH_COMMANDS[commandName];

    if (!command) {
      // 显示命令提示
      const matchingCommands = Object.keys(SLASH_COMMANDS).filter(k =>
        k.startsWith(commandName)
      );
      if (matchingCommands.length > 0) {
        setSlashCommandHint(`可用命令: ${matchingCommands.map(k => `/${k}`).join(', ')}`);
      } else {
        setSlashCommandHint(`未知命令。输入 /help 查看所有命令`);
      }
      setTimeout(() => setSlashCommandHint(null), 3000);
      return true;
    }

    // 添加用户命令消息到对话（仅展示，不发送给AI）
    const userCmdMessage: Message = {
      id: `cmd-${Date.now()}`,
      role: 'user',
      content: cmd,
      timestamp: Date.now(),
    };

    let resultContent = '';

    // 执行命令
    switch (command.action()) {
      case 'CLEAR_SESSION':
        if (activeSession) {
          updateSession(activeSession.id, { messages: [userCmdMessage] });
          resultContent = '✅ 已清空当前会话历史';
        } else {
          resultContent = '⚠️ 当前没有活跃会话';
        }
        break;

      case 'SHOW_STATUS':
        const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
        const estimatedTokens = Math.round(totalChars / 2);
        resultContent =
          `📊 **状态信息**\n` +
          `- API 提供商: ${API_PRESETS[apiProvider]?.name ?? '自定义'}\n` +
          `- 模型: ${model || '未设置'}\n` +
          `- Temperature: ${temperature}\n` +
          `- Max Tokens: ${maxTokens}\n` +
          `- 当前会话消息数: ${messages.length}\n` +
          `- 估算 Token 数: ~${estimatedTokens}\n` +
          `- API Key: ${apiKey ? '✅ 已配置' : '❌ 未配置'}`;
        break;

      case 'SHOW_HELP':
        const helpText = Object.values(SLASH_COMMANDS)
          .map(c => `**${c.name}** - ${c.description}`)
          .join('\n');
        resultContent = `📖 **可用命令**\n${helpText}`;
        break;

      case 'EXPORT_SESSION':
        if (messages.length === 0) {
          resultContent = '⚠️ 当前会话没有内容可导出';
        } else {
          const exportText = messages
            .map(m => `[${m.role === 'user' ? '用户' : m.role === 'system' ? '系统' : 'AI'}]\n${m.content}`)
            .join('\n\n---\n\n');
          const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `session-${currentNovel?.title || 'export'}-${new Date().toISOString().slice(0, 10)}.txt`;
          a.click();
          URL.revokeObjectURL(url);
          resultContent = '✅ 会话已导出';
        }
        break;

      case 'COMPACT_MESSAGES':
        if (messages.length <= MAX_MESSAGES) {
          resultContent = `ℹ️ 当前消息数(${messages.length})未超过限制(${MAX_MESSAGES})，无需压缩`;
        } else if (activeSession) {
          const trimmed = getTrimmedMessages(messages);
          // 添加命令消息和结果到压缩后的消息列表
          const newMessages = [...trimmed, userCmdMessage];
          updateSession(activeSession.id, { messages: newMessages });
          resultContent = `✅ 已压缩 ${messages.length - trimmed.length} 条历史消息`;
        }
        break;
    }

    // 添加系统结果消息到对话（仅展示，不发送给AI）
    if (resultContent) {
      const resultMessage: Message = {
        id: `result-${Date.now()}`,
        role: 'system',
        content: resultContent,
        timestamp: Date.now(),
      };

      // 对于clear命令，已经处理过了，不需要再添加
      if (command.action() !== 'CLEAR_SESSION' && activeSession) {
        updateSession(activeSession.id, {
          messages: [...messages, userCmdMessage, resultMessage]
        });
      } else if (command.action() === 'CLEAR_SESSION' && activeSession) {
        // clear 命令已经把 userCmdMessage 加进去了，现在加结果
        updateSession(activeSession.id, {
          messages: [userCmdMessage, resultMessage]
        });
      }
    }

    return true;
  }, [activeSession, messages, apiProvider, model, temperature, maxTokens, apiKey, currentNovel, updateSession, getTrimmedMessages]);

  const handleSend = useCallback(async (content?: string) => {
    const sendContent = content || input.trim();
    if (!sendContent || !currentNovelId || isLoading) return;

    // 检查是否为斜杠命令
    if (sendContent.startsWith('/')) {
      setInput('');
      localStorage.removeItem(INPUT_DRAFT_KEY);
      handleSlashCommand(sendContent);
      return;
    }

    if (!modelConfigured) {
      setError('请先在“模型设置”中填写有效的地址、模型和认证信息');
      return;
    }

    setError(null);
    setInput('');
    localStorage.removeItem(INPUT_DRAFT_KEY);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: sendContent,
      timestamp: Date.now(),
    };

    let enhancedContent = sendContent;
    if (currentNovel) {
      enhancedContent = `【小说信息】\n书名: ${currentNovel.title}\n题材: ${currentNovel.genre || '未设置'}\n简介: ${currentNovel.summary || '未设置'}\n状态: ${currentNovel.status === 'draft' ? '草稿' : currentNovel.status === 'writing' ? '创作中' : '已完成'}`;
    }
    enhancedContent += getOutlineContext();       // 大纲
    enhancedContent += getCharactersContext();    // 人物设定
    enhancedContent += getWorldContext();         // 世界观设定
    enhancedContent += getChaptersContext();      // 章节列表
    enhancedContent += getPreviousChaptersContent(3); // 前3章完整内容
    if (currentChapter) {
      enhancedContent += `\n\n【当前编辑章节】\n${currentChapter.title}\n字数: ${currentChapter.wordCount}`;
    }

    // 🔴 核心新增：创作阶段判断（决定 AI 行为）
    enhancedContent += `\n\n【创作阶段】${getCreationStage()}`;

    // 大纲完整性要求提醒
    enhancedContent += `\n\n【大纲完整性要求】必须建立完整的卷和章节大纲结构，每个章节都要有情节概要（summary），才能开始写作章节内容。如果创作阶段显示"大纲缺失"或"大纲不完整"，你必须拒绝写章节请求并引导用户先完成大纲。`;

    enhancedContent += `\n\n【用户的问题】\n${sendContent}`;

    // 在用户消息末尾再次强调自定义要求
    if (currentNovel?.agentPrompt) {
      enhancedContent += `\n\n【再次提醒：必须遵守的用户自定义要求】\n${currentNovel.agentPrompt}\n请严格遵守以上要求！`;
    }

    let sessionId = activeSession?.id;
    if (!sessionId) {
      const newSession = addSession({
        novelId: currentNovelId,
        agentType: activeAgent,
        title: `${AGENT_CONFIGS[activeAgent].name} - ${new Date().toLocaleString()}`,
        messages: [],
      });
      sessionId = newSession.id;
    }

    // 更新消息列表
    const updatedMessages = [...messages, userMessage];
    updateSession(sessionId, { messages: updatedMessages });

    setIsLoading(true);
    setGenerationPhase('connecting');
    setGenerationStartedAt(Date.now());
    setStreamingContent('');
    streamingContentRef.current = '';

    const deepseek = new DeepSeekService();
    const generation = new AbortController();
    generationRef.current = generation;

    try {
      await new Promise(resolve => setTimeout(resolve, 50));

      // 使用压缩后的消息列表发送请求
      const trimmedMessages = getTrimmedMessages(messages);

      // 在 system prompt 中提示 AI 使用选项格式
      let enhancedSystemPrompt = AGENT_CONFIGS[activeAgent].systemPrompt;

      // 附加用户自定义的提示词（必须遵守）
      if (currentNovel?.agentPrompt) {
        enhancedSystemPrompt += `\n\n========================================\n【必须遵守的用户自定义要求】\n以下是用户为本书设定的专属要求，你必须严格遵守，不能忽略：\n========================================\n${currentNovel.agentPrompt}\n========================================\n以上要求必须100%遵守，特别是字数要求！\n========================================`;

      }

      console.log('📤 发送的 system prompt 长度:', enhancedSystemPrompt.length);
      console.log('📤 发送的消息数量:', trimmedMessages.length + 2);

      await deepseek.chatStream({
        signal: generation.signal,
        messages: [
          { role: 'system', content: enhancedSystemPrompt },
          ...trimmedMessages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
          { role: 'user', content: enhancedContent },
        ],
        agentType: activeAgent,
        onProgress: (phase) => {
          if (generationRef.current === generation) setGenerationPhase(phase);
        },
        onStream: (content) => {
          if (generationRef.current !== generation) return;
          const first = !streamingContentRef.current;
          streamingContentRef.current = content;
          if (first) setStreamingContent(content);
          else if (!streamTimerRef.current) streamTimerRef.current = setTimeout(() => {
            streamTimerRef.current = null;
            setStreamingContent(streamingContentRef.current);
          }, 80);
        },
        onError: (err) => {
          const partial = streamingContentRef.current;
          if (partial) {
            const latest = useNovelStore.getState().sessions.find(s => s.id === sessionId);
            if (latest) updateSession(sessionId, { messages: [...latest.messages, {
              id: crypto.randomUUID(), role: 'assistant', content: partial, timestamp: Date.now(), agentType: activeAgent,
              syncStatus: { state: 'partial', message: '回复未完成，已保留收到的文字，未自动同步。' },
            }] });
          }
          if (useNovelStore.getState().currentNovelId === currentNovelId) setError(err);
        },
        onComplete: async (finalContent) => {
          if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
          streamTimerRef.current = null;
          streamingContentRef.current = '';
          const aiMessage: Message = {
            id: crypto.randomUUID(), role: 'assistant', content: finalContent, timestamp: Date.now(), agentType: activeAgent,
            ...(hasSyncableContent(finalContent) ? { syncStatus: { state: 'pending' as const, message: '正在写入本地面板…' } } : {}),
          };
          const latest = useNovelStore.getState().sessions.find(s => s.id === sessionId);
          if (!latest) return;
          updateSession(sessionId, { messages: [...latest.messages, aiMessage] });
          setStreamingContent('');
          // Let the completed reply paint before synchronous parsing/storage work.
          await new Promise<void>(resolve => setTimeout(resolve, 16));
          if (aiMessage.syncStatus) {
            let status: NonNullable<Message['syncStatus']>;
            if (generation.signal.aborted) status = { state: 'warning', message: '自动同步已取消，可检查回复后重新同步。' };
            else {
              try { status = syncFeedback(autoSyncContent(finalContent, currentNovelId)); }
              catch { status = { state: 'error', message: '同步未完成，可能有部分内容已写入；请检查面板后重试。' }; }
            }
            const current = useNovelStore.getState().sessions.find(s => s.id === sessionId);
            if (current) updateSession(sessionId, { messages: current.messages.map(m => m.id === aiMessage.id ? { ...m, syncStatus: status } : m) });
          }
        },
      });
    } catch (err) {
      if (useNovelStore.getState().currentNovelId === currentNovelId) setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
      setIsLoading(false);
      setStreamingContent('');
      streamingContentRef.current = '';
      generationRef.current = null;
    }
  }, [input, currentNovelId, isLoading, modelConfigured, currentChapter, activeAgent, activeSession, messages, addSession, updateSession, getOutlineContext, getCharactersContext, getWorldContext, getTrimmedMessages, getChaptersContext, getPreviousChaptersContent, getCreationStage, currentNovel, handleSlashCommand]);

  if (!currentNovelId) {
    return (
      <div className="flex h-full flex-col border-l bg-muted/40">
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          请先选择或创建一本小说
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-l bg-muted/40">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-semibold">AI助手</span>
          <span className="text-xs text-muted-foreground">· {currentNovel?.title}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 rounded-lg ${currentNovel?.agentPrompt ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`}
          onClick={() => {
            setPromptText(currentNovel?.agentPrompt || '');
            setShowPromptDialog(true);
          }}
          disabled={!currentNovelId}
          title="自定义Agent提示词"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      {/* API Key Warning */}
      {!modelConfigured && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 dark:bg-amber-950 dark:border-amber-800">
          <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div><p className="font-medium">模型尚未配置完整</p><p>请在“模型设置”中填写地址、模型和认证信息</p></div>
          </div>
        </div>
      )}

      {/* 简化：不再显示子Agent团队 */}

      {/* Quick Actions */}
      <div className="px-3 py-2 border-b flex shrink-0 flex-wrap gap-2">
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSend('请帮我生成这本小说的大纲，请先问我一些关键问题')} disabled={!modelConfigured || isLoading}>
          <Sparkles className="h-3 w-3 mr-1" />生成大纲
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSend('请帮我优化当前大纲')} disabled={!modelConfigured || isLoading || plotCards.length === 0}>
          优化大纲
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSend('请帮我续写当前章节')} disabled={!modelConfigured || isLoading || !currentChapter}>
          续写章节
        </Button>
      </div>

      <div className="shrink-0 border-b px-4 py-2 text-xs text-muted-foreground">
        {isLoading ? '生成中，可随时停止' : modelConfigured ? '就绪' : '等待完成模型设置'}
        {' · 结构化内容自动同步 · 长回复自动折叠'}
      </div>

      {/* Chat Area */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin" ref={scrollRef}>
        {messages.length === 0 && !streamingContent ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center text-sm text-muted-foreground space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl">
              {AGENT_CONFIGS[activeAgent].avatar}
            </div>
            <div>
              <p className="font-medium text-foreground">{AGENT_CONFIGS[activeAgent].name}</p>
              <p className="max-w-[200px] mt-1">{AGENT_CONFIGS[activeAgent].description}</p>
            </div>
            <div className="text-xs text-muted-foreground">
              {plotCards.length > 0 && `大纲: ${plotCards.length} 个情节点`}
              {chapters.length > 0 && ` · 章节: ${chapters.length} 章`}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              message.role === 'system' ? (
                // 系统消息：居中显示，带信息图标
                <div key={message.id} className="flex justify-center">
                  <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm bg-muted/50 border border-border/50">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="prose prose-sm max-w-none dark:prose-invert text-muted-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5">
                        <MemoMarkdown>{message.content}</MemoMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {message.role === 'user' ? <User className="h-4 w-4" /> : <span className="text-sm">{AGENT_CONFIGS[activeAgent].avatar}</span>}
                  </div>
                  <div className="flex flex-col gap-2 max-w-[85%]">
                    <div className={`rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      {message.role === 'assistant' ? (
                        <AssistantReply content={message.content} syncStatus={message.syncStatus}>
                          <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5">
                            <MemoMarkdown>{formatAIResponse(message.content)}</MemoMarkdown>
                          </div>
                        </AssistantReply>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )}
                    </div>
                    {message.syncStatus && <p role="status" className={`text-xs ${message.syncStatus.state === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{message.syncStatus.message}</p>}
                    {!!message.syncStatus?.details?.length && (
                      <details className="text-xs text-muted-foreground max-w-full">
                        <summary className="cursor-pointer">查看修改结果（{message.syncStatus.details.length} 条）</summary>
                        <ol className="mt-2 space-y-1 break-words list-decimal pl-4">
                          {message.syncStatus.details.map((detail, index) => <li key={index}>{detail}</li>)}
                        </ol>
                      </details>
                    )}
                    {!message.syncStatus && syncableMessageIds.has(message.id) && <p className="text-xs text-muted-foreground">历史回复未记录同步结果，可重新同步。</p>}
                    {syncableMessageIds.has(message.id) && (
                      <Button variant="ghost" size="sm" className="self-start h-7 text-xs" disabled={isLoading} onClick={() => retrySync(message)}>重新同步到面板</Button>
                    )}
                  </div>
                </div>
              )
            ))}

            {/* Streaming */}
            {isLoading && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-sm">{AGENT_CONFIGS[activeAgent].avatar}</span>
                </div>
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted">
                  <AssistantReply content={streamingContent} streaming>
                    <div className="whitespace-pre-wrap break-words">{streamingContent}</div>
                  </AssistantReply>
                  <GenerationStatus phase={generationPhase} startedAt={generationStartedAt} />
                  <div className="flex gap-1 mt-2">
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div className="h-4" />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 dark:bg-red-950 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Slash Command Hint */}
      {slashCommandHint && (
        <div className="px-4 py-2 bg-sky-50 border-t border-sky-200 dark:bg-sky-950 dark:border-sky-800">
          <p className="text-xs text-sky-600 dark:text-sky-400">{slashCommandHint}</p>
        </div>
      )}

      {/* Prompt Dialog */}
      {showPromptDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-sm">自定义 Agent 提示词</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPromptDialog(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <p className="text-xs text-muted-foreground mb-3">
                为这本书设置专属的 Agent 提示词，每次对话都会附加发送。
              </p>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="例如：&#10;• 每章固定写2000字左右&#10;• 禁止出现现实中的地名&#10;• 使用轻松幽默的文风"
                rows={6}
                className="w-full px-3 py-2 text-sm bg-muted border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setShowPromptDialog(false)}>
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (currentNovelId) {
                      updateNovel(currentNovelId, { agentPrompt: promptText.trim() || undefined });
                      setShowPromptDialog(false);
                    }
                  }}
                >
                  <Check className="h-3 w-3 mr-1" />
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 p-4 border-t bg-muted/40">
        <div className="flex gap-2">
          <textarea
            ref={(el) => {
              if (el) {
                // 自动调整高度
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 120) + 'px';
              }
            }}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              saveInputDraft(e.target.value);
            }}
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
                  saveInputDraft(newValue);
                  // 延迟设置光标位置
                  requestAnimationFrame(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                  });
                } else {
                  // Enter: 发送消息
                  e.preventDefault();
                  handleSend();
                  // 发送后清空 draft
                  localStorage.removeItem(INPUT_DRAFT_KEY);
                }
              }
            }}
                        placeholder={modelConfigured ? '输入需求... (/help 查看命令)' : '请先完成模型设置'}
            disabled={!modelConfigured || isLoading}
            rows={1}
            className="flex-1 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none overflow-hidden min-h-[36px] max-h-[120px]"
          />
          {isLoading && <Button variant="outline" onClick={() => generationRef.current?.abort()} className="self-end">停止生成</Button>}
          <Button size="icon" onClick={() => { handleSend(); localStorage.removeItem(INPUT_DRAFT_KEY); }} disabled={!input.trim() || !modelConfigured || isLoading} className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Enter发送 · /help 命令 · {messages.length} 条对话
        </p>
      </div>
    </div>
  );
}
