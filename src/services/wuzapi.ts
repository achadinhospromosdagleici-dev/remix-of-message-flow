import { api } from '@/services/api';
import { proxyCall } from './proxy';
import { generateToken } from '@/lib/id';
import { getUserId } from '@/services/user';

export interface WuzapiCredentials {
  baseUrl: string;
  adminToken: string;
  id?: string;
}

export interface WuzapiInstance {
  id: string;
  name: string;
  phone: string | null;
  status: 'connected' | 'disconnected' | 'connecting';
  user_token: string;
}

export interface WuzapiUser {
  ID: number;
  Name: string;
  Token: string;
  Webhook: string;
  Events: string[];
}

export interface MessageResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface WuzapiButton {
  DisplayText: string;
  Type: 'quickreply' | 'url' | 'call';
  Url?: string;
  PhoneNumber?: string;
}

export type WuzapiStatus = 'connected' | 'disconnected' | 'connecting';
export type WuzapiInstanceDb = WuzapiInstance;

const STORAGE_KEY = 'wuzapi_credentials';

export async function saveWuzapiSettings(creds: WuzapiCredentials): Promise<{ success: boolean; error?: string }> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  const userId = getUserId();
  if (!userId) return { success: false, error: 'Usuário não autenticado' };

  try {
    await api.upsert('wuzapi_settings', {
      base_url: creds.baseUrl,
      admin_token: creds.adminToken,
    }, 'user_id');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function loadWuzapiSettings(): Promise<WuzapiCredentials | null> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {}
  }

  try {
    const userId = getUserId();
    if (!userId) return null;

    const rows = await api.get('wuzapi_settings');
    const data = rows?.[0];
    if (!data) return null;

    const creds: WuzapiCredentials = {
      id: data.id,
      baseUrl: data.base_url,
      adminToken: data.admin_token,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    return creds;
  } catch (err) {
    console.error('Error loading wuzapi settings:', err);
    return null;
  }
}

export async function loadWuzapiInstances(): Promise<WuzapiInstance[]> {
  const userId = getUserId();
  if (!userId) return [];

  const data = await api.get('wuzapi_instances', { order: 'created_at.desc' });
  const instances = (data || []) as WuzapiInstance[];

  const legacyRows = await api.get('user_instances', { source: 'wuzapi' });

  if (legacyRows?.length) {
    const existingNames = new Set(instances.map(i => i.name));
    const settingsRows = await api.get('wuzapi_settings');
    const settings = settingsRows?.[0];

    for (const legacy of legacyRows) {
      const name = legacy.profile_name || legacy.instance_name.replace(/^wuz_/, '');
      if (!name || existingNames.has(name)) continue;
      const status: 'connected' | 'disconnected' = legacy.status === 'connected' ? 'connected' : 'disconnected';
      try {
        const newInst = await api.post('wuzapi_instances', {
          settings_id: settings?.id || null,
          user_token: '',
          name,
          phone: legacy.phone,
          status,
        });
        if (newInst) {
          instances.push(newInst as WuzapiInstance);
          existingNames.add(name);
        }
      } catch {}
    }
  }

  return instances;
}

export async function clearWuzapiSettings(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  const userId = getUserId();
  if (!userId) return;
  const rows = await api.get('wuzapi_settings');
  if (rows?.[0]?.id) await api.del('wuzapi_settings', rows[0].id);
}

export async function saveWuzapiInstance(
  settingsId: string,
  userToken: string,
  name: string,
  phone?: string,
  status: 'connected' | 'disconnected' | 'connecting' = 'disconnected'
): Promise<WuzapiInstance | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const inst = await api.upsert('wuzapi_instances', {
      settings_id: settingsId,
      user_token: userToken,
      phone,
      name,
      status,
    }, 'settings_id,user_token') as WuzapiInstance;

    await api.upsert('user_instances', {
      instance_name: `wuz_${name}`,
      phone,
      profile_name: name,
      status: status === 'connected' ? 'connected' : 'connecting',
      source: 'wuzapi',
    }, 'user_id,instance_name');

    return inst;
  } catch {
    return null;
  }
}

export async function updateWuzapiInstance(
  id: string,
  updates: Partial<WuzapiInstance>
): Promise<void> {
  await api.put('wuzapi_instances', id, updates);
}

