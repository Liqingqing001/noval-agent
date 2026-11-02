export interface ReferenceParagraph { id: string; text: string; start: number; end: number }
export interface ReferenceMetrics { characters: number; paragraphs: number; sentences: number; averageSentence: number; averageParagraph: number }
export interface ReferenceEvidence { paragraphId: string; quote: string; conclusion: string; verified: boolean }
export interface ReferenceReport {
  issues?: string[];
  summary: string; audience: string;
  structure: Array<{ paragraphId: string; role: string; technique: string }>;
  style: string; methods: string; limitations: string[];
  evidence: ReferenceEvidence[]; missingParagraphs: string[];
}
export interface ReferenceBrief { topic: string; audience: string; title: string; min: number; max: number; requirements: string; mode: 'both' | 'style' | 'structure' }
export interface ReferenceDraft { text: string; context: string; completedBy?: 'model' | 'manual'; model: string; createdAt: number }
export interface ReferenceRange { from: number; to: number }
export type ReferenceSynthesis = Pick<ReferenceReport, 'summary' | 'audience' | 'style' | 'methods' | 'limitations'>;
export interface ReferenceCache { report?: ReferenceReport; synthesis?: ReferenceSynthesis }
export interface ReferenceProject {
  id: string; title: string; source: string; sourceHash: string; createdAt: number; updatedAt: number;
  report?: ReferenceReport; analysisKey?: string; analyzedModel?: string;
  selection?: ReferenceRange; analyzedRange?: ReferenceRange;
  analysisCache?: Record<string, ReferenceCache>;
  style: string; methods: string; brief: ReferenceBrief;
  outline: string; confirmedContext?: string; draft?: ReferenceDraft;
  lastAttempt?: { stage: string; text: string; error: string; at: number };
  imports: Array<{ hash: string; novelId: string; chapterId: string }>;
}
