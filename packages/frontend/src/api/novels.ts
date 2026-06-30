// 小说 API
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface Novel {
  id: string;
  userId: string;
  title: string;
  cover: string | null;
  wordCount: number;
  status: 'draft' | 'writing' | 'completed';
  genre: string | null;
  summary: string | null;
  agentPrompt: string | null;
  lastOpenedChapterId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const novelsApi = {
  list: () => apiGet<{ novels: Novel[] }>('/novels'),
  get: (id: string) => apiGet<{ novel: any }>(`/novels/${id}`),
  create: (data: Partial<Novel>) => apiPost<{ novel: Novel }>('/novels', data),
  update: (id: string, data: Partial<Novel>) => apiPut<{ novel: Novel }>(`/novels/${id}`, data),
  remove: (id: string) => apiDelete<{ success: boolean }>(`/novels/${id}`),
};
