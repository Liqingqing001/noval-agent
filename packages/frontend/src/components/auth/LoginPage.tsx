// 登录 / 注册页
import { useState } from 'react';
import { BookOpen, Mail, Lock, User as UserIcon, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

type Mode = 'login' | 'register';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');

  const { login, register, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, nickname || undefined);
      }
    } catch {
      // 错误已经在 store 中
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-green-400 items-center justify-center shadow-lg shadow-primary/20 mb-4">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">NovelAgent</h1>
          <p className="text-sm text-muted-foreground mt-2">AI 驱动的小说创作工作台</p>
        </div>

        {/* 卡片 */}
        <div className="bg-card border rounded-2xl shadow-xl p-8">
          {/* Tab 切换 */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); clearError(); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); clearError(); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'register' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="text-sm font-medium block mb-1.5">昵称（可选）</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="你的笔名"
                    className="w-full pl-10 pr-3 py-2.5 text-sm bg-muted border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium block mb-1.5">邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-muted border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1.5">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-muted border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/30 dark:border-red-900">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isLoading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
            </button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-4">
            注册即表示同意将创作数据存储到云端
          </p>
        </div>
      </div>
    </div>
  );
}
