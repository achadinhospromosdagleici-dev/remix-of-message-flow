// Messages Service
// Manages conversations and messages from WhatsApp webhooks

import { api } from '@/services/api';

export interface Conversation {
  id: string;
  instance_name: string;
  phone_number: string;
  contact_name: string | null;
  profile_picture: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  instance_name: string;
  message_id: string | null;
  from_me: boolean;
  phone_number: string;
  content: string | null;
  message_type: string;
  media_url: string | null;
  media_caption: string | null;
  timestamp: string | null;
  created_at: string;
}

// Get all conversations for an instance
export async function getConversations(instanceName: string): Promise<Conversation[]> {
  try {
    const data = (await api.get('conversations', { instance_name: instanceName })) || [];
    return data;
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
}

// Get messages for a conversation
export async function getMessages(conversationId: string): Promise<Message[]> {
  try {
    const data = (await api.get('messages', { conversation_id: conversationId })) || [];
    return data;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

// Get conversation by ID
export async function getConversation(conversationId: string): Promise<Conversation | null> {
  try {
    const data = (await api.get('conversations', { id: conversationId })) as Conversation[];
    return data?.[0] || null;
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return null;
  }
}

// Mark conversation as read (reset unread count)
export async function markConversationAsRead(conversationId: string): Promise<void> {
  try {
    await api.put('conversations', conversationId, { unread_count: 0 });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
  }
}

// Get total unread count for an instance
export async function getTotalUnreadCount(instanceName: string): Promise<number> {
  try {
    const data = (await api.get('conversations', { instance_name: instanceName })) as Conversation[];
    return (data || []).reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return 0;
  }
}

// Subscribe to new messages via polling
export function subscribeToMessages(
  conversationId: string,
  onNewMessage: (message: Message) => void
) {
  const seenIds = new Set<string>();
  const interval = setInterval(async () => {
    try {
      const messages = await getMessages(conversationId);
      for (const msg of messages) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          onNewMessage(msg);
        }
      }
    } catch {}
  }, 5000);

  return () => clearInterval(interval);
}

// Subscribe to new conversations via polling
export function subscribeToConversations(
  instanceName: string,
  onNewConversation: (conversation: Conversation) => void
) {
  const seenIds = new Set<string>();
  const interval = setInterval(async () => {
    try {
      const conversations = await getConversations(instanceName);
      for (const conv of conversations) {
        if (!seenIds.has(conv.id)) {
          seenIds.add(conv.id);
          onNewConversation(conv);
        }
      }
    } catch {}
  }, 5000);

  return () => clearInterval(interval);
}

// Get the webhook URL for this app
export function getWebhookUrl(): string {
  return `${window.location.origin}/api/webhook/receive`;
}