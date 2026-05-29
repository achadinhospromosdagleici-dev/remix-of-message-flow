// Campaign Sender Service
// Supports both UnoAPI and Evolution API with progress tracking

import {
  loadUnoApiCredentials,
  loadUnoApiCredentialsWithFallback,
  sendUnoApiMessage,
  UnoApiMessage,
} from './unoapi';
import {
  loadEvolutionCredentials,
  loadEvolutionCredentialsWithFallback,
  sendMessage as sendEvoMessage,
  getInstanceStatus,
  EvolutionMessage,
} from './evolution';
import {
  loadEvolutionGoCredentials,
  loadEvolutionGoCredentialsWithFallback,
  sendEvolutionGoMessage,
  getEvolutionGoInstanceStatus,
  EvolutionGoMessage,
} from './evolutionGo';
import {
  loadChatwootCredentialsWithFallback,
  findOrCreateConversation,
  sendMediaMessage as sendCwMediaMessage,
} from './chatwoot';
import {
  loadWuzapiSettings,
  loadWuzapiInstances,
  getWuzapiInstanceCredentials,
} from './wuzapi';
import { sendWuzapiMessage } from './wuzapi-sender';
import { FollowUpConfig } from '@/components/wizard/FollowUpSettings';
import { generateId } from '@/lib/id';
import { msUntilAllowed, sleepCapped } from '@/utils/schedule';

export interface SendProgress {
  current: number;
  total: number;
  percent: number;
  status: 'idle' | 'sending' | 'waiting_reply' | 'follow_up' | 'completed' | 'error' | 'paused';
  currentContact?: string;
  sent: number;
  failed: number;
  replied: number;
  errors: { contact: string; error: string }[];
  log: { time: Date; message: string; type: 'info' | 'success' | 'error' | 'warning' }[];
}

export type ProgressCallback = (progress: SendProgress) => void;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomInterval(min: number, max: number): number {
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

async function waitUntilSchedule(allowedWeekDays?: number[], allowedTimes?: string[]): Promise<void> {
  if (!allowedWeekDays?.length && !allowedTimes?.length) return;
  const horaIni = allowedTimes?.length ? allowedTimes.reduce((a, b) => a < b ? a : b) : undefined;
  const horaFim = allowedTimes?.length ? allowedTimes.reduce((a, b) => a > b ? a : b) : undefined;
  const ms = msUntilAllowed(new Date(), {
    horaIni,
    horaFim,
    diasSemana: allowedWeekDays,
    timezone: 'America/Sao_Paulo',
  });
  if (ms > 0) {
    console.log(`[schedule] Fora da janela. Aguardando ${Math.round(ms / 60000)}min...`);
    await sleepCapped(ms);
  }
}

function replaceVariables(template: string, contact: Record<string, any>): string {
  // Match variables with special characters (like ç, ã, etc)
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const keyLower = key.toLowerCase().trim();
    
    // Handle special {{primeiro_nome}} variable - extract first name from 'nome'
    if (keyLower === 'primeiro_nome') {
      let nomeValue = '';
      for (const k of Object.keys(contact)) {
        if (k.toLowerCase().includes('nome') && !k.toLowerCase().includes('primeiro')) {
          nomeValue = contact[k];
          break;
        }
      }
      if (nomeValue) {
        const primeiro = String(nomeValue).trim().split(/\s+/)[0];
        return primeiro || `{{${key}}`;
      }
      return `{{${key}}`;
    }
    
    // Case-insensitive and accent-insensitive search for the key
    for (const k of Object.keys(contact)) {
      const kNormalized = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const keyNormalized = keyLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (kNormalized === keyNormalized || k.toLowerCase() === keyLower) {
        return contact[k];
      }
    }
    
    // Try partial match - if key is contained in column name
    for (const k of Object.keys(contact)) {
      const kNormalized = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const keyNormalized = keyLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (kNormalized.includes(keyNormalized) || keyNormalized.includes(kNormalized)) {
        return contact[k];
      }
    }
    
    return `{{${key}}`;
  });
}

// Replace button values with contact data
function replaceButtonValue(value: string, contact: Record<string, any>): string {
  // If value contains a variable, replace it
  if (value.includes('{{')) {
    return replaceVariables(value, contact);
  }
  // If value is exactly a variable name, try to find it with accent-insensitive match
  const valueNormalized = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const k of Object.keys(contact)) {
    const kNormalized = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (kNormalized === valueNormalized) {
      return contact[k];
    }
  }
  return value;
}

