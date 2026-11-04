import { storageKey } from './runtime';

export const OPEN_USAGE_EVENT = 'novel-agent-open-usage';

/** Open the usage tab even when Settings is already mounted behind the assistant. */
export function openUsageSettings(): void {
  try { sessionStorage.setItem(storageKey('novel-agent-settings-section'), 'usage'); } catch { /* The mounted view also receives the event. */ }
  window.dispatchEvent(new Event(OPEN_USAGE_EVENT));
}
