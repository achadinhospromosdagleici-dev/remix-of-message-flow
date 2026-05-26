// UnoAPI Service
// Sends WhatsApp messages (text, image, audio, document, video) via UnoAPI Cloud API
// API follows WhatsApp Cloud API format: https://github.com/clairton/unoapi-cloud
import { supabase } from '@/integrations/supabase/client';
import { proxyCall } from './proxy';
import { generateId } from '@/lib/id';
export interface UnoApiCredentials {
  baseUrl: string;       // e.g. https://your-unoapi.com
  token: string;         // Authorization token
}

export type MediaType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'contact';

export interface MediaAttachment {
  type: MediaType;
  url?: string;
  caption?: string;
  filename?: string;
  mimeType?: string;
}

export interface UnoApiMessage {
  content: string;
  media?: MediaAttachment;
  buttons?: Array<{ id: string; title: string; url?: string; phone?: string; reply?: string; copy?: string; contactName?: string }>;
  list?: {
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
  carousel?: Array<{
    image?: string;
    title: string;
    description: string;
    footer?: string;
    buttons: Array<{ id: string; title: string; url?: string; phone?: string; reply?: string; copy?: string }>;
  }>;
  header?: string;
  footer?: string;
}

export interface UnoApiInstance {
  phone: string;
  status: 'connected' | 'disconnected' | 'unknown';
  name?: string;
}

const STORAGE_KEY = 'unoapi_credentials';

async function saveUnoApiToDb(creds: UnoApiCredentials): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('unoapi_settings').upsert({
    user_id: user.id,
    base_url: creds.baseUrl,
    token: creds.token,
    s3_enabled: creds.s3Enabled || false,
    s3_endpoint: creds.s3Endpoint,
    s3_access_key: creds.s3AccessKey,
    s3_secret_key: creds.s3SecretKey,
    s3_bucket: creds.s3Bucket,
    s3_region: creds.s3Region,
  }, { onConflict: 'user_id' });
}

async function loadUnoApiFromDb(): Promise<UnoApiCredentials | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from('unoapi_settings').select('*').eq('user_id', user.id).maybeSingle();
    if (error) {
      console.error('Error loading unoapi from DB:', error);
      return null;
    }
    if (!data) return null;
    return {
      baseUrl: data.base_url,
      token: data.token,
      s3Enabled: data.s3_enabled,
      s3Endpoint: data.s3_endpoint,
      s3AccessKey: data.s3_access_key,
      s3SecretKey: data.s3_secret_key,
      s3Bucket: data.s3_bucket,
      s3Region: data.s3_region,
    };
  } catch (error) {
    console.error('Error loading unoapi from DB:', error);
    return null;
  }
}

export async function saveUnoApiCredentials(credentials: UnoApiCredentials): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  await saveUnoApiToDb(credentials);
}

export function loadUnoApiCredentials(): UnoApiCredentials | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

export async function loadUnoApiCredentialsWithFallback(): Promise<UnoApiCredentials | null> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) { try { return JSON.parse(stored); } catch { return null; } }
  return loadUnoApiFromDb();
}

export async function clearUnoApiCredentials(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('unoapi_settings').delete().eq('user_id', user.id);
}

// Headers helper
function getHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: token,
  };
}

function buildApiUrl(baseUrl: string, phoneNumberId: string): string {
  return `${baseUrl}/v15.0/${phoneNumberId}/messages`;
}

// Proxy call via local server (avoids CORS)
async function proxyCallFn(creds: UnoApiCredentials, endpoint: string, method = 'GET', requestBody?: any): Promise<{ ok: boolean; data: any }> {
  try {
    const data = await proxyCall('unoapi', {
      baseUrl: creds.baseUrl,
      token: creds.token,
      endpoint,
      method,
      body: requestBody,
    });
    return { ok: true, data };
  } catch (err: any) {
    console.error('[unoapi] proxyCall error:', err);
    return { ok: false, data: { error: err.message } };
  }
}

// Proxy send message (avoids CORS issues)
async function proxySendMessage(creds: UnoApiCredentials, phoneNumberId: string, payload: any): Promise<any> {
  const endpoint = `/v15.0/${phoneNumberId}/messages`;
  const result = await proxyCallFn(creds, endpoint, 'POST', payload);
  
  if (!result.ok || !result.data) {
    throw new Error(result.data?.error || 'Erro ao enviar mensagem via proxy');
  }
  
  if (result.data.error) {
    throw new Error(result.data.error);
  }
  
  return result.data;
}