export function sanitizeWaMeUrl(url: string): string {
  if (!url) return url;
  if (!url.includes('wa.me/') && !url.includes('api.whatsapp.com')) return url;
  
  // Aggressively remove + and other non-digits from the phone number part
  return url.replace(/(wa\.me\/|phone=)\+?(\d+)/g, '$1$2');
}

export interface CampaignMessage {
  content: string;
  mediaType?: 'text' | 'image' | 'audio' | 'video' | 'document' | 'buttons' | 'link' | 'list' | 'carousel' | 'contact' | 'sticker' | 'location' | 'poll';
  mediaUrl?: string;
  mediaCaption?: string;
  mediaFilename?: string;
  // Para tipo 'buttons'
  title?: string;
  footer?: string;
  btnTitle?: string;
  btnFooter?: string;
  buttons?: { id: string; type: 'url' | 'phone' | 'reply' | 'copy'; label: string; value: string }[];
  // Para tipo 'link'
  linkUrl?: string;
  // Para tipo 'list' (Evolution Go / WuzAPI)
  sections?: { title: string; rows: { id?: string; title: string; description: string }[] }[];
  // Para tipo 'carousel' (Evolution Go)
  cards?: {
    image?: string;
    title?: string;
    description?: string;
    footer?: string;
    buttons?: { id: string; type: 'url' | 'phone' | 'reply' | 'copy'; label: string; value: string }[];
  }[];
  // Para tipo 'location'
  latitude?: number;
  longitude?: number;
  // Para tipo 'poll'
  pollHeader?: string;
  pollOptions?: string[];
}

// Detect which API to use based on selected instance ID prefix
function getInstanceSource(instanceId: string): 'evolution-go' | 'evolution' | 'unoapi' | 'chatwoot' | 'wuzapi' | 'default' {
  if (instanceId.startsWith('evogo_')) return 'evolution-go';
  if (instanceId.startsWith('evo_')) return 'evolution';
  if (instanceId.startsWith('uno_')) return 'unoapi';
  if (instanceId.startsWith('chatwoot_')) return 'chatwoot';
  if (instanceId.startsWith('wuz_')) return 'wuzapi';
  return 'default';
}

function getInstanceName(instanceId: string): string {
  if (instanceId.startsWith('evogo_')) return instanceId.slice(7);
  if (instanceId.startsWith('evo_')) return instanceId.slice(4);
  if (instanceId.startsWith('uno_')) return instanceId.slice(4);
  if (instanceId.startsWith('chatwoot_')) return instanceId.slice(9);
  if (instanceId.startsWith('wuz_')) return instanceId.slice(4);
  return instanceId;
}

