// 自动同步工具
// 解析 AI 响应中的结构化内容并同步到 store

import { useNovelStore } from '@/stores/novelStore';

/**
 * 解析修改指令
 */
interface ModifyInstruction {
  target: '章节' | '大纲' | '角色' | '世界观';
  title?: string;  // 章节/大纲/世界观的标题
  name?: string;   // 角色的姓名
  field?: string;  // 角色的字段（性格、背景等）
  originalContent: string;
  newContent: string;
}

export function parseModifyInstructions(content: string): ModifyInstruction[] {
  const results: ModifyInstruction[] = [];

  const regex = /【修改】([\s\S]*?)【\/修改】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const instruction: Partial<ModifyInstruction> = {};

    // 解析目标
    const targetMatch = block.match(/目标[：:]\s*(章节|大纲|角色|世界观)/);
    if (targetMatch) instruction.target = targetMatch[1] as ModifyInstruction['target'];

    // 解析标题
    const titleMatch = block.match(/标题[：:]\s*(.+?)(?:\n|原内容|$)/);
    if (titleMatch) instruction.title = titleMatch[1].trim();

    // 解析姓名（角色专用）
    const nameMatch = block.match(/姓名[：:]\s*(.+?)(?:\n|字段|$)/);
    if (nameMatch) instruction.name = nameMatch[1].trim();

    // 解析字段（角色专用）
    const fieldMatch = block.match(/字段[：:]\s*(.+?)(?:\n|原内容|$)/);
    if (fieldMatch) instruction.field = fieldMatch[1].trim();

    // 解析原内容
    const originalMatch = block.match(/原内容[：:]\s*([\s\S]+?)(?:\n新内容|$)/);
    if (originalMatch) instruction.originalContent = originalMatch[1].trim();

    // 解析新内容
    const newMatch = block.match(/新内容[：:]\s*([\s\S]+?)(?:【|$)/);
    if (newMatch) instruction.newContent = newMatch[1].trim();

    if (instruction.target && instruction.originalContent && instruction.newContent) {
      results.push(instruction as ModifyInstruction);
    }
  }

  return results;
}

/**
 * 解析删除指令
 */
interface DeleteInstruction {
  target: '章节' | '大纲' | '角色' | '世界观';
  title?: string;
  name?: string;
}

export function parseDeleteInstructions(content: string): DeleteInstruction[] {
  const results: DeleteInstruction[] = [];

  const regex = /【删除】([\s\S]*?)【\/删除】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const instruction: Partial<DeleteInstruction> = {};

    const targetMatch = block.match(/目标[：:]\s*(章节|大纲|角色|世界观)/);
    if (targetMatch) instruction.target = targetMatch[1] as DeleteInstruction['target'];

    const titleMatch = block.match(/标题[：:]\s*(.+?)(?:\n|【|$)/);
    if (titleMatch) instruction.title = titleMatch[1].trim();

    const nameMatch = block.match(/姓名[：:]\s*(.+?)(?:\n|【|$)/);
    if (nameMatch) instruction.name = nameMatch[1].trim();

    if (instruction.target) {
      results.push(instruction as DeleteInstruction);
    }
  }

  return results;
}

/**
 * 解析插入章节指令
 */
interface InsertChapterInstruction {
  position: string;  // 如 "第二章之后"、"第一章之前"
  title: string;
  content: string;
}

function parseInsertChapterInstructions(content: string): InsertChapterInstruction[] {
  const results: InsertChapterInstruction[] = [];
  const regex = /【插入章节】([\s\S]*?)【\/插入章节】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const instruction: Partial<InsertChapterInstruction> = {};

    const positionMatch = block.match(/位置[：:]\s*(.+?)(?:\n|标题|$)/);
    if (positionMatch) instruction.position = positionMatch[1].trim();

    const titleMatch = block.match(/标题[：:]\s*(.+?)(?:\n|内容|$)/);
    if (titleMatch) instruction.title = titleMatch[1].trim();

    const contentMatch = block.match(/内容[：:]\s*([\s\S]+?)(?:【|$)/);
    if (contentMatch) instruction.content = contentMatch[1].trim();

    if (instruction.position && instruction.title && instruction.content) {
      results.push(instruction as InsertChapterInstruction);
    }
  }

  return results;
}

/**
 * 解析替换指令（不同于修改，替换是整个内容替换）
 */
interface ReplaceInstruction {
  target: '章节' | '大纲';
  title: string;
  original?: string;
  newContent: string;
}

function parseReplaceInstructions(content: string): ReplaceInstruction[] {
  const results: ReplaceInstruction[] = [];
  const regex = /【替换】([\s\S]*?)【\/替换】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const instruction: Partial<ReplaceInstruction> = {};

    const targetMatch = block.match(/目标[：:]\s*(章节|大纲)/);
    if (targetMatch) instruction.target = targetMatch[1] as '章节' | '大纲';

    const titleMatch = block.match(/标题[：:]\s*(.+?)(?:\n|原内容|$)/);
    if (titleMatch) instruction.title = titleMatch[1].trim();

    const originalMatch = block.match(/原内容[：:]\s*([\s\S]+?)(?:\n新内容|$)/);
    if (originalMatch) instruction.original = originalMatch[1].trim();

    const newMatch = block.match(/新内容[：:]\s*([\s\S]+?)(?:【|$)/);
    if (newMatch) instruction.newContent = newMatch[1].trim();

    if (instruction.target && instruction.title && instruction.newContent) {
      results.push(instruction as ReplaceInstruction);
    }
  }

  return results;
}