// Auto-detect Evolution API by trying its fetchInstances endpoint
async function detectEvolutionApi(creds: UnoApiCredentials): Promise<boolean> {
  try {
    const data = await proxyCall('evolution', {
      action: 'fetchInstances',
      baseUrl: creds.baseUrl,
      apiKey: creds.token,
    });
    return data && Array.isArray(data.instances);
  } catch {
    return false;
  }
}

// Fetch instances via Evolution API proxy
async function fetchEvolutionInstances(creds: UnoApiCredentials): Promise<{ instances: UnoApiInstance[]; error?: string }> {
  try {
    const data = await proxyCall('evolution', {
      action: 'fetchInstances',
      baseUrl: creds.baseUrl,
      apiKey: creds.token,
    });
    if (data?.instances && Array.isArray(data.instances)) {
      const instances: UnoApiInstance[] = data.instances.map((inst: any) => ({
        phone: inst.phone || inst.instanceName || '',
        status: (inst.status === 'open' || inst.status === 'connected') ? 'connected' as const : 'disconnected' as const,
        name: inst.profileName || inst.instanceName || undefined,
      }));
      return { instances };
    }
    return { instances: [], error: 'Nenhuma instância encontrada na Evolution API.' };
  } catch (err: any) {
    return { instances: [], error: err.message };
  }
}

// Test connection by checking if API is reachable
export async function testConnection(creds: UnoApiCredentials): Promise<boolean> {
  localStorage.setItem('api_type_detected', 'unoapi'); // Force UnoAPI mode
  
  try {
    // Try ping first
    const pingResult = await proxyCallFn(creds, 'ping');
    if (pingResult.ok && pingResult.data) {
      const text = typeof pingResult.data === 'string' ? pingResult.data : (pingResult.data.text || JSON.stringify(pingResult.data));
      if (text.toLowerCase().includes('pong')) return true;
    }

    // Fallback: Try fetching sessions (the actual endpoint we use)
    const sessionsResult = await proxyCallFn(creds, 'sessions');
    if (sessionsResult.ok && sessionsResult.data) {
      // If we got a valid JSON response from the proxy, the API is reachable
      return true;
    }
    
    return false;
  } catch (err) {
    console.error('[UnoAPI] Connection test failed:', err);
    return false;
  }
}

// Force set API type (for testing)
export function forceSetApiType(type: 'unoapi' | 'evolution'): void {
  localStorage.setItem('api_type_detected', type);
}

// Fetch connected instances/phone numbers
export async function fetchInstances(creds: UnoApiCredentials): Promise<{ instances: UnoApiInstance[]; error?: string }> {
  console.log('[UnoAPI] Fetching instances from:', creds.baseUrl);

  try {
    // Use ONLY /sessions endpoint
    const result = await proxyCallFn(creds, 'sessions');
    
    if (result.ok && result.data) {
      const data = result.data;
      console.log('[UnoAPI] /sessions response:', JSON.stringify(data).substring(0, 1000));

      // Handle error response from proxy
      if (data?.error) {
        return { instances: [], error: data.error?.title || data.error };
      }

      // FORMATO EXATO da UnoAPI: { "data": [{ "display_phone_number": "5531...", "status": "online" }] }
      if (data?.data && Array.isArray(data.data)) {
        const instances: UnoApiInstance[] = data.data
          .filter((item: any) => item.display_phone_number && typeof item.display_phone_number === 'string')
          .map((item: any) => ({
            phone: item.display_phone_number,
            status: (item.status === 'online' || item.status === 'connected' || item.status === 'open')
              ? 'connected' as const
              : 'disconnected' as const,
            name: item.pushName || item.profileName || item.name || undefined,
          }));
        
        console.log('[UnoAPI] Found instances:', instances);
        
        // Only return if we found valid instances, don't fallback to manual
        if (instances.length > 0) {
          return { instances };
        }
      }

      return { instances: [], error: 'Nenhum número encontrado. Verifique se há instâncias conectadas na UnoAPI.' };
    }
    
    return { instances: [], error: 'Erro ao conectar com UnoAPI. Verifique URL e token.' };
  } catch (err: any) {
    console.error('[UnoAPI] Erro ao buscar instâncias:', err);
    return { instances: [], error: `Erro: ${err.message}` };
  }
}

