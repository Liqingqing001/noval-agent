import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { Bot, Send, Sparkles, User, AlertCircle, Settings2, Check, Trash2, Info, HelpCircle, Download, Layers, ReceiptText, RotateCcw, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNovelStore } from '@/stores/novelStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { API_PRESETS, isModelConfigured } from '@/lib/modelConfig';
import type { GenerationPhase } from '@/services/modelService';
import { GenerationStatus } from './GenerationStatus';
import { AssistantReply } from './AssistantReply';
import { syncFeedback } from '@/lib/syncFeedback';
import { DeepSeekService } from '@/services/deepseek';
import { AgentType, AGENT_CONFIGS } from '@/types/agents';
import type { Message, ViewType } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { autoSyncContent, hasSyncableContent } from '@/lib/autoSync';
import { generationOperation, generationRetry, interruptedGenerations } from '@/lib/generationRetry';
import { openUsageSettings } from '@/lib/usageNavigation';
import { openReview } from '@/lib/reviewNavigation';
import { flushActiveEditor } from '@/lib/editorEvents';
import { buildChatContext } from '@/lib/chatContext';
import type { ChatContextSummary } from '@/lib/chatContext';
import { chatDraftKey, chatDraftNamespace, clearSentChatDraft, hasUnsavedChatDrafts, readChatDraft, readLegacyChatDraft, restoreLegacyChatDraft, writeChatDraft } from '@/lib/chatDraft';
import { sanitizeExportFilename } from '@/lib/novelExport';

// Markdown options are static at each call site; history text does not change on stream updates.
const MemoMarkdown = memo(ReactMarkdown, (previous, next) => previous.children === next.children);

interface AgentPanelProps {
  currentView: ViewType;
}

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
    description: '精简发送给 AI 的历史，保留完整会话',
    usage: '/compact',
    icon: Layers,
    action: () => 'COMPACT_MESSAGES',
  },
};

