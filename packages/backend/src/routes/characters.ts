// 角色路由
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.js';
import { characterAliases, characterAvatarValue, characterRelationships } from '../lib/characterProfileData.js';

const router = Router();
router.use(authMiddleware);

async function assertOwnership(novelId: string, userId: string) {
  const n = await prisma.novel.findFirst({
    where: { id: novelId, userId },
    select: { id: true },
  });
  return !!n;
}

async function profileData(body: Record<string, unknown>, novelId: string, characterId?: string) {
  const data: Record<string, unknown> = {};
  for (const field of ['name', 'description', 'appearance', 'personality', 'background', 'firstAppearanceChapterId', 'role', 'sequence']) {
    if (Object.hasOwn(body, field)) data[field] = body[field];
  }
  if (Object.hasOwn(body, 'aliases')) data.aliases = characterAliases(body.aliases);
  if (Object.hasOwn(body, 'avatar')) data.avatar = characterAvatarValue(body.avatar);
  if (Object.hasOwn(body, 'relationships')) {
    const relationships = characterRelationships(body.relationships);
    const targets = [...new Set(relationships.map(item => item.targetId))];
    const valid = await prisma.character.count({ where: { novelId, id: { in: targets, not: characterId } } });
    if (valid !== targets.length) throw new Error('人物关系只能指向同一部小说的其他角色');
    data.relationships = JSON.stringify(relationships);
  }
  return data;
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
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '角色名必填' });
    let data;
    try { data = await profileData(req.body, req.params.novelId); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : '人物资料无效' }); }
    const character = await prisma.character.create({
      data: {
        novelId: req.params.novelId,
        name,
        ...data,
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
    let data;
    try { data = await profileData(req.body, existing.novelId, existing.id); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : '人物资料无效' }); }
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
    await prisma.$transaction(async transaction => {
      const peers = await transaction.character.findMany({ where: { novelId: existing.novelId, id: { not: existing.id } }, select: { id: true, relationships: true } });
      for (const peer of peers) {
        const relationships = characterRelationships(peer.relationships);
        const remaining = relationships.filter(relationship => relationship.targetId !== existing.id);
        if (remaining.length !== relationships.length) await transaction.character.update({ where: { id: peer.id }, data: { relationships: JSON.stringify(remaining) } });
      }
      await transaction.character.delete({ where: { id: req.params.id } });
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
