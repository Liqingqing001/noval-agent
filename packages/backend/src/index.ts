// Express 入口
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import novelRoutes from './routes/novels.js';
import chapterRoutes from './routes/chapters.js';
import characterRoutes from './routes/characters.js';
import worldSettingRoutes from './routes/worldSettings.js';
import plotCardRoutes from './routes/plotCards.js';
import foreshadowingRoutes from './routes/foreshadowings.js';
import migrateRoutes from './routes/migrate.js';
import { errorHandler, notFoundHandler } from './middlewares/error.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// CORS：允许前端开发服务器
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));

// JSON body parser：章节可能很大，调到 10mb
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 简单日志
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 业务路由
app.use('/api/auth', authRoutes);
app.use('/api/novels', novelRoutes);
app.use('/api', chapterRoutes);          // /api/novels/:novelId/chapters + /api/chapters/:id
app.use('/api', characterRoutes);        // /api/novels/:novelId/characters + /api/characters/:id
app.use('/api', worldSettingRoutes);     // /api/novels/:novelId/world-settings + /api/world-settings/:id
app.use('/api', plotCardRoutes);         // /api/novels/:novelId/plot-cards + /api/plot-cards/:id
app.use('/api', foreshadowingRoutes);    // /api/novels/:novelId/foreshadowings + /api/foreshadowings/:id
app.use('/api/migrate', migrateRoutes);

// 错误处理
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 NovelAgent backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});
