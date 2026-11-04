import type { Message, Session } from '../types/index';

const retryable = new Set(['failed', 'cancelled', 'interrupted']);

/** Only reconnect a retry to the original user turn in this exact book/session. */
export function generationRetry(sessions: Session[], novelId: string, sessionId: string, failedMessageId: string) {
  const session = sessions.find(item => item.id === sessionId && item.novelId === novelId);
  const failedIndex = session?.messages.findIndex(item => item.id === failedMessageId) ?? -1;
  const failed = session?.messages[failedIndex];
  if (!session || !failed || failed.role !== 'assistant' || !failed.generation || !retryable.has(failed.generation.status)) return null;
  const request = session.messages.slice(0, failedIndex).find(item => item.id === failed.generation?.requestMessageId && item.role === 'user');
  if (!request?.content.trim() || request.content.trimStart().startsWith('/')) return null;
  return { content: request.content, retryOf: failed.generation.callId,
    reviewCount: Number.isInteger(failed.generation.reviewCount) && failed.generation.reviewCount! >= 0 ? failed.generation.reviewCount : undefined };
}

/** Partial markup is kept for the author, but never presented as completed model history. */
export function completedGenerationHistory(messages: Message[]): Message[] {
  return messages.filter(message => message.role !== 'assistant' || (!message.generation || message.generation.status === 'succeeded') && message.syncStatus?.state !== 'partial');
}

/** A page reload cannot confirm whether an upstream request finished or was charged. */
export function interruptedGenerations(messages: Message[]): Message[] {
  if (!messages.some(message => message.generation?.status === 'running')) return messages;
  return messages.map(message => message.generation?.status === 'running' ? {
    ...message, content: message.content || '上次调用未确认完成，没有保存到正文。',
    generation: { ...message.generation, status: 'interrupted' as const },
    syncStatus: { state: 'partial' as const, message: '上次调用未确认完成，已保留收到的文字；请先确认原任务，再决定是否重新调用。' },
  } : message);
}

/** Static task labels keep request contents out of the accounting ledger. */
export function generationOperation(request: string): string {
  if (/检查.*章|章节.*检查/.test(request)) return '检查章节';
  if (/优化.*大纲/.test(request)) return '优化大纲';
  if (/生成.*大纲/.test(request)) return '生成大纲';
  if (/续写三章/.test(request)) return '续写三章';
  if (/续写一章/.test(request)) return '续写一章';
  if (/续写.*章节/.test(request)) return '续写章节';
  return '创作对话';
}