/**
 * 解析合并章节指令
 */
interface MergeChaptersInstruction {
  sources: string[];  // 要合并的章节标题列表
  newTitle: string;
  newContent: string;
}

function parseMergeChaptersInstructions(content: string): MergeChaptersInstruction[] {
  const results: MergeChaptersInstruction[] = [];
  const regex = /【合并章节】([\s\S]*?)【\/合并章节】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const instruction: Partial<MergeChaptersInstruction> = {};

    const sourcesMatch = block.match(/源章节[：:]\s*(.+?)(?:\n|新标题|$)/);
    if (sourcesMatch) {
      instruction.sources = sourcesMatch[1].split(/[、,，]/).map(s => s.trim());
    }

    const titleMatch = block.match(/新标题[：:]\s*(.+?)(?:\n|新内容|$)/);
    if (titleMatch) instruction.newTitle = titleMatch[1].trim();

    const contentMatch = block.match(/新内容[：:]\s*([\s\S]+?)(?:【|$)/);
    if (contentMatch) instruction.newContent = contentMatch[1].trim();

    if (instruction.sources && instruction.newTitle && instruction.newContent) {
      results.push(instruction as MergeChaptersInstruction);
    }
  }

  return results;
}

/**
 * 解析拆分章节指令
 */
interface SplitChapterInstruction {
  source: string;  // 要拆分的章节标题
  newChapters: { title: string; content: string }[];
}

function parseSplitChapterInstructions(content: string): SplitChapterInstruction[] {
  const results: SplitChapterInstruction[] = [];
  const regex = /【拆分章节】([\s\S]*?)【\/拆分章节】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const instruction: Partial<SplitChapterInstruction> = {};

    const sourceMatch = block.match(/源章节[：:]\s*(.+?)(?:\n|新章节|$)/);
    if (sourceMatch) instruction.source = sourceMatch[1].trim();

    // 解析新章节列表
    const newChaptersMatch = block.match(/新章节[：:]\s*([\s\S]+?)(?:【|$)/);
    if (newChaptersMatch) {
      const newChaptersText = newChaptersMatch[1];
      const chapterRegex = /[-•]\s*标题[：:]\s*(.+?)\n\s*内容[：:]\s*([\s\S]+?)(?=\n[-•]|$)/g;
      const newChapters: { title: string; content: string }[] = [];
      let chapterMatch;
      while ((chapterMatch = chapterRegex.exec(newChaptersText)) !== null) {
        newChapters.push({
          title: chapterMatch[1].trim(),
          content: chapterMatch[2].trim(),
        });
      }
      instruction.newChapters = newChapters;
    }

    if (instruction.source && instruction.newChapters && instruction.newChapters.length > 0) {
      results.push(instruction as SplitChapterInstruction);
    }
  }

  return results;
}

/**
 * 解析调整顺序指令
 */
interface ReorderInstruction {
  type: '章节' | '大纲';
  newOrder: string[];  // 新顺序的标题列表
}

function parseReorderInstructions(content: string): ReorderInstruction[] {
  const results: ReorderInstruction[] = [];
  const regex = /【调整顺序】([\s\S]*?)【\/调整顺序】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const instruction: Partial<ReorderInstruction> = {};

    const typeMatch = block.match(/类型[：:]\s*(章节|大纲)/);
    if (typeMatch) instruction.type = typeMatch[1] as '章节' | '大纲';

    const orderMatch = block.match(/新顺序[：:]\s*(.+?)(?:【|$)/);
    if (orderMatch) {
      instruction.newOrder = orderMatch[1].split(/[、,，]/).map(s => s.trim());
    }

    if (instruction.type && instruction.newOrder && instruction.newOrder.length > 0) {
      results.push(instruction as ReorderInstruction);
    }
  }

  return results;
}

/**
 * 插入章节到指定位置
 */
function insertChapterAtPosition(novelId: string, position: string, title: string, chapterContent: string): boolean {
  const store = useNovelStore.getState();
  const chapters = store.chapters.filter(c => c.novelId === novelId).sort((a, b) => a.sequence - b.sequence);

  // 解析位置描述
  let insertIndex = chapters.length; // 默认插入到最后

  // 匹配 "第X章之后" 或 "第X章之前"
  const afterMatch = position.match(/第?[零一二三四五六七八九十\d]+章?之后$/);
  const beforeMatch = position.match(/第?[零一二三四五六七八九十\d]+章?之前$/);
  const afterTitleMatch = position.match(/(.+)之后$/);
  const beforeTitleMatch = position.match(/(.+)之前$/);

  if (afterMatch) {
    // 按序号匹配
    const chapterNum = chineseToNumber(afterMatch[0].replace(/之后$/, '').replace(/第/, '').replace(/章$/, ''));
    insertIndex = chapterNum;
  } else if (beforeMatch) {
    const chapterNum = chineseToNumber(beforeMatch[0].replace(/之前$/, '').replace(/第/, '').replace(/章$/, ''));
    insertIndex = chapterNum - 1;
  } else if (afterTitleMatch) {
    // 按标题匹配
    const targetTitle = afterTitleMatch[1].trim();
    const targetChapter = chapters.find(c => c.title.includes(targetTitle) || targetTitle.includes(c.title));
    if (targetChapter) {
      insertIndex = targetChapter.sequence + 1;
    }
  } else if (beforeTitleMatch) {
    const targetTitle = beforeTitleMatch[1].trim();
    const targetChapter = chapters.find(c => c.title.includes(targetTitle) || targetTitle.includes(c.title));
    if (targetChapter) {
      insertIndex = targetChapter.sequence;
    }
  }

  // 创建新章节
  const newChapter = {
    id: `chapter-${Date.now()}`,
    novelId,
    title,
    content: chapterContent,
    wordCount: chapterContent.length,
    sequence: insertIndex,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 更新其他章节的 sequence
  chapters.forEach(c => {
    if (c.sequence >= insertIndex) {
      store.updateChapter(c.id, { sequence: c.sequence + 1 });
    }
  });

  // 添加新章节
  store.addChapter(newChapter as any);
  console.log(`插入章节 "${title}" 到位置 ${insertIndex}`);
  return true;
}

/**
 * 中文数字转阿拉伯数字
 */
function chineseToNumber(str: string): number {
  const chineseNumbers: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14,
    '十五': 15, '十六': 16, '十七': 17, '十八': 18, '十九': 19,
    '二十': 20,
  };

  // 如果是纯数字
  const num = parseInt(str);
  if (!isNaN(num)) return num;

  // 中文数字
  if (chineseNumbers[str]) return chineseNumbers[str];

  // 处理 "二十一" 等格式
  if (str.includes('十')) {
    const parts = str.split('十');
    if (parts.length === 2) {
      const tens = parts[0] ? chineseToNumber(parts[0]) * 10 : 10;
      const ones = parts[1] ? chineseToNumber(parts[1]) : 0;
      return tens + ones;
    }
  }

  return 1;
}