// Manual instances storage
const MANUAL_INSTANCES_KEY = 'unoapi_manual_instances';

export function saveManualInstances(instances: UnoApiInstance[]): void {
  localStorage.setItem(MANUAL_INSTANCES_KEY, JSON.stringify(instances));
}

export function loadManualInstances(): UnoApiInstance[] {
  const stored = localStorage.getItem(MANUAL_INSTANCES_KEY);
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
}

export function clearManualInstances(): void {
  localStorage.removeItem(MANUAL_INSTANCES_KEY);
}

// Send text message
export async function sendTextMessage(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  body: string
): Promise<any> {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  };
  
  console.log('[unoapi] sendTextMessage:', {
    baseUrl: creds.baseUrl,
    phoneNumberId,
    to,
    body: body.substring(0, 50)
  });
  
  try {
    const result = await proxySendMessage(creds, phoneNumberId, payload);
    console.log('[unoapi] sendTextMessage result:', result);
    return result;
  } catch (err) {
    console.error('[unoapi] sendTextMessage error:', err);
    throw err;
  }
}

// Send image message
export async function sendImageMessage(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  imageUrl: string,
  caption?: string
): Promise<any> {
  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl },
  };
  if (caption) payload.image.caption = caption;
  
  try {
    return await proxySendMessage(creds, phoneNumberId, payload);
  } catch (err) {
    console.warn('[unoapi] Proxy failed for image, trying direct fetch:', err);
    const res = await fetch(buildApiUrl(creds.baseUrl, phoneNumberId), {
      method: 'POST',
      headers: getHeaders(creds.token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Erro ao enviar imagem: ${res.status} - ${errorData}`);
    }
    return await res.json();
  }
}

// Send audio message
export async function sendAudioMessage(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  audioUrl: string
): Promise<any> {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { link: audioUrl },
  };
  
  try {
    return await proxySendMessage(creds, phoneNumberId, payload);
  } catch (err) {
    console.warn('[unoapi] Proxy failed for audio, trying direct fetch:', err);
    const res = await fetch(buildApiUrl(creds.baseUrl, phoneNumberId), {
      method: 'POST',
      headers: getHeaders(creds.token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Erro ao enviar áudio: ${res.status} - ${errorData}`);
    }
    return await res.json();
  }
}

// Send video message
export async function sendVideoMessage(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  videoUrl: string,
  caption?: string
): Promise<any> {
  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: { link: videoUrl },
  };
  if (caption) payload.video.caption = caption;
  
  try {
    return await proxySendMessage(creds, phoneNumberId, payload);
  } catch (err) {
    console.warn('[unoapi] Proxy failed for video, trying direct fetch:', err);
    const res = await fetch(buildApiUrl(creds.baseUrl, phoneNumberId), {
      method: 'POST',
      headers: getHeaders(creds.token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Erro ao enviar vídeo: ${res.status} - ${errorData}`);
    }
    return await res.json();
  }
}

// Send document message
export async function sendDocumentMessage(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  documentUrl: string,
  filename?: string,
  caption?: string
): Promise<any> {
  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: { link: documentUrl },
  };
  if (filename) payload.document.filename = filename;
  if (caption) payload.document.caption = caption;
  
  try {
    return await proxySendMessage(creds, phoneNumberId, payload);
  } catch (err) {
    console.warn('[unoapi] Proxy failed for document, trying direct fetch:', err);
    const res = await fetch(buildApiUrl(creds.baseUrl, phoneNumberId), {
      method: 'POST',
      headers: getHeaders(creds.token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Erro ao enviar documento: ${res.status} - ${errorData}`);
    }
    return await res.json();
  }
}

