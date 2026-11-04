import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, useId } from 'react';
import { Bot, Send, Sparkles, User, AlertCircle, Settings2, Check, Info, ReceiptText, RotateCcw, ArrowDown, Slash, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNovelStore } from '@/stores/novelStore';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { API_PRESETS, isModelConfigured } from '@/lib/modelConfig';
import type { GenerationPhase } from '@/services/modelService';
import { GenerationStatus } from './GenerationStatus';
import { AssistantReply } from './AssistantReply';
import { SlashCommandMenu } from './SlashCommandMenu';
import { slashHeadQuery, completeSlashCommand, isSlashCommandDisabled, moveSlashCommandSelection, slashOptionId } from '@/lib/slashComposer';
import { syncFeedback } from '@/lib/syncFeedback';
import { DeepSeekService } from '@/services/deepseek';
import { AgentType, AGENT_CONFIGS } from '@/types/agents';
import type { Message, ViewType } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { autoSyncContent, hasSyncableContent } from '@/lib/autoSync';
import { generationOperation, generationRetry, interruptedGenerations } from '@/lib/generationRetry';
import { openUsageSettings } from '@/lib/usageNavigation';
import { openCharacterTimeline, openReview } from '@/lib/reviewNavigation';
import { flushActiveEditor } from '@/lib/editorEvents';
import { buildChatContext } from '@/lib/chatContext';
import type { ChatContextSummary } from '@/lib/chatContext';
import { chatDraftKey, chatDraftNamespace, clearSentChatDraft, hasUnsavedChatDrafts, readChatDraft, readLegacyChatDraft, restoreLegacyChatDraft, writeChatDraft } from '@/lib/chatDraft';
import { sanitizeExportFilename } from '@/lib/novelExport';
import { findSlashCommand, getSlashCommandSuggestions, parseSlashCommand, resolveTimelineCharacter, SLASH_COMMANDS } from '@/lib/slashCommands';
import type { SlashCommandDefinition } from '@/lib/slashCommands';
import { applyScopedSlashResponse } from '@/lib/slashSync';
import type { SlashSyncScope } from '@/lib/slashSync';

// Markdown options are static at each call site; history text does not change on stream updates.
const MemoMarkdown = memo(ReactMarkdown, (previous, next) => previous.children === next.children);
const needsChapterScope = (command: Extract<ReturnType<typeof parseSlashCommand>, { kind: 'ai' }>): boolean =>
  ['polish', 'rewrite'].includes(command.command.id) || command.command.id === 'continue' && command.requiresChapter;
const isScopedEditMessage = (message: Message): boolean => {
  if (message.generation?.syncPolicy === 'current-chapter') return true;
  const command = message.sourceCommand ? parseSlashCommand(message.sourceCommand) : undefined;
  return command?.kind === 'ai' && needsChapterScope(command);
};

interface AgentPanelProps {
  currentView: ViewType;
  onShowDemo?: () => void;
}

