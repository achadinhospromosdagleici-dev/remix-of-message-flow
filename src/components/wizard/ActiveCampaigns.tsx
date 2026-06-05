import React from 'react';
import {
  Send,
  Pause,
  Play,
  X,
  RefreshCw,
  Settings,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { campaignManager } from '@/services/campaignManager';
import { deleteCampaign, updateCampaignStatus } from '@/services/campaigns';
import { toast } from 'sonner';

export interface ActiveCampaign {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'error' | 'cancelled';
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  repliedCount: number;
  createdAt: Date;
  currentStep?: number;
  totalSteps?: number;
  currentContact?: string;
}

interface ActiveCampaignsProps {
  campaigns: ActiveCampaign[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onResend: (id: string) => void;
  onNewCampaign: () => void;
}

export function ActiveCampaigns({
  campaigns,
  onPause,
  onResume,
  onCancel,
  onResend,
  onNewCampaign,
}: ActiveCampaignsProps) {
  const handlePause = async (id: string) => {
    try {
      await campaignManager.pause(id);
      onPause(id);
      toast.success('Campanha pausada');
    } catch (err: any) {
      toast.error(`Erro ao pausar: ${err.message}`);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await updateCampaignStatus(id, 'running');
      onResume(id);
      toast.success('Campanha retomada');
    } catch (err: any) {
      toast.error(`Erro ao retomar: ${err.message}`);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Deseja realmente cancelar esta campanha?')) return;
    try {
      await campaignManager.cancel(id);
      onCancel(id);
      toast.success('Campanha cancelada');
    } catch (err: any) {
      toast.error(`Erro ao cancelar: ${err.message}`);
    }
  };

  const handleResend = async (id: string) => {
    try {
      await updateCampaignStatus(id, 'running');
      onResend(id);
      toast.success('Reenviando campanha');
    } catch (err: any) {
      toast.error(`Erro ao reenviar: ${err.message}`);
    }
  };

  const drafts = campaigns.filter(c => c.status === 'paused');
  const running = campaigns.filter(c => c.status === 'running');
  const all = campaigns;

  const getStatusBadge = (status: ActiveCampaign['status']) => {
    switch (status) {
      case 'running':
        return { label: 'ANDAMENTO', color: 'bg-success/20 text-success', dot: 'bg-success' };
      case 'paused':
        return { label: 'PAUSADO', color: 'bg-warning/20 text-warning', dot: 'bg-warning' };
      case 'completed':
        return { label: 'CONCLUÍDO', color: 'bg-primary/20 text-primary', dot: 'bg-primary' };
      case 'error':
        return { label: 'ERRO', color: 'bg-destructive/20 text-destructive', dot: 'bg-destructive' };
      case 'cancelled':
        return { label: 'CANCELADO', color: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Send className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SUAS CAMPANHAS</h1>
            <p className="text-sm text-muted-foreground uppercase tracking-wider">
              Gerencie seus disparos e acompanhe o progresso em tempo real
            </p>
          </div>
        </div>
        <button
          onClick={onNewCampaign}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          <span className="text-lg">+</span> NOVA CAMPANHA
        </button>
      </div>

      {/* Drafts / Paused campaigns */}
      {drafts.length > 0 && (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="font-bold uppercase tracking-wide">Retomar Rascunhos</h3>
              <p className="text-xs text-muted-foreground uppercase">
                Você possui {drafts.length} campanha{drafts.length > 1 ? 's' : ''} incompleta{drafts.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {drafts.map(draft => (
              <div key={draft.id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-4 min-w-[280px]">
                <div className="flex-1">
                  <p className="font-bold text-sm">{draft.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-warning" />
                    PASSO {draft.currentStep || 0}/{draft.totalSteps || 4} •{' '}
                    {draft.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
                    {draft.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={() => onCancel(draft.id)}
                  className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onResume(draft.id)}
                  className="w-10 h-10 rounded-full bg-warning text-warning-foreground flex items-center justify-center hover:bg-warning/80 transition-colors"
                >
                  <Play className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All campaigns table */}
      {all.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Send className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">Nenhuma campanha ainda</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Crie sua primeira campanha para começar a enviar mensagens
          </p>
          <button
            onClick={onNewCampaign}
            className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            + Nova Campanha
          </button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Campanha
                </th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Progresso
                </th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Data Criação
                </th>
                <th className="text-right px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {all.map(campaign => {
                const badge = getStatusBadge(campaign.status);
                const percent = campaign.totalContacts > 0
                  ? Math.round((campaign.sentCount / campaign.totalContacts) * 100)
                  : 0;

                return (
                  <tr
                    key={campaign.id}
                    className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    {/* Campaign info */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Send className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground uppercase">
                            {campaign.totalContacts} contatos total
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Progress */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-[160px]">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {campaign.sentCount} / {campaign.totalContacts}
                        </span>
                        <div className="flex-1 h-2 bg-muted/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              campaign.status === 'error' ? 'bg-destructive' : 'bg-primary'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold">{percent}%</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${badge.color}`}>
                        <span className={`w-2 h-2 rounded-full ${badge.dot} ${campaign.status === 'running' ? 'animate-pulse' : ''}`} />
                        {badge.label}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium">
                        {campaign.createdAt.toLocaleDateString('pt-BR')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {campaign.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {campaign.status === 'running' && (
                          <button
                            onClick={() => handlePause(campaign.id)}
                            className="w-9 h-9 rounded-full bg-warning text-warning-foreground flex items-center justify-center hover:bg-warning/80 transition-colors"
                            title="Pausar"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {campaign.status === 'paused' && (
                          <button
                            onClick={() => handleResume(campaign.id)}
                            className="w-9 h-9 rounded-full bg-success text-success-foreground flex items-center justify-center hover:bg-success/80 transition-colors"
                            title="Retomar"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {(campaign.status === 'completed' || campaign.status === 'error') && (
                          <button
                            onClick={() => handleResend(campaign.id)}
                            className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                            title="Reenviar"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        {campaign.status !== 'cancelled' && campaign.status !== 'completed' && (
                          <button
                            onClick={() => handleCancel(campaign.id)}
                            className="w-9 h-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors"
                            title="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className="w-9 h-9 rounded-full bg-muted/50 text-muted-foreground flex items-center justify-center hover:bg-muted transition-colors"
                          title="Detalhes"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats summary */}
      {all.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-primary">{running.length}</p>
            <p className="text-xs text-muted-foreground">Em andamento</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-warning">{drafts.length}</p>
            <p className="text-xs text-muted-foreground">Pausadas</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-success">
              {campaigns.filter(c => c.status === 'completed').length}
            </p>
            <p className="text-xs text-muted-foreground">Concluídas</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-destructive">
              {campaigns.filter(c => c.status === 'error').length}
            </p>
            <p className="text-xs text-muted-foreground">Com erro</p>
          </div>
        </div>
      )}
    </div>
  );
}