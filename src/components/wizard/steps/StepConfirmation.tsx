import React, { useState, useRef } from 'react';
import { useWizard } from '@/contexts/WizardContext';
import { Campaign } from '../CampaignHistory';
import { sendCampaign, SendProgress, CampaignMessage } from '@/services/campaignSender';
import { createCampaign } from '@/services/campaigns';
import { campaignManager } from '@/services/campaignManager';
import { loadUnoApiCredentials } from '@/services/unoapi';
import { loadEvolutionCredentials } from '@/services/evolution';
import { loadEvolutionGoCredentials } from '@/services/evolutionGo';
import { loadChatwootCredentials } from '@/services/chatwoot';
import { CampaignScheduler, ScheduledCampaign } from '../CampaignScheduler';
import {
  Users,
  MessageSquare,
  Smartphone,
  Clock,
  Sparkles,
  CheckCircle2,
  Send,
  Loader2,
  History,
  StopCircle,
  Zap,
  XCircle,
  Reply,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { generateId } from '@/lib/id';

interface StepConfirmationProps {
  onCampaignStarted?: () => void;
}

export function StepConfirmation({ onCampaignStarted }: StepConfirmationProps = {}) {
  const {
    data, messages, instances, selectedInstances, settings,
    getValidCount, campaignHistory, addCampaign,
    unoApiConnected, followUpConfig, updateMetrics, scheduledCampaigns, addScheduledCampaign,
    cancelScheduledCampaign,
    addActiveCampaign, updateActiveCampaign, removeActiveCampaign, clearWizard,
  } = useWizard();
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const validContacts = getValidCount();
  const validData = Array.isArray(data) ? data.filter(r => r.isValid) : [];
  const selectedInstancesData = Array.isArray(instances) ? instances.filter(i => selectedInstances.includes(i.id)) : [];

  // Detect API source from selected instances (evo_ → Evolution, evogo_ → Evolution Go, uno_ → UnoAPI, wuz_ → WuzAPI, chatwoot_ → Chatwoot)
  const usesEvolution = selectedInstances.some(id => id.startsWith('evo_'));
  const usesEvoGo = selectedInstances.some(id => id.startsWith('evogo_'));
  const usesUnoApi = selectedInstances.some(id => id.startsWith('uno_'));
  const usesWuzapi = selectedInstances.some(id => id.startsWith('wuz_'));
  const usesChatwoot = selectedInstances.some(id => id.startsWith('chatwoot_'));
  const evoCreds = loadEvolutionCredentials();
  const evoGoCreds = loadEvolutionGoCredentials();
  const unoCreds = loadUnoApiCredentials();
  const wuzCreds = localStorage.getItem('wuzapi_credentials') ? JSON.parse(localStorage.getItem('wuzapi_credentials')!) : null;
  const cwCreds = loadChatwootCredentials();
  const hasRequiredCreds =
    (usesEvolution && !!evoCreds) ||
    (usesEvoGo && !!evoGoCreds) ||
    (usesUnoApi && !!unoCreds) ||
    (usesWuzapi && !!wuzCreds) ||
    (usesChatwoot && !!cwCreds) ||
    (!usesEvolution && !usesEvoGo && !usesUnoApi && !usesWuzapi && !usesChatwoot && (unoApiConnected || !!evoCreds || !!evoGoCreds || !!wuzCreds || !!cwCreds));
  const apiLabel = usesEvolution ? 'Evolution API' : usesEvoGo ? 'Evolution Go' : usesUnoApi ? 'UnoAPI' : usesWuzapi ? 'WuzAPI' : usesChatwoot ? 'Chatwoot' : 'WhatsApp API';

  const calculateTotalTime = () => {
    const messageCount = settings.sendType === 'multiple' ? messages.length : 1;
    const totalMessages = validContacts * messageCount;
    let avgInterval = settings.intervalType === 'fixed' ? settings.fixedInterval : (settings.minInterval + settings.maxInterval) / 2;
    const totalSeconds = totalMessages * avgInterval;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `~${hours}h ${minutes}min` : `~${minutes} minutos`;
  };

  const handleStartSending = async () => {
    if (selectedInstances.length === 0) { toast.error('Selecione ao menos um número remetente!'); return; }
    if (usesEvolution && !evoCreds) { toast.error('Credenciais da Evolution API não configuradas'); return; }
    if (usesEvoGo && !evoGoCreds) { toast.error('Credenciais da Evolution Go não configuradas'); return; }
    if (usesUnoApi && !unoCreds) { toast.error('Credenciais da UnoAPI não configuradas'); return; }
    if (usesWuzapi && !wuzCreds) { toast.error('Credenciais da WuzAPI não configuradas'); return; }
    if (usesChatwoot && !cwCreds) { toast.error('Credenciais do Chatwoot não configuradas'); return; }
    if (validContacts === 0) { toast.error('Nenhum contato válido para envio'); return; }
    if (messages.length === 0) { toast.error('Configure ao menos uma mensagem'); return; }

    const campaignName = `Campanha ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const contactsData = validData.map(row => {
      const obj: Record<string, any> = {};
      Object.keys(row).forEach(key => {
        if (key !== 'id' && key !== 'isValid' && key !== 'errorMessage') obj[key] = row[key];
      });
      return obj;
    });

    const campaignMessages: CampaignMessage[] = messages.map(m => ({
      content: m.content,
      mediaType: (m as any).mediaType || 'text',
      mediaUrl: (m as any).mediaUrl || undefined,
      mediaCaption: (m as any).mediaCaption || undefined,
      mediaFilename: (m as any).mediaFilename || undefined,
      title: (m as any).mediaType === 'buttons' ? (m as any).mediaCaption : undefined,
      footer: (m as any).mediaType === 'buttons' ? (m as any).mediaFilename : undefined,
      buttons: (m as any).buttons || undefined,
      linkUrl: (m as any).linkUrl || undefined,
    }));

    // Build schedule restriction from settings
    const schedule = settings.scheduleEnabled
      ? {
          allowedWeekDays: settings.scheduleWeekDays,
          allowedTimes: [settings.scheduleStartTime, settings.scheduleEndTime],
        }
      : undefined;

    // Persist campaign to database
    let campaignId: string;
    try {
      const campaign = await createCampaign({
        name: campaignName,
        settings: {
          intervalType: settings.intervalType,
          fixedInterval: settings.fixedInterval,
          minInterval: settings.minInterval,
          maxInterval: settings.maxInterval,
          sendType: settings.sendType,
          useAI: settings.useAI,
          messageRandomization: settings.messageRandomization,
          instanceRandomization: settings.instanceRandomization,
          selectedPhoneNumbers: selectedInstances,
          followUpConfig: followUpConfig,
        },
        schedule: settings.scheduleEnabled
          ? {
              enabled: true,
              weekDays: settings.scheduleWeekDays,
              startTime: settings.scheduleStartTime,
              endTime: settings.scheduleEndTime,
            }
          : null,
        contacts: contactsData.map(c => ({
          phone: c.numero || c.phone || '',
          name: c.nome || c.name,
          data: c,
        })),
        messages: campaignMessages.map(m => ({
          content: m.content,
          media_type: m.mediaType,
          media_url: m.mediaUrl,
          media_caption: m.mediaCaption,
          media_filename: m.mediaFilename,
          title: m.title,
          footer: m.footer,
          buttons: m.buttons as any,
          link_url: m.linkUrl,
        })),
      });
      campaignId = campaign.id;
    } catch (err: any) {
      console.error('[StepConfirmation] Failed to save campaign to DB:', err);
      toast.error('Falha ao criar campanha no banco de dados');
      return;
    }

    // Add to active campaigns immediately so the home page shows progress
    addActiveCampaign({
      id: campaignId,
      name: campaignName,
      status: 'running',
      totalContacts: validContacts,
      sentCount: 0,
      failedCount: 0,
      repliedCount: 0,
      createdAt: new Date(),
    });

    const controller = new AbortController();
    abortRef.current = controller;
    campaignManager.register(campaignId, controller);

    setIsSending(true);

    // Run send in background so we can close the wizard view
    void (async () => {
      try {
        const result = await sendCampaign(
          contactsData,
          campaignMessages,
          settings,
          selectedInstances,
          followUpConfig,
          (p) => {
            updateActiveCampaign(campaignId, {
              sentCount: p.sent,
              failedCount: p.failed,
              repliedCount: p.replied,
              currentContact: p.currentContact,
              status: p.status === 'completed' ? 'completed'
                : p.status === 'error' ? 'error'
                : p.status === 'paused' ? 'paused'
                : 'running',
            });
          },
          controller.signal,
          schedule,
          campaignId,
        );

        if (result.status === 'paused') return;

        updateActiveCampaign(campaignId, {
          status: result.failed === 0 ? 'completed' : (result.sent > 0 ? 'completed' : 'error'),
          sentCount: result.sent,
          failedCount: result.failed,
          repliedCount: result.replied,
        });

        updateMetrics({
          totalSent: result.sent,
          totalFailed: result.failed,
          totalReplied: result.replied,
          deliveryRate: result.sent > 0 ? Math.round(((result.sent - result.failed) / result.sent) * 1000) / 10 : 0,
          replyRate: result.sent > 0 ? Math.round((result.replied / result.sent) * 1000) / 10 : 0,
          failRate: result.sent > 0 ? Math.round((result.failed / result.sent) * 1000) / 10 : 0,
        });

        toast.success(`Campanha finalizada! ${result.sent} enviadas.`);
      } catch (err: any) {
        updateActiveCampaign(campaignId, { status: 'error' });
        toast.error(`Erro: ${err.message}`);
      } finally {
        campaignManager.unregister(campaignId);
        abortRef.current = null;
        setIsSending(false);
      }
    })();

    toast.success('Campanha iniciada — acompanhe o progresso na página inicial');
    // Reset wizard state and close the creation view
    clearWizard();
    onCampaignStarted?.();
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    toast.warning('Campanha pausada');
  };

  const summaryItems = [
    { icon: Users, label: 'Contatos Válidos', value: validContacts, color: 'text-success' },
    { icon: MessageSquare, label: 'Mensagens', value: messages.length, color: 'text-primary' },
    { icon: Smartphone, label: 'Instâncias', value: selectedInstances.length, color: 'text-primary' },
    { icon: Clock, label: 'Tempo Estimado', value: calculateTotalTime(), color: 'text-muted-foreground' },
  ];

  const statusLabels: Record<string, string> = {
    idle: 'Aguardando',
    sending: 'Enviando...',
    waiting_reply: 'Aguardando resposta...',
    follow_up: 'Enviando follow-up...',
    completed: 'Concluído!',
    error: 'Erro',
    paused: 'Pausado',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {summaryItems.map(item => (
              <div key={item.label} className="glass-card p-4 text-center">
                <item.icon className={`w-6 h-6 mx-auto mb-2 ${item.color}`} />
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>

          {/* API Status */}
          <div className={`glass-card p-4 flex items-center gap-3 ${hasRequiredCreds ? 'border-success/30' : 'border-destructive/30'}`}>
            <Zap className={`w-5 h-5 ${hasRequiredCreds ? 'text-success' : 'text-destructive'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {hasRequiredCreds
                  ? `${apiLabel} pronta para envio`
                  : 'Nenhuma API configurada'}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedInstances.length > 0
                  ? `${selectedInstances.length} número(s) selecionado(s) — envio via ${apiLabel}`
                  : 'Selecione um número remetente na etapa anterior'}
              </p>
            </div>
          </div>

          {/* Config Details */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="font-semibold">Configurações de Envio</h3>
            <div className="grid gap-3">
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Intervalo</span>
                <span className="font-medium">
                  {settings.intervalType === 'fixed' ? `${settings.fixedInterval}s` : `${settings.minInterval}-${settings.maxInterval}s`}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Tipo</span>
                <span className="font-medium">{settings.sendType === 'single' ? 'Mensagem única' : 'Múltiplas'}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground flex items-center gap-2"><Sparkles className="w-4 h-4" /> IA</span>
                <span className={`font-medium ${settings.useAI ? 'text-success' : 'text-muted-foreground'}`}>{settings.useAI ? 'Ativada' : 'Desativada'}</span>
              </div>
            </div>
          </div>

          {/* Messages Preview */}
          <div className="glass-card p-6 space-y-4">
            <h3 className="font-semibold">Mensagens</h3>
            <div className="space-y-3 max-h-48 overflow-y-auto scrollbar-thin">
              {messages.length > 0 ? messages.map((msg, i) => (
                <div key={msg.id} className="p-3 rounded-lg bg-muted/50 border border-border/30">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-muted-foreground">Mensagem {i + 1}</p>
                    {(msg as any).mediaType && (msg as any).mediaType !== 'text' && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {(msg as any).mediaType === 'image' ? '🖼️' : (msg as any).mediaType === 'audio' ? '🎵' : (msg as any).mediaType === 'video' ? '📹' : '📄'} {(msg as any).mediaType}
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap line-clamp-3">{msg.content}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">Nenhuma mensagem configurada</p>}
            </div>
          </div>

          {/* Warning */}
          {!hasRequiredCreds && (
            <div className="glass-card p-4 border-destructive/30 bg-destructive/5">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="font-medium text-destructive">API não configurada</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vá em Configurações e conecte a Evolution API, Evolution Go, UnoAPI, WuzAPI ou Chatwoot para habilitar o envio.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Live Progress */}
          {progress && isSending && (
            <div className="glass-card p-6 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="font-medium">{statusLabels[progress.status]}</span>
                </div>
                <span className="text-primary font-bold">{progress.percent}%</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${progress.percent}%` }} />
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div><p className="text-lg font-bold text-success">{progress.sent}</p><p className="text-[10px] text-muted-foreground">Enviadas</p></div>
                <div><p className="text-lg font-bold text-destructive">{progress.failed}</p><p className="text-[10px] text-muted-foreground">Falhas</p></div>
                <div><p className="text-lg font-bold text-primary">{progress.replied}</p><p className="text-[10px] text-muted-foreground">Respostas</p></div>
                <div><p className="text-lg font-bold">{progress.current}/{progress.total}</p><p className="text-[10px] text-muted-foreground">Processados</p></div>
              </div>
              {progress.currentContact && (
                <p className="text-xs text-muted-foreground text-center">Atual: {progress.currentContact}</p>
              )}

              {/* Live Log */}
              <div className="max-h-40 overflow-y-auto scrollbar-thin space-y-1 bg-muted/30 rounded-lg p-3">
                {progress.log.slice(-20).map((entry, i) => (
                  <p key={i} className={`text-xs font-mono ${
                    entry.type === 'success' ? 'text-success' :
                    entry.type === 'error' ? 'text-destructive' :
                    entry.type === 'warning' ? 'text-warning' : 'text-muted-foreground'
                  }`}>
                    <span className="opacity-50">{entry.time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>{' '}
                    {entry.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Completed Summary */}
          {progress && progress.status === 'completed' && !isSending && (
            <div className="glass-card p-6 space-y-3 border-success/30 animate-fade-in">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-success" />
                <div>
                  <h3 className="font-semibold">Campanha Finalizada!</h3>
                  <p className="text-sm text-muted-foreground">{progress.sent} enviadas, {progress.failed} falhas</p>
                </div>
              </div>
              {progress.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-destructive">Erros ({progress.errors.length}):</p>
                  {progress.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{e.contact}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            {isSending ? (
              <button onClick={handleStop}
                className="flex-1 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all">
                <StopCircle className="w-5 h-5" /> Parar Envio
              </button>
            ) : (
              <>
                <button onClick={handleStartSending}
                  disabled={validContacts === 0 || messages.length === 0 || !hasRequiredCreds || selectedInstances.length === 0}
                  className={`flex-1 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
                    validContacts === 0 || messages.length === 0 || !hasRequiredCreds || selectedInstances.length === 0
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 glow-effect'
                  }`}>
                  <Send className="w-5 h-5" /> Enviar Agora
                </button>
                <button onClick={() => setShowScheduler(!showScheduler)}
                  disabled={validContacts === 0 || messages.length === 0 || selectedInstances.length === 0}
                  className={`flex-1 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
                    validContacts === 0 || messages.length === 0 || selectedInstances.length === 0
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                  }`}>
                  <Calendar className="w-5 h-5" /> Agendar
                </button>
              </>
            )}
          </div>

          {/* Scheduler */}
          {showScheduler && (
            <div className="glass-card p-6 animate-fade-in">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-primary" />
                Agendar Campanha
              </h3>
              <CampaignScheduler
                scheduledCampaigns={scheduledCampaigns}
                onSchedule={(campaign) => {
                  addScheduledCampaign({
                    id: generateId(),
                    status: 'scheduled',
                    name: campaign.name,
                    scheduledDate: campaign.scheduledDate,
                    messageIds: messages.map(m => m.id),
                    contactCount: campaign.contactCount,
                    recurrence: campaign.recurrence,
                    allowedTimes: campaign.allowedTimes,
                    allowedWeekDays: campaign.allowedWeekDays,
                  });
                  toast.success('Campanha agendada!');
                  setShowScheduler(false);
                  clearWizard();
                  onCampaignStarted?.();
                }}
                onCancel={(id) => cancelScheduledCampaign(id)}
                contactCount={validContacts}
                messageCount={messages.length}
              />
            </div>
          )}

          {!hasRequiredCreds && (
            <p className="text-center text-sm text-muted-foreground">Conecte a Evolution API ou UnoAPI nas Configurações para habilitar o envio</p>
          )}
          {hasRequiredCreds && selectedInstances.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">Volte e selecione ao menos um número remetente</p>
          )}
    </div>
  );
}
