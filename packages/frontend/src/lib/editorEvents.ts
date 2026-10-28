export const FLUSH_EDITOR_EVENT = 'novel-agent:flush-editor';

export function flushActiveEditor(): void {
  window.dispatchEvent(new Event(FLUSH_EDITOR_EVENT));
}
