// 大纲（情节点）路由
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();
router.use(authMiddleware);

async function assertOwnership(novelId: string, userId: string) {
  const n = await prisma.novel.findFirst({
    where: { id: novelId, userId },
    select: { id: true },
  });
  return !!n;
}

router.get('/novels/:novelId/plot-cards', async (req, res, next) => {
  try {
    if (!(await assertOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const items = await prisma.plotCard.findMany({
      where: { novelId: req.params.novelId },
      orderBy: [{ type: 'asc' }, { sequence: 'asc' }],
    });
    res.json({ plotCards: items });
  } catch (err) {
    next(err);
  }
});

router.post('/novels/:novelId/plot-cards', async (req, res, next) => {
  try {
    if (!(await assertOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const { type, title, summary, sequence, volumeId, chapterId, status } = req.body;
    if (!title) return res.status(400).json({ error: '大纲标题必填' });
    let seq = sequence;
    if (seq === undefined) {
      const max = await prisma.plotCard.findFirst({
        where: { novelId: req.params.novelId, volumeId: volumeId || null },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      seq = (max?.sequence ?? -1) + 1;
    }
    const item = await prisma.plotCard.create({
      data: {
        novelId: req.params.novelId,
        type: type || 'chapter',
        title,
        summary: summary || '',
        sequence: seq,
        volumeId,
        chapterId,
        status: status || 'pending',
      },
    });
    res.status(201).json({ plotCard: item });
  } catch (err) {
    next(err);
  }
});

router.put('/plot-cards/:id', async (req, res, next) => {
  try {
    const existing = await prisma.plotCard.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!existing || existing.novel.userId !== req.userId) {
      return res.status(404).json({ error: '情节点不存在' });
    }
    const item = await prisma.plotCard.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ plotCard: item });
  } catch (err) {
    next(err);
  }
});

router.delete('/plot-cards/:id', async (req, res, next) => {
  try {
    const existing = await prisma.plotCard.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!existing || existing.novel.userId !== req.userId) {
      return res.status(404).json({ error: '情节点不存在' });
    }
    await prisma.plotCard.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
