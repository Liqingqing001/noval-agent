export interface EditorPreferences {
  fontSize: number;
  lineHeight: number;
  paragraphGap: number;
  firstLineIndent: boolean;
}

export const EDITOR_PREFERENCES_KEY = 'novel-agent-editor-preferences';
export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = { fontSize: 16, lineHeight: 1.6, paragraphGap: 0, firstLineIndent: true };

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  const input = value && typeof value === 'object' ? value as Partial<EditorPreferences> : {};
  return {
    fontSize: [14, 16, 18, 20].includes(input.fontSize!) ? input.fontSize! : 16,
    lineHeight: [1.4, 1.6, 1.8].includes(input.lineHeight!) ? input.lineHeight! : 1.6,
    paragraphGap: [0, 4, 8].includes(input.paragraphGap!) ? input.paragraphGap! : 0,
    firstLineIndent: typeof input.firstLineIndent === 'boolean' ? input.firstLineIndent : true,
  };
}

export function readEditorPreferences(): EditorPreferences {
  try { return normalizeEditorPreferences(JSON.parse(localStorage.getItem(EDITOR_PREFERENCES_KEY) || 'null')); }
  catch { return { ...DEFAULT_EDITOR_PREFERENCES }; }
}

export interface EditorNode { type?: string; text?: string; content?: EditorNode[]; [key: string]: unknown }

/** Explicit, undoable cleanup; non-text nodes and list structure must survive. */
export function compactEditorDocument(document: EditorNode): EditorNode {
  const blank = (node: EditorNode) => node.type === 'paragraph' && (!node.content || node.content.every(child => child.type === 'hardBreak' || child.type === 'text' && !child.text?.trim()));
  const content = document.content?.filter(node => !blank(node));
  return { ...document, content: content?.length ? content : [{ type: 'paragraph' }] };
}
