import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { compactEditorDocument, DEFAULT_EDITOR_PREFERENCES, normalizeEditorPreferences, readEditorPreferences } from '../src/lib/editorPreferences.ts';
import { toEditorHtml } from '../src/lib/textModification.ts';
import { paragraphText, readManuscript } from '../src/lib/manuscript.ts';
import { createNovelExport, exportChapterTitle, prepareNovelExport, renderNovelMarkdown, renderNovelTxt, sanitizeExportFilename } from '../src/lib/novelExport.ts';

const novel = { id: 'book', title: '校园故事', summary: '一本小说的简介。', status: 'draft', wordCount: 0, createdAt: 0, updatedAt: 0 };
const chapter = (id, title, content, sequence = 0, novelId = novel.id) => ({ id, novelId, title, content, sequence, wordCount: content.length, createdAt: 0, updatedAt: 0 });
const chapters = [chapter('second', '数', '第三段。\n第四段。', 10), chapter('first', '四个小时', '第一段。\n\n第二段。', 2), chapter('private', '别的作品', '不要带入', 0, 'other-book')];

test('editor defaults use normal line spacing without a paragraph gap', () => {
  assert.deepEqual(normalizeEditorPreferences(null), DEFAULT_EDITOR_PREFERENCES);
  assert.deepEqual(normalizeEditorPreferences({ fontSize: 99, lineHeight: 3, paragraphGap: -4, firstLineIndent: 'false' }), DEFAULT_EDITOR_PREFERENCES);
  assert.deepEqual(normalizeEditorPreferences({ fontSize: 20, lineHeight: 1.4, paragraphGap: 8, firstLineIndent: false }), { fontSize: 20, lineHeight: 1.4, paragraphGap: 8, firstLineIndent: false });
});

test('corrupt or unavailable local preferences fall back safely', () => {
  globalThis.localStorage = { getItem: () => '{bad json' };
  assert.deepEqual(readEditorPreferences(), DEFAULT_EDITOR_PREFERENCES);
  globalThis.localStorage = { getItem: () => { throw new Error('denied'); } };
  assert.deepEqual(readEditorPreferences(), DEFAULT_EDITOR_PREFERENCES);
});

test('AI blank lines do not become extra blank editor paragraphs; existing HTML is retained', () => {
  assert.equal(toEditorHtml('第一段。\r\n\r\n  \r\n第二段。\n'), '<p>第一段。</p><p>第二段。</p>');
  assert.equal(toEditorHtml('<p>第一段。</p><p></p><p>第二段。</p>'), '<p>第一段。</p><p></p><p>第二段。</p>');
  assert.equal(toEditorHtml(''), '<p></p>');
});

test('explicit blank cleanup retains rich content, lists and non-text nodes without mutating input', () => {
  const input = { type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'hardBreak' }] }, { type: 'paragraph', content: [{ type: 'text', text: '正文', marks: [{ type: 'bold' }] }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }, { type: 'paragraph', content: [{ type: 'image', attrs: { src: 'local' } }] }, { type: 'horizontalRule' }] };
  const before = JSON.stringify(input);
  assert.equal(compactEditorDocument(input).content.length, 4);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(compactEditorDocument({ type: 'doc', content: [{ type: 'paragraph' }] }).content, [{ type: 'paragraph' }]);
});

test('plain manuscript preserves paragraph boundaries, visible symbols and soft indentation', () => {
  const result = readManuscript('  第一段：甲 < 乙 & 丙。\r\n\r\n第二段：😀。');
  assert.deepEqual(result.map(paragraphText), ['  第一段：甲 < 乙 & 丙。', '第二段：😀。']);
});

test('exports are restricted to this novel, sorted without modifying source arrays', () => {
  const before = JSON.stringify(chapters);
  const data = prepareNovelExport(novel, chapters, { scope: 'novel', includeSummary: true });
  assert.deepEqual(data.chapters.map(item => item.title), ['第1章 四个小时', '第2章 数']);
  assert.equal(data.summary.length, 1);
  assert.equal(JSON.stringify(chapters), before);
  assert.ok(!renderNovelTxt(data).includes('不要带入'));
});

