// 章节 API
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface Chapter {
  id: string;
  novelId: string;
  title: string;
  content: string;
  wordCount: number;
  sequence: number;
  createdAt: string;
  updatedAt: string;
}

export const chaptersApi = {
  list: (novelId: string) => apiGet<{ chapters: Chapter[] }>(`/novels/${novelId}/chapters`),
  create: (novelId: string, data: Partial<Chapter>) =>
    apiPost<{ chapter: Chapter }>(`/novels/${novelId}/chapters`, data),
  update: (id: string, data: Partial<Chapter>) => apiPut<{ chapter: Chapter }>(`/chapters/${id}`, data),
  remove: (id: string) => apiDelete<{ success: boolean }>(`/chapters/${id}`),
};
