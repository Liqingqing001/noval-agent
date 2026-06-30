// 伏笔路由
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

router.get('/novels/:novelId/foreshadowings', async (req, res, next) => {
  try {
    if (!(await assertOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const items = await prisma.foreshadowing.findMany({
      where: { novelId: req.params.novelId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ foreshadowings: items });
  } catch (err) {
    next(err);
  }
});

router.post('/novels/:novelId/foreshadowings', async (req, res, next) => {
  try {
    if (!(await assertOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const { title, description, plantedChapterId, resolvedChapterId, plantedPlotCardId, resolvedPlotCardId, status } = req.body;
    if (!title) return res.status(400).json({ error: '伏笔标题必填' });
    const item = await prisma.foreshadowing.create({
      data: {
        novelId: req.params.novelId,
        title,
        description: description || '',
        plantedChapterId,
        resolvedChapterId,
        plantedPlotCardId,
        resolvedPlotCardId,
        status: status || 'planted',
      },
    });
    res.status(201).json({ foreshadowing: item });
  } catch (err) {
    next(err);
  }
});

router.put('/foreshadowings/:id', async (req, res, next) => {
  try {
    const existing = await prisma.foreshadowing.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!existing || existing.novel.userId !== req.userId) {
      return res.status(404).json({ error: '伏笔不存在' });
    }
    const item = await prisma.foreshadowing.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ foreshadowing: item });
  } catch (err) {
    next(err);
  }
});

router.delete('/foreshadowings/:id', async (req, res, next) => {
  try {
    const existing = await prisma.foreshadowing.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!existing || existing.novel.userId !== req.userId) {
      return res.status(404).json({ error: '伏笔不存在' });
    }
    await prisma.foreshadowing.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
