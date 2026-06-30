// 角色路由
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

router.get('/novels/:novelId/characters', async (req, res, next) => {
  try {
    if (!(await assertOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const characters = await prisma.character.findMany({
      where: { novelId: req.params.novelId },
      orderBy: [
        { role: 'asc' },
        { sequence: 'asc' },
      ],
    });
    res.json({ characters });
  } catch (err) {
    next(err);
  }
});

router.post('/novels/:novelId/characters', async (req, res, next) => {
  try {
    if (!(await assertOwnership(req.params.novelId, req.userId!))) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const { name, aliases, description, appearance, personality, background, firstAppearanceChapterId, role, sequence } = req.body;
    if (!name) return res.status(400).json({ error: '角色名必填' });
    const character = await prisma.character.create({
      data: {
        novelId: req.params.novelId,
        name,
        aliases: JSON.stringify(aliases || []),
        description: description || '',
        appearance,
        personality,
        background,
        firstAppearanceChapterId,
        role: role || 'supporting',
        sequence: sequence || 0,
      },
    });
    res.status(201).json({ character });
  } catch (err) {
    next(err);
  }
});

router.put('/characters/:id', async (req, res, next) => {
  try {
    const existing = await prisma.character.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!existing || existing.novel.userId !== req.userId) {
      return res.status(404).json({ error: '角色不存在' });
    }
    const data = { ...req.body };
    if (data.aliases) data.aliases = JSON.stringify(data.aliases);
    const character = await prisma.character.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ character });
  } catch (err) {
    next(err);
  }
});

router.delete('/characters/:id', async (req, res, next) => {
  try {
    const existing = await prisma.character.findUnique({
      where: { id: req.params.id },
      include: { novel: { select: { userId: true } } },
    });
    if (!existing || existing.novel.userId !== req.userId) {
      return res.status(404).json({ error: '角色不存在' });
    }
    await prisma.character.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
