export interface TextModificationResult {
  state: 'applied' | 'already-applied' | 'failed';
  content: string;
  message: string;
}

export function isRichTextContent(content: string): boolean {
  return /<\/?(?:p|div|h[1-6]|span|strong|em|u|s|b|i|br|ul|ol|li|blockquote|pre|code)(?:\s[^<>]*|)\s*\/?>/i.test(content);
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toEditorHtml(content: string): string {
  if (isRichTextContent(content)) return content;
  const lines = content.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim());
  return lines.length ? lines.map(line => `<p>${escapeHtml(line)}</p>`).join('') : '<p></p>';
}

interface TextPoint { node: Text; offset: number }

/** Build a visible-text projection without changing the saved document or its formatting. */
function projectContent(content: string): { text: string; points: Array<TextPoint | null>; document?: Document } {
  if (!isRichTextContent(content)) return { text: content, points: [] };
  if (typeof DOMParser === 'undefined') throw new Error('富文本修改需要在浏览器中执行');
  const document = new DOMParser().parseFromString(content, 'text/html');
  let text = '';
  const points: Array<TextPoint | null> = [];
  const newline = () => { text += '\n'; points.push(null); };
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      const value = node.textContent || '';
      for (let offset = 0; offset < value.length; offset++) {
        text += value[offset];
        points.push({ node: node as Text, offset });
      }
    } else if (node.nodeType === 1) {
      const element = node as Element;
      if (/^(SCRIPT|STYLE)$/.test(element.tagName)) return;
      if (element.tagName === 'BR') { newline(); return; }
      for (const child of element.childNodes) walk(child);
      if (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test(element.tagName)) newline();
    }
  };
  walk(document.body);
  return { text, points, document };
}

/** Only typography and whitespace vary; words, numbers, punctuation and meaning stay exact. */
function normalizedText(text: string) {
  let value = '';
  const spans: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(/\s+|[^\s]/gu)) {
    const part = /^\s/u.test(match[0]) ? ' ' : match[0].replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    value += part;
    for (let i = 0; i < part.length; i++) spans.push({ start: match.index!, end: match.index! + match[0].length });
  }
  return { value, spans };
}

function occurrences(text: string, search: string): number[] {
  const results: number[] = [];
  for (let start = text.indexOf(search); start !== -1; start = text.indexOf(search, start + 1)) results.push(start);
  return results;
}

export function contentWordCount(content: string): number {
  return projectContent(content).text.trimEnd().length;
}

/** Replace one unambiguous visible-text range. Replacement text is never interpreted as HTML. */
export function applyTextModification(content: string, original: string, replacement: string): TextModificationResult {
  const result = (state: TextModificationResult['state'], message: string, next = content): TextModificationResult => ({ state, message, content: next });
  if (!original.trim() || !replacement.trim()) return result('failed', '原内容或新内容为空，未修改');
  const projection = projectContent(content);
  const normalized = normalizedText(projection.text);
  const before = normalizedText(original.trim()).value;
  const after = normalizedText(replacement.trim()).value;
  if (original === replacement) return result('already-applied', '原内容与新内容相同，未重复写入');
  const existing = occurrences(normalized.value, after);
  // A replacement may contain the original (e.g. 全校 -> 全校师生). Do not expand it again on retry.
  const matches = occurrences(normalized.value, before).filter(start => before === after || !existing.some(index => index <= start && index + after.length >= start + before.length));
  if (!matches.length) {
    return existing.length ? result('already-applied', '已包含新内容，未重复写入') : result('failed', '未找到原内容，请核对当前正文和引用原文');
  }
  if (matches.length > 1) return result('failed', `原内容匹配到 ${matches.length} 处，请提供更长的上下文定位`);
  const start = normalized.spans[matches[0]].start;
  const end = normalized.spans[matches[0] + before.length - 1].end;
  if (projection.text.slice(start, end) === replacement) return result('already-applied', '已包含新内容，未重复写入');
  if (!projection.document) return result('applied', '已修改正文', content.slice(0, start) + replacement + content.slice(end));
  const first = projection.points[start];
  const last = projection.points[end - 1];
  if (!first || !last) return result('failed', '无法安全定位富文本范围，未修改');
  const document = projection.document;
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  replacement.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    if (index) fragment.append(document.createElement('br'));
    fragment.append(document.createTextNode(line));
  });
  range.insertNode(fragment);
  return result('applied', '已修改正文，保留原有排版', document.body.innerHTML);
}