// Send contact (vCard) message
export async function sendContactMessage(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  contactName: string,
  contactNumber: string
): Promise<any> {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'contacts',
    contacts: [
      {
        name: {
          formatted_name: contactName,
        },
        phones: [
          {
            wa_id: contactNumber.replace(/\D/g, ''),
            phone: contactNumber.startsWith('+') ? contactNumber : `+${contactNumber.replace(/\D/g, '')}`,
          },
        ],
      },
    ],
  };

  try {
    return await proxySendMessage(creds, phoneNumberId, payload);
  } catch (err) {
    console.warn('[unoapi] Proxy failed for contact, trying direct fetch:', err);
    const res = await fetch(buildApiUrl(creds.baseUrl, phoneNumberId), {
      method: 'POST',
      headers: getHeaders(creds.token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Erro ao enviar contato: ${res.status} - ${errorData}`);
    }
    return await res.json();
  }
}

// Send interactive buttons message
export async function sendInteractiveButtons(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string; url?: string; phone?: string; reply?: string }>,
  header?: string,
  footer?: string,
  mediaHeader?: { type: 'image' | 'video' | 'document'; url: string; filename?: string }
): Promise<any> {
  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body || ' ' },
      action: {
        buttons: buttons.map(btn => {
          if (btn.url) {
            // URL button - native cta_url
            return {
              type: 'cta_url',
              url: {
                title: btn.title,
                link: btn.url,
              },
            };
          } else if (btn.phone) {
            // Phone button - native cta_call
            let phoneNum = btn.phone.replace(/\D/g, '');
            if (phoneNum.length > 0 && !phoneNum.startsWith('55') && phoneNum.length <= 11) {
              phoneNum = '55' + phoneNum;
            }
            return {
              type: 'cta_call',
              call: {
                title: btn.title,
                phone_number: `+${phoneNum}`,
              },
            };
          } else if (btn.copy) {
            // Copy button - native cta_copy
            return {
              type: 'cta_copy',
              copy_code: {
                title: btn.title,
                code: btn.copy,
              },
            };
          } else if (btn.reply) {
            // Reply button - envia o texto quando clicado
            return {
              type: 'reply',
              reply: {
                id: btn.id || generateId(),
                title: btn.reply,
              },
            };
          } else {
            // Default reply button (fallback)
            return {
              type: 'reply',
              reply: {
                id: btn.id || generateId(),
                title: btn.title,
              },
            };
          }
        }),
      },
    },
  };

if (mediaHeader) {
    // Header com mídia (imagem/vídeo/documento) — formato WhatsApp Cloud API
    if (mediaHeader.type === 'image') {
      payload.interactive.header = { type: 'image', image: { link: mediaHeader.url } };
    } else if (mediaHeader.type === 'video') {
      payload.interactive.header = { type: 'video', video: { link: mediaHeader.url } };
    } else if (mediaHeader.type === 'document') {
      payload.interactive.header = {
        type: 'document',
        document: { link: mediaHeader.url, filename: mediaHeader.filename || undefined },
      };
    }
  } else if (header) {
    payload.interactive.header = { type: 'text', text: header };
  }
  if (footer) {
    payload.interactive.footer = { text: footer };
  }

  try {
    return await proxySendMessage(creds, phoneNumberId, payload);
  } catch (err) {
    console.warn('[unoapi] Proxy failed for buttons, trying direct fetch:', err);
    const res = await fetch(buildApiUrl(creds.baseUrl, phoneNumberId), {
      method: 'POST',
      headers: getHeaders(creds.token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Erro ao enviar botões: ${res.status} - ${errorData}`);
    }
    return await res.json();
  }
}

// Send interactive list message
export async function sendInteractiveList(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  body: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>,
  header?: string,
  footer?: string
): Promise<any> {
  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body || ' ' },
      action: {
        button: buttonText,
        sections: sections.map(section => ({
          title: section.title,
          rows: section.rows.map(row => ({
            id: row.id,
            title: row.title,
            description: row.description || '',
          })),
        })),
      },
    },
  };

  if (header) {
    payload.interactive.header = { type: 'text', text: header };
  }
  if (footer) {
    payload.interactive.footer = { text: footer };
  }

  try {
    return await proxySendMessage(creds, phoneNumberId, payload);
  } catch (err) {
    console.warn('[unoapi] Proxy failed for list, trying direct fetch:', err);
    const res = await fetch(buildApiUrl(creds.baseUrl, phoneNumberId), {
      method: 'POST',
      headers: getHeaders(creds.token),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`Erro ao enviar lista: ${res.status} - ${errorData}`);
    }
    return await res.json();
  }
}