test('single chapter retains its position in the novel and does not include the synopsis', () => {
  const data = prepareNovelExport(novel, chapters, { scope: 'chapter', chapterId: 'second', includeSummary: true });
  assert.deepEqual(data.chapters.map(item => item.title), ['第2章 数']);
  assert.deepEqual(data.summary, []);
  assert.throws(() => prepareNovelExport(novel, chapters, { scope: 'chapter', chapterId: 'private' }), /选择/);
  assert.throws(() => prepareNovelExport(novel, [], { scope: 'novel' }), /还没有章节/);
});

test('existing numbered and special chapter titles do not receive duplicate numbering', () => {
  assert.equal(exportChapterTitle('第十二章 四个小时', 12), '第十二章 四个小时');
  assert.equal(exportChapterTitle('序章', 1), '序章');
  assert.equal(exportChapterTitle('四个小时', 3), '第3章 四个小时');
});

test('TXT uses Windows CRLF and UTF-8 BOM and never joins adjacent paragraphs', async () => {
  const data = prepareNovelExport(novel, chapters, { scope: 'novel' });
  const result = await createNovelExport(data, 'txt', 'novel');
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = await result.blob.text();
  assert.match(text, /第一段。\r\n第二段。/);
  assert.ok(!/(?<!\r)\n/.test(text));
  assert.equal(result.filename, '校园故事.txt');
});

test('Markdown emits real headings, basic marks and escapes executable HTML and controls', () => {
  const data = { title: '书名 # 测试', summary: [], chapters: [{ title: '第1章 开始', paragraphs: [{ kind: 'paragraph', runs: [{ text: '**正文** <script>alert(1)</script>' }, { text: '重点', bold: true }, { text: '强调', italic: true }] }, { kind: 'paragraph', quote: true, runs: [{ text: '第一行\n第二行' }] }] }] };
  const markdown = renderNovelMarkdown(data);
  assert.match(markdown, /^# 书名 \\# 测试/);
  assert.ok(markdown.includes('## 第1章 开始'));
  assert.ok(markdown.includes('**重点***强调*'));
  assert.ok(markdown.includes('\\*\\*正文\\*\\*'));
  assert.ok(markdown.includes('&lt;script&gt;'));
  assert.ok(!markdown.includes('<script>'));
  assert.ok(markdown.includes('> 第一行  \n> 第二行'));
});

test('Windows filenames reject reserved names, controls, forbidden characters and trailing periods', () => {
  assert.equal(sanitizeExportFilename('CON'), '_CON');
  assert.equal(sanitizeExportFilename('nul.txt'), '_nul.txt');
  assert.equal(sanitizeExportFilename('A:B/书名?\n. '), 'A_B_书名__');
  assert.equal(sanitizeExportFilename('.. '), '未命名小说');
  assert.equal(Array.from(sanitizeExportFilename('😀'.repeat(200))).length, 100);
});

function zipEntry(buffer, name) {
  let offset = buffer.readUInt32LE(buffer.lastIndexOf(Buffer.from('PK\x05\x06', 'binary')) + 16);
  while (buffer.readUInt32LE(offset) === 0x02014b50) {
    const length = buffer.readUInt16LE(offset + 28);
    const entryName = buffer.subarray(offset + 46, offset + 46 + length).toString();
    if (entryName === name) {
      const local = buffer.readUInt32LE(offset + 42);
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const compressed = buffer.subarray(start, start + buffer.readUInt32LE(offset + 20));
      return (buffer.readUInt16LE(offset + 10) === 8 ? inflateRawSync(compressed) : compressed).toString();
    }
    offset += 46 + length + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  throw new Error(`Missing ZIP entry ${name}`);
}

test('Word output is a real DOCX with explicit CJK fonts, stable spacing and chapter breaks', async () => {
  const data = prepareNovelExport(novel, chapters, { scope: 'novel', includeSummary: true });
  const { blob } = await createNovelExport(data, 'docx', 'novel');
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const document = zipEntry(bytes, 'word/document.xml');
  const styles = zipEntry(bytes, 'word/styles.xml');
  assert.match(document, /w:eastAsia="宋体"/);
  assert.match(document, /w:eastAsia="黑体"/);
  assert.match(document, /w:ascii="Times New Roman"/);
  assert.match(document, /w:line="360"/);
  assert.match(document, /w:lineRule="auto"/);
  assert.match(document, /w:pageBreakBefore/);
  assert.ok(!/w:(?:ascii|hAnsi|eastAsia|cs)Theme=/.test(document + styles));
  assert.ok(document.includes('第一段。') && document.includes('第二段。'));
  assert.ok(!document.includes('不要带入'));
});