export async function deleteWuzapiInstance(id: string): Promise<void> {
  const data = await api.getById('wuzapi_instances', id).catch(() => null);
  if (data?.name) {
    const uiRows = await api.get('user_instances', { instance_name: `wuz_${data.name}` });
    if (uiRows?.[0]?.id) await api.del('user_instances', uiRows[0].id);
  }
  await api.del('wuzapi_instances', id);
}

export async function getWuzapiInstanceById(id: string): Promise<WuzapiInstance | null> {
  try {
    return await api.getById('wuzapi_instances', id) as WuzapiInstance;
  } catch {
    return null;
  }
}

export async function saveWuzapiInstanceDb(
  userToken: string,
  phone: string | null,
  name: string,
  status: 'connected' | 'disconnected' | 'connecting' = 'disconnected'
): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  const settingsRows = await api.get('wuzapi_settings');
  const settings = settingsRows?.[0];

  if (!settings) {
    throw new Error('Configuração global da WuzAPI não encontrada. Configure-a primeiro.');
  }

  await api.upsert('wuzapi_instances', {
    settings_id: settings.id,
    user_token: userToken,
    phone,
    name,
    status,
  }, 'settings_id,user_token');

  await api.upsert('user_instances', {
    instance_name: `wuz_${name}`,
    phone,
    profile_name: name,
    status: status === 'connected' ? 'connected' : 'connecting',
    source: 'wuzapi',
  }, 'user_id,instance_name');
}

export async function deleteWuzapiInstanceDb(name: string, userToken: string): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  const settingsRows = await api.get('wuzapi_settings');
  const settings = settingsRows?.[0];

  if (settings?.id) {
    const instRows = await api.get('wuzapi_instances', { settings_id: settings.id, user_token: userToken });
    if (instRows?.[0]?.id) await api.del('wuzapi_instances', instRows[0].id);
  }

  const uiRows = await api.get('user_instances', { instance_name: `wuz_${name}` });
  if (uiRows?.[0]?.id) await api.del('user_instances', uiRows[0].id);
}

async function apiCall(
  baseUrl: string,
  endpoint: string,
  token: string,
  method = 'GET',
  body?: any,
  isAdmin = false,
): Promise<any> {
  if (!baseUrl) throw new Error('WuzAPI base URL não configurada');
  console.log('[WuzAPI] apiCall:', method, `${baseUrl}${endpoint}`, { isAdmin });
  return proxyCall('wuzapi', { baseUrl, token, endpoint, method, body, isAdmin });
}

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

export async function testConnection(baseUrl: string, adminToken: string): Promise<{ success: boolean; users?: WuzapiUser[] }> {
  try {
    const users = await listUsers(baseUrl, adminToken);
    return { success: true, users };
  } catch (err) {
    console.error('[WuzAPI] Admin connection test failed:', err);
    return { success: false };
  }
}

export async function listUsers(baseUrl: string, adminToken: string): Promise<WuzapiUser[]> {
  const data = await apiCall(baseUrl, '/admin/users', adminToken, 'GET', undefined, true);
  return Array.isArray(data) ? data : (data?.users || []);
}

export async function createUser(baseUrl: string, adminToken: string, name: string): Promise<{ id: number; token: string }> {
  const token = generateToken();
  await apiCall(baseUrl, '/admin/users', adminToken, 'POST', {
    name, token, webhook: '', events: 'All', expiration: 0,
  }, true);
  return { id: 0, token };
}

export async function deleteUser(baseUrl: string, adminToken: string, userId: number): Promise<void> {
  await apiCall(baseUrl, `/admin/users/${userId}`, adminToken, 'DELETE', undefined, true);
}

// ============================================================================
// SESSION ENDPOINTS
// ============================================================================

export async function connect(baseUrl: string, userToken: string): Promise<{ success: boolean; jid?: string }> {
  return apiCall(baseUrl, '/session/connect', userToken, 'POST', { Subscribe: ['Message'], Immediate: true });
}

export async function getStatus(baseUrl: string, userToken: string): Promise<{ connected: boolean; loggedIn: boolean; jid?: string }> {
  try {
    const raw = await apiCall(baseUrl, '/session/status', userToken, 'GET');
    const status = raw?.data || raw;
    return {
      connected: !!(status.Connected || status.connected),
      loggedIn: !!(status.LoggedIn || status.loggedIn),
      jid: status.jid || status.Jid || undefined,
    };
  } catch (err) {
    console.error('[WuzAPI] getStatus error:', err);
    return { connected: false, loggedIn: false };
  }
}

