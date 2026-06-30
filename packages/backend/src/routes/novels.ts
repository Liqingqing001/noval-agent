// 小说路由：CRUD
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/novels
 * 获取当前用户的所有小说
 */
router.get('/', async (req, res, next) => {
  try {
    const novels = await prisma.novel.findMany({
      where: { userId: req.userId! },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ novels });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/novels/:id
 * 获取单本小说 + 关联的章节/角色/大纲/世界观/伏笔
 */
router.get('/:id', async (req, res, next) => {
  try {
    const novel = await prisma.novel.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: {
        chapters: { orderBy: { sequence: 'asc' } },
        characters: true,
        worldSettings: true,
        plotCards: { orderBy: { sequence: 'asc' } },
        foreshadowings: true,
      },
    });
    if (!novel) {
      return res.status(404).json({ error: '小说不存在' });
    }
    res.json({ novel });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/novels
 * Body: { title, status?, genre?, summary?, agentPrompt? }
 */
router.post('/', async (req, res, next) => {
  try {
    const { title, status, genre, summary, agentPrompt, cover } = req.body;
    if (!title) {
      return res.status(400).json({ error: '书名必填' });
    }
    const novel = await prisma.novel.create({
      data: {
        userId: req.userId!,
        title,
        cover,
        status: status || 'draft',
        genre,
        summary,
        agentPrompt,
      },
    });
    res.status(201).json({ novel });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/novels/:id
 * Body: Partial<Novel>
 */
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.novel.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const novel = await prisma.novel.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ novel });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/novels/:id
 * 级联删除章节、角色等
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.novel.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!existing) {
      return res.status(404).json({ error: '小说不存在' });
    }
    await prisma.novel.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
