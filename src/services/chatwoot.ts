// Chatwoot API Service
// Manages communication with Chatwoot API for message sending and inbox management

import { supabase } from '@/integrations/supabase/client';
import { getUserId } from '@/services/user';

export interface ChatwootCredentials {
  baseUrl: string; // e.g. https://app.chatwoot.com
  apiToken: string;
  accountId: number;
}

export interface ChatwootInbox {
  id: number;
  name: string;
  channel_type: string;
  phone_number?: string;
  avatar_url?: string;
}

export interface ChatwootConversation {
  id: number;
  inbox_id: number;
  status: string;
  contact: {
    id: number;
    name: string;
    phone_number: string;
  };
  messages: ChatwootMessage[];
}

export interface ChatwootMessage {
  id: number;
  content: string;
  message_type: 'incoming' | 'outgoing';
  created_at: number;
  conversation_id: number;
}

export interface ChatwootContact {
  id: number;
  name: string;
  phone_number: string;
  email?: string;
}

const STORAGE_KEY = 'chatwoot_credentials';

async function saveChatwootToDb(creds: ChatwootCredentials): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  await supabase.from('chatwoot_settings').upsert({
    user_id: userId,
    base_url: creds.baseUrl,
    api_token: creds.apiToken,
    account_id: creds.accountId,
  }, { onConflict: 'user_id' });
}

async function loadChatwootFromDb(): Promise<ChatwootCredentials | null> {
  try {
    const userId = getUserId();
    if (!userId) return null;
    const { data, error } = await supabase.from('chatwoot_settings').select('*').eq('user_id', userId).maybeSingle();
    if (error) {
      console.error('Error loading chatwoot from DB:', error);
      return null;
    }
    if (!data) return null;
    return {
      baseUrl: data.base_url,
      apiToken: data.api_token,
      accountId: data.account_id,
    };
  } catch (error) {
    console.error('Error loading chatwoot from DB:', error);
    return null;
  }
}

export async function saveChatwootCredentials(credentials: ChatwootCredentials): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  await saveChatwootToDb(credentials);
}

export function loadChatwootCredentials(): ChatwootCredentials | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

export async function loadChatwootCredentialsWithFallback(): Promise<ChatwootCredentials | null> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) { try { return JSON.parse(stored); } catch { return null; } }
  try {
    return await loadChatwootFromDb();
  } catch {
    return null;
  }
}

export async function clearChatwootCredentials(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  const userId = getUserId();
  if (!userId) return;
  await supabase.from('chatwoot_settings').delete().eq('user_id', userId);
}

function getHeaders(apiToken: string) {
  return {
    'Content-Type': 'application/json',
    api_access_token: apiToken,
  };
}

export async function fetchInboxes(creds: ChatwootCredentials): Promise<ChatwootInbox[]> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/inboxes`,
    { headers: getHeaders(creds.apiToken) }
  );
  if (!res.ok) throw new Error(`Erro ao buscar caixas de entrada: ${res.status}`);
  const data = await res.json();
  return data.payload || [];
}

export async function searchContact(
  creds: ChatwootCredentials,
  phoneNumber: string
): Promise<ChatwootContact | null> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/contacts/search?q=${encodeURIComponent(phoneNumber)}`,
    { headers: getHeaders(creds.apiToken) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.payload?.[0] || null;
}

export async function createContact(
  creds: ChatwootCredentials,
  name: string,
  phoneNumber: string,
  inboxId: number
): Promise<ChatwootContact> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/contacts`,
    {
      method: 'POST',
      headers: getHeaders(creds.apiToken),
      body: JSON.stringify({
        name,
        phone_number: phoneNumber,
        inbox_id: inboxId,
      }),
    }
  );
  if (!res.ok) throw new Error(`Erro ao criar contato: ${res.status}`);
  const data = await res.json();
  return data.payload?.contact || data;
}

export async function createConversation(
  creds: ChatwootCredentials,
  contactId: number,
  inboxId: number
): Promise<ChatwootConversation> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/conversations`,
    {
      method: 'POST',
      headers: getHeaders(creds.apiToken),
      body: JSON.stringify({
        contact_id: contactId,
        inbox_id: inboxId,
      }),
    }
  );
  if (!res.ok) throw new Error(`Erro ao criar conversa: ${res.status}`);
  return await res.json();
}

export async function findOrCreateConversation(
  creds: ChatwootCredentials,
  phoneNumber: string,
  inboxId: number,
  contactName?: string
): Promise<{ conversationId: number; contactId: number }> {
  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  
  let contact = await searchContact(creds, normalizedPhone);
  let contactId: number;
  let conversationId: number;
  
  if (!contact) {
    const newContact = await createContact(
      creds,
      contactName || `Contato ${normalizedPhone}`,
      normalizedPhone,
      inboxId
    );
    contactId = newContact.id;
  } else {
    contactId = contact.id;
  }
  
  const conversations = await getContactConversations(creds, contactId);
  const existingConv = conversations.find(c => c.inbox_id === inboxId);
  
  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const newConv = await createConversation(creds, contactId, inboxId);
    conversationId = newConv.id;
  }
  
  return { conversationId, contactId };
}