/**
 * 替换章节或大纲的全部内容
 */
function replaceContent(novelId: string, target: '章节' | '大纲', title: string, newContent: string): boolean {
  const store = useNovelStore.getState();

  if (target === '章节') {
    const chapter = store.chapters.find(c =>
      c.novelId === novelId &&
      (c.title.trim() === title.trim() || c.title.includes(title) || title.includes(c.title))
    );
    if (chapter) {
      store.updateChapter(chapter.id, {
        content: newContent,
        wordCount: newContent.length,
        updatedAt: Date.now(),
      });
      console.log(`替换章节 "${title}" 的内容`);
      return true;
    }
  } else if (target === '大纲') {
    const plotCard = store.plotCards.find(p =>
      p.novelId === novelId &&
      (p.title.trim() === title.trim() || p.title.includes(title) || title.includes(p.title))
    );
    if (plotCard) {
      store.updatePlotCard(plotCard.id, {
        summary: newContent,
        updatedAt: Date.now(),
      });
      console.log(`替换大纲 "${title}" 的内容`);
      return true;
    }
  }

  return false;
}

/**
 * 合并多个章节
 */
function mergeChapters(novelId: string, sources: string[], newTitle: string, newContent: string): boolean {
  const store = useNovelStore.getState();
  const chapters = store.chapters.filter(c => c.novelId === novelId).sort((a, b) => a.sequence - b.sequence);

  // 找到要合并的章节
  const sourceChapters = sources.map(title =>
    chapters.find(c => c.title.includes(title) || title.includes(c.title))
  ).filter(Boolean);

  if (sourceChapters.length === 0) {
    console.log('未找到要合并的章节');
    return false;
  }

  // 删除源章节
  sourceChapters.forEach(c => {
    if (c) store.deleteChapter(c.id);
  });

  // 在第一个源章节的位置插入新章节
  const firstSequence = sourceChapters[0]?.sequence || 0;

  store.addChapter({
    novelId,
    title: newTitle,
    content: newContent,
    wordCount: newContent.length,
    sequence: firstSequence,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any);

  console.log(`合并章节 "${sources.join('、')}" 为 "${newTitle}"`);
  return true;
}

/**
 * 拆分章节
 */
function splitChapter(novelId: string, source: string, newChapters: { title: string; content: string }[]): boolean {
  const store = useNovelStore.getState();
  const chapters = store.chapters.filter(c => c.novelId === novelId).sort((a, b) => a.sequence - b.sequence);

  // 找到要拆分的章节
  const sourceChapter = chapters.find(c => c.title.includes(source) || source.includes(c.title));
  if (!sourceChapter) {
    console.log('未找到要拆分的章节');
    return false;
  }

  const sourceSequence = sourceChapter.sequence;

  // 删除源章节
  store.deleteChapter(sourceChapter.id);

  // 插入新章节
  newChapters.forEach((newChapter, index) => {
    store.addChapter({
      novelId,
      title: newChapter.title,
      content: newChapter.content,
      wordCount: newChapter.content.length,
      sequence: sourceSequence + index,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any);
  });

  console.log(`拆分章节 "${source}" 为 ${newChapters.length} 个新章节`);
  return true;
}

/**
 * 调整章节或大纲顺序
 */
function reorderItems(novelId: string, type: '章节' | '大纲', newOrder: string[]): boolean {
  const store = useNovelStore.getState();

  if (type === '章节') {
    const chapters = store.chapters.filter(c => c.novelId === novelId);

    // 按新顺序更新 sequence
    newOrder.forEach((title, index) => {
      const chapter = chapters.find(c => c.title.includes(title) || title.includes(c.title));
      if (chapter) {
        store.updateChapter(chapter.id, { sequence: index });
      }
    });

    console.log(`调整章节顺序: ${newOrder.join(' → ')}`);
    return true;
  } else if (type === '大纲') {
    const plotCards = store.plotCards.filter(p => p.novelId === novelId);

    newOrder.forEach((title, index) => {
      const plotCard = plotCards.find(p => p.title.includes(title) || title.includes(p.title));
      if (plotCard) {
        store.updatePlotCard(plotCard.id, { sequence: index });
      }
    });

    console.log(`调整大纲顺序: ${newOrder.join(' → ')}`);
    return true;
  }

  return false;
}

/**
 * 精准修改章节内容
 */
function modifyChapterContent(novelId: string, title: string, original: string, newContent: string): boolean {
  const store = useNovelStore.getState();
  const chapter = store.chapters.find(c =>
    c.novelId === novelId &&
    (c.title.trim() === title.trim() ||
     c.title.replace(/第?[零一二三四五六七八九十百千万\d]+章?[\s:：]*/g, '').trim() === title.trim())
  );

  if (!chapter) {
    console.log(`未找到章节: ${title}`);
    return false;
  }

  // 检查原内容是否存在于章节中
  if (!chapter.content.includes(original)) {
    console.log(`章节 "${title}" 中未找到原内容: "${original.slice(0, 50)}..."`);
    return false;
  }

  // 替换内容
  const newChapterContent = chapter.content.replace(original, newContent);
  store.updateChapter(chapter.id, {
    content: newChapterContent,
    wordCount: newChapterContent.length,
  });

  console.log(`已修改章节 "${title}"：将 "${original.slice(0, 30)}..." 替换为 "${newContent.slice(0, 30)}..."`);
  return true;
}

/**
 * 精准修改大纲
 */
function modifyPlotCard(novelId: string, title: string, original: string, newContent: string): boolean {
  const store = useNovelStore.getState();
  const plotCard = store.plotCards.find(p =>
    p.novelId === novelId &&
    p.title.trim() === title.trim()
  );

  if (!plotCard) {
    console.log(`未找到大纲: ${title}`);
    return false;
  }

  // 替换摘要中的内容
  const newSummary = plotCard.summary?.replace(original, newContent) || newContent;
  store.updatePlotCard(plotCard.id, { summary: newSummary });

  console.log(`已修改大纲 "${title}"`);
  return true;
}

/**
 * 精准修改角色
 */
function modifyCharacter(novelId: string, name: string, field: string, _original: string, newContent: string): boolean {
  const store = useNovelStore.getState();
  const character = store.characters.find(c =>
    c.novelId === novelId && c.name.trim() === name.trim()
  );

  if (!character) {
    console.log(`未找到角色: ${name}`);
    return false;
  }

  // 根据字段更新
  const fieldMap: Record<string, keyof typeof character> = {
    '性格': 'personality',
    '背景': 'background',
    '外貌': 'appearance',
    '描述': 'description',
    '简介': 'description',
  };

  const targetField = fieldMap[field] || field.toLowerCase() as keyof typeof character;

  store.updateCharacter(character.id, { [targetField]: newContent });
  console.log(`已修改角色 "${name}" 的 ${field}`);
  return true;
}

/**
 * 精准修改世界观
 */
function modifyWorldSetting(novelId: string, title: string, original: string, newContent: string): boolean {
  const store = useNovelStore.getState();
  const worldSetting = store.worldSettings.find(w =>
    w.novelId === novelId && w.title.trim() === title.trim()
  );

  if (!worldSetting) {
    console.log(`未找到世界观: ${title}`);
    return false;
  }

  // 替换内容
  const newWorldContent = worldSetting.content?.replace(original, newContent) || newContent;
  store.updateWorldSetting(worldSetting.id, { content: newWorldContent });

  console.log(`已修改世界观 "${title}"`);
  return true;
}

/**
 * 删除内容
 */
function deleteContent(novelId: string, instruction: DeleteInstruction): boolean {
  const store = useNovelStore.getState();

  switch (instruction.target) {
    case '章节':
      const chapter = store.chapters.find(c =>
        c.novelId === novelId && c.title.trim() === instruction.title?.trim()
      );
      if (chapter) {
        store.deleteChapter(chapter.id);
        console.log(`已删除章节: ${instruction.title}`);
        return true;
      }
      break;

    case '大纲':
      const plotCard = store.plotCards.find(p =>
        p.novelId === novelId && p.title.trim() === instruction.title?.trim()
      );
      if (plotCard) {
        store.deletePlotCard(plotCard.id);
        console.log(`已删除大纲: ${instruction.title}`);
        return true;
      }
      break;

    case '角色':
      const character = store.characters.find(c =>
        c.novelId === novelId && c.name.trim() === instruction.name?.trim()
      );
      if (character) {
        store.deleteCharacter(character.id);
        console.log(`已删除角色: ${instruction.name}`);
        return true;
      }
      break;

    case '世界观':
      const worldSetting = store.worldSettings.find(w =>
        w.novelId === novelId && w.title.trim() === instruction.title?.trim()
      );
      if (worldSetting) {
        store.deleteWorldSetting(worldSetting.id);
        console.log(`已删除世界观: ${instruction.title}`);
        return true;
      }
      break;
  }

  return false;
}

/**
 * 解析 AI 响应中的基本信息
 */
export function parseBasicInfo(content: string): { genre?: string; summary?: string } | null {
  const match = content.match(/【基本信息】([\s\S]*?)【\/基本信息】/);
  if (!match) return null;

  const block = match[1];
  const result: { genre?: string; summary?: string } = {};

  // 解析题材
  const genreMatch = block.match(/题材[：:]\s*(.+?)(?:\n|简介|$)/);
  if (genreMatch) {
    result.genre = genreMatch[1].trim();
  }

  // 解析简介 - 使用更宽松的匹配
  const summaryMatch = block.match(/简介[：:]\s*([\s\S]+?)(?:【|$)/);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * 解析卷大纲
 */
export function parseVolumeContent(content: string): Array<{ title: string; summary: string }> {
  const results: Array<{ title: string; summary: string }> = [];
  const regex = /【卷】([\s\S]*?)【\/卷】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/标题[：:]\s*(.+?)(?:\n|概要|$)/);
    const summaryMatch = block.match(/概要[：:]\s*([\s\S]+?)(?:【|$)/);

    if (titleMatch) {
      results.push({
        title: titleMatch[1].trim(),
        summary: summaryMatch ? summaryMatch[1].trim() : '',
      });
    }
  }

  return results;
}

/**
 * 解析章节大纲（带卷关联）
 */
export function parseChapterOutlineContent(content: string): Array<{ volumeTitle?: string; chapters: Array<{ title: string; summary: string }> }> {
  const results: Array<{ volumeTitle?: string; chapters: Array<{ title: string; summary: string }> }> = [];
  const regex = /【章节大纲】([\s\S]*?)【\/章节大纲】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const volumeMatch = block.match(/卷[：:]\s*(.+?)(?:\n|第|$)/);
    const volumeTitle = volumeMatch ? volumeMatch[1].trim() : undefined;

    const chapters: Array<{ title: string; summary: string }> = [];
    // 匹配章节格式：第X章 标题 - 摘要
    const chapterRegex = /第[零一二三四五六七八九十百千万\d]+章[\s]*(.+?)[\s]*[-—－][\s]*(.+)/g;
    let chapterMatch;

    while ((chapterMatch = chapterRegex.exec(block)) !== null) {
      chapters.push({
        title: chapterMatch[1].trim(),
        summary: chapterMatch[2].trim(),
      });
    }

    if (chapters.length > 0 || volumeTitle) {
      results.push({ volumeTitle, chapters });
    }
  }

  return results;
}

