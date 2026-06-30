// 章节路由
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();
router.use(authMiddleware);

async function assertNovelOwnership(novelId: string, userId: string) {
  const novel = await prisma.novel.findFirst({
    where: { id: novelId, userId },
    select: { id: true },
  });
  return !!novel;
}

router.get('/novels/:novelId/chapters', async (req, res, next) => {
  try {
    if (!(await assertNovelOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const chapters = await prisma.chapter.findMany({
      where: { novelId: req.params.novelId },
      orderBy: { sequence: 'asc' },
    });
    res.json({ chapters });
  } catch (err) {
    next(err);
  }
});

router.post('/novels/:novelId/chapters', async (req, res, next) => {
  try {
    if (!(await assertNovelOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const { title, content, sequence, wordCount } = req.body;
    if (!title) return res.status(400).json({ error: '章节标题必填' });

    // 自动计算 sequence（如果没传）
    let seq = sequence;
    if (seq === undefined) {
      const max = await prisma.chapter.findFirst({
        where: { novelId: req.params.novelId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      seq = (max?.sequence ?? -1) + 1;
    }

    const chapter = await prisma.chapter.create({
      data: {
        novelId: req.params.novelId,
        title,
        content: content || '',
        wordCount: wordCount || (content || '').length,
        sequence: seq,
      },
    });

    // 更新小说总字数
    await updateNovelWordCount(req.params.novelId);

    res.status(201).json({ chapter });
  } catch (err) {
    next(err);
  }
});

router.put('/chapters/:id', async (req, res, next) => {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!chapter || chapter.novel.userId !== req.userId) {
      return res.status(404).json({ error: '章节不存在' });
    }
    const updated = await prisma.chapter.update({
      where: { id: req.params.id },
      data: req.body,
    });
    // 字数可能变了
    if (req.body.content !== undefined || req.body.wordCount !== undefined) {
      await updateNovelWordCount(chapter.novelId);
    }
    res.json({ chapter: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/chapters/:id', async (req, res, next) => {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true, id: true } } },
    });
    if (!chapter || chapter.novel.userId !== req.userId) {
      return res.status(404).json({ error: '章节不存在' });
    }
    await prisma.chapter.delete({ where: { id: req.params.id } });
    await updateNovelWordCount(chapter.novel.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

async function updateNovelWordCount(novelId: string) {
  const chapters = await prisma.chapter.findMany({
    where: { novelId },
    select: { wordCount: true },
  });
  const total = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
  await prisma.novel.update({
    where: { id: novelId },
    data: { wordCount: total },
  });
}

export default router;
