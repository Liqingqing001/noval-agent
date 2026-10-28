import type { Message } from '../types';
import type { ModificationResult } from './modificationInstructions';

const labels = { outlineCount: '条大纲', characterCount: '个人物', worldCount: '条世界观', chapterCount: '章正文', modifyCount: '项修改', deleteCount: '项删除', insertCount: '项插入', replaceCount: '项替换', mergeCount: '项合并', splitCount: '项拆分', reorderCount: '项排序' };
type FeedbackResult = Partial<Record<keyof typeof labels, number>> & { basicInfo?: boolean; modificationResults?: ModificationResult[] };

export function syncFeedback(result: FeedbackResult): NonNullable<Message['syncStatus']> {
  const parts = result.basicInfo ? ['基本信息'] : [];
  for (const key of Object.keys(labels) as Array<keyof typeof labels>) if (Number(result[key]) > 0) parts.push(`${result[key]} ${labels[key]}`);
  const modifications = result.modificationResults || [];
  if (modifications.length) {
    const failed = modifications.filter(item => item.state === 'failed').length;
    const unchanged = modifications.filter(item => item.state === 'already-applied').length;
    const summary = parts.length ? `已写入本地面板：${parts.join('、')}` : '修改检查完成，未写入新内容';
    return {
      state: failed ? 'warning' : 'success',
      message: `${summary}${unchanged ? `；${unchanged} 项已包含新内容，未重复写入` : ''}${failed ? `；${failed} 项未执行，请查看修改结果` : ''}`,
      details: modifications.map(item => `第 ${item.index} 条${item.target ? ` · ${item.target}` : ''}${item.title ? `《${item.title}》` : ''}：${item.message}`),
    };
  }
  return parts.length
    ? { state: 'success', message: `已写入本地面板：${parts.join('、')}` }
    : { state: 'warning', message: '未识别到有效字段，尚未同步。请检查名称、标题和内容是否齐全。' };
}
