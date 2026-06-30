// 角色 API
import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface Character {
  id: string;
  novelId: string;
  name: string;
  aliases: string; // JSON 字符串
  description: string;
  appearance: string | null;
  personality: string | null;
  background: string | null;
  firstAppearanceChapterId: string | null;
  role: string | null;
  sequence: number | null;
}

export const charactersApi = {
  list: (novelId: string) => apiGet<{ characters: Character[] }>(`/novels/${novelId}/characters`),
  create: (novelId: string, data: Partial<Character>) =>
    apiPost<{ character: Character }>(`/novels/${novelId}/characters`, data),
  update: (id: string, data: Partial<Character>) =>
    apiPut<{ character: Character }>(`/characters/${id}`, data),
  remove: (id: string) => apiDelete<{ success: boolean }>(`/characters/${id}`),
};
