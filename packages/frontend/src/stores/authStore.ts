// 鉴权状态管理
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type User } from '@/api/auth';
import { getToken } from '@/api/client';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname?: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      error: null,
      isAuthenticated: !!getToken(),

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { user } = await authApi.login(email, password);
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          set({ error: err.message || '登录失败', isLoading: false });
          throw err;
        }
      },

      register: async (email, password, nickname) => {
        set({ isLoading: true, error: null });
        try {
          const { user } = await authApi.register(email, password, nickname);
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          set({ error: err.message || '注册失败', isLoading: false });
          throw err;
        }
      },

      logout: () => {
        authApi.logout();
        set({ user: null, isAuthenticated: false });
      },

      fetchMe: async () => {
        if (!getToken()) return;
        try {
          const { user } = await authApi.me();
          set({ user, isAuthenticated: true });
        } catch {
          authApi.logout();
          set({ user: null, isAuthenticated: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'novel-agent-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// 监听全局 logout 事件（API 401 时触发）
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });
}
