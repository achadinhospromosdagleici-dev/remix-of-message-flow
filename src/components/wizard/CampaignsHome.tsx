import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Play, 
  Trash2, 
  Settings, 
  Pause, 
  X, 
  Clock, 
  Rocket,
  ChevronRight,
  History,
  Loader2,
} from 'lucide-react';
import { useWizard } from '@/contexts/WizardContext';
import { campaignManager } from '@/services/campaignManager';
import { loadCampaigns, deleteCampaign, updateCampaignStatus, campaignRecordToActive, CampaignRecord, getCampaign, getCampaignContacts, getCampaignMessages } from '@/services/campaigns';
import { sendCampaign, CampaignMessage } from '@/services/campaignSender';
import { toast } from 'sonner';

export function CampaignsHome({ onNewCampaign, onResume }: { onNewCampaign: () => void; onResume: () => void }) {
  const { 
    activeCampaigns, 
    removeActiveCampaign, 
    updateActiveCampaign,
    addActiveCampaign,
    currentStep,
    data,
    clearWizard,
  } = useWizard();
  const [loading, setLoading] = useState(true);

  const hasDraft = data.length > 0;

  // Load campaigns from DB on mount
  useEffect(() => {
    let mounted = true;
    const fetch = async () => {
      try {
        const records: CampaignRecord[] = await loadCampaigns();
        if (!mounted) return;
        const active = records.filter(r => r.status === 'running' || r.status === 'paused');
        for (const r of active) {
          const existing = activeCampaigns.find(c => c.id === r.id);
          if (!existing) {
            addActiveCampaign(campaignRecordToActive(r));
          } else {
            updateActiveCampaign(r.id, {
              sentCount: r.sent_count,
              failedCount: r.failed_count,
              repliedCount: r.replied_count,
              status: r.status,
            });
          }
        }
      } catch (err) {
        console.error('[CampaignsHome] Error loading campaigns:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetch();
    return () => { mounted = false; };
  }, []);

  const handlePause = async (id: string) => {
    try {
      await campaignManager.pause(id);
      updateActiveCampaign(id, { status: 'paused' });
      toast.success('Campanha pausada');
    } catch (err: any) {
      toast.error(`Erro ao pausar: ${err.message}`);
    }
  };

  const handleResume = async (id: string) => {
    try {
      const record = await getCampaign(id);
      const contacts = await getCampaignContacts(id);
      const messages = await getCampaignMessages(id);

      const contactsData = contacts.map(c => {
        const data = (c.data || {}) as Record<string, any>;
        return { ...data, nome: data.nome || c.name, phone: c.phone };
      });

      const campaignMessages: CampaignMessage[] = messages.map(m => ({
        content: m.content,
        mediaType: (m as any).media_type || 'text',
        mediaUrl: (m as any).media_url || undefined,
        mediaCaption: (m as any).media_caption || undefined,
        mediaFilename: (m as any).media_filename || undefined,
        title: (m as any).title || undefined,
        footer: (m as any).footer || undefined,
        buttons: (m as any).buttons || undefined,
        linkUrl: (m as any).link_url || undefined,
      }));

      const dbSettings = record.settings as Record<string, any>;
      const sendSettings = {
        intervalType: (dbSettings.intervalType || 'fixed') as 'fixed' | 'random',
        fixedInterval: dbSettings.fixedInterval || 3,
        minInterval: dbSettings.minInterval || 3,
        maxInterval: dbSettings.maxInterval || 5,
        sendType: (dbSettings.sendType || 'single') as 'single' | 'multiple',
      };

      const selectedPhoneNumbers: string[] = dbSettings.selectedPhoneNumbers || [];
      const followUpConfig = dbSettings.followUpConfig as any;

      const schedule = record.schedule
        ? {
            allowedWeekDays: (record.schedule as any).weekDays,
            allowedTimes: [(record.schedule as any).startTime, (record.schedule as any).endTime],
          }
        : undefined;

      const startIndex = record.current_index;

      await updateCampaignStatus(id, 'running');
      updateActiveCampaign(id, { status: 'running' });

      const controller = new AbortController();
      campaignManager.register(id, controller);

      void (async () => {
        try {
          const result = await sendCampaign(
            contactsData,
            campaignMessages,
            sendSettings,
            selectedPhoneNumbers,
            followUpConfig,
            (p) => {
              updateActiveCampaign(id, {
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
            id,
            startIndex,
          );

          if (result.status === 'paused') return;

          updateActiveCampaign(id, {
            status: result.failed === 0 ? 'completed' : (result.sent > 0 ? 'completed' : 'error'),
            sentCount: result.sent,
            failedCount: result.failed,
            repliedCount: result.replied,
          });

          toast.success(`Campanha finalizada! ${result.sent} enviadas.`);
        } catch (err: any) {
          updateActiveCampaign(id, { status: 'error' });
          toast.error(`Erro: ${err.message}`);
        } finally {
          campaignManager.unregister(id);
        }
      })();

      toast.success('Campanha retomada!');
    } catch (err: any) {
      toast.error(`Erro ao retomar: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta campanha?')) return;
    try {
      await campaignManager.cancel(id);
      await deleteCampaign(id);
      removeActiveCampaign(id);
      toast.success('Campanha excluída');
    } catch (err: any) {
      toast.error(`Erro ao excluir: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SUAS CAMPANHAS</h1>
          <p className="text-muted-foreground mt-1 text-sm uppercase tracking-wider">
            Gerencie seus disparos e acompanhe o progresso em tempo real
          </p>
        </div>
        <button
          onClick={onNewCampaign}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          NOVA CAMPANHA
        </button>
      </div>

      {/* Resume Drafts Section */}
      {hasDraft && (
        <div className="glass-card p-8 border-primary/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-12 -mr-8 -mt-8 bg-primary/5 rounded-full blur-3xl" />
          
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-warning/10 flex items-center justify-center">
              <History className="w-6 h-6 text-warning" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">RETOMAR RASCUNHOS</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                Você possui 1 campanha incompleta
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-muted/30 border border-border/50 rounded-2xl p-6 flex items-center justify-between group/card hover:bg-muted/50 transition-all cursor-pointer">
              <div className="space-y-1">
                <h3 className="font-bold text-sm uppercase tracking-wider">RASCUNHO ATUAL</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                  PASSO {currentStep}/5 • {new Date().toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    if (confirm('Deseja realmente excluir este rascunho?')) {
                      clearWizard();
                    }
                  }}
                  className="p-2.5 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={onResume}
                  className="p-2.5 rounded-xl bg-warning text-warning-foreground shadow-lg shadow-warning/20 hover:scale-110 transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaigns Table */}
      {loading ? (
        <div className="glass-card p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando campanhas...</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20">
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Campanha</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Progresso</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Data Criação</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {activeCampaigns.length > 0 ? (
                activeCampaigns.map((campaign) => {
                  const progress = campaign.totalContacts > 0
                    ? (campaign.sentCount / campaign.totalContacts) * 100
                    : 0;
                  return (
                    <tr key={campaign.id} className="group hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Rocket className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-bold text-sm tracking-wide">{campaign.name || 'SEM NOME'}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{campaign.totalContacts} CONTATOS TOTAL</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="w-48 space-y-2">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                            <span className="text-muted-foreground">{campaign.sentCount}/{campaign.totalContacts}</span>
                            <span className="text-primary">{Math.round(progress)}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all duration-1000"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          campaign.status === 'running' ? 'bg-success/10 text-success border-success/20' :
                          campaign.status === 'completed' ? 'bg-primary/10 text-primary border-primary/20' :
                          campaign.status === 'error' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                          'bg-warning/10 text-warning border-warning/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            campaign.status === 'running' ? 'bg-success animate-pulse' : 
                            campaign.status === 'completed' ? 'bg-primary' : 
                            campaign.status === 'error' ? 'bg-destructive' : 
                            'bg-warning'
                          }`} />
                          {
                            campaign.status === 'running' ? 'Andamento' : 
                            campaign.status === 'completed' ? 'Concluído' : 
                            campaign.status === 'error' ? 'Erro' : 
                            'Pausado'
                          }
                        </span>
                      </td>
                      <td className="px-6 py-6 text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                        {new Date(campaign.createdAt).toLocaleDateString()}<br/>
                        {new Date(campaign.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {campaign.status === 'running' && (
                            <button 
                              onClick={() => handlePause(campaign.id)}
                              className="p-2.5 rounded-xl bg-warning text-warning-foreground transition-all hover:scale-110"
                              title="Pausar"
                            >
                              <Pause className="w-4 h-4 fill-current" />
                            </button>
                          )}
                          {campaign.status === 'paused' && (
                            <button 
                              onClick={() => handleResume(campaign.id)}
                              className="p-2.5 rounded-xl bg-success text-success-foreground transition-all hover:scale-110"
                              title="Retomar"
                            >
                              <Play className="w-4 h-4 fill-current" />
                            </button>
                          )}
                          <button 
                            onClick={() => handleDelete(campaign.id)}
                            className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                            title="Excluir"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all" title="Detalhes">
                            <Settings className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <Rocket className="w-12 h-12 opacity-10" />
                      <p className="text-sm font-medium uppercase tracking-[0.2em]">Nenhuma campanha ativa no momento</p>
                      <button 
                        onClick={onNewCampaign}
                        className="text-primary hover:underline text-xs font-bold tracking-widest mt-2"
                      >
                        CLIQUE PARA CRIAR UMA NOVA
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
