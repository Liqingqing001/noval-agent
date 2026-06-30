// 伏笔 API
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface Foreshadowing {
  id: string;
  novelId: string;
  title: string;
  description: string;
  plantedChapterId: string | null;
  resolvedChapterId: string | null;
  plantedPlotCardId: string | null;
  resolvedPlotCardId: string | null;
  status: 'planted' | 'hinted' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export const foreshadowingsApi = {
  list: (novelId: string) =>
    apiGet<{ foreshadowings: Foreshadowing[] }>(`/novels/${novelId}/foreshadowings`),
  create: (novelId: string, data: Partial<Foreshadowing>) =>
    apiPost<{ foreshadowing: Foreshadowing }>(`/novels/${novelId}/foreshadowings`, data),
  update: (id: string, data: Partial<Foreshadowing>) =>
    apiPut<{ foreshadowing: Foreshadowing }>(`/foreshadowings/${id}`, data),
  remove: (id: string) => apiDelete<{ success: boolean }>(`/foreshadowings/${id}`),
};