/**
 * 解析 AI 响应中的大纲内容
 */
export function parseOutlineContent(content: string): Array<{ title: string; summary: string }> {
  const results: Array<{ title: string; summary: string }> = [];

  const outlineMatch = content.match(/【大纲】([\s\S]*?)【\/大纲】/);
  if (outlineMatch) {
    const lines = outlineMatch[1].split('\n').filter(l => l.trim());
    lines.forEach(line => {
      // 尝试多种格式
      // 格式1：第一章：觉醒 - 主角觉醒能力
      // 格式2：第一章 觉醒：主角觉醒能力
      // 格式3：1. 觉醒 - 主角觉醒能力

      let title = '';
      let summary = '';

      // 尝试匹配 "xxx - xxx" 格式
      const dashMatch = line.match(/^(.+?)[\s]*[-—－][\s]*(.+)$/);
      if (dashMatch) {
        title = dashMatch[1].trim();
        summary = dashMatch[2].trim();
      } else {
        // 尝试匹配 "xxx：xxx" 格式
        const colonMatch = line.match(/^(.+?)[：:]\s*(.+)$/);
        if (colonMatch) {
          title = colonMatch[1].trim();
          summary = colonMatch[2].trim();
        } else if (line.trim()) {
          // 只有标题
          title = line.trim();
        }
      }

      if (title) {
        results.push({ title, summary });
      }
    });
  }

  return results;
}