export async function sendCampaign(
  contacts: Record<string, any>[],
  messages: CampaignMessage[],
  settings: {
    intervalType: 'fixed' | 'random';
    fixedInterval: number;
    minInterval: number;
    maxInterval: number;
    sendType: 'single' | 'multiple';
  },
  selectedPhoneNumbers: string[],
  followUpConfig: FollowUpConfig,
  onProgress: ProgressCallback,
  abortSignal?: AbortSignal,
  schedule?: { allowedWeekDays?: number[]; allowedTimes?: string[] },
): Promise<SendProgress> {
  if (selectedPhoneNumbers.length === 0) throw new Error('Nenhum número remetente selecionado');

  const unoCredsEarly = await loadUnoApiCredentialsWithFallback();
  const evoCredsEarly = await loadEvolutionCredentialsWithFallback();
  const evoGoCredsEarly = await loadEvolutionGoCredentialsWithFallback();
  const cwCredsEarly = await loadChatwootCredentialsWithFallback();
  const wuzCredsEarly = await loadWuzapiSettings();

  // Filter out instances that have no matching API credentials.
  const validInstances = selectedPhoneNumbers.filter(id => {
    const src = getInstanceSource(id);
    if (src === 'evolution-go') return !!evoGoCredsEarly;
    if (src === 'evolution') return !!evoCredsEarly;
    if (src === 'unoapi') return !!unoCredsEarly;
    if (src === 'chatwoot') return !!cwCredsEarly;
    if (src === 'wuzapi') return !!wuzCredsEarly;
    // default → use whichever API is configured
    return !!evoCredsEarly || !!unoCredsEarly || !!evoGoCredsEarly || !!cwCredsEarly || !!wuzCredsEarly;
  });

  if (validInstances.length === 0) {
    throw new Error('Nenhuma instância válida com credenciais de API configuradas');
  }

  const progress: SendProgress = {
    current: 0,
    total: contacts.length,
    percent: 0,
    status: 'sending',
    sent: 0,
    failed: 0,
    replied: 0,
    errors: [],
    log: [],
  };

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    progress.log.push({ time: new Date(), message, type });
    onProgress({ ...progress });
  };

  const unoCreds = unoCredsEarly;
  const evoCreds = evoCredsEarly;
  const evoGoCreds = evoGoCredsEarly;
  const cwCreds = cwCredsEarly;

  // Resolve API source per-instance (default → evolution → evolution-go → unoapi → chatwoot → wuzapi)
  const resolveSource = (id: string): 'evolution-go' | 'evolution' | 'unoapi' | 'chatwoot' | 'wuzapi' => {
    const s = getInstanceSource(id);
    if (s === 'evolution-go') return 'evolution-go';
    if (s === 'evolution') return 'evolution';
    if (s === 'unoapi') return 'unoapi';
    if (s === 'chatwoot') return 'chatwoot';
    if (s === 'wuzapi') return 'wuzapi';
    // default → any available
    if (evoCreds) return 'evolution';
    if (evoGoCreds) return 'evolution-go';
    if (cwCreds) return 'chatwoot';
    if (wuzCredsEarly) return 'wuzapi';
    return 'unoapi';
  };

  if (validInstances.length < selectedPhoneNumbers.length) {
    addLog(`⚠️ ${selectedPhoneNumbers.length - validInstances.length} instância(s) ignorada(s) (sem credenciais)`, 'warning');
  }

  const primarySource = resolveSource(validInstances[0]);
  const sourceLabel = primarySource === 'evolution-go' ? 'Evolution Go' : primarySource === 'evolution' ? 'Evolution API' : primarySource === 'chatwoot' ? 'Chatwoot' : primarySource === 'wuzapi' ? 'WuzAPI' : 'UnoAPI';
  addLog(`🚀 Iniciando campanha via ${sourceLabel}...`, 'info');

  // For Evolution: validate all instances (non-blocking — warn but continue)
  if (evoCreds) {
    let anyConnected = false;
    const evoInstances = validInstances.filter(id => resolveSource(id) === 'evolution');
    for (const instId of evoInstances) {
      const instName = getInstanceName(instId);
      try {
        const status = await getInstanceStatus(evoCreds, instName);
        if (status.connected) {
          anyConnected = true;
          addLog(`✅ Instância "${instName}" conectada (status: ${status.status})`, 'success');
        } else {
          addLog(`⚠️ Instância "${instName}" status: ${status.status} — tentaremos enviar mesmo assim`, 'warning');
        }
      } catch (err: any) {
        addLog(`⚠️ Não foi possível validar "${instName}": ${err.message}`, 'warning');
        anyConnected = true; // assume ok if validation itself failed
      }
    }
    if (evoInstances.length > 0 && !anyConnected) {
      addLog('⚠️ Nenhuma instância confirmada como conectada. Continuando, mas envios podem falhar.', 'warning');
    }
  }

  let phoneIndex = 0;

  for (let i = 0; i < contacts.length; i++) {
    if (abortSignal?.aborted) {
      progress.status = 'paused';
      addLog('⏸️ Campanha pausada pelo usuário', 'warning');
      return progress;
    }

    // Wait until within allowed schedule (weekday/hour restriction)
    if (schedule) {
      await waitUntilSchedule(schedule.allowedWeekDays, schedule.allowedTimes);
    }

    const contact = contacts[i];
    const rawPhoneNumber = contact.numero || contact.phone || '';
    const phoneNumber = String(rawPhoneNumber).replace(/\D/g, '');
    const contactName = contact.nome || contact.name || rawPhoneNumber;

    const senderInstId = validInstances[phoneIndex % validInstances.length];
    const senderName = getInstanceName(senderInstId);
    const source = resolveSource(senderInstId);
    phoneIndex++;

    progress.current = i + 1;
    progress.percent = Math.round(((i + 1) / contacts.length) * 100);
    progress.currentContact = contactName;

    addLog(`📤 Enviando para ${contactName} (${phoneNumber}) via ${senderName} [${source}]...`);

    try {
      const messagesToSend = settings.sendType === 'single' ? [messages[0]] : messages;

      for (const msg of messagesToSend) {
        const personalizedContent = replaceVariables(msg.content, contact);
        const personalizedCaption = msg.mediaCaption ? replaceVariables(msg.mediaCaption, contact) : undefined;

        if (source === 'evolution' && evoCreds) {
          // Evolution API sending
          const evoMsg: EvolutionMessage = {
            type: (msg.mediaType === 'list' || msg.mediaType === 'carousel' ? 'text' : (msg.mediaType || 'text')) as EvolutionMessage['type'],
            content: personalizedContent,
            mediaUrl: msg.mediaUrl,
            caption: personalizedCaption || personalizedContent,
            filename: msg.mediaFilename,
            title: msg.title,
            footer: msg.footer,
            buttons: msg.buttons?.map(b => ({ 
              type: b.type, 
              label: b.label, 
              value: b.type === 'url' ? sanitizeWaMeUrl(replaceButtonValue(b.value, contact)) : (b.type === 'phone' ? replaceButtonValue(b.value, contact).replace(/\D/g, '') : b.value)
            })),
            linkUrl: msg.linkUrl,
            contactName: msg.mediaType === 'contact' ? replaceVariables(msg.btnTitle || 'Contato', contact) : undefined,
            contactNumber: msg.mediaType === 'contact' ? replaceVariables(msg.btnFooter || '', contact) : undefined,
          };
          const result = await sendEvoMessage(evoCreds, senderName, phoneNumber, evoMsg);
          console.log('[campaignSender] Evolution send result:', result);
        } else if (source === 'evolution-go' && evoGoCreds) {
          // Evolution Go sending
          const evoGoMsg: EvolutionGoMessage = {
            type: (msg.mediaType === 'link' ? 'text' : (msg.mediaType || 'text')) as EvolutionGoMessage['type'],
            content: personalizedContent,
            mediaUrl: msg.mediaUrl,
            caption: personalizedCaption || personalizedContent,
            filename: msg.mediaFilename,
            title: msg.title,
            footer: msg.footer,
            btnTitle: msg.btnTitle,
            btnFooter: msg.btnFooter,
            buttons: msg.buttons?.map(b => ({ 
              type: b.type, 
              label: b.label, 
              value: b.type === 'url' ? sanitizeWaMeUrl(replaceButtonValue(b.value, contact)) : (b.type === 'phone' ? replaceButtonValue(b.value, contact).replace(/\D/g, '') : b.value)
            })),
            linkUrl: msg.linkUrl,
            sections: msg.sections as EvolutionGoMessage['sections'],
            cards: msg.cards as EvolutionGoMessage['cards'],
            contactName: msg.mediaType === 'contact' ? replaceVariables(msg.btnTitle || 'Contato', contact) : undefined,
            contactNumber: msg.mediaType === 'contact' ? replaceVariables(msg.btnFooter || '', contact) : undefined,
          };
          const result = await sendEvolutionGoMessage(evoGoCreds, senderName, phoneNumber, evoGoMsg);
          console.log('[campaignSender] Evolution Go send result:', result);
        } else if (source === 'unoapi' && unoCreds) {
          // UnoAPI sending
          console.log('[campaignSender] Sending via UnoAPI:', {
            senderName,
            phoneNumber,
            unoApiUrl: unoCreds.baseUrl
          });
          const unoMsg: UnoApiMessage = { content: personalizedContent };
          
          if (msg.mediaType === 'buttons') {
            // Only send interactive buttons for all types (URL, phone, reply)
            const interactiveButtons = msg.buttons?.map(b => {
              if (b.type === 'url') {
                // URL button - enviar como botão clicável com link customizado
                return {
                  id: b.id,
                  title: b.label,
                  url: sanitizeWaMeUrl(replaceButtonValue(b.value, contact)),
                };
              } else if (b.type === 'phone') {
                const phoneValue = replaceButtonValue(b.value, contact);
                const contactName = b.label || 'Contato';
                const cleanPhone = phoneValue.replace(/\D/g, '');
                console.log('[campaignSender] Phone button:', { 
                  label: b.label, 
                  originalValue: b.value,
                  contactName, 
                  phoneValue,
                  cleanPhone,
                  finalPhone: cleanPhone
                });
                return {
                  id: b.id,
                  title: b.label,
                  phone: cleanPhone,
                  contactName: contactName,
                };
              } else if (b.type === 'reply') {
                // Reply button - envia texto quando clicado
                return {
                  id: b.id,
                  title: b.label,
                  reply: b.label,
                };
              } else if (b.type === 'copy') {
                // Copy button - native cta_copy
                return {
                  id: b.id,
                  title: b.label,
                  copy: replaceButtonValue(b.value, contact),
                };
              } else {
                return {
                  id: b.id,
                  title: b.label,
                };
              }
            }).filter(b => b !== null) || [];
            
            if (interactiveButtons.length > 0) {
              unoMsg.buttons = interactiveButtons as Array<{ id: string; title: string; url?: string; phone?: string; reply?: string; copy?: string }>;
              if (msg.title) unoMsg.header = msg.title;
              if (msg.footer) unoMsg.footer = msg.footer;
            }
            
            await sendUnoApiMessage(unoCreds, senderName, phoneNumber, unoMsg);
          } else if (msg.mediaType === 'link' && msg.linkUrl) {
            // Link message - send as text with URL
            const linkText = msg.linkUrl
              ? `${personalizedContent}\n\n🔗 Link: ${msg.linkUrl}`
              : personalizedContent;
            await sendUnoApiMessage(unoCreds, senderName, phoneNumber, { content: linkText });
          } else if (msg.mediaType === 'contact') {
            // Contact (vCard) - send as interactive with contact data
            const contactName = replaceVariables(msg.btnTitle || 'Contato', contact);
            const contactNumber = replaceVariables(msg.btnFooter || '', contact);
            
            unoMsg.buttons = [{
              id: generateId(),
              title: contactName,
              phone: contactNumber,
              contactName: contactName,
            }];
            
            // For UnoAPI, media.type = 'contact' triggers sendContactMessage
            unoMsg.media = { type: 'contact' };
            await sendUnoApiMessage(unoCreds, senderName, phoneNumber, unoMsg);
          } else if (msg.mediaType === 'list' && (msg.buttons || msg.sections)) {
            const sections = msg.sections || msg.buttons;
            unoMsg.list = {
              buttonText: msg.btnTitle || 'Opções',
              sections: (sections as any[]).map(s => ({
                title: s.title,
                rows: s.rows.map((r: any) => ({
                  id: r.id || generateId(),
                  title: r.title,
                  description: r.description,
                })),
              })),
            };
            if (msg.title) unoMsg.header = msg.title;
            if (msg.footer) unoMsg.footer = msg.footer;
            await sendUnoApiMessage(unoCreds, senderName, phoneNumber, unoMsg);
          } else if (msg.mediaType === 'carousel' && (msg.buttons || msg.cards)) {
            const cards = msg.cards || msg.buttons;
            if (Array.isArray(cards)) {
              unoMsg.carousel = cards.map(card => ({
                image: card.image,
                title: card.title || '',
                description: card.description || '',
                footer: card.footer,
                buttons: card.buttons?.map((b: any) => ({
                  id: b.id || generateId(),
                  title: b.label || b.title || '',
                  url: b.type === 'url' ? sanitizeWaMeUrl(replaceButtonValue(b.value || b.url || '', contact)) : undefined,
                  phone: b.type === 'phone' ? replaceButtonValue(b.value || b.phone || '', contact).replace(/\D/g, '') : undefined,
                  reply: b.type === 'reply' ? (b.label || b.reply || '') : undefined,
                  copy: b.type === 'copy' ? replaceButtonValue(b.value || b.copy || '', contact) : undefined,
                })).filter((b: any) => !!b.title) || [],
              }));
              console.log('[campaignSender] Sending Carousel via UnoAPI:', JSON.stringify(unoMsg.carousel, null, 2));
              await sendUnoApiMessage(unoCreds, senderName, phoneNumber, unoMsg);
            } else {
              console.warn('[campaignSender] Carousel cards is not an array:', cards);
              await sendUnoApiMessage(unoCreds, senderName, phoneNumber, unoMsg);
            }
          } else if (msg.mediaType && msg.mediaType !== 'text' && msg.mediaUrl) {
            const mt = msg.mediaType as 'image' | 'audio' | 'video' | 'sticker' | 'document';
            const hasButtons = msg.buttons && msg.buttons.length > 0 && mt !== 'sticker';

            if (hasButtons && (mt === 'image' || mt === 'video' || mt === 'document')) {
              // Mídia + botões → interactive com header de mídia
              const { sendInteractiveButtons } = await import('./unoapi');
              await sendInteractiveButtons(
                unoCreds,
                senderName,
                phoneNumber,
                personalizedCaption || personalizedContent,
                msg.buttons!.map(b => ({
                  id: b.id,
                  title: b.label,
                  url: b.type === 'url' ? sanitizeWaMeUrl(replaceButtonValue(b.value, contact)) : undefined,
                  phone: b.type === 'phone' ? replaceButtonValue(b.value, contact).replace(/\D/g, '') : undefined,
                  copy: b.type === 'copy' ? replaceButtonValue(b.value, contact) : undefined,
                })),
                undefined,
                msg.footer,
                { type: mt as any, url: msg.mediaUrl, filename: msg.mediaFilename },
              );
            } else {
              // Mídia simples (sem botões) ou áudio ou figurinha
              unoMsg.media = {
                type: mt,
                url: msg.mediaUrl,
                caption: personalizedCaption || personalizedContent,
                filename: msg.mediaFilename,
              };
              await sendUnoApiMessage(unoCreds, senderName, phoneNumber, unoMsg);
            }
          } else {
            // Text only
            await sendUnoApiMessage(unoCreds, senderName, phoneNumber, unoMsg);
          }
        } else if (source === 'chatwoot' && cwCreds) {
          // Chatwoot sending
          const inboxId = parseInt(senderName);
          const { conversationId } = await findOrCreateConversation(cwCreds, phoneNumber, inboxId, contactName);
          
          const mt = msg.mediaType === 'contact' ? 'contact' : (msg.mediaType as any) || 'text';
          const filename = msg.mediaType === 'contact' 
            ? replaceVariables(msg.btnFooter || '', contact) // phone number as filename/meta
            : msg.mediaFilename;
          const caption = msg.mediaType === 'contact'
            ? replaceVariables(msg.btnTitle || 'Contato', contact) // name as caption
            : personalizedCaption || personalizedContent;

          await sendCwMediaMessage(
            cwCreds,
            conversationId,
            mt,
            msg.mediaUrl,
            caption,
            filename
          );
        } else if (source === 'wuzapi' && wuzCredsEarly) {
          // WuzAPI sending - get instance credentials dynamically
          const instanceCreds = await getWuzapiInstanceCredentials(senderName);
          if (!instanceCreds) {
            throw new Error(`Credenciais WuzAPI não encontradas para instância "${senderName}"`);
          }
          await sendWuzapiMessage(senderName, phoneNumber, msg, contact);
        } else {
          throw new Error(`Nenhuma API disponível para a instância "${senderName}"`);
        }

        progress.sent++;
        const mediaLabel = msg.mediaType && msg.mediaType !== 'text' ? ` (${msg.mediaType})` : '';
        addLog(`✅ Mensagem${mediaLabel} enviada para ${contactName}`, 'success');

        if (messagesToSend.length > 1) await delay(2000);
      }

      onProgress({ ...progress });
    } catch (err: any) {
      progress.failed++;
      const errorMsg = err.message || 'Erro desconhecido';
      progress.errors.push({ contact: contactName, error: errorMsg });

      // Handle Evolution reconnect suggestion
      if (errorMsg.includes('não está conectada') || errorMsg.includes('reconnect')) {
        addLog(`🔌 ${contactName}: Instância offline — sugerindo reconexão`, 'error');
      } else {
        addLog(`❌ Erro com ${contactName}: ${errorMsg}`, 'error');
      }
      onProgress({ ...progress });
    }

    // Interval
    if (i < contacts.length - 1) {
      const waitTime = settings.intervalType === 'fixed'
        ? settings.fixedInterval * 1000
        : getRandomInterval(settings.minInterval, settings.maxInterval);
      addLog(`⏱️ Aguardando ${Math.round(waitTime / 1000)}s antes do próximo...`, 'info');
      await delay(waitTime);
    }
  }

  progress.status = 'completed';
  addLog(`🎉 Campanha finalizada! ${progress.sent} enviadas, ${progress.failed} falhas`, 'success');
  onProgress({ ...progress });
  return progress;
}
