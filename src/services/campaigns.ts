import { api } from './api';
import { ActiveCampaign } from '@/components/wizard/ActiveCampaigns';
import { Campaign } from '@/components/wizard/CampaignHistory';
import { CampaignMessage } from './campaignSender';

export type ContactStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'ignored' | 'cancelled';

export interface CampaignRecord {
  id: string;
  user_id: string;
  name: string;
  status: ActiveCampaign['status'];
  settings: Record<string, unknown>;
  schedule: { enabled: boolean; weekDays: number[]; startTime: string; endTime: string } | null;
  total_contacts: number;
  sent_count: number;
  failed_count: number;
  replied_count: number;
  pending_count: number;
  ignored_count: number;
  current_index: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignContactRecord {
  id: string;
  campaign_id: string;
  order_index: number;
  phone: string;
  name: string | null;
  data: Record<string, unknown> | null;
  status: ContactStatus;
  error: string | null;
  error_message: string | null;
  retry_count: number;
  message_id: string | null;
  attempted_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface CampaignMessageRecord {
  id: string;
  campaign_id: string;
  content: string;
  media_type: string;
  media_url: string | null;
  media_caption: string | null;
  media_filename: string | null;
  title: string | null;
  footer: string | null;
  buttons: unknown | null;
  link_url: string | null;
  section: unknown | null;
  cards: unknown | null;
  msg_order: number;
  created_at: string;
}

export interface CampaignAuditRecord {
  id: string;
  campaign_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateCampaignInput {
  name: string;
  settings: Record<string, unknown>;
  schedule?: { enabled: boolean; weekDays: number[]; startTime: string; endTime: string } | null;
  contacts: Array<{ phone: string; name?: string; data?: Record<string, unknown> }>;
  messages: Array<{
    content: string;
    media_type?: string;
    media_url?: string;
    media_caption?: string;
    media_filename?: string;
    title?: string;
    footer?: string;
    buttons?: unknown;
    link_url?: string;
    sections?: unknown;
    cards?: unknown;
  }>;
}

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignRecord> {
  const campaign = await api.post('campaigns', {
    name: input.name,
    status: 'running',
    settings: input.settings,
    schedule: input.schedule || null,
    total_contacts: input.contacts.length,
    pending_count: input.contacts.length,
    started_at: new Date().toISOString(),
  });

  if (input.contacts.length > 0) {
    const contactRows = input.contacts.map((c, index) => ({
      campaign_id: campaign.id,
      order_index: index,
      phone: c.phone,
      name: c.name || null,
      data: c.data || null,
      status: 'pending',
    }));
    for (const row of contactRows) {
      await api.post('campaign_contacts', row);
    }
  }

  if (input.messages.length > 0) {
    for (let i = 0; i < input.messages.length; i++) {
      const msg = input.messages[i];
      await api.post('campaign_messages', {
        campaign_id: campaign.id,
        content: msg.content,
        media_type: msg.media_type || 'text',
        media_url: msg.media_url || null,
        media_caption: msg.media_caption || null,
        media_filename: msg.media_filename || null,
        title: msg.title || null,
        footer: msg.footer || null,
        buttons: msg.buttons || null,
        link_url: msg.link_url || null,
        section: msg.sections || null,
        cards: msg.cards || null,
        msg_order: i,
      });
    }
  }

  return campaign;
}

export async function loadCampaigns(): Promise<CampaignRecord[]> {
  return api.get('campaigns', { order: 'created_at.desc' }) as Promise<CampaignRecord[]>;
}

export async function getCampaign(id: string): Promise<CampaignRecord> {
  return api.getById('campaigns', id) as Promise<CampaignRecord>;
}

export async function getCampaignContacts(campaignId: string): Promise<CampaignContactRecord[]> {
  return api.get('campaign_contacts', { campaign_id: campaignId, order: 'order_index.asc' }) as Promise<CampaignContactRecord[]>;
}

export async function getCampaignMessages(campaignId: string): Promise<CampaignMessageRecord[]> {
  return api.get('campaign_messages', { campaign_id: campaignId, order: 'msg_order.asc' }) as Promise<CampaignMessageRecord[]>;
}

export async function getPendingContacts(campaignId: string): Promise<CampaignContactRecord[]> {
  return api.get('campaign_contacts', { campaign_id: campaignId, status: 'pending', order: 'order_index.asc' }) as Promise<CampaignContactRecord[]>;
}

export async function getFailedContacts(campaignId: string): Promise<CampaignContactRecord[]> {
  return api.get('campaign_contacts', { campaign_id: campaignId, status: 'failed', order: 'order_index.asc' }) as Promise<CampaignContactRecord[]>;
}

export async function getPendingOrFailedContacts(campaignId: string): Promise<CampaignContactRecord[]> {
  const pending = await getPendingContacts(campaignId);
  const failed = await getFailedContacts(campaignId);
  const merged = [...pending, ...failed];
  merged.sort((a, b) => a.order_index - b.order_index);
  return merged;
}

export async function getCampaignContactsByStatus(campaignId: string, status: ContactStatus): Promise<CampaignContactRecord[]> {
  return api.get('campaign_contacts', { campaign_id: campaignId, status, order: 'order_index.asc' }) as Promise<CampaignContactRecord[]>;
}

export async function updateCampaignStatus(
  id: string,
  status: CampaignRecord['status'],
  extra?: Partial<Pick<CampaignRecord, 'paused_at' | 'completed_at' | 'started_at'>>
): Promise<void> {
  const updates: Record<string, unknown> = { status, ...extra };
  if (status === 'running') {
    updates.started_at = new Date().toISOString();
    updates.paused_at = null;
  } else if (status === 'paused') {
    updates.paused_at = new Date().toISOString();
  } else if (status === 'completed' || status === 'error' || status === 'cancelled') {
    updates.completed_at = new Date().toISOString();
  }
  await api.put('campaigns', id, updates);
}

export async function pauseCampaign(
  id: string,
  progress: { sent_count: number; failed_count: number; replied_count: number; current_index: number }
): Promise<void> {
  await api.put('campaigns', id, {
    status: 'paused',
    paused_at: new Date().toISOString(),
    ...progress,
  });
}

export async function updateCampaignProgress(
  id: string,
  data: { sent_count: number; failed_count: number; replied_count: number; current_index: number }
): Promise<void> {
  await api.put('campaigns', id, data);
}

export async function updateCampaignCounts(
  id: string,
  data: { sent_count?: number; failed_count?: number; replied_count?: number; pending_count?: number; ignored_count?: number }
): Promise<void> {
  await api.put('campaigns', id, data);
}

export async function updateContactStatus(
  contactId: string,
  status: ContactStatus,
  extra?: {
    error?: string | null;
    error_message?: string | null;
    retry_count?: number;
    message_id?: string | null;
    attempted_at?: string | null;
    sent_at?: string | null;
  }
): Promise<void> {
  const updates: Record<string, unknown> = { status, ...extra };
  await api.put('campaign_contacts', contactId, updates);
}

export async function deleteCampaign(id: string): Promise<void> {
  await api.del('campaigns', id);
}

export async function addAuditLog(
  campaignId: string,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  await api.post('campaign_audit', {
    campaign_id: campaignId,
    action,
    details: details || null,
  });
}

export async function loadCampaignAudit(campaignId: string): Promise<CampaignAuditRecord[]> {
  return api.get('campaign_audit', { campaign_id: campaignId, order: 'created_at.asc' }) as Promise<CampaignAuditRecord[]>;
}

export function campaignRecordToActive(r: CampaignRecord): ActiveCampaign {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    totalContacts: r.total_contacts,
    sentCount: r.sent_count,
    failedCount: r.failed_count,
    repliedCount: r.replied_count,
    createdAt: new Date(r.created_at),
  };
}

export function campaignRecordToHistory(
  r: CampaignRecord,
  messages: CampaignMessageRecord[]
): Campaign {
  return {
    id: r.id,
    name: r.name,
    date: new Date(r.created_at),
    totalContacts: r.total_contacts,
    sentCount: r.sent_count,
    successCount: r.sent_count - r.failed_count,
    failedCount: r.failed_count,
    messages: messages.map(m => m.content),
    status: r.status === 'completed' ? 'completed' : r.status === 'error' ? 'failed' : 'partial',
  };
}