/**
 * 解析 AI 响应中的角色内容
 */
export function parseCharacterContent(content: string): Array<Record<string, string>> {
  const results: Array<Record<string, string>> = [];

  const regex = /【角色】([\s\S]*?)【\/角色】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const character: Record<string, string> = {};

    const lines = block.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      const lineMatch = line.match(/^(.+?)[：:]\s*(.+)$/);
      if (lineMatch) {
        const key = lineMatch[1].trim();
        const value = lineMatch[2].trim();

        if (key.includes('姓名') || key.includes('名字')) {
          character.name = value;
        } else if (key.includes('性格')) {
          character.personality = value;
        } else if (key.includes('背景')) {
          character.background = value;
        } else if (key.includes('外貌')) {
          character.appearance = value;
        } else if (key.includes('描述') || key.includes('简介')) {
          character.description = value;
        } else {
          character[key.toLowerCase()] = value;
        }
      }
    });

    if (character.name) {
      results.push(character);
    }
  }

  return results;
}

/**
 * 解析 AI 响应中的世界观内容
 */
export function parseWorldContent(content: string): Array<Record<string, string>> {
  const results: Array<Record<string, string>> = [];

  const regex = /【世界观】([\s\S]*?)【\/世界观】/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const world: Record<string, string> = {};

    const lines = block.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      const lineMatch = line.match(/^(.+?)[：:]\s*(.+)$/);
      if (lineMatch) {
        const key = lineMatch[1].trim();
        const value = lineMatch[2].trim();

        if (key.includes('分类') || key.includes('类别')) {
          world.category = value;
        } else if (key.includes('名称') || key.includes('标题')) {
          world.title = value;
        } else if (key.includes('内容') || key.includes('描述')) {
          world.content = value;
        } else {
          world[key.toLowerCase()] = value;
        }
      }
    });

    if (world.title) {
      results.push(world);
    }
  }

  return results;
}

/**
 * 解析 AI 响应中的章节内容
 * 格式：
 * 【章节】
 * 标题：第一章 觉醒
 * 内容：
 * 林风走在山路上，突然一道光芒从天而降...
 *
 * 光芒消散后，林风发现自己体内多了一股奇异的能量...
 * 【/章节】
 */
