// Express Request 扩展：认证中间件会写入 userId

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
