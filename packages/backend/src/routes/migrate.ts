// 数据迁移路由：首次登录时把 localStorage 数据导入到数据库
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();
router.use(authMiddleware);

interface ImportPayload {
  novels: any[];
  chapters: any[];
  characters: any[];
  worldSettings: any[];
  plotCards: any[];
  foreshadowings: any[];
}

/**
 * POST /api/migrate/import
 * Body: { novels, chapters, characters, worldSettings, plotCards, foreshadowings }
 *
 * 使用 Prisma 事务保证原子性：全部成功才提交，任一失败整体回滚
 */
router.post('/import', async (req, res, next) => {
  try {
    const payload: ImportPayload = req.body;
    const { novels = [], chapters = [], characters = [], worldSettings = [], plotCards = [], foreshadowings = [] } = payload;

    const counts = { novels: 0, chapters: 0, characters: 0, worldSettings: 0, plotCards: 0, foreshadowings: 0 };

    // 一次性事务写入
    await prisma.$transaction(async (tx) => {
      // 1. 创建小说
      const novelIdMap = new Map<string, string>();
      for (const n of novels) {
        const created = await tx.novel.create({
          data: {
            userId: req.userId!,
            title: n.title,
            cover: n.cover,
            wordCount: n.wordCount || 0,
            status: n.status || 'draft',
            genre: n.genre,
            summary: n.summary,
            agentPrompt: n.agentPrompt,
            lastOpenedChapterId: n.lastOpenedChapterId,
          },
        });
        novelIdMap.set(n.id, created.id);
        counts.novels++;
      }

      // 2. 章节
      for (const c of chapters) {
        const newNovelId = novelIdMap.get(c.novelId);
        if (!newNovelId) continue;
        await tx.chapter.create({
          data: {
            novelId: newNovelId,
            title: c.title,
            content: c.content || '',
            wordCount: c.wordCount || 0,
            sequence: c.sequence ?? 0,
          },
        });
        counts.chapters++;
      }

      // 3. 角色
      for (const ch of characters) {
        const newNovelId = novelIdMap.get(ch.novelId);
        if (!newNovelId) continue;
        await tx.character.create({
          data: {
            novelId: newNovelId,
            name: ch.name,
            aliases: typeof ch.aliases === 'string' ? ch.aliases : JSON.stringify(ch.aliases || []),
            description: ch.description || '',
            appearance: ch.appearance,
            personality: ch.personality,
            background: ch.background,
            firstAppearanceChapterId: ch.firstAppearanceChapterId,
          },
        });
        counts.characters++;
      }

      // 4. 世界观
      for (const w of worldSettings) {
        const newNovelId = novelIdMap.get(w.novelId);
        if (!newNovelId) continue;
        await tx.worldSetting.create({
          data: {
            novelId: newNovelId,
            category: w.category || '其他',
            title: w.title,
            content: w.content || '',
          },
        });
        counts.worldSettings++;
      }

      // 5. 大纲
      for (const p of plotCards) {
        const newNovelId = novelIdMap.get(p.novelId);
        if (!newNovelId) continue;
        await tx.plotCard.create({
          data: {
            novelId: newNovelId,
            type: p.type || 'chapter',
            title: p.title,
            summary: p.summary || '',
            sequence: p.sequence ?? 0,
            volumeId: p.volumeId,
            chapterId: p.chapterId,
            status: p.status || 'pending',
          },
        });
        counts.plotCards++;
      }

      // 6. 伏笔
      for (const f of foreshadowings) {
        const newNovelId = novelIdMap.get(f.novelId);
        if (!newNovelId) continue;
        await tx.foreshadowing.create({
          data: {
            novelId: newNovelId,
            title: f.title,
            description: f.description || '',
            plantedChapterId: f.plantedChapterId,
            resolvedChapterId: f.resolvedChapterId,
            plantedPlotCardId: f.plantedPlotCardId,
            resolvedPlotCardId: f.resolvedPlotCardId,
            status: f.status || 'planted',
          },
        });
        counts.foreshadowings++;
      }
    });

    res.json({ success: true, imported: counts });
  } catch (err) {
    next(err);
  }
});

export default router;