export function parseChapterContent(content: string): Array<{ title: string; content: string }> {
  const results: Array<{ title: string; content: string }> = [];

  // 先匹配完整闭合的章节
  const closedRegex = /【章节】([\s\S]*?)【\/章节】/g;
  let match;
  let matchCount = 0;

  while ((match = closedRegex.exec(content)) !== null) {
    matchCount++;
    const block = match[1];
    let title = '';
    let chapterContent = '';

    console.log(`📝 解析章节 #${matchCount}, block 长度: ${block.length}`);

    // 解析标题
    const titleMatch = block.match(/标题[：:]\s*(.+?)(?:\n|内容|$)/);
    if (titleMatch) {
      title = titleMatch[1].trim();
      console.log(`  标题: "${title}"`);
    } else {
      console.warn(`  ⚠️ 未找到标题`);
    }

    // 解析内容
    let contentMatch = block.match(/内容[：:][\s]*([\s\S]+)$/);
    if (!contentMatch) {
      contentMatch = block.match(/内容[：:][\s]*([\s\S]+?)(?=【|$)/);
    }
    if (!contentMatch) {
      contentMatch = block.match(/内容[：:]\s*([\s\S]+)/);
    }

    if (contentMatch) {
      chapterContent = contentMatch[1].trim();
      if (chapterContent.endsWith('【')) {
        chapterContent = chapterContent.slice(0, -1).trim();
      }
      console.log(`  内容长度: ${chapterContent.length}字`);
    } else {
      console.warn(`  ⚠️ 未找到内容`);
    }

    if (title) {
      results.push({ title, content: chapterContent });
    }
  }

  // 再检查未闭合的章节（AI被截断的情况）
  const openRegex = /【章节】([\s\S]*?)(?=【章节】|【\/章节】|$)/g;
  while ((match = openRegex.exec(content)) !== null) {
    const block = match[1];
    if (!block.trim()) continue;

    // 检查是否已被完整闭合处理过
    const titleMatch = block.match(/标题[：:]\s*(.+?)(?:\n|内容|$)/);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();

    // 检查是否已存在
    if (results.some(r => r.title === title)) continue;

    console.log(`📝 解析未闭合章节: "${title}"`);

    let chapterContent = '';
    const contentMatch = block.match(/内容[：:][\s]*([\s\S]+)$/);
    if (contentMatch) {
      chapterContent = contentMatch[1].trim();
    }

    if (title && chapterContent.length > 50) { // 至少50字才同步
      results.push({ title, content: chapterContent });
      console.log(`  ✅ 已同步未闭合章节，内容长度: ${chapterContent.length}字`);
    }
  }

  console.log(`📊 共解析 ${results.length} 个章节`);
  return results;
}

/**
 * 自动同步 AI 响应中的所有内容到 store
 * 如果已存在同名/同标题的内容，则更新而不是追加
 * 支持精准修改指令、插入、替换、合并、拆分、调整顺序
 */