export async function fetchContactsByLabel(
  creds: ChatwootCredentials,
  label: string
): Promise<ChatwootContact[]> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/contacts?labels[]=${encodeURIComponent(label)}`,
    { headers: getHeaders(creds.apiToken) }
  );
  if (!res.ok) throw new Error(`Erro ao buscar contatos por etiqueta: ${res.status}`);
  const data = await res.json();
  return data.payload || [];
}

export async function sendMessage(
  creds: ChatwootCredentials,
  conversationId: number,
  content: string
): Promise<ChatwootMessage> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: getHeaders(creds.apiToken),
      body: JSON.stringify({
        content,
        message_type: 'outgoing',
        private: false,
      }),
    }
  );
  if (!res.ok) throw new Error(`Erro ao enviar mensagem: ${res.status}`);
  return await res.json();
}

export async function sendImageMessage(
  creds: ChatwootCredentials,
  conversationId: number,
  imageUrl: string,
  caption?: string
): Promise<ChatwootMessage> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: getHeaders(creds.apiToken),
      body: JSON.stringify({
        content: caption || 'Imagem',
        message_type: 'outgoing',
        private: false,
        attachments: [imageUrl],
      }),
    }
  );
  if (!res.ok) throw new Error(`Erro ao enviar imagem: ${res.status}`);
  return await res.json();
}

export async function sendVideoMessage(
  creds: ChatwootCredentials,
  conversationId: number,
  videoUrl: string,
  caption?: string
): Promise<ChatwootMessage> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: getHeaders(creds.apiToken),
      body: JSON.stringify({
        content: caption || 'Vídeo',
        message_type: 'outgoing',
        private: false,
        attachments: [videoUrl],
      }),
    }
  );
  if (!res.ok) throw new Error(`Erro ao enviar vídeo: ${res.status}`);
  return await res.json();
}

export async function sendDocumentMessage(
  creds: ChatwootCredentials,
  conversationId: number,
  documentUrl: string,
  filename: string
): Promise<ChatwootMessage> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: getHeaders(creds.apiToken),
      body: JSON.stringify({
        content: filename,
        message_type: 'outgoing',
        private: false,
        attachments: [documentUrl],
      }),
    }
  );
  if (!res.ok) throw new Error(`Erro ao enviar documento: ${res.status}`);
  return await res.json();
}

export async function sendMediaMessage(
  creds: ChatwootCredentials,
  conversationId: number,
  mediaType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'contact',
  mediaUrl?: string,
  caption?: string,
  filename?: string
): Promise<ChatwootMessage> {
  switch (mediaType) {
    case 'image':
      return sendImageMessage(creds, conversationId, mediaUrl!, caption);
    case 'video':
      return sendVideoMessage(creds, conversationId, mediaUrl!, caption);
    case 'document':
      return sendDocumentMessage(creds, conversationId, mediaUrl!, filename || 'documento');
    case 'audio':
      return sendImageMessage(creds, conversationId, mediaUrl!, caption);
    case 'contact': {
      const contactInfo = caption ? `👤 Contato: ${caption}` : '👤 Contato';
      const phoneInfo = filename ? `\n📞 Telefone: ${filename}` : '';
      return sendMessage(creds, conversationId, `${contactInfo}${phoneInfo}`);
    }
    default:
      return sendMessage(creds, conversationId, mediaUrl || caption || '');
  }
}

export async function getConversationMessages(
  creds: ChatwootCredentials,
  conversationId: number
): Promise<ChatwootMessage[]> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/conversations/${conversationId}/messages`,
    { headers: getHeaders(creds.apiToken) }
  );
  if (!res.ok) throw new Error(`Erro ao buscar mensagens: ${res.status}`);
  const data = await res.json();
  return data.payload || [];
}

export async function checkForReply(
  creds: ChatwootCredentials,
  conversationId: number,
  afterTimestamp: number
): Promise<boolean> {
  const messages = await getConversationMessages(creds, conversationId);
  return messages.some(
    (msg) => msg.message_type === 'incoming' && msg.created_at > afterTimestamp
  );
}

export async function getContactConversations(
  creds: ChatwootCredentials,
  contactId: number
): Promise<ChatwootConversation[]> {
  const res = await fetch(
    `${creds.baseUrl}/api/v1/accounts/${creds.accountId}/contacts/${contactId}/conversations`,
    { headers: getHeaders(creds.apiToken) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.payload || [];
}
