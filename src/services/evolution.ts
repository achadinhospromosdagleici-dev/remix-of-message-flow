// Evolution API Service
// Manages WhatsApp connection via Evolution API with edge function proxy

import { proxyCall } from './proxy';
import { getUserId } from '@/services/user';
import { api } from '@/services/api';

export interface EvolutionCredentials {
  baseUrl: string;
  apiKey: string;
  instanceName?: string;
}

export interface EvolutionInstance {
  instanceName: string;
  status: string;
  phone: string;
  profileName?: string;
  profilePictureUrl?: string;
}

const STORAGE_KEY = 'evolution_credentials';

async function saveEvoToDb(creds: EvolutionCredentials): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  await api.upsert('evolution_settings', {
    base_url: creds.baseUrl,
    api_key: creds.apiKey,
    instance_name: creds.instanceName,
  }, 'user_id');
}

async function loadEvoFromDb(): Promise<EvolutionCredentials | null> {
  try {
    const userId = getUserId();
    if (!userId) return null;
    const rows = await api.get('evolution_settings');
    const data = rows?.[0];
    if (!data) return null;
    return {
      baseUrl: data.base_url,
      apiKey: data.api_key,
      instanceName: data.instance_name,
    };
  } catch (error) {
    console.error('Error loading evolution from DB:', error);
    return null;
  }
}

export async function saveEvolutionCredentials(creds: EvolutionCredentials): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  await saveEvoToDb(creds);
}

export function loadEvolutionCredentials(): EvolutionCredentials | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

export async function loadEvolutionCredentialsWithFallback(): Promise<EvolutionCredentials | null> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) { try { return JSON.parse(stored); } catch { return null; } }
  try {
    return await loadEvoFromDb();
  } catch {
    return null;
  }
}

export async function clearEvolutionCredentials(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  const userId = getUserId();
  if (!userId) return;
  const rows = await api.get('evolution_settings');
  const data = rows?.[0];
  if (data?.id) await api.del('evolution_settings', data.id);
}

// ── Shared Evolution (fallback for trial users) ──
export async function loadSharedEvolutionCredentials(): Promise<EvolutionCredentials | null> {
  try {
    const { data, error } = await (supabase as any).rpc('get_shared_evolution');
    if (error || !data) return null;
    const v = data as { baseUrl?: string; apiKey?: string; enabled?: boolean };
    if (!v.enabled || !v.baseUrl || !v.apiKey) return null;
    return { baseUrl: v.baseUrl, apiKey: v.apiKey };
  } catch {
    return null;
  }
}

/** Returns user's own creds if set, otherwise the shared system creds (if enabled). */
export async function resolveEvolutionCredentials(): Promise<EvolutionCredentials | null> {
  const own = await loadEvolutionCredentialsWithFallback();
  if (own?.baseUrl && own?.apiKey) return own;
  return loadSharedEvolutionCredentials();
}

// ── Generic proxy call ──
async function evolutionCall(payload: Record<string, any>): Promise<any> {
  return proxyCall('evolution', payload);
}

// ── ETAPA 1: Listar instâncias ──
export async function fetchInstances(creds: EvolutionCredentials): Promise<EvolutionInstance[]> {
  const data = await evolutionCall({
    action: 'fetchInstances',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
  });
  return data.instances || [];
}

// ── ETAPA 1: Encontrar ou criar instância (anti-duplicação) ──
export async function findOrCreateInstance(
  creds: EvolutionCredentials,
  instanceName: string
): Promise<{ action: 'existing' | 'created'; instanceName: string; status: string; qrcode?: string; phone?: string }> {
  return evolutionCall({
    action: 'findOrCreate',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    instanceName,
  });
}

// ── ETAPA 2: Gerar QR Code ──
export async function getQRCode(creds: EvolutionCredentials, instanceName: string): Promise<{ qrcode: string; pairingCode: string }> {
  return evolutionCall({
    action: 'connect',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    instanceName,
  });
}

// ── ETAPA 2: Verificar status da conexão ──
export async function getInstanceStatus(
  creds: EvolutionCredentials,
  instanceName: string
): Promise<{ instanceName: string; status: string; connected: boolean }> {
  return evolutionCall({
    action: 'connectionState',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    instanceName,
  });
}

// ── ETAPA 2: Logout ──
export async function logoutInstance(creds: EvolutionCredentials, instanceName: string): Promise<void> {
  await evolutionCall({
    action: 'logout',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    instanceName,
  });
}

// ── ETAPA 3: Enviar mensagem com validação de status ──
export interface EvolutionMessage {
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'buttons' | 'link' | 'contact';
  content: string;
  mediaUrl?: string;
  caption?: string;
  filename?: string;
  // Para buttons:
  title?: string;
  footer?: string;
  buttons?: { type: 'url' | 'phone' | 'reply' | 'copy'; label: string; value: string }[];
  // Para link:
  linkUrl?: string;
  // Para contact:
  contactName?: string;
  contactNumber?: string;
}

export async function sendMessage(
  creds: EvolutionCredentials,
  instanceName: string,
  to: string,
  message: EvolutionMessage
): Promise<any> {
  return evolutionCall({
    action: 'sendMessage',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    instanceName,
    to,
    message,
  });
}

// ── WEBHOOK: Configurar webhook para receber mensagens ──
export async function setWebhook(
  creds: EvolutionCredentials,
  instanceName: string,
  webhookUrl: string
): Promise<{ success: boolean; webhookUrl: string }> {
  return evolutionCall({
    action: 'setWebhook',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    instanceName,
    webhookUrl,
    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
  });
}

// ── WEBHOOK: Remover webhook ──
export async function removeWebhook(
  creds: EvolutionCredentials,
  instanceName: string
): Promise<{ success: boolean }> {
  return evolutionCall({
    action: 'removeWebhook',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    instanceName,
  });
}

// ── WEBHOOK: Buscar configuração atual ──
export async function getWebhook(
  creds: EvolutionCredentials,
  instanceName: string
): Promise<{ enabled: boolean; url: string; events: string[] }> {
  return evolutionCall({
    action: 'getWebhook',
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    instanceName,
  });
}