export function autoSyncContent(content: string, novelId: string): {
  basicInfo: boolean;
  outlineCount: number;
  characterCount: number;
  worldCount: number;
  chapterCount: number;
  modifyCount: number;
  deleteCount: number;
  insertCount: number;
  replaceCount: number;
  mergeCount: number;
  splitCount: number;
  reorderCount: number;
} {
  const store = useNovelStore.getState();
  const result = {
    basicInfo: false,
    outlineCount: 0,
    characterCount: 0,
    worldCount: 0,
    chapterCount: 0,
    modifyCount: 0,
    deleteCount: 0,
    insertCount: 0,
    replaceCount: 0,
    mergeCount: 0,
    splitCount: 0,
    reorderCount: 0,
  };

  // 优先处理插入章节指令
  const insertInstructions = parseInsertChapterInstructions(content);
  if (insertInstructions.length > 0) {
    insertInstructions.forEach(instruction => {
      const success = insertChapterAtPosition(novelId, instruction.position, instruction.title, instruction.content);
      if (success) result.insertCount++;
    });
  }

  // 处理替换指令
  const replaceInstructions = parseReplaceInstructions(content);
  if (replaceInstructions.length > 0) {
    replaceInstructions.forEach(instruction => {
      const success = replaceContent(novelId, instruction.target, instruction.title, instruction.newContent);
      if (success) result.replaceCount++;
    });
  }

  // 处理合并章节指令
  const mergeInstructions = parseMergeChaptersInstructions(content);
  if (mergeInstructions.length > 0) {
    mergeInstructions.forEach(instruction => {
      const success = mergeChapters(novelId, instruction.sources, instruction.newTitle, instruction.newContent);
      if (success) result.mergeCount++;
    });
  }

  // 处理拆分章节指令
  const splitInstructions = parseSplitChapterInstructions(content);
  if (splitInstructions.length > 0) {
    splitInstructions.forEach(instruction => {
      const success = splitChapter(novelId, instruction.source, instruction.newChapters);
      if (success) result.splitCount++;
    });
  }

  // 处理调整顺序指令
  const reorderInstructions = parseReorderInstructions(content);
  if (reorderInstructions.length > 0) {
    reorderInstructions.forEach(instruction => {
      const success = reorderItems(novelId, instruction.type, instruction.newOrder);
      if (success) result.reorderCount++;
    });
  }

  // 优先处理修改指令
  const modifyInstructions = parseModifyInstructions(content);
  if (modifyInstructions.length > 0) {
    modifyInstructions.forEach(instruction => {
      let success = false;
      switch (instruction.target) {
        case '章节':
          success = modifyChapterContent(novelId, instruction.title!, instruction.originalContent, instruction.newContent);
          break;
        case '大纲':
          success = modifyPlotCard(novelId, instruction.title!, instruction.originalContent, instruction.newContent);
          break;
        case '角色':
          success = modifyCharacter(novelId, instruction.name!, instruction.field!, instruction.originalContent, instruction.newContent);
          break;
        case '世界观':
          success = modifyWorldSetting(novelId, instruction.title!, instruction.originalContent, instruction.newContent);
          break;
      }
      if (success) result.modifyCount++;
    });
  }

  // 处理删除指令
  const deleteInstructions = parseDeleteInstructions(content);
  if (deleteInstructions.length > 0) {
    deleteInstructions.forEach(instruction => {
      const success = deleteContent(novelId, instruction);
      if (success) result.deleteCount++;
    });
  }

  // 同步基本信息
  const basicInfo = parseBasicInfo(content);
  if (basicInfo) {
    store.updateNovel(novelId, basicInfo as any);
    result.basicInfo = true;
  }

  // 同步卷大纲
  const volumes = parseVolumeContent(content);
  if (volumes.length > 0) {
    const existingVolumes = store.plotCards.filter(c => c.novelId === novelId && c.type === 'volume');
    volumes.forEach((vol) => {
      const existingVol = existingVolumes.find(v => v.title.trim() === vol.title.trim());
      if (existingVol) {
        store.updatePlotCard(existingVol.id, {
          summary: vol.summary,
          updatedAt: Date.now(),
        });
        console.log(`更新卷: ${vol.title}`);
      } else {
        store.addPlotCard({
          novelId,
          type: 'volume',
          title: vol.title,
          summary: vol.summary,
          sequence: existingVolumes.length,
          status: 'pending',
        });
        console.log(`新增卷: ${vol.title}`);
      }
      result.outlineCount++;
    });
  }

  // 同步章节大纲（带卷关联）
  const chapterOutlines = parseChapterOutlineContent(content);
  if (chapterOutlines.length > 0) {
    chapterOutlines.forEach(({ volumeTitle, chapters }) => {
      // 查找对应的卷ID
      let volumeId: string | undefined;
      if (volumeTitle) {
        const volume = store.plotCards.find(
          c => c.novelId === novelId && c.type === 'volume' && c.title.includes(volumeTitle)
        );
        volumeId = volume?.id;
      }

      const existingChapters = store.plotCards.filter(
        c => c.novelId === novelId && c.type === 'chapter' && c.volumeId === volumeId
      );

      chapters.forEach((ch) => {
        const existingChapter = existingChapters.find(
          c => c.title.trim() === ch.title.trim() || c.title.includes(ch.title) || ch.title.includes(c.title)
        );

        if (existingChapter) {
          store.updatePlotCard(existingChapter.id, {
            summary: ch.summary,
            updatedAt: Date.now(),
          });
          console.log(`更新章节大纲: ${ch.title}`);
        } else {
          store.addPlotCard({
            novelId,
            type: 'chapter',
            title: ch.title,
            summary: ch.summary,
            sequence: existingChapters.length + result.outlineCount,
            volumeId,
            status: 'pending',
          });
          console.log(`新增章节大纲: ${ch.title}`);
        }
        result.outlineCount++;
      });
    });
  }

  // 同步大纲 - 检查是否已存在同名，存在则更新
  const outlineItems = parseOutlineContent(content);
  if (outlineItems.length > 0) {
    const existingPlotCards = store.plotCards.filter(c => c.novelId === novelId);
    outlineItems.forEach((item) => {
      // 查找是否有同名的大纲
      const existingCard = existingPlotCards.find(
        c => c.title.trim() === item.title.trim() ||
             c.title.replace(/[第\d+章\s:：]*/, '').trim() === item.title.replace(/[第\d+章\s:：]*/, '').trim()
      );

      if (existingCard) {
        // 更新已有的大纲
        store.updatePlotCard(existingCard.id, {
          summary: item.summary,
          updatedAt: Date.now(),
        });
        console.log(`更新大纲: ${item.title}`);
      } else {
        // 添加新的大纲
        store.addPlotCard({
          novelId,
          type: 'chapter',
          title: item.title,
          summary: item.summary,
          sequence: existingPlotCards.length + result.outlineCount,
          status: 'pending',
        });
        console.log(`新增大纲: ${item.title}`);
      }
      result.outlineCount++;
    });
  }

  // 同步角色 - 检查是否已存在同名角色，存在则更新
  const characters = parseCharacterContent(content);
  if (characters.length > 0) {
    characters.forEach(char => {
      const existingChar = store.characters.find(
        c => c.novelId === novelId && c.name.trim() === (char.name || '').trim()
      );

      if (existingChar) {
        // 更新已有的角色
        store.updateCharacter(existingChar.id, {
          description: char.description || existingChar.description,
          personality: char.personality || existingChar.personality,
          background: char.background || existingChar.background,
          appearance: char.appearance || existingChar.appearance,
        });
        console.log(`更新角色: ${char.name}`);
      } else {
        // 添加新角色
        store.addCharacter({
          novelId,
          name: char.name || '新角色',
          aliases: [],
          description: char.description || '',
          personality: char.personality,
          background: char.background,
          appearance: char.appearance,
        });
        console.log(`新增角色: ${char.name}`);
      }
      result.characterCount++;
    });
  }

  // 同步世界观 - 检查是否已存在同标题，存在则更新
  const worlds = parseWorldContent(content);
  if (worlds.length > 0) {
    worlds.forEach(world => {
      const existingWorld = store.worldSettings.find(
        w => w.novelId === novelId && w.title.trim() === (world.title || '').trim()
      );

      if (existingWorld) {
        store.updateWorldSetting(existingWorld.id, {
          category: world.category || existingWorld.category,
          content: world.content || existingWorld.content,
        });
        console.log(`更新世界观: ${world.title}`);
      } else {
        store.addWorldSetting({
          novelId,
          category: world.category || '其他',
          title: world.title || '新设定',
          content: world.content || '',
        });
        console.log(`新增世界观: ${world.title}`);
      }
      result.worldCount++;
    });
  }

  // 同步章节 - 检查是否已存在同标题章节，存在则更新内容
  const chapters = parseChapterContent(content);
  if (chapters.length > 0) {
    const existingChapters = store.chapters.filter(c => c.novelId === novelId);
    console.log(`📚 当前小说 ${novelId} 已有 ${existingChapters.length} 个章节`);
    console.log(`📚 已有章节列表:`, existingChapters.map(c => c.title));

    chapters.forEach((chap) => {
      // 标准化标题进行匹配（去掉章节编号差异）
      const normalizeTitle = (title: string) => {
        return title.replace(/第?[零一二三四五六七八九十百千万\d]+章?[\s:：]*/g, '').trim();
      };

      const existingChapter = existingChapters.find(
        c => c.title.trim() === chap.title.trim() ||
             normalizeTitle(c.title) === normalizeTitle(chap.title)
      );

      if (existingChapter) {
        // 更新已有章节的内容（不是追加，是替换）
        const newContent = chap.content || '';
        store.updateChapter(existingChapter.id, {
          content: newContent,
          wordCount: newContent.length,
          updatedAt: Date.now(),
        });
        console.log(`更新章节: ${chap.title}，内容长度: ${newContent.length}字`);

        // 如果内容有更新，自动选中该章节
        if (newContent.length > 100 && store.currentChapterId !== existingChapter.id) {
          store.setCurrentChapter(existingChapter.id);
          console.log(`自动选中章节: ${chap.title}`);
        }

        // 更新对应的章节大纲状态为已完成
        const chapterOutline = store.plotCards.find(
          p => p.novelId === novelId && p.type === 'chapter' &&
               (p.title.trim() === chap.title.trim() || normalizeTitle(p.title) === normalizeTitle(chap.title))
        );
        if (chapterOutline && chapterOutline.status !== 'completed') {
          store.updatePlotCard(chapterOutline.id, {
            status: 'completed',
            chapterId: existingChapter.id,
            updatedAt: Date.now(),
          });
          console.log(`更新大纲状态为已完成: ${chapterOutline.title}`);
        }
      } else {
        // 添加新章节
        const processedContent = chap.content || '';
        const newChapter = store.addChapter({
          novelId,
          title: chap.title,
          content: processedContent,
          wordCount: processedContent.length,
          sequence: existingChapters.length + result.chapterCount,
        });
        console.log(`新增章节: ${chap.title}`);

        // 更新对应的章节大纲状态为已完成
        const chapterOutline = store.plotCards.find(
          p => p.novelId === novelId && p.type === 'chapter' &&
               (p.title.trim() === chap.title.trim() || normalizeTitle(p.title) === normalizeTitle(chap.title))
        );
        if (chapterOutline) {
          store.updatePlotCard(chapterOutline.id, {
            status: 'completed',
            chapterId: newChapter.id,
            updatedAt: Date.now(),
          });
          console.log(`更新大纲状态为已完成: ${chapterOutline.title}`);
        }
      }
      result.chapterCount++;
    });
  }

  console.log('自动同步完成:', result);
  return result;
}

