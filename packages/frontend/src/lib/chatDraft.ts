import { IS_DEMO, storageKey } from './runtime';

export const LEGACY_CHAT_DRAFT_KEY = 'novel-agent-input-draft';
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const chatDraftNamespace = (userId?: string | null): string => IS_DEMO ? 'browser' : userId || 'local';
export const chatDraftKey = (namespace: string, novelId: string | null): string | null => novelId ? `${storageKey('novel-agent-chat-draft')}:${encodeURIComponent(namespace)}:${encodeURIComponent(novelId)}` : null;

const browserStorage = (): DraftStorage => localStorage;
const failure = '草稿暂未保存到浏览器，文字仍保留在输入框；请先复制备份，再检查存储空间或权限。';
// Quota failures must survive switching books or mounting another panel in this
// same tab. Keys include account and book; none of this text crosses scopes.
const unsaved = new Map<string, string>();
export const hasUnsavedChatDrafts = (): boolean => unsaved.size > 0;
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  if (unsaved.size) { event.preventDefault(); event.returnValue = ''; }
});

export function readChatDraft(key: string | null, storage?: DraftStorage): { value: string; error: string } {
  if (!key) return { value: '', error: '' };
  if (unsaved.has(key)) return { value: unsaved.get(key)!, error: failure };
  try { return { value: (storage || browserStorage()).getItem(key) || '', error: '' }; }
  catch { return { value: '', error: '无法读取本书草稿，原有草稿未覆盖；请检查浏览器存储权限。' }; }
}

export function writeChatDraft(key: string | null, value: string, storage?: DraftStorage): string {
  if (!key) return value ? '先选择一本作品，再保存创作草稿。' : '';
  try {
    const target = storage || browserStorage();
    if (value) target.setItem(key, value); else target.removeItem(key);
    unsaved.delete(key);
    return '';
  } catch { unsaved.set(key, value); return failure; }
}

/** Sending clears the composer only after durable removal. A failed removal is
 * different from the author intentionally editing their draft to an empty value. */
export function clearSentChatDraft(key: string, storage?: DraftStorage): string {
  try { (storage || browserStorage()).removeItem(key); unsaved.delete(key); return ''; }
  catch { return failure; }
}

/** An old global draft has no reliable book/account owner. Restore only on an explicit click. */
export function readLegacyChatDraft(storage?: DraftStorage): string {
  try { return (storage || browserStorage()).getItem(LEGACY_CHAT_DRAFT_KEY) || ''; } catch { return ''; }
}

export function restoreLegacyChatDraft(key: string, storage?: DraftStorage): { value: string; error: string } {
  const value = readLegacyChatDraft(storage);
  if (!value) return { value: '', error: '' };
  const existing = readChatDraft(key, storage);
  if (existing.value && existing.value !== value) return { value: existing.value, error: '本书已有草稿，已保留当前作品的文字；请先备份后再恢复旧版草稿。' };
  if (existing.error && existing.value !== value) return existing;
  const error = writeChatDraft(key, value, storage);
  if (error) return { value, error };
  try { (storage || browserStorage()).removeItem(LEGACY_CHAT_DRAFT_KEY); }
  catch { return { value, error: '旧版草稿已保存到本书，但旧记录暂未清理；请保留当前草稿。' }; }
  return { value, error: '' };
}
