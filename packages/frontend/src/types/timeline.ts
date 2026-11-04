export interface TimelineEntry {
  id: string;
  novelId: string;
  characterId: string;
  chapterId: string;
  storyTime: string;
  location: string;
  physicalState: string;
  emotion: string;
  knowledge: string;
  relationships: string;
  possessions: string;
  note: string;
  quote: string;
  sourceFingerprint: string;
  origin: 'manual' | 'ai-reviewed';
  createdAt: number;
  updatedAt: number;
}

export type TimelineDraft = Pick<TimelineEntry, 'storyTime' | 'location' | 'physicalState' | 'emotion' | 'knowledge' | 'relationships' | 'possessions' | 'note' | 'quote'>;
export type TimelineEvidence = 'missing-chapter' | 'missing-character' | 'changed' | 'quoted' | 'unquoted';