export function AgentPanel({ currentView: _currentView }: AgentPanelProps) {
  const currentNovelId = useNovelStore((state) => state.currentNovelId);
  const userId = useAuthStore(state => state.user?.id);
  const namespace = chatDraftNamespace(userId);
  const draftKey = chatDraftKey(namespace, currentNovelId);
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  const inputRevisionRef = useRef(0);
  const pendingDraftRef = useRef<{ key: string; value: string } | null>(null);
  const [draftError, setDraftError] = useState('');
  const [legacyDraft, setLegacyDraft] = useState('');
  const compositionRef = useRef(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [activeAgent] = useState<AgentType>(AgentType.MASTER);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('connecting');
  const [generationStartedAt, setGenerationStartedAt] = useState(0);
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextBlocked, setContextBlocked] = useState(false);
  const [budgetWarning, setBudgetWarning] = useState('');
  const [showPromptDialog, setShowPromptDialog] = useState(false);
  const [promptText, setPromptText] = useState('');
  const promptScopeRef = useRef<{ novelId: string; namespace: string } | null>(null);
  const [slashCommandHint, setSlashCommandHint] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const [unreadReply, setUnreadReply] = useState(false);
  const [lastContext, setLastContext] = useState<ChatContextSummary>();
  const streamingContentRef = useRef('');
  const generationRef = useRef<AbortController | null>(null);
  const activeReplyIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const inputSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => generationRef.current?.abort(), [draftKey]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; generationRef.current?.abort(); }; }, []);
  useEffect(() => { setError(null); setContextBlocked(false); setBudgetWarning(''); setLastContext(undefined); setShowPromptDialog(false); }, [draftKey]);
  const allSessions = useNovelStore((state) => state.sessions);
  const addSession = useNovelStore((state) => state.addSession);
  const updateSession = useNovelStore((state) => state.updateSession);
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
  const allForeshadowings = useNovelStore(state => state.foreshadowings);

  const flushInputDraft = useCallback(() => {
    if (inputSaveTimeoutRef.current) clearTimeout(inputSaveTimeoutRef.current);
    inputSaveTimeoutRef.current = null;
    const pending = pendingDraftRef.current;
    if (!pending) return;
    const error = writeChatDraft(pending.key, pending.value);
    if (!error) pendingDraftRef.current = null;
    if (mountedRef.current) setDraftError(error);
  }, []);

  // Capture the destination key when typing; a later book/account switch cannot
  // send this timer's text into the newly selected book.
  const saveInputDraft = useCallback((value: string) => {
    if (!draftKey) return;
    if (inputSaveTimeoutRef.current) clearTimeout(inputSaveTimeoutRef.current);
    pendingDraftRef.current = { key: draftKey, value };
    inputSaveTimeoutRef.current = setTimeout(flushInputDraft, 300);
  }, [draftKey, flushInputDraft]);

  useLayoutEffect(() => {
    flushInputDraft();
    const result = readChatDraft(draftKey);
    inputRef.current = result.value;
    inputRevisionRef.current++;
    setInput(result.value); setDraftError(result.error);
    setLegacyDraft(readLegacyChatDraft());
    setLastContext(undefined);
    followLatestRef.current = true; setUnreadReply(false);
    return flushInputDraft;
  }, [draftKey, flushInputDraft]);

  useEffect(() => {
    const saveBeforeLeave = (event: BeforeUnloadEvent) => {
      flushInputDraft();
      if (pendingDraftRef.current || hasUnsavedChatDrafts()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', saveBeforeLeave);
    return () => window.removeEventListener('beforeunload', saveBeforeLeave);
  }, [flushInputDraft]);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarsePointer(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const plotCards = useMemo(() => {
    if (!currentNovelId) return [];
    return allPlotCards.filter((c) => c.novelId === currentNovelId).sort((a, b) => a.sequence - b.sequence);
  }, [allPlotCards, currentNovelId]);

  const chapters = useMemo(() => {
    if (!currentNovelId) return [];
    return allChapters.filter((c) => c.novelId === currentNovelId).sort((a, b) => a.sequence - b.sequence);
  }, [allChapters, currentNovelId]);

  const currentChapter = useMemo(() => {
    if (!currentChapterId) return null;
    return chapters.find((c) => c.id === currentChapterId);
  }, [chapters, currentChapterId]);

  const activeSession = useMemo(() => {
    return allSessions.find((s) => s.novelId === currentNovelId && s.agentType === activeAgent);
  }, [allSessions, currentNovelId, activeAgent]);

  const messages = useMemo(() => activeSession?.messages || [], [activeSession?.messages]);
  const syncableMessageIds = useMemo(() => new Set(messages.filter(message => message.role === 'assistant' && message.syncStatus?.state !== 'partial' && hasSyncableContent(message.content)).map(message => message.id)), [messages]);
  const retryableMessageIds = useMemo(() => new Set(activeSession && currentNovelId ? messages.filter(message => generationRetry([activeSession], currentNovelId, activeSession.id, message.id)).map(message => message.id) : []), [activeSession, currentNovelId, messages]);

  useEffect(() => {
    if (!activeSession || generationRef.current) return;
    const recovered = interruptedGenerations(activeSession.messages);
    if (recovered !== activeSession.messages) updateSession(activeSession.id, { messages: recovered });
  }, [activeSession, isLoading, updateSession]);

  const scrollToLatest = useCallback(() => {
    followLatestRef.current = true;
    setUnreadReply(false);
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
  }, []);

  useLayoutEffect(() => {
    if (followLatestRef.current) scrollToLatest();
    else if (streamingContent || messages.length) setUnreadReply(true);
  }, [messages.length, streamingContent, isLoading, draftKey, scrollToLatest]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (followLatestRef.current) scrollToLatest(); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollToLatest, draftKey]);

  useEffect(() => () => { if (streamTimerRef.current) clearTimeout(streamTimerRef.current); }, []);

  const contextPreview = useMemo(() => {
    if (lastContext && (isLoading || !input.trim())) return { summary: lastContext, blockedReason: contextBlocked ? error || undefined : undefined };
    if (!currentNovel) return;
    return buildChatContext({ novel: currentNovel, chapters: allChapters, characters: allCharacters,
      worldSettings: allWorldSettings, plotCards: allPlotCards, foreshadowings: allForeshadowings, currentChapterId,
      request: input.trim() || '请根据当前作品继续协助创作。', history: messages,
      systemPrompt: AGENT_CONFIGS[activeAgent].systemPrompt,
      historyLimit: activeSession?.contextHistoryLimit,
    });
  }, [isLoading, lastContext, contextBlocked, error, currentNovel, allChapters, allCharacters, allWorldSettings, allPlotCards, allForeshadowings, currentChapterId, input, messages, activeAgent, activeSession?.contextHistoryLimit]);

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

  // Local commands are displayed and exported, but never become model instructions.
  const handleSlashCommand = useCallback((cmd: string): boolean => {
    if (!currentNovelId || generationRef.current) return false;
    const commandName = cmd.slice(1).trim().toLowerCase();
    const command = SLASH_COMMANDS[commandName];
    if (!command) {
      const matching = Object.keys(SLASH_COMMANDS).filter(name => name.startsWith(commandName));
      setSlashCommandHint(matching.length ? '可用命令: ' + matching.map(name => '/' + name).join(', ') : '未知命令。输入 /help 查看所有命令');
      return false;
    }
    const latest = useNovelStore.getState();
    let session = latest.sessions.find(value => value.novelId === currentNovelId && value.agentType === activeAgent);
    const previous = session?.messages || [];
    const action = command.action();
    if (action === 'CLEAR_SESSION' && previous.length && !window.confirm('清空当前作品的 AI 会话？章节、人物和世界观不会删除。可先用 /export 导出会话。')) return false;
    if (!session) session = addSession({ novelId: currentNovelId, agentType: activeAgent,
      title: AGENT_CONFIGS[activeAgent].name + ' - ' + new Date().toLocaleString(), messages: [] });
    const commandMessage: Message = { id: 'cmd-' + crypto.randomUUID(), role: 'user', content: cmd, timestamp: Date.now() };
    let result = '';
    switch (action) {
      case 'CLEAR_SESSION':
        result = '已清空当前会话。章节、人物和世界观仍保留。';
        break;
      case 'SHOW_STATUS':
        result = '模型：' + (API_PRESETS[apiProvider]?.name ?? '自定义') + ' / ' + (model || '未设置') + '\n'
          + 'Temperature：' + temperature + ' · 最大输出：' + maxTokens + ' tokens\n'
          + '会话记录：' + previous.length + ' 条 · ' + (contextPreview?.summary.scopeLabel || '尚未选择上下文') + '\n'
          + '本次预计输入：' + (contextPreview?.summary.estimatedInputTokens.toLocaleString() || '0') + ' tokens（文本估算）\n'
          + '模型配置：' + (modelConfigured ? '已配置' : '未配置完整');
        break;
      case 'SHOW_HELP':
        result = Object.values(SLASH_COMMANDS).map(value => '**' + value.name + '** — ' + value.description).join('\n');
        break;
      case 'EXPORT_SESSION': {
        if (!previous.length) { result = '当前会话没有内容可导出。'; break; }
        const exported = previous.map(value => '[' + (value.role === 'user' ? '用户' : value.role === 'system' ? '系统' : 'AI') + ']\n' + value.content).join('\n\n---\n\n');
        const url = URL.createObjectURL(new Blob(['\uFEFF', exported.replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url;
        link.download = sanitizeExportFilename(currentNovel?.title || '会话') + '-AI会话-' + new Date().toISOString().slice(0, 10) + '.txt';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        result = '完整会话已导出。';
        break;
      }
      case 'COMPACT_MESSAGES':
        result = '已启用精简上下文：后续请求最多携带最近 8 条有效历史，仍受输入预算约束。完整会话保留在本页并可导出；章节和设定仍从作品读取。';
        break;
    }
    const resultMessage: Message = { id: 'result-' + crypto.randomUUID(), role: 'system', content: result, timestamp: Date.now() };
    updateSession(session.id, { messages: action === 'CLEAR_SESSION' ? [commandMessage, resultMessage] : [...previous, commandMessage, resultMessage],
      ...(action === 'COMPACT_MESSAGES' ? { contextHistoryLimit: 8 } : action === 'CLEAR_SESSION' ? { contextHistoryLimit: undefined } : {}) });
    setSlashCommandHint(null);
    return true;
  }, [currentNovelId, activeAgent, addSession, apiProvider, model, temperature, maxTokens, modelConfigured, contextPreview, currentNovel, updateSession]);

  const handleSend = useCallback(async (content?: string, reviewCount?: number, retry?: { sessionId: string; failedMessageId: string }) => {
    if (!currentNovelId || isLoading || generationRef.current || useNovelStore.getState().currentNovelId !== currentNovelId) return;
    const capturedNamespace = namespace;
    const sameAccount = () => chatDraftNamespace(useAuthStore.getState().user?.id) === capturedNamespace;
    if (!sameAccount()) return;
    const sentDraft = inputRef.current, sentRevision = inputRevisionRef.current;
    const retryRequest = retry ? generationRetry(useNovelStore.getState().sessions, currentNovelId, retry.sessionId, retry.failedMessageId) : null;
    if (retry && !retryRequest) { setError('原请求已不存在，或已切换作品，请在当前作品重新输入需求。'); return; }
    const sendContent = retryRequest?.content || content || sentDraft.trim();
    const requestedReviewCount = retryRequest?.reviewCount ?? reviewCount;
    if (!sendContent) return;

    flushInputDraft();
    // Changes made while budget/storage preflight waits belong to the next draft,
    // even if the author deleted and retyped the exact same words.
    const clearInputDraft = () => {
      if (content || retry || !draftKey || !sameAccount() || useNovelStore.getState().currentNovelId !== currentNovelId || inputRevisionRef.current !== sentRevision || inputRef.current !== sentDraft) return;
      const failed = clearSentChatDraft(draftKey);
      setDraftError(failed);
      if (failed) return;
      if (inputSaveTimeoutRef.current) clearTimeout(inputSaveTimeoutRef.current);
      inputSaveTimeoutRef.current = null;
      if (pendingDraftRef.current?.key === draftKey) pendingDraftRef.current = null;
      inputRef.current = ''; inputRevisionRef.current++; setInput('');
    };

    if (sendContent.startsWith('/')) {
      try { if (handleSlashCommand(sendContent)) clearInputDraft(); }
      catch { setError('会话暂未保存，本地命令未完成。草稿仍在输入框，请检查浏览器存储后重试。'); }
      return;
    }
    if (!isModelConfigured(useSettingsStore.getState())) {
      setError('请先在“模型设置”中填写有效的地址、模型和认证信息');
      return;
    }

    flushActiveEditor();
    const latest = useNovelStore.getState();
    const novel = latest.novels.find(value => value.id === currentNovelId);
    if (!novel || latest.currentNovelId !== currentNovelId || !sameAccount()) return;
    const previousSession = retry ? latest.sessions.find(value => value.id === retry.sessionId && value.novelId === currentNovelId)
      : latest.sessions.find(value => value.novelId === currentNovelId && value.agentType === activeAgent);
    const history = previousSession?.messages || [];
    const context = buildChatContext({ novel, chapters: latest.chapters, characters: latest.characters,
      worldSettings: latest.worldSettings, plotCards: latest.plotCards, foreshadowings: latest.foreshadowings,
      currentChapterId: latest.currentChapterId, request: sendContent, history,
      systemPrompt: AGENT_CONFIGS[activeAgent].systemPrompt, reviewCount: requestedReviewCount,
      historyLimit: previousSession?.contextHistoryLimit });
    setLastContext(context.summary);
    setContextBlocked(!!context.blockedReason);
    if (context.blockedReason) { setError(context.blockedReason); return; }
    setError(null); setBudgetWarning('');
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: sendContent, timestamp: Date.now() };
    let sessionId = previousSession?.id || '';
    const replyId = crypto.randomUUID();
    let generationMetadata: NonNullable<Message['generation']> = {
      status: 'running', requestMessageId: userMessage.id,
      ...(retryRequest?.retryOf ? { retryOf: retryRequest.retryOf } : {}),
      ...(requestedReviewCount === undefined ? {} : { reviewCount: requestedReviewCount }),
    };
    // Do not mark an active generation until the request/reply slot is saved.
    // Zustand may update memory before its persistence middleware throws.
    try {
      if (!sessionId) sessionId = addSession({ novelId: currentNovelId, agentType: activeAgent,
        title: AGENT_CONFIGS[activeAgent].name + ' - ' + new Date().toLocaleString(), messages: [] }).id;
      updateSession(sessionId, { messages: [...history, userMessage, {
        id: replyId, role: 'assistant', content: '', timestamp: Date.now(), agentType: activeAgent,
        generation: generationMetadata,
        syncStatus: { state: 'partial', message: '调用尚未完成，收到的文字会暂存；未完成内容不会自动同步。' },
      }] });
    } catch {
      const partialSession = useNovelStore.getState().sessions.find(value => value.id === sessionId && value.novelId === currentNovelId);
      if (partialSession?.messages.some(value => value.id === replyId)) {
        try { updateSession(sessionId, { messages: partialSession.messages.map(value => value.id === replyId ? {
          ...value, content: '会话保存失败，本次没有发送模型请求。',
          generation: { ...generationMetadata, status: 'failed' },
          syncStatus: { state: 'partial', message: '未发送模型请求。释放浏览器空间后可手动重试。' },
        } : value) }); } catch { /* The unsent status remains in memory when persistence is still unavailable. */ }
      }
      setError('会话暂未保存，本次没有发送模型请求。草稿仍在输入框，请复制备份并检查浏览器存储后重试。');
      return;
    }

    const generation = new AbortController();
    generationRef.current = generation;
    activeReplyIdRef.current = replyId;

    setIsLoading(true);
    setGenerationPhase('connecting');
    setGenerationStartedAt(Date.now());
    setStreamingContent('');
    streamingContentRef.current = '';

    const deepseek = new DeepSeekService();
    let received = '', settled = false, lastSnapshot = 0, inputCleared = false;
    const visible = () => mountedRef.current && sameAccount() && generationRef.current === generation && useNovelStore.getState().currentNovelId === currentNovelId;
    const updateReply = (patch: Partial<Message>) => {
      if (!sameAccount()) return;
      const latest = useNovelStore.getState().sessions.find(session => session.id === sessionId && session.novelId === currentNovelId);
      if (latest?.messages.some(message => message.id === replyId)) updateSession(sessionId, { messages: latest.messages.map(message => message.id === replyId ? { ...message, ...patch, generation: generationMetadata } : message) });
    };
    const finishPartial = () => {
      if (settled) return;
      settled = true;
      const cancelled = generation.signal.aborted;
      generationMetadata = { ...generationMetadata, status: cancelled ? 'cancelled' : 'failed' };
      updateReply({ content: received || (cancelled ? '本次调用已停止，尚未收到正文。' : '本次请求未完成，尚未收到可保留的正文。'),
        syncStatus: { state: 'partial', message: cancelled ? '已停止生成，已收到的文字仍保留，未自动同步。' : '回复未完成，已保留收到的文字，未自动同步。' } });
    };

    try {
      await new Promise(resolve => setTimeout(resolve, 50));
      generation.signal.throwIfAborted();

      if (!sameAccount() || useNovelStore.getState().currentNovelId !== currentNovelId) { generation.abort(); generation.signal.throwIfAborted(); }
      await deepseek.chatStream({
        signal: generation.signal,
        usageContext: { operation: generationOperation(sendContent), novelId: currentNovelId, sessionId, retryOf: retryRequest?.retryOf },
        onCallId: callId => { generationMetadata = { ...generationMetadata, callId }; updateReply({}); },
        onBudgetWarning: warning => { if (visible()) setBudgetWarning(warning); },
        messages: context.messages,
        agentType: activeAgent,
        onProgress: (phase) => {
          if (visible()) {
            if (!inputCleared) { clearInputDraft(); inputCleared = true; }
            setGenerationPhase(phase);
          }
        },
        onStream: (content) => {
          received = content;
          // A throttled snapshot also survives a refresh; completion/error always saves the tail.
          if (!lastSnapshot || Date.now() - lastSnapshot >= 1000) { lastSnapshot = Date.now(); updateReply({ content }); }
          if (!visible()) return;
          const first = !streamingContentRef.current;
          streamingContentRef.current = content;
          if (first) setStreamingContent(content);
          else if (!streamTimerRef.current) streamTimerRef.current = setTimeout(() => {
            streamTimerRef.current = null;
            setStreamingContent(streamingContentRef.current);
          }, 80);
        },
        onError: (err) => {
          finishPartial();
          if (visible() && !generation.signal.aborted) setError(err);
        },
        onComplete: async (finalContent) => {
          received = finalContent;
          if (generation.signal.aborted || !sameAccount()) { finishPartial(); return; }
          settled = true;
          generationMetadata = { ...generationMetadata, status: 'succeeded' };
          if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
          streamTimerRef.current = null;
          streamingContentRef.current = '';
          const aiMessage: Message = {
            id: replyId, role: 'assistant', content: finalContent, timestamp: Date.now(), agentType: activeAgent,
            generation: generationMetadata, syncStatus: undefined,
            ...(hasSyncableContent(finalContent) ? { syncStatus: { state: 'pending' as const, message: '正在写入本地面板…' } } : {}),
          };
          const latest = useNovelStore.getState().sessions.find(s => s.id === sessionId && s.novelId === currentNovelId);
          if (!latest) return;
          updateReply(aiMessage);
          if (visible()) setStreamingContent('');
          // Let the completed reply paint before synchronous parsing/storage work.
          await new Promise<void>(resolve => setTimeout(resolve, 16));
          if (aiMessage.syncStatus) {
            let status: NonNullable<Message['syncStatus']>;
            if (generation.signal.aborted || !sameAccount() || useNovelStore.getState().currentNovelId !== currentNovelId) status = { state: 'warning', message: '自动同步已取消，可检查回复后重新同步。' };
            else {
              try { status = syncFeedback(autoSyncContent(finalContent, currentNovelId)); }
              catch { status = { state: 'error', message: '同步未完成，可能有部分内容已写入；请检查面板后重试。' }; }
            }
            const current = useNovelStore.getState().sessions.find(s => s.id === sessionId && s.novelId === currentNovelId);
            if (current && sameAccount()) updateSession(sessionId, { messages: current.messages.map(m => m.id === aiMessage.id ? { ...m, syncStatus: status } : m) });
          }
        },
      });
    } catch (err) {
      finishPartial();
      if (visible() && !generation.signal.aborted) setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      if (!settled) finishPartial();
      if (generationRef.current === generation) {
        if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
        streamTimerRef.current = null;
        generationRef.current = null;
        activeReplyIdRef.current = null;
        streamingContentRef.current = '';
        if (mountedRef.current) { setIsLoading(false); setStreamingContent(''); }
      }
    }
  }, [currentNovelId, isLoading, namespace, draftKey, flushInputDraft, handleSlashCommand, activeAgent, addSession, updateSession]);

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
    <div className="chat-panel flex h-full min-h-0 flex-col overflow-hidden border-l bg-muted/40">
      {/* Header */}
      <div className="chat-header flex shrink-0 items-center justify-between p-4 border-b">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-5 w-5 shrink-0 text-primary" />
          <span className="shrink-0 font-semibold">AI助手</span>
          <span className="truncate text-xs text-muted-foreground">· {currentNovel?.title}</span>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground" onClick={openUsageSettings} aria-label="调用与预算" title="调用记录与预算">
          <ReceiptText className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 rounded-lg ${currentNovel?.agentPrompt ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-muted'}`}
          onClick={() => {
            if (currentNovelId) promptScopeRef.current = { novelId: currentNovelId, namespace };
            setPromptText(currentNovel?.agentPrompt || '');
            setShowPromptDialog(true);
          }}
          disabled={!currentNovelId}
          aria-label="自定义 Agent 提示词"
          title="自定义Agent提示词"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
        </div>
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
      <div className="chat-quick-actions px-3 py-2 border-b flex shrink-0 flex-wrap gap-2">
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSend('请帮我生成这本小说的大纲，请先问我一些关键问题')} disabled={!modelConfigured || isLoading}>生成大纲</Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSend('请帮我优化当前大纲')} disabled={!modelConfigured || isLoading || plotCards.length === 0}>优化大纲</Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSend('请帮我续写当前章节')} disabled={!modelConfigured || isLoading || !currentChapter}>续写章节</Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSend('请按照大纲顺序，续写一章。按照大纲中下一章待写作的情节概要来写，字数3000-4000字。')} disabled={!modelConfigured || isLoading}>
          <Sparkles className="h-3 w-3 mr-1" />续写一章
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSend('请按照大纲顺序，续写三章。按照大纲中待写作的章节情节概要，连续写三章内容，每章3000-4000字。')} disabled={!modelConfigured || isLoading}>
          <Sparkles className="h-3 w-3 mr-1" />续写三章
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => {
          // 智能检查策略：避免发送过多章节浪费token
          if (chapters.length <= 5) {
            handleSend(`请检查目前所有已写章节（共${chapters.length}章）的通顺性，是否有逻辑错误、前后矛盾、人物行为不一致等问题。逐一指出问题并给出修改建议。`, chapters.length);
          } else {
            // 只检查最近5章，节省token
            const recentCount = Math.min(5, chapters.length);
            handleSend(`请检查最近${recentCount}章（第${chapters.length - recentCount + 1}章至第${chapters.length}章）的通顺性，是否有逻辑错误、前后矛盾、人物行为不一致等问题。逐一指出问题并给出修改建议。如需检查更多章节，请告诉我具体章节编号。`, recentCount);
          }
        }} disabled={!modelConfigured || isLoading || chapters.length === 0}>
          <AlertCircle className="h-3 w-3 mr-1" />检查章节
        </Button>
      </div>

      <div className="chat-status shrink-0 border-b px-4 py-2 text-xs text-muted-foreground">
        {isLoading ? '生成中，可随时停止' : modelConfigured ? '就绪' : '等待完成模型设置'}
        {' · 结构化内容自动同步 · 长回复自动折叠'}
      </div>

      {contextPreview && <details data-chat-context className="shrink-0 border-b px-4 py-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">本次上下文 · {contextPreview.summary.chapterCount} 章 · 约 {contextPreview.summary.estimatedInputTokens.toLocaleString()} 输入 tokens</summary>
        <div className="mt-2 max-h-24 space-y-1 overflow-y-auto break-words leading-relaxed text-muted-foreground sm:max-h-40">
          <p>{contextPreview.summary.scopeLabel}</p>
          {!!contextPreview.summary.chapterTitles.length && <p>正文：{contextPreview.summary.chapterTitles.join('、')}</p>}
          <p>有效历史 {contextPreview.summary.historyIncluded} 条{contextPreview.summary.historyOmitted ? ` · 未带入 ${contextPreview.summary.historyOmitted} 条` : ''}；完整记录仍保留。</p>
          {activeSession?.contextHistoryLimit === 8 && <p>已启用精简历史（/compact）。<button type="button" disabled={isLoading} className="ml-2 text-primary underline disabled:opacity-50" onClick={() => updateSession(activeSession.id, { contextHistoryLimit: undefined })}>恢复常规上下文</button></p>}
          {[...contextPreview.summary.warnings, ...contextPreview.summary.omitted].map((value, index) => <p key={index}>{value}</p>)}
          {contextPreview.blockedReason && <p className="text-amber-800 dark:text-amber-200">{contextPreview.blockedReason}</p>}
          <p>未输入新需求时显示最近一次请求范围。用量为文本估算，实际以调用记录为准；发送前会读取刚保存的正文。</p>
        </div>
      </details>}

      {/* Chat Area */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin" ref={scrollRef} data-chat-scroll="true" aria-label="对话消息" onScroll={event => {
        const element = event.currentTarget;
        followLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
        if (followLatestRef.current) setUnreadReply(false);
      }}>
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
            {messages.filter(message => !isLoading || message.id !== activeReplyIdRef.current).map((message) => (
              message.role === 'system' ? (
                // 系统消息：居中显示，带信息图标
                <div key={message.id} className="flex justify-center">
                  <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm bg-muted/50 border border-border/50">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="prose prose-sm max-w-none dark:prose-invert text-muted-foreground break-words [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted/50 [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:p-2 [&_tr]:border-b [&_tr:last-child]:border-b-0">
                        <MemoMarkdown remarkPlugins={[remarkGfm]}>{message.content}</MemoMarkdown>
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
                          <div className="prose prose-sm max-w-none dark:prose-invert break-words [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:bg-muted/50 [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:p-2 [&_tr]:border-b [&_tr:last-child]:border-b-0">
                            <MemoMarkdown remarkPlugins={[remarkGfm]}>{formatAIResponse(message.content)}</MemoMarkdown>
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
                    {retryableMessageIds.has(message.id) && activeSession && <div className="space-y-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isLoading || !modelConfigured} onClick={() => void handleSend(undefined, undefined, { sessionId: activeSession.id, failedMessageId: message.id })}>
                        <RotateCcw className="mr-1 h-3 w-3" />重试本次请求
                      </Button>
                      <p className="text-xs leading-relaxed text-muted-foreground">使用原需求和当前模型、作品上下文重新调用，可能再次计费；上次的部分文字保留。</p>
                    </div>}
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

      {unreadReply && <div className="shrink-0 border-t px-4 py-1 text-center"><Button size="sm" variant="outline" className="h-8 text-xs" onClick={scrollToLatest}><ArrowDown className="mr-1 h-3 w-3" />回到最新</Button></div>}

      {budgetWarning && <div role="status" className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{budgetWarning}<button type="button" className="ml-2 underline underline-offset-2" onClick={openUsageSettings}>查看调用与预算</button></div>}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 dark:bg-red-950 dark:border-red-800">
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>
          {contextBlocked && <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => openReview('consistency')}>打开全书一致性检查</button>}
        </div>
      )}

      {/* Slash Command Hint */}
      {slashCommandHint && (
        <div className="px-4 py-2 bg-sky-50 border-t border-sky-200 dark:bg-sky-950 dark:border-sky-800">
          <p className="text-xs text-sky-600 dark:text-sky-400">{slashCommandHint}</p>
        </div>
      )}

      <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
        <DialogContent className="max-h-[85dvh] max-w-[calc(100vw-24px)] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>自定义 Agent 提示词</DialogTitle><DialogDescription>为本书设置风格、人物与篇幅要求，每次对话携带一次；本次明确提出的要求优先。</DialogDescription></DialogHeader>
          <textarea aria-label="本书 Agent 提示词" value={promptText} onChange={event => setPromptText(event.target.value)}
            placeholder="例如：每章约2000字，保持轻松幽默的文风" rows={7}
            className="w-full min-w-0 resize-y rounded-lg border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          <DialogFooter><Button variant="outline" onClick={() => setShowPromptDialog(false)}>取消</Button><Button onClick={() => {
            const scope = promptScopeRef.current;
            if (!scope || useNovelStore.getState().currentNovelId !== scope.novelId || chatDraftNamespace(useAuthStore.getState().user?.id) !== scope.namespace) {
              setShowPromptDialog(false); setError('作品或账号已切换，请重新打开本书提示词。'); return;
            }
            updateNovel(scope.novelId, { agentPrompt: promptText.trim() || undefined }); setShowPromptDialog(false);
          }}><Check className="mr-1 h-3 w-3" />保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Input */}
      <div className="chat-composer shrink-0 border-t bg-muted/40 p-3 sm:p-4">
        {draftError && <p role="alert" className="mb-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200">{draftError}<button type="button" className="ml-2 underline" onClick={() => {
          const error = writeChatDraft(draftKey, inputRef.current); setDraftError(error);
          if (!error && pendingDraftRef.current?.key === draftKey) pendingDraftRef.current = null;
        }}>重试保存草稿</button></p>}
        {!!legacyDraft && !input && !draftError && <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>发现一份旧版未归属草稿。</span><button type="button" className="text-primary underline" onClick={() => {
          if (!draftKey || inputRef.current) return;
          const restored = restoreLegacyChatDraft(draftKey);
          inputRef.current = restored.value; inputRevisionRef.current++; setInput(restored.value); setDraftError(restored.error);
          setLegacyDraft(readLegacyChatDraft());
        }}>恢复旧版草稿</button></div>}
        <div className="flex gap-2">
          <textarea
            aria-label="AI 创作需求"
            ref={element => {
              if (element) { element.style.height = 'auto'; element.style.height = Math.min(element.scrollHeight, 120) + 'px'; }
            }}
            value={input}
            onChange={event => {
              const value = event.target.value;
              inputRef.current = value; inputRevisionRef.current++;
              setInput(value); saveInputDraft(value);
            }}
            onCompositionStart={() => { compositionRef.current = true; }}
            onCompositionEnd={() => { compositionRef.current = false; }}
            onKeyDown={event => {
              if (event.key !== 'Enter' || compositionRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.shiftKey || isLoading || coarsePointer && !event.ctrlKey && !event.metaKey) return;
              event.preventDefault(); void handleSend();
            }}
            placeholder={isLoading ? '可继续写下一条需求，完成后再发送' : modelConfigured ? '输入需求... (/help 查看命令)' : '可先写下需求，配置模型后发送；/help 查看命令'}
            rows={1}
            className="min-h-[36px] max-h-[120px] min-w-0 flex-1 resize-none overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {isLoading && <Button variant="outline" onClick={() => generationRef.current?.abort()} className="self-end">停止生成</Button>}
          <Button size="icon" aria-label="发送需求" onClick={() => void handleSend()} disabled={!input.trim() || isLoading || !modelConfigured && !input.trimStart().startsWith('/')} className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{coarsePointer ? '回车换行 · 点击发送' : 'Enter 发送 · Shift+Enter 换行'} · /help 命令 · {messages.length} 条对话{isLoading ? ' · 正在生成，可先写下一条' : ''}</p>
      </div>
    </div>
  );
}
