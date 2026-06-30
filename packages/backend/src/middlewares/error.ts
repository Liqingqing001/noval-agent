// 全局错误处理中间件
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('[Error]', err);

  // Prisma 已知错误
  if (err.code === 'P2002') {
    return res.status(409).json({ error: '数据已存在（唯一约束冲突）' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: '记录不存在' });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  res.status(status).json({ error: message });
}

// 404 处理
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: '接口不存在' });
}
