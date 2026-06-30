// 认证相关 API
import { apiPost, apiGet, setToken, getToken } from './client';

export interface User {
  id: string;
  email: string;
  nickname: string | null;
  createdAt: string;
}

export const authApi = {
  async register(email: string, password: string, nickname?: string) {
    const res = await apiPost<{ token: string; user: User }>('/auth/register', {
      email,
      password,
      nickname,
    });
    setToken(res.token);
    return res;
  },

  async login(email: string, password: string) {
    const res = await apiPost<{ token: string; user: User }>('/auth/login', { email, password });
    setToken(res.token);
    return res;
  },

  async me() {
    return apiGet<{ user: User }>('/auth/me');
  },

  logout() {
    setToken(null);
  },

  isLoggedIn() {
    return !!getToken();
  },
};