export async function getQRCode(baseUrl: string, userToken: string): Promise<string> {
  const res = await apiCall(baseUrl, '/session/qr', userToken, 'GET');
  return res?.data?.QRCode || res?.QRCode || res?.qr || res?.qrcode || res?.QR || '';
}

export async function disconnect(baseUrl: string, userToken: string): Promise<void> {
  await apiCall(baseUrl, '/session/disconnect', userToken, 'POST');
}

export async function logout(baseUrl: string, userToken: string): Promise<void> {
  await apiCall(baseUrl, '/session/logout', userToken, 'POST');
}

// ============================================================================
// MESSAGE ENDPOINTS
// ============================================================================

export async function sendText(baseUrl: string, userToken: string, to: string, body: string): Promise<MessageResult> {
  const res = await apiCall(baseUrl, '/chat/send/text', userToken, 'POST', { Phone: to, Body: body });
  return { success: true, id: res.id || res.messageId };
}

export async function sendImage(baseUrl: string, userToken: string, to: string, imageData: string, caption?: string): Promise<MessageResult> {
  const res = await apiCall(baseUrl, '/chat/send/image', userToken, 'POST', { Phone: to, Image: imageData, Caption: caption || '' });
  return { success: true, id: res.id || res.messageId };
}

export async function sendAudio(baseUrl: string, userToken: string, to: string, audioData: string): Promise<MessageResult> {
  const payload = {
    Phone: to,
    Audio: audioData.replace(/^data:[^,]+,/i, 'data:audio/ogg;base64,'),
    PTT: true,
    MimeType: 'audio/ogg; codecs=opus',
  };
  const res = await apiCall(baseUrl, '/chat/send/audio', userToken, 'POST', payload);
  return { success: true, id: res.id || res.messageId };
}

export async function sendVideo(baseUrl: string, userToken: string, to: string, videoData: string, caption?: string): Promise<MessageResult> {
  const res = await apiCall(baseUrl, '/chat/send/video', userToken, 'POST', { Phone: to, Video: videoData, Caption: caption || '' });
  return { success: true, id: res.id || res.messageId };
}

export async function sendDocument(baseUrl: string, userToken: string, to: string, docData: string, filename: string, caption?: string): Promise<MessageResult> {
  const res = await apiCall(baseUrl, '/chat/send/document', userToken, 'POST', { Phone: to, Document: docData, FileName: filename, Caption: caption || '' });
  return { success: true, id: res.id || res.messageId };
}

export async function sendTemplate(baseUrl: string, userToken: string, to: string, content: string, buttons: WuzapiButton[], header?: string, footer?: string): Promise<MessageResult> {
  const payload = { Phone: to, Template: { Content: content, Header: header || '', Footer: footer || '', Buttons: buttons } };
  const res = await apiCall(baseUrl, '/chat/send/template', userToken, 'POST', payload);
  return { success: true, id: res.id || res.messageId };
}

export async function sendContact(baseUrl: string, userToken: string, to: string, name: string, vcard: string): Promise<MessageResult> {
  const res = await apiCall(baseUrl, '/chat/send/contact', userToken, 'POST', { Phone: to, Contact: { Name: name, Vcard: vcard } });
  return { success: true, id: res.id || res.messageId };
}

export async function sendSticker(baseUrl: string, userToken: string, to: string, stickerData: string, packName?: string, packPublisher?: string, emojis?: string[]): Promise<MessageResult> {
  const payload: Record<string, unknown> = { Phone: to, Sticker: stickerData };
  if (packName) payload.PackName = packName;
  if (packPublisher) payload.PackPublisher = packPublisher;
  if (emojis) payload.Emojis = emojis;
  const res = await apiCall(baseUrl, '/chat/send/sticker', userToken, 'POST', payload);
  return { success: true, id: res.id || res.messageId };
}

export async function sendLocation(baseUrl: string, userToken: string, to: string, latitude: number, longitude: number, name?: string): Promise<MessageResult> {
  const payload: Record<string, unknown> = { Phone: to, Latitude: latitude, Longitude: longitude };
  if (name) payload.Name = name;
  const res = await apiCall(baseUrl, '/chat/send/location', userToken, 'POST', payload);
  return { success: true, id: res.id || res.messageId };
}

