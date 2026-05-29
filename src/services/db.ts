import { getUserId } from '@/services/user';
import { api } from '@/services/api';

export async function saveUserSetting(key: string, value: unknown): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  await api.upsert('user_settings', { key, value: value as object }, 'user_id,key');
}

export async function loadUserSetting<T>(key: string): Promise<T | null> {
  const userId = getUserId();
  if (!userId) return null;
  const rows = await api.get('user_settings', { key });
  return (rows?.[0]?.value ?? null) as T | null;
}

export async function clearUserSetting(key: string): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  const rows = await api.get('user_settings', { key });
  if (rows?.[0]?.id) await api.del('user_settings', rows[0].id);
}

export async function saveUserData<T>(table: string, data: Record<string, unknown>): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  const conflict = table === 'message_templates' ? 'user_id,name' : 'user_id,phone';
  await api.upsert(table, { ...data }, conflict);
}

export async function loadUserData<T>(table: string): Promise<T[]> {
  const userId = getUserId();
  if (!userId) return [];
  return api.get(table) as Promise<T[]>;
}

export async function deleteUserData(table: string, id: string): Promise<void> {
  await api.del(table, id);
}
