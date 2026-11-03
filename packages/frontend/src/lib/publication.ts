import type { Chapter, Novel } from '@/types';
import { paragraphText, readManuscript } from './manuscript';
import type { ManuscriptParagraph } from './manuscript';
import { prepareNovelExport } from './novelExport';

export type AiUse = 'unknown' | 'human' | 'assisted' | 'generated';
export const AI_USE_LABELS: Record<AiUse, string> = { unknown: '尚未确认', human: '未使用 AI（人工创作）', assisted: 'AI 辅助（构思 / 校对等）', generated: '包含 AI 生成内容（含后续人工修改）' };
const visibleParagraph = (paragraph: ManuscriptParagraph) => `${paragraph.quote ? '＞ ' : ''}${paragraph.prefix || ''}${paragraphText(paragraph)}`;
export const plainManuscript = (content: string) => readManuscript(content).map(visibleParagraph).join('\n\n');
export function publicationChapters(novelId: string, chapters: Chapter[]) {
  return chapters.filter(chapter => chapter.novelId === novelId).slice().sort((a,b)=>a.sequence-b.sequence);
}
export function createSubmissionBrief(novel: Novel, chapters: Chapter[], platform: { name: string; entryUrl: string; checkedAt: string }, textUse: AiUse, coverUse: AiUse) {
  const ordered=publicationChapters(novel.id,chapters);
  return [
    `# 《${novel.title}》投稿资料（本机准备，尚未提交）`,
    `目标平台：${platform.name}\n官方入口：${platform.entryUrl}\n平台资料核查日期：${platform.checkedAt}`,
    `## 作品信息\n\n书名：${novel.title}\n题材：${novel.genre || '待作者填写'}\n状态：${novel.status === 'completed' ? '已完成' : novel.status === 'writing' ? '创作中' : '草稿'}\n章节数：${ordered.length}`,
    `## 简介\n\n${plainManuscript(novel.summary || '') || '待作者填写'}`,
    `## AI 使用自述（由作者选择，不是系统检测）\n\n正文：${AI_USE_LABELS[textUse]}\n封面 / 插图：${AI_USE_LABELS[coverUse]}\n具体工具、涉及范围、人工创作与核查过程：待作者补充。\n请按平台表单重新填写，不将本自述视为平台许可；不得为通过审核隐瞒实际生成情况。`,
    `## 章节清单\n\n${ordered.map((chapter,i)=>`${i+1}. ${chapter.title}`).join('\n') || '暂无章节'}`,
    '## 提交前由作者核对\n\n- [ ] 当前官方规则与本次活动 / 合同要求\n- [ ] 正文、封面、引用等权利\n- [ ] AI 内容是否允许，是否需标签 / 声明\n- [ ] 首发、独家、已公开版本与签约限制\n- [ ] 分类、年龄分级、警告与作者信息\n- [ ] 登录平台预览并亲自确认发布\n\n本文件仅整理资料；未登录平台、未上传稿件、未签约、未代表平台审核。TXT / Word 导出可供整理或复制，不代表平台支持直接导入。',
  ].join('\n\n')+'\n';
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
export function createPublicationHtml(novel: Novel, chapters: Chapter[]): string {
  const data=prepareNovelExport(novel,chapters,{scope:'novel',includeSummary:true});
  const renderParagraphs=(items: typeof data.summary)=>items.map(item=>`<p>${escapeHtml(visibleParagraph(item)).replace(/\n/g,'<br>')}</p>`).join('\n');
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(data.title)}</title><style>body{max-width:760px;margin:auto;padding:32px 22px;background:#f6f3ec;color:#203b3c;font-family:"Songti SC",SimSun,serif;line-height:2}h1,h2{line-height:1.6}nav a{display:block;color:inherit}section{padding:35px 0;border-top:1px solid #ccd1c9}p{white-space:normal;overflow-wrap:anywhere}section p{text-indent:2em}footer{font:12px sans-serif;color:#617471}a:focus-visible{outline:2px solid #8c6631}@media(prefers-color-scheme:dark){body{background:#152729;color:#d4dfd7}}@media print{nav{display:none}}</style></head><body><h1>${escapeHtml(data.title)}</h1>${renderParagraphs(data.summary)}<nav aria-label="章节目录"><h2>目录</h2>${data.chapters.map((chapter,i)=>`<a href="#chapter-${i+1}">${escapeHtml(chapter.title)}</a>`).join('\n')}</nav>${data.chapters.map((chapter,i)=>`<section id="chapter-${i+1}"><h2>${escapeHtml(chapter.title)}</h2>${renderParagraphs(chapter.paragraphs)}<a href="#">回到目录</a></section>`).join('\n')}<footer>由 NovelAgent 在本机整理。是否使用 AI 及发布条件由作者核实；本文件尚未上传任何平台。</footer></body></html>\n`;
}
