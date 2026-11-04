import { storageKey } from './runtime';

export type ReviewTab = 'history' | 'consistency' | 'timeline';
export const OPEN_REVIEW_EVENT = 'novel-agent-open-review';

export function openReview(tab: ReviewTab = 'history'): void {
  try { sessionStorage.setItem(storageKey('novel-agent-review-tab'), tab); } catch { /* Navigation also works without storage. */ }
  window.dispatchEvent(new CustomEvent(OPEN_REVIEW_EVENT, { detail: { tab } }));
}

export function openCharacterTimeline(novelId: string, characterId: string): void {
  try { sessionStorage.setItem(storageKey('novel-agent-timeline-focus'), JSON.stringify({ novelId, characterId })); } catch { /* The timeline remains available without a focus hint. */ }
  openReview('timeline');
}
