import type { Message } from '../types';

export function syncFeedback(result: Record<string, number | boolean>): NonNullable<Message['syncStatus']> {
  const labels: Record<string, string> = { outlineCount: '条大纲', characterCount: '个人物', worldCount: '条世界观', chapterCount: '章正文', modifyCount: '项修改', deleteCount: '项删除', insertCount: '项插入', replaceCount: '项替换', mergeCount: '项合并', splitCount: '项拆分', reorderCount: '项排序' };
  const parts = result.basicInfo ? ['基本信息'] : [];
  for (const [key, label] of Object.entries(labels)) if (Number(result[key]) > 0) parts.push(`${result[key]} ${label}`);
  return parts.length
    ? { state: 'success', message: `已写入本地面板：${parts.join('、')}` }
    : { state: 'warning', message: '未识别到有效字段，尚未同步。请检查名称、标题和内容是否齐全。' };
}