export async function sendPoll(baseUrl: string, userToken: string, to: string, header: string, options: string[]): Promise<MessageResult> {
  const res = await apiCall(baseUrl, '/chat/send/poll', userToken, 'POST', { Group: to, Header: header, Options: options });
  return { success: true, id: res.id || res.messageId };
}

// ============================================================================
// BUTTONS & LIST ENDPOINTS
// ============================================================================

export async function sendButtons(
  baseUrl: string, userToken: string, to: string, body: string,
  buttons: { DisplayText: string; Type?: 'reply' | 'url' | 'call' | 'copy'; Url?: string; PhoneNumber?: string; CopyCode?: string }[],
  imageDataUrl?: string, title?: string, footer?: string,
): Promise<MessageResult> {
  const typeMap = { reply: 'reply', url: 'cta_url', call: 'cta_call', copy: 'cta_copy' } as const;
  const payload: Record<string, unknown> = {
    Phone: to, Body: body,
    ...(title ? { Title: title } : {}),
    ...(footer ? { Footer: footer } : {}),
    ...(imageDataUrl ? { Image: imageDataUrl } : {}),
    Buttons: buttons.map((b) => ({
      title: b.DisplayText, id: b.DisplayText, type: typeMap[b.Type ?? 'reply'],
      ...(b.Url ? { url: b.Url } : {}),
      ...(b.PhoneNumber ? { phone_number: b.PhoneNumber } : {}),
      ...(b.CopyCode ? { copy_code: b.CopyCode } : {}),
    })),
  };
  const res = await apiCall(baseUrl, '/chat/send/buttons', userToken, 'POST', payload);
  return { success: true, id: res.id || res.messageId };
}

export async function sendList(baseUrl: string, userToken: string, to: string, payload: {
  topText: string; desc: string; buttonText: string; footerText?: string;
  sections: { title: string; rows: { title: string; description?: string; rowId?: string }[] }[];
}): Promise<MessageResult> {
  const res = await apiCall(baseUrl, '/chat/send/list', userToken, 'POST', {
    Phone: to, ButtonText: payload.buttonText, Desc: payload.desc, TopText: payload.topText,
    FooterText: payload.footerText ?? '',
    Sections: payload.sections.map((s) => ({ Title: s.title, Rows: s.rows.map((r) => ({ Title: r.title, Description: r.description ?? '', RowId: r.rowId ?? r.title })) })),
  });
  return { success: true, id: res.id || res.messageId };
}

// ============================================================================
// AVATAR & NUMBER CHECK ENDPOINTS
// ============================================================================

export async function getAvatar(baseUrl: string, userToken: string, jid: string): Promise<string> {
  try {
    const res = await apiCall(baseUrl, '/user/avatar', userToken, 'POST', { Phone: jid });
    return res?.data?.URL || res?.URL || '';
  } catch { return ''; }
}

export async function checkPhone(baseUrl: string, userToken: string, phone: string): Promise<{ isWhatsApp: boolean; jid?: string }> {
  try {
    const res = await apiCall(baseUrl, '/user/check', userToken, 'POST', { Phone: phone });
    const users = res?.data?.Users ?? [];
    const found = users.find((u: { IsInWhatsapp?: boolean }) => u.IsInWhatsapp);
    return { isWhatsApp: !!found, jid: found?.JID || undefined };
  } catch { return { isWhatsApp: false }; }
}

export function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0]?.split(':')[0] || jid;
}

// ============================================================================
// INSTANCE HELPERS
// ============================================================================

export async function getWuzapiInstanceByName(name: string): Promise<WuzapiInstance | null> {
  const userId = getUserId();
  if (!userId) return null;
  try {
    const rows = await api.get('wuzapi_instances', { name });
    return (rows?.[0] as WuzapiInstance) || null;
  } catch { return null; }
}

export async function getWuzapiInstanceCredentials(instanceId: string): Promise<{ baseUrl: string; userToken: string } | null> {
  const creds = await loadWuzapiSettings();
  if (!creds) return null;
  try {
    const data = await api.getById('wuzapi_instances', instanceId);
    if (!data) return null;
    return { baseUrl: creds.baseUrl, userToken: data.user_token };
  } catch { return null; }
}
