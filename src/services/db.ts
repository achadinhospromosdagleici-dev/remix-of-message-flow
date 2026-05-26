import { supabase } from '@/integrations/supabase/client';
import { getUserId } from '@/services/user';

type AnyTable = any;
const sb: any = supabase;

export async function saveUserSetting(key: string, value: unknown): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  await sb.from('user_settings').upsert({
    user_id: userId,
    key,
    value: value as unknown as object
  }, { onConflict: 'user_id,key' });
}

export async function loadUserSetting<T>(key: string): Promise<T | null> {
  const userId = getUserId();
  if (!userId) return null;

  const { data } = await sb.from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .single();

  return (data?.value ?? null) as T | null;
}

export async function clearUserSetting(key: string): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  await sb.from('user_settings')
    .delete()
    .eq('user_id', userId)
    .eq('key', key);
}

export async function saveUserData<T>(table: string, data: Record<string, unknown>): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  await sb.from(table).upsert({
    ...data,
    user_id: userId
  } as Record<string, unknown>, { onConflict: table === 'message_templates' ? 'user_id,name' : 'user_id,phone' });
}

export async function loadUserData<T>(table: string): Promise<T[]> {
  const userId = getUserId();
  if (!userId) return [];

  const { data } = await sb.from(table)
    .select('*')
    .eq('user_id', userId);

  return (data ?? []) as T[];
}

export async function deleteUserData(table: string, id: string): Promise<void> {
  await sb.from(table).delete().eq('id', id);
}
