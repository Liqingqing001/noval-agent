// 认证路由：注册 / 登录 / 获取当前用户
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, signToken } from '../middlewares/auth.js';

const router = Router();

/**
 * POST /api/auth/register
 * Body: { email, password, nickname? }
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, nickname } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码必填' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }

    // 检查邮箱是否已注册
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: '该邮箱已注册' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, nickname },
      select: { id: true, email: true, nickname: true, createdAt: true },
    });

    const token = signToken({ userId: user.id, email: user.email });
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码必填' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me  (需要认证)
 */
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, nickname: true, createdAt: true },
    });
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