export function AgentPanel({ currentView: _currentView, onShowDemo }: AgentPanelProps) {
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
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const menuId = useId();
  const [inputCaret, setInputCaret] = useState(0);
  const [manualMenu, setManualMenu] = useState(false);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
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
    setInputCaret(result.value.length); setManualMenu(false); setMenuDismissed(false);
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
  const parsedInput = useMemo(() => parseSlashCommand(input), [input]);
  const canSubmitInput = !!input.trim() && (!isLoading || parsedInput.kind === 'local' && parsedInput.command.busyAllowed)
    && (modelConfigured || parsedInput.kind === 'local' || parsedInput.kind === 'error');
  const menuQuery = slashHeadQuery(input, inputCaret);
  const preserveMenuDraft = !!input.trim() && !input.trimStart().startsWith('/');
  const commandMenuOpen = !menuDismissed && !showPromptDialog && (manualMenu || menuQuery !== null);
  const suggestedCommands = useMemo(() => getSlashCommandSuggestions(menuQuery || '/'), [menuQuery]);
  const activeCommand = suggestedCommands[Math.min(activeCommandIndex, suggestedCommands.length - 1)];
  const chooseCommand = useCallback((command: SlashCommandDefinition) => {
    if (compositionRef.current || isSlashCommandDisabled(command, !!generationRef.current, preserveMenuDraft)) return;
    const completed = completeSlashCommand(inputRef.current, command.name);
    if (!completed) return;
    inputRef.current = completed.value; inputRevisionRef.current++;
    const completedRevision = inputRevisionRef.current;
    const completedElement = composerRef.current;
    setInput(completed.value); setInputCaret(completed.caret); saveInputDraft(completed.value);
    setManualMenu(false); setMenuDismissed(true); setActiveCommandIndex(0);
    requestAnimationFrame(() => {
      if (!mountedRef.current || compositionRef.current || inputRevisionRef.current !== completedRevision || inputRef.current !== completed.value || composerRef.current !== completedElement) return;
      completedElement?.focus(); completedElement?.setSelectionRange(completed.caret, completed.caret);
    });
  }, [preserveMenuDraft, saveInputDraft]);
  const syncableMessageIds = useMemo(() => new Set(messages.filter(message => message.role === 'assistant' && !isScopedEditMessage(message) && message.generation?.syncPolicy !== 'review-only' && message.syncStatus?.state !== 'partial' && hasSyncableContent(message.content)).map(message => message.id)), [messages]);
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
    if (parsedInput.kind === 'local' || parsedInput.kind === 'error') return;
    if (lastContext && (isLoading || !input.trim())) return { summary: lastContext, blockedReason: contextBlocked ? error || undefined : undefined };
    if (!currentNovel) return;
    return buildChatContext({ novel: currentNovel, chapters: allChapters, characters: allCharacters,
      worldSettings: allWorldSettings, plotCards: allPlotCards, foreshadowings: allForeshadowings, currentChapterId,
      request: parsedInput.kind === 'ai' ? parsedInput.request : input.trim() || '请根据当前作品继续协助创作。', history: messages,
      systemPrompt: AGENT_CONFIGS[activeAgent].systemPrompt,
      ...(parsedInput.kind === 'ai' ? { reviewCount: parsedInput.reviewCount } : {}),
      ...(parsedInput.kind === 'ai' && parsedInput.syncPolicy === 'review' ? { reviewOnly: true } : {}),
      historyLimit: activeSession?.contextHistoryLimit,
    });
  }, [parsedInput, isLoading, lastContext, contextBlocked, error, currentNovel, allChapters, allCharacters, allWorldSettings, allPlotCards, allForeshadowings, currentChapterId, input, messages, activeAgent, activeSession?.contextHistoryLimit]);

  // Formatting must never claim that a store write succeeded.
  const formatAIResponse = useCallback((content: string): string => content
    .replace(/【(基本信息|角色|人物|世界观|卷|大纲|章节大纲|章节)】/g, '\n**$1**\n')
    .replace(/【\/(基本信息|角色|人物|世界观|卷|大纲|章节大纲|章节)】/g, '\n'), []);

  const retrySync = useCallback((message: Message) => {
    if (!currentNovelId || !activeSession || isLoading || isScopedEditMessage(message) || message.generation?.syncPolicy === 'review-only') return;
    let status: NonNullable<Message['syncStatus']>;
    try { status = syncFeedback(autoSyncContent(message.content, currentNovelId, { contentOnly: true, retryModifications: true })); }
    catch { status = { state: 'error', message: '同步未完成，可能有部分内容已写入；请检查面板后重试。' }; }
    const latest = useNovelStore.getState().sessions.find(s => s.id === activeSession.id);
    if (latest) updateSession(latest.id, { messages: latest.messages.map(m => m.id === message.id ? { ...m, syncStatus: status } : m) });
  }, [currentNovelId, activeSession, isLoading, updateSession]);

  // Local actions run without a model and always append to a fresh session snapshot.
  const handleSlashCommand = useCallback((parsed: Extract<ReturnType<typeof parseSlashCommand>, { kind: 'local' }>, raw: string): boolean => {
    if (!currentNovelId) return false;
    if (generationRef.current && !parsed.command.busyAllowed) {
      setSlashCommandHint('生成期间不能执行此命令，请先停止或等待本次回复完成。');
      return false;
    }
    if (parsed.action === 'clear' && !window.confirm('清空当前作品的 AI 会话？章节、人物和世界观不会删除。可先用 /export 导出会话。')) return false;
    const latest = useNovelStore.getState();
    if (latest.currentNovelId !== currentNovelId || chatDraftNamespace(useAuthStore.getState().user?.id) !== namespace) return false;
    const novel = latest.novels.find(value => value.id === currentNovelId);
    if (!novel) return false;
    const session = latest.sessions.find(value => value.novelId === currentNovelId && value.agentType === activeAgent);
    const previous = session?.messages || [];
    let result = '';
    let navigate: (() => void) | undefined;
    let historyLimit = session?.contextHistoryLimit;
    switch (parsed.action) {
      case 'help': {
        const exact = parsed.argument ? findSlashCommand(parsed.argument) : undefined;
        const matches = exact ? [exact] : parsed.argument ? getSlashCommandSuggestions(parsed.argument) : SLASH_COMMANDS;
        if (!matches.length) { setSlashCommandHint('没有匹配的命令。输入 / 或点击命令按钮查看全部命令。'); return false; }
        result = matches.map(command => '**' + command.name + '** — ' + command.description + '（' + (command.kind === 'ai' ? 'AI 调用' : '本地操作') + '）\n用法：' + command.usage + (parsed.argument ? '\n示例：' + command.examples.join('；') : '')).join('\n\n')
          + '\n\n选择菜单只会补全输入，发送后才执行；AI 命令使用当前模型并计入预算。';
        break;
      }
      case 'status': {
        const settings = useSettingsStore.getState();
        result = '模型：' + (API_PRESETS[settings.apiProvider]?.name ?? '自定义') + ' / ' + (settings.model || '未设置') + '\n'
          + 'Temperature：' + settings.temperature + ' · 最大输出：' + settings.maxTokens + ' tokens\n'
          + '会话记录：' + previous.length + ' 条 · ' + (generationRef.current ? '正在生成，可用 /stop 停止' : '没有执行中的生成任务') + '\n'
          + '模型配置：' + (isModelConfigured(settings) ? '已配置' : '未配置完整') + '\n本地命令不发送给模型，不产生模型调用费用。';
        break;
      }
      case 'context': {
        flushActiveEditor();
        const snapshot = useNovelStore.getState();
        const summary = generationRef.current && lastContext ? lastContext : buildChatContext({ novel,
          chapters: snapshot.chapters, characters: snapshot.characters, worldSettings: snapshot.worldSettings,
          plotCards: snapshot.plotCards, foreshadowings: snapshot.foreshadowings,
          currentChapterId: snapshot.currentChapterId, request: '请根据当前作品继续协助创作。', history: previous,
          systemPrompt: AGENT_CONFIGS[activeAgent].systemPrompt, historyLimit }).summary;
        result = (generationRef.current ? '正在执行的请求范围' : '下一次普通对话的参考范围') + '\n'
          + summary.scopeLabel + '\n正文：' + (summary.chapterTitles.join('、') || '未附加章节正文') + '\n'
          + '有效历史 ' + summary.historyIncluded + ' 条 · 未带入 ' + summary.historyOmitted + ' 条\n'
          + '预计输入约 ' + summary.estimatedInputTokens.toLocaleString() + ' tokens（文本估算）\n'
          + [...summary.warnings, ...summary.omitted].join('\n') + '\n本次 /context 为本地查看，不调用模型。';
        break;
      }
      case 'export': {
        if (!previous.length) { result = '当前会话没有内容可导出。'; break; }
        const exported = previous.map(value => '[' + (value.role === 'user' ? '用户' : value.role === 'system' ? '系统' : 'AI') + ']\n'
          + (value.sourceCommand ? value.sourceCommand + '\n' : '') + value.content).join('\n\n---\n\n');
        const url = URL.createObjectURL(new Blob(['\uFEFF', exported.replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url;
        link.download = sanitizeExportFilename(novel.title || '会话') + '-AI会话-' + new Date().toISOString().slice(0, 10) + '.txt';
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        result = '完整会话已导出。';
        break;
      }
      case 'clear': historyLimit = undefined; result = '已清空当前会话。章节、人物和世界观仍保留。'; break;
      case 'compact':
        historyLimit = parsed.compactMode === 'off' ? undefined : parsed.historyLimit ?? 8;
        result = historyLimit === undefined ? '已恢复常规上下文，完整会话仍保留。后续最多携带最近 15 条有效历史，仍受输入预算约束。'
          : '已精简发送给 AI 的历史范围：后续最多携带最近 ' + historyLimit + ' 条有效历史，仍受输入预算约束。完整会话保留在本页并可导出。';
        break;
      case 'usage': result = '已打开调用记录与预算，本次导航不调用模型。'; navigate = openUsageSettings; break;
      case 'history': result = '已打开当前作品的章节版本历史。'; navigate = () => openReview('history'); break;
      case 'review': result = '已打开全书一致性检查，尚未开始 AI 检查。'; navigate = () => openReview('consistency'); break;
      case 'timeline': {
        const found = resolveTimelineCharacter(parsed.argument, latest.characters, currentNovelId);
        if (found.kind === 'error') { setSlashCommandHint(found.message); return false; }
        result = found.kind === 'found' ? '已打开“' + found.character.name + '”的人物状态时间线。' : '已打开当前作品的人物状态时间线。';
        navigate = found.kind === 'found' ? () => openCharacterTimeline(currentNovelId, found.character.id) : () => openReview('timeline');
        break;
      }
      case 'prompt':
        promptScopeRef.current = { novelId: currentNovelId, namespace };
        setPromptText(novel.agentPrompt || ''); setShowPromptDialog(true);
        result = '已打开本书自定义提示词，保存后影响后续对话。';
        break;
      case 'stop': {
        const running = generationRef.current;
        running?.abort();
        result = running ? '已请求停止当前生成，收到的文字仍保留。' : '当前没有执行中的生成任务。';
        break;
      }
    }
    let target = session;
    try {
      if (!target) target = addSession({ novelId: currentNovelId, agentType: activeAgent,
        title: AGENT_CONFIGS[activeAgent].name + ' - ' + new Date().toLocaleString(), messages: [] });
      const current = useNovelStore.getState().sessions.find(value => value.id === target!.id && value.novelId === currentNovelId);
      if (!current) return false;
      const commandMessage: Message = { id: 'cmd-' + crypto.randomUUID(), role: 'user', content: raw, timestamp: Date.now() };
      const resultMessage: Message = { id: 'result-' + crypto.randomUUID(), role: 'system', content: result, timestamp: Date.now() };
      updateSession(target.id, { messages: parsed.action === 'clear' ? [commandMessage, resultMessage] : [...current.messages, commandMessage, resultMessage],
        ...(['clear', 'compact'].includes(parsed.action) ? { contextHistoryLimit: historyLimit } : {}) });
      setSlashCommandHint(null);
    } catch {
      setError('本地命令已在当前页面处理，但会话记录未能保存；请导出备份并检查浏览器存储。');
    }
    navigate?.();
    return true;
  }, [currentNovelId, namespace, activeAgent, addSession, updateSession, lastContext]);

  const handleSend = useCallback(async (content?: string, reviewCount?: number, retry?: { sessionId: string; failedMessageId: string }) => {
    if (!currentNovelId || useNovelStore.getState().currentNovelId !== currentNovelId) return;
    const capturedNamespace = namespace;
    const sameAccount = () => chatDraftNamespace(useAuthStore.getState().user?.id) === capturedNamespace;
    if (!sameAccount()) return;
    const sentDraft = inputRef.current, sentRevision = inputRevisionRef.current;
    const retryRequest = retry ? generationRetry(useNovelStore.getState().sessions, currentNovelId, retry.sessionId, retry.failedMessageId) : null;
    if (retry && !retryRequest) { setError('原请求已不存在，或已切换作品，请在当前作品重新输入需求。'); return; }
    let sendContent = retryRequest?.content || content || sentDraft.trim();
    let requestedReviewCount = retryRequest?.reviewCount ?? reviewCount;
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

    const parsed = retry ? { kind: 'not-command' as const } : parseSlashCommand(sendContent);
    if (parsed.kind === 'error') { setSlashCommandHint(parsed.message); return; }
    if (parsed.kind === 'local') {
      try { if (handleSlashCommand(parsed, sendContent)) clearInputDraft(); }
      catch { setError('会话暂未保存，本地命令未完成。草稿仍在输入框，请检查浏览器存储后重试。'); }
      return;
    }
    if (isLoading || generationRef.current) { setSlashCommandHint('当前正在生成，可先准备下一条需求，完成后再发送。'); return; }
    const sourceCommand = parsed.kind === 'ai' ? sendContent : retryRequest?.sourceCommand;
    const retryCommand = retryRequest?.sourceCommand ? parseSlashCommand(retryRequest.sourceCommand) : undefined;
    const command = parsed.kind === 'ai' ? parsed : retryCommand?.kind === 'ai' ? retryCommand : undefined;
    if (parsed.kind === 'ai') { sendContent = parsed.request; requestedReviewCount = parsed.reviewCount; }
    const syncPolicy = command?.syncPolicy === 'review' || retryRequest?.syncPolicy === 'review-only' ? 'review-only' as const
      : command && needsChapterScope(command) || retryRequest?.syncPolicy === 'current-chapter' ? 'current-chapter' as const : undefined;
    if (!isModelConfigured(useSettingsStore.getState())) {
      setError('请先在“模型设置”中填写有效的地址、模型和认证信息');
      return;
    }

    flushActiveEditor();
    const latest = useNovelStore.getState();
    const novel = latest.novels.find(value => value.id === currentNovelId);
    if (!novel || latest.currentNovelId !== currentNovelId || !sameAccount()) return;
    const targetChapterId = retryRequest?.scopeChapterId || latest.currentChapterId;
    const targetChapter = latest.chapters.find(value => value.id === targetChapterId && value.novelId === currentNovelId);
    if (retryRequest && command?.requiresChapter && (!retryRequest.scopeChapterId || !targetChapter)) {
      setSlashCommandHint('原请求的目标章节已不存在或未保存，未发送请求；请重新选择目标与命令。'); return;
    }
    if (retryRequest?.syncPolicy === 'current-chapter' && (!targetChapter || !command || !needsChapterScope(command))) {
      setSlashCommandHint('原改稿命令或目标章节已不存在，未发送请求；请重新选择目标与命令。'); return;
    }
    if (command?.requiresChapter && !targetChapter) { setSlashCommandHint('请先在章节目录中选择当前章节，再执行 ' + command.command.name + '。'); return; }
    if (command?.requiresOutline && !latest.plotCards.some(value => value.novelId === currentNovelId && value.type === 'chapter' && value.summary.trim())) {
      setSlashCommandHint('本书还没有可用的章节大纲，请先生成或补充大纲。'); return;
    }
    if (command?.requiresRewriteConfirm && !window.confirm('按新要求重写章节《' + (targetChapter?.title || '') + '》？本次会调用模型并可能计费，验证通过后会写回这篇章节；修改前版本会保留。')) return;
    if (useNovelStore.getState().currentNovelId !== currentNovelId || !sameAccount()) return;
    const commandScope: SlashSyncScope | undefined = syncPolicy === 'current-chapter' && targetChapter && command
      ? { novelId: currentNovelId, chapterId: targetChapter.id, title: targetChapter.title, content: targetChapter.content, kind: command.command.id === 'polish' ? 'polish' : command.command.id === 'continue' ? 'continue' : 'rewrite' } : undefined;
    const previousSession = retry ? latest.sessions.find(value => value.id === retry.sessionId && value.novelId === currentNovelId)
      : latest.sessions.find(value => value.novelId === currentNovelId && value.agentType === activeAgent);
    const history = previousSession?.messages || [];
    const context = buildChatContext({ novel, chapters: latest.chapters, characters: latest.characters,
      worldSettings: latest.worldSettings, plotCards: latest.plotCards, foreshadowings: latest.foreshadowings,
      currentChapterId: command?.requiresChapter ? targetChapter?.id : latest.currentChapterId, request: sendContent, history,
      ...(syncPolicy === 'review-only' ? { reviewOnly: true } : {}),
      systemPrompt: AGENT_CONFIGS[activeAgent].systemPrompt, reviewCount: requestedReviewCount,
      historyLimit: previousSession?.contextHistoryLimit });
    setLastContext(context.summary);
    setContextBlocked(!!context.blockedReason);
    if (context.blockedReason) { setError(context.blockedReason); return; }
    if (command?.command.id === 'check' && !context.summary.chapterCount) {
      setSlashCommandHint('当前作品没有可供检查的已保存正文，未发送请求；请先补充正文或选择已有章节。'); return;
    }
    setError(null); setBudgetWarning('');
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: sendContent, ...(sourceCommand ? { sourceCommand } : {}), timestamp: Date.now() };
    let sessionId = previousSession?.id || '';
    const replyId = crypto.randomUUID();
    let generationMetadata: NonNullable<Message['generation']> = {
      status: 'running', requestMessageId: userMessage.id,
      ...(retryRequest?.retryOf ? { retryOf: retryRequest.retryOf } : {}),
      ...(requestedReviewCount === undefined ? {} : { reviewCount: requestedReviewCount }),
      ...(syncPolicy ? { syncPolicy } : {}),
      ...(command?.requiresChapter && targetChapter ? { scopeChapterId: targetChapter.id } : {}),
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
            ...(sourceCommand ? { sourceCommand } : {}),
            ...(syncPolicy === 'review-only' ? { syncStatus: { state: 'warning' as const, message: '仅供检查与建议，未自动改稿。' } }
              : hasSyncableContent(finalContent) ? { syncStatus: { state: 'pending' as const, message: '正在写入本地面板…' } } : {}),
          };
          const latest = useNovelStore.getState().sessions.find(s => s.id === sessionId && s.novelId === currentNovelId);
          if (!latest) return;
          updateReply(aiMessage);
          if (visible()) setStreamingContent('');
          // Let the completed reply paint before synchronous parsing/storage work.
          await new Promise<void>(resolve => setTimeout(resolve, 16));
          if (commandScope) {
            let status: NonNullable<Message['syncStatus']>;
            if (generation.signal.aborted || !sameAccount() || useNovelStore.getState().currentNovelId !== currentNovelId) status = { state: 'warning', message: '目标上下文已变化，改稿尚未应用，请核对候选内容后重新操作。' };
            else {
              try {
                flushActiveEditor();
                status = applyScopedSlashResponse(finalContent, commandScope) || { state: 'warning', message: '候选改稿未应用，请核对回复与原章节。' };
              }
              catch { status = { state: 'error', message: '改稿同步未完成，回复仍保留，请检查原章节和版本历史。' }; }
            }
            updateReply({ syncStatus: status });
            return;
          }
          if (aiMessage.syncStatus && syncPolicy !== 'review-only') {
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
        {onShowDemo && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground" disabled={isLoading} onClick={() => { flushInputDraft(); onShowDemo(); }} aria-label="返回示例回放" title="返回示例回放"><Play className="h-4 w-4" /></Button>}
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground" aria-label="斜杠命令" title="输入 / 或选择命令" aria-expanded={commandMenuOpen} aria-controls={menuId} onClick={() => {
          if (commandMenuOpen) { setManualMenu(false); setMenuDismissed(true); }
          else { setManualMenu(true); setMenuDismissed(false); setActiveCommandIndex(0); }
          composerRef.current?.focus();
        }}><Slash className="h-4 w-4" /></Button>
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
                        <div className="whitespace-pre-wrap break-words">{message.sourceCommand && <p data-source-command className="mb-2 font-mono text-xs opacity-85">{message.sourceCommand}</p>}{message.content}</div>
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
                      <p className="text-xs leading-relaxed text-muted-foreground">{message.generation?.scopeChapterId ? '使用原需求、原目标章节和当前模型重新调用' : '使用原需求和当前模型、作品上下文重新调用'}，可能再次计费；上次的部分文字保留。</p>
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
        <div data-slash-feedback role="status" className="px-4 py-2 bg-sky-50 border-t border-sky-200 dark:bg-sky-950 dark:border-sky-800">
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
      <div className="chat-composer relative shrink-0 border-t bg-muted/40 p-3 sm:p-4">
        {commandMenuOpen && <SlashCommandMenu id={menuId} commands={suggestedCommands} activeIndex={activeCommandIndex}
          onActiveIndexChange={setActiveCommandIndex} onChoose={chooseCommand} busy={isLoading} preserveDraft={preserveMenuDraft}
          onClose={() => { setManualMenu(false); setMenuDismissed(true); composerRef.current?.focus(); }} />}
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
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={commandMenuOpen}
            aria-controls={commandMenuOpen ? menuId : undefined}
            aria-activedescendant={commandMenuOpen && activeCommand && !isSlashCommandDisabled(activeCommand, isLoading, preserveMenuDraft) ? slashOptionId(menuId, activeCommand.id) : undefined}
            ref={element => {
              composerRef.current = element;
              if (element) { element.style.height = 'auto'; element.style.height = Math.min(element.scrollHeight, 120) + 'px'; }
            }}
            value={input}
            onChange={event => {
              const value = event.target.value;
              inputRef.current = value; inputRevisionRef.current++;
              setInput(value); setInputCaret(event.currentTarget.selectionStart); saveInputDraft(value);
              setManualMenu(false); setMenuDismissed(false); setActiveCommandIndex(0); setSlashCommandHint(null);
            }}
            onSelect={event => setInputCaret(event.currentTarget.selectionStart)}
            onCompositionStart={() => { compositionRef.current = true; }}
            onCompositionEnd={() => { compositionRef.current = false; }}
            onKeyDown={event => {
              if (compositionRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (commandMenuOpen) {
                if (event.key === 'Escape') { event.preventDefault(); setManualMenu(false); setMenuDismissed(true); return; }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault(); setActiveCommandIndex(index => moveSlashCommandSelection(suggestedCommands, index, event.key === 'ArrowDown' ? 1 : -1, isLoading, preserveMenuDraft)); return;
                }
                if (!event.shiftKey && !event.ctrlKey && !event.metaKey && (event.key === 'Tab' || event.key === 'Enter')) {
                  if (activeCommand) { event.preventDefault(); chooseCommand(activeCommand); }
                  return;
                }
              }
              if (event.key !== 'Enter' || event.shiftKey || isLoading && !(parsedInput.kind === 'local' && parsedInput.command.busyAllowed) || coarsePointer && !event.ctrlKey && !event.metaKey) return;
              event.preventDefault(); void handleSend();
            }}
            placeholder={isLoading ? '可继续写下一条需求，完成后再发送' : modelConfigured ? '输入需求... (/help 查看命令)' : '可先写下需求，配置模型后发送；/help 查看命令'}
            rows={1}
            className="min-h-[36px] max-h-[120px] min-w-0 flex-1 resize-none overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {isLoading && <Button variant="outline" onClick={() => generationRef.current?.abort()} className="self-end">停止生成</Button>}
          <Button size="icon" aria-label="发送需求" onClick={() => void handleSend()} disabled={!canSubmitInput} className="self-end">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!commandMenuOpen && parsedInput.kind !== 'not-command' && <p data-slash-command-preview role="status" className="mt-2 break-words text-xs leading-relaxed text-muted-foreground">
          {parsedInput.kind === 'error' ? '命令待补全，不调用模型。' + parsedInput.message : parsedInput.command.name + ' · ' + (parsedInput.kind === 'ai' ? 'AI 调用，可能计费；发送后执行。' : '本地操作，不调用模型；发送后执行。') + '\n' + parsedInput.command.usage}
        </p>}
        <p className="mt-2 text-xs text-muted-foreground">{coarsePointer ? '回车换行 · 点击发送' : 'Enter 发送 · Shift+Enter 换行'} · 输入 / 命令 · {messages.length} 条对话{isLoading ? ' · 正在生成，可先写下一条' : ''}</p>
      </div>
    </div>
  );
}