// Send interactive carousel message
export async function sendCarouselMessage(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  body: string,
  cards: Array<{
    image?: string;
    title: string;
    description: string;
    footer?: string;
    buttons: Array<{ id: string; title: string; url?: string; phone?: string; reply?: string; copy?: string }>;
  }>
): Promise<any> {
  console.log('[unoapi] sendCarouselMessage payload:', JSON.stringify(cards, null, 2));
  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'carousel',
      body: { text: body || ' ' },
      action: {
        cards: cards.map((card, index) => {
          const cardPayload: any = {
            card_index: index,
            body: { text: card.description || ' ' },
            action: {
              buttons: card.buttons.map(btn => {
                if (btn.url) {
                  return {
                    type: 'cta_url',
                    url: {
                      title: btn.title,
                      link: btn.url,
                    },
                  };
                } else if (btn.phone) {
                  let phoneNum = btn.phone.replace(/\D/g, '');
                  if (phoneNum.length > 0 && !phoneNum.startsWith('55') && phoneNum.length <= 11) {
                    phoneNum = '55' + phoneNum;
                  }
                  return {
                    type: 'cta_call',
                    call: {
                      title: btn.title,
                      phone_number: `+${phoneNum}`,
                    },
                  };
                } else if (btn.copy) {
                  return {
                    type: 'cta_copy',
                    copy_code: {
                      title: btn.title,
                      code: btn.copy,
                    },
                  };
                } else {
                  return {
                    type: 'reply',
                    reply: {
                      id: btn.id || generateId(),
                      title: btn.reply || btn.title,
                    },
                  };
                }
              }),
            },
          };

          if (card.image) {
            cardPayload.header = {
              type: 'image',
              image: { link: card.image },
            };
          }

          return cardPayload;
        }),
      },
    },
  };

  try {
    return await proxySendMessage(creds, phoneNumberId, payload);
  } catch (err) {
    console.warn('[unoapi] Proxy failed for carousel, trying direct fetch:', err);
    const res = await fetch(buildApiUrl(creds.baseUrl, phoneNumberId), {
      method: 'POST',
      headers: getHeaders(creds.token),
      body: JSON.stringify(payload),
    });
    console.log('[unoapi] Direct fetch response status:', res.status);
    if (!res.ok) {
      const errorData = await res.text();
      console.error('[unoapi] Direct fetch error data:', errorData);
      throw new Error(`Erro ao enviar carrossel: ${res.status} - ${errorData}`);
    }
    return await res.json();
  }
}

// Generic send based on media type
export async function sendUnoApiMessage(
  creds: UnoApiCredentials,
  phoneNumberId: string,
  to: string,
  message: UnoApiMessage
): Promise<any> {
  // Check for interactive buttons (but not if it's a contact message using buttons array for data payload)
  if (message.buttons && message.buttons.length > 0 && (!message.media || message.media.type !== 'contact')) {
    return sendInteractiveButtons(
      creds,
      phoneNumberId,
      to,
      message.content,
      message.buttons,
      message.header,
      message.footer
    );
  }

  // Check for interactive list
  if (message.list) {
    return sendInteractiveList(
      creds,
      phoneNumberId,
      to,
      message.content,
      message.list.buttonText,
      message.list.sections,
      message.header,
      message.footer
    );
  }

  // Check for interactive carousel
  if (message.carousel) {
    return sendCarouselMessage(
      creds,
      phoneNumberId,
      to,
      message.content,
      message.carousel
    );
  }

  // Text only (no media)
  if (!message.media || message.media.type === 'text') {
    return sendTextMessage(creds, phoneNumberId, to, message.content);
  }

  // Media messages
  const { type, url, caption, filename } = message.media;
  
  if (type === 'contact') {
    return sendContactMessage(creds, phoneNumberId, to, message.buttons?.[0]?.contactName || message.content, message.buttons?.[0]?.phone || '');
  }

  if (!url) {
    return sendTextMessage(creds, phoneNumberId, to, message.content);
  }

  switch (type) {
    case 'image':
      return sendImageMessage(creds, phoneNumberId, to, url, caption || message.content);
    case 'audio':
      return sendAudioMessage(creds, phoneNumberId, to, url);
    case 'video':
      return sendVideoMessage(creds, phoneNumberId, to, url, caption || message.content);
    case 'document':
      return sendDocumentMessage(creds, phoneNumberId, to, url, filename, caption || message.content);
    default:
      return sendTextMessage(creds, phoneNumberId, to, message.content);
  }
}