/**
 * 检查内容是否包含可同步的结构化数据（放宽条件：支持未闭合标签）
 */
export function hasSyncableContent(content: string): boolean {
  // 完整闭合的标签
  const hasClosedTags = (
    /【基本信息】[\s\S]*?【\/基本信息】/.test(content) ||
    /【大纲】[\s\S]*?【\/大纲】/.test(content) ||
    /【角色】[\s\S]*?【\/角色】/.test(content) ||
    /【世界观】[\s\S]*?【\/世界观】/.test(content) ||
    /【章节】[\s\S]*?【\/章节】/.test(content) ||
    /【插入章节】[\s\S]*?【\/插入章节】/.test(content) ||
    /【替换】[\s\S]*?【\/替换】/.test(content) ||
    /【合并章节】[\s\S]*?【\/合并章节】/.test(content) ||
    /【拆分章节】[\s\S]*?【\/拆分章节】/.test(content) ||
    /【调整顺序】[\s\S]*?【\/调整顺序】/.test(content) ||
    /【修改】[\s\S]*?【\/修改】/.test(content) ||
    /【删除】[\s\S]*?【\/删除】/.test(content)
  );

  // 未闭合但有开始标签的情况（AI被截断时）
  const hasOpenTags = (
    /【章节】/.test(content) ||
    /【插入章节】/.test(content) ||
    /【大纲】/.test(content) ||
    /【角色】/.test(content) ||
    /【世界观】/.test(content) ||
    /【基本信息】/.test(content)
  );

  return hasClosedTags || hasOpenTags;
}
