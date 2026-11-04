type ReplyClipboard = Pick<Clipboard, 'writeText'>;

/** A rejected or unavailable clipboard must lead to manual copying, never a success message. */
export async function copyChatReply(text: string, clipboard?: ReplyClipboard | null): Promise<'copied' | 'manual'> {
  try {
    const target = clipboard === undefined ? (typeof navigator === 'undefined' ? undefined : navigator.clipboard) : clipboard;
    if (!target || typeof target.writeText !== 'function') return 'manual';
    await target.writeText(text);
    return 'copied';
  } catch { return 'manual'; }
}

function safeStart(text: string, length: number): string {
  let end = Math.min(length, text.length);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] || '')) end--;
  return text.slice(0, end);
}
function safeEnd(text: string, length: number): string {
  let start = Math.max(0, text.length - length);
  if (start && /[\uDC00-\uDFFF]/.test(text[start] || '')) start++;
  return text.slice(start);
}

/** A bounded view only. The original response remains intact for copying and synchronization. */
export function chatReplyPreview(content: string, streaming: boolean): { head: string; tail: string; omitted: boolean } {
  if (streaming && content.length > 360) return { head: safeStart(content, 100), tail: safeEnd(content, 240), omitted: true };
  const head = safeStart(content, 240).split('\n').slice(0, 6).join('\n');
  return { head, tail: '', omitted: head.length < content.length };
}
