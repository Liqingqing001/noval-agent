// 世界观路由
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

router.get('/novels/:novelId/world-settings', async (req, res, next) => {
  try {
    if (!(await assertOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const items = await prisma.worldSetting.findMany({
      where: { novelId: req.params.novelId },
      orderBy: { category: 'asc' },
    });
    res.json({ worldSettings: items });
  } catch (err) {
    next(err);
  }
});

router.post('/novels/:novelId/world-settings', async (req, res, next) => {
  try {
    if (!(await assertOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const { category, title, content } = req.body;
    if (!title) return res.status(400).json({ error: '标题必填' });
    const item = await prisma.worldSetting.create({
      data: {
        novelId: req.params.novelId,
        category: category || '其他',
        title,
        content: content || '',
      },
    });
    res.status(201).json({ worldSetting: item });
  } catch (err) {
    next(err);
  }
});

router.put('/world-settings/:id', async (req, res, next) => {
  try {
    const existing = await prisma.worldSetting.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!existing || existing.novel.userId !== req.userId) {
      return res.status(404).json({ error: '世界观不存在' });
    }
    const item = await prisma.worldSetting.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ worldSetting: item });
  } catch (err) {
    next(err);
  }
});

router.delete('/world-settings/:id', async (req, res, next) => {
  try {
    const existing = await prisma.worldSetting.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!existing || existing.novel.userId !== req.userId) {
      return res.status(404).json({ error: '世界观不存在' });
    }
    await prisma.worldSetting.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
