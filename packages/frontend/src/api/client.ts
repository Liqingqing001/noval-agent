// API 客户端基础封装
const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export const TOKEN_KEY = 'novel-agent-auth-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export const api = async <T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // 401：token 失效，清除
  if (res.status === 401) {
    setToken(null);
    // 触发全局事件，让 App 跳到登录页
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '网络错误' }));
    throw new ApiError(error.error || '请求失败', res.status);
  }

  // 204 No Content
  if (res.status === 204) {
    return null as T;
  }

  return res.json();
};

export const apiGet = <T = any>(path: string) => api<T>(path, { method: 'GET' });
export const apiPost = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const apiPut = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });
