import React, { useState, useEffect, useRef } from 'react';
import { 
  Smartphone, Wifi, WifiOff, QrCode, RefreshCw, Plus, Trash2, 
  Loader2, CheckCircle2, XCircle, MessageSquare, ExternalLink,
  PanelLeftClose, PanelLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { loadUnoApiCredentials, testConnection, UnoApiInstance, fetchInstances as fetchUnoInstances } from '@/services/unoapi';
import { 
  loadEvolutionCredentials, 
  fetchInstances as fetchEvoInstances, 
  EvolutionInstance,
  getQRCode,
  getInstanceStatus,
} from '@/services/evolution';
import { 
  loadEvolutionGoCredentials, 
  fetchEvolutionGoInstances, 
  EvolutionGoInstance,
  getEvolutionGoQRCode,
  getEvolutionGoInstanceStatus,
} from '@/services/evolutionGo';
import {
  loadWuzapiSettings,
  getStatus as getWuzapiStatus,
  getQRCode as getWuzapiQRCode,
  connect as connectWuzapi,
  extractPhoneFromJid,
} from '@/services/wuzapi';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { ConversationsPanel } from './ConversationsPanel';

type ApiSource = 'unoapi' | 'evolution' | 'evolution-go' | 'wuzapi';

interface InstanceInfo {
  id: string;
  name: string;
  phone: string;
  status: 'connected' | 'disconnected' | 'pending';
  source: ApiSource;
  profileName?: string;
  qrcode?: string;
}

export function InstancesManager() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeApi, setActiveApi] = useState<ApiSource>('evolution');
  const [qrCode, setQrCode] = useState('');
  const [qrInstance, setQrInstance] = useState('');
  const [qrTimer, setQrTimer] = useState(30);
  const [conversationsInstance, setConversationsInstance] = useState<string | null>(null);
  
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (isOpen) {
      loadAllInstances();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen, user]);

  const hasUno = !!loadUnoApiCredentials();
  const hasEvo = !!loadEvolutionCredentials();
  const hasEvoGo = !!loadEvolutionGoCredentials();
  const hasWuzapi = typeof window !== 'undefined' && !!localStorage.getItem('wuzapi_credentials');

  const loadAllInstances = async () => {
    setLoading(true);
    const allInstances: InstanceInfo[] = [];

    // UnoAPI
    if (hasUno) {
      const creds = loadUnoApiCredentials();
      if (creds) {
        try {
          const { instances: fetched } = await fetchUnoInstances(creds);
          allInstances.push(...fetched.map((i: UnoApiInstance): InstanceInfo => ({
            id: `uno_${i.phone}`,
            name: i.name || i.phone,
            phone: i.phone,
            status: (i.status === 'connected' ? 'connected' : 'disconnected') as InstanceInfo['status'],
            source: 'unoapi' as ApiSource,
          })));
        } catch (e) {}
      }
    }

    // Evolution
    if (hasEvo) {
      const creds = loadEvolutionCredentials();
      if (creds) {
        try {
          const fetched = await fetchEvoInstances(creds);
          allInstances.push(...fetched.map((i: EvolutionInstance): InstanceInfo => ({
            id: `evo_${i.instanceName}`,
            name: i.profileName || i.instanceName,
            phone: i.phone || i.instanceName,
            status: (i.status === 'open' || i.status === 'connected' ? 'connected' : 'disconnected') as InstanceInfo['status'],
            source: 'evolution' as ApiSource,
            profileName: i.profileName,
          })));
        } catch (e) {}
      }
    }

    // Evolution Go
    if (hasEvoGo) {
      const creds = loadEvolutionGoCredentials();
      if (creds) {
        try {
          const fetched = await fetchEvolutionGoInstances(creds);
          allInstances.push(...fetched.map((i: EvolutionGoInstance): InstanceInfo => ({
            id: `evogo_${i.instanceName}`,
            name: i.profileName || i.instanceName,
            phone: i.phone || i.instanceName,
            status: (i.status === 'open' || i.status === 'connected' ? 'connected' : 'disconnected') as InstanceInfo['status'],
            source: 'evolution-go' as ApiSource,
            profileName: i.profileName,
          })));
        } catch (e) {}
      }
    }

    // WuzAPI
    if (hasWuzapi && user?.id) {
      try {
        const data = await api.get('wuzapi_instances', { order: 'created_at.desc' });

        if (data?.length) {
          allInstances.push(...data.map((i: any): InstanceInfo => ({
            id: `wuz_${i.name}`,
            name: i.name,
            phone: i.phone || i.name,
            status: (i.status === 'connected' ? 'connected' : 'disconnected') as InstanceInfo['status'],
            source: 'wuzapi' as ApiSource,
          })));
        }
      } catch (e) {
        console.error('[InstancesManager] Error fetching WuzAPI instances:', e);
      }
    }

    setInstances(allInstances);
    setLoading(false);
  };

  const handleGenerateQR = async (source: ApiSource, instanceName: string) => {
    try {
      setQrInstance(instanceName);
      let data: { qrcode: string } = { qrcode: '' };
      
      if (source === 'evolution') {
        const creds = loadEvolutionCredentials()!;
        data = await getQRCode(creds, instanceName);
      } else if (source === 'evolution-go') {
        const creds = loadEvolutionGoCredentials()!;
        data = await getEvolutionGoQRCode(creds, instanceName);
      } else if (source === 'wuzapi') {
        const creds = await loadWuzapiSettings();
        if (creds && user?.id) {
          const dbInstances = await api.get('wuzapi_instances');
          
          const matched = dbInstances?.find((di: any) => di.name === instanceName || di.phone === instanceName);
          if (matched?.user_token) {
            await connectWuzapi(creds.baseUrl, matched.user_token);
            const qr = await getWuzapiQRCode(creds.baseUrl, matched.user_token);
            data = { qrcode: qr };
          } else {
            throw new Error('Instância WuzAPI não encontrada no banco de dados');
          }
        } else {
          throw new Error('Credenciais da WuzAPI não configuradas');
        }
      }
      
      setQrCode(data.qrcode || '');
      startQrTimer(source, instanceName);
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
  };

  const startQrTimer = (source: ApiSource, instanceName: string) => {
    setQrTimer(30);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setQrTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setQrCode('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        let connected = false;
        if (source === 'evolution') {
          const creds = loadEvolutionCredentials()!;
          const status = await getInstanceStatus(creds, instanceName);
          connected = !!status.connected;
        } else if (source === 'evolution-go') {
          const creds = loadEvolutionGoCredentials()!;
          const status = await getEvolutionGoInstanceStatus(creds, instanceName);
          connected = status.status === 'open' || status.status === 'connected';
        } else if (source === 'wuzapi') {
          const creds = await loadWuzapiSettings();
          if (creds && user?.id) {
            const dbInstances = await api.get('wuzapi_instances');
            
            const matched = dbInstances?.find((di: any) => di.name === instanceName || di.phone === instanceName);
              if (matched?.user_token) {
                const status = await getWuzapiStatus(creds.baseUrl, matched.user_token);
                connected = !!status.connected;
                if (connected && status.jid) {
                  const phone = extractPhoneFromJid(status.jid);
                  const { saveWuzapiInstanceDb } = await import('@/services/wuzapi');
                  await saveWuzapiInstanceDb(matched.user_token, phone, matched.name, 'connected');
                }
              }
          }
        }
        
        if (connected) {
          setQrCode('');
          clearInterval(pollRef.current!);
          clearInterval(timerRef.current!);
          toast.success(`WhatsApp conectado!`);
          loadAllInstances();
        }
      } catch {}
    }, 5000);
  };

  const getSourceIcon = (source: ApiSource) => {
    switch (source) {
      case 'unoapi': return '🌐';
      case 'evolution': return '📱';
      case 'evolution-go': return '⚡';
      case 'wuzapi': return '💬';
    }
  };

  const getSourceLabel = (source: ApiSource) => {
    switch (source) {
      case 'unoapi': return 'UnoAPI';
      case 'evolution': return 'Evolution';
      case 'evolution-go': return 'EvoGo';
      case 'wuzapi': return 'WuzAPI';
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'connected') {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">Conectado</span>;
    }
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Desconectado</span>;
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center gap-2 glow-effect z-50"
      >
        <Smartphone className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-end">
      <div className="w-full max-w-md h-full bg-background border-l border-border overflow-hidden flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              Gerenciar Números
            </h2>
            <p className="text-xs text-muted-foreground">{instances.length} número(s) encontrado(s)</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg hover:bg-muted"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        {/* API Tabs */}
        <div className="p-3 border-b border-border bg-muted/20">
          <div className="flex gap-2 flex-wrap">
            {hasEvo && (
              <button
                onClick={() => setActiveApi('evolution')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${
                  activeApi === 'evolution' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                📱 Evolution
              </button>
            )}
            {hasEvoGo && (
              <button
                onClick={() => setActiveApi('evolution-go')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${
                  activeApi === 'evolution-go' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                ⚡ EvoGo
              </button>
            )}
            {hasWuzapi && (
              <button
                onClick={() => setActiveApi('wuzapi')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${
                  activeApi === 'wuzapi' 
                    ? 'bg-amber-600 text-white' 
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                💬 WuzAPI
              </button>
            )}
            {hasUno && (
              <button
                onClick={() => setActiveApi('unoapi')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 ${
                  activeApi === 'unoapi' 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-muted hover:bg-muted/80'
                }`}
              >
                🌐 UnoAPI
              </button>
            )}
          </div>
        </div>

        {/* QR Code Display */}
        {qrCode && (
          <div className="p-4 bg-primary/5 border-b border-primary/20 animate-fade-in">
            <h3 className="text-sm font-medium text-center mb-3 flex items-center justify-center gap-2">
              <QrCode className="w-4 h-4 text-primary" /> 
              QR Code — {qrInstance}
            </h3>
            <div className="w-48 h-48 mx-auto bg-white rounded-xl p-2">
              <img 
                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                alt="QR Code" 
                className="w-full h-full object-contain" 
              />
            </div>
            <p className="text-center text-xs text-primary mt-2">Expira em {qrTimer}s</p>
          </div>
        )}

        {/* Instances List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
            </div>
          ) : instances.filter(i => i.source === activeApi).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma instância encontrada</p>
              {activeApi !== 'unoapi' && (
                <p className="text-xs mt-1">Va em Configurações para conectar</p>
              )}
            </div>
          ) : (
            instances.filter(i => i.source === activeApi).map(inst => (
              <div 
                key={inst.id}
                className="p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getSourceIcon(inst.source)}</span>
                    <div>
                      <p className="font-medium text-sm">{inst.name}</p>
                      <p className="text-xs text-muted-foreground">{inst.phone}</p>
                    </div>
                  </div>
                  {getStatusBadge(inst.status)}
                </div>
                
                <div className="flex gap-2 mt-2">
                  {inst.status !== 'connected' && activeApi !== 'unoapi' && (
                    <button
                      onClick={() => handleGenerateQR(inst.source, inst.phone)}
                      className="flex-1 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 flex items-center justify-center gap-1"
                    >
                      <QrCode className="w-3 h-3" /> Conectar
                    </button>
                  )}
                  {inst.status === 'connected' && (
                    <button
                      onClick={() => setConversationsInstance(`${inst.source}:${inst.phone}`)}
                      className="flex-1 py-1.5 rounded-md bg-success/10 text-success text-xs font-medium hover:bg-success/20 flex items-center justify-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" /> Conversas
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Quick Actions */}
          {!loading && instances.length > 0 && (
            <button
              onClick={loadAllInstances}
              className="w-full py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Atualizar
            </button>
          )}
        </div>

        {/* Help Text */}
        <div className="p-3 border-t border-border bg-muted/20">
          <p className="text-[10px] text-muted-foreground text-center">
            {hasEvo ? '📱 Evolution API ' : ''} {hasEvoGo ? '⚡ EvoGo ' : ''} {hasWuzapi ? '💬 WuzAPI ' : ''} {hasUno ? '🌐 UnoAPI ' : ''}
            <br />
            Clique em "Conectar" para gerar novo QR Code
          </p>
        </div>
      </div>

      {/* Conversations Panel */}
      {conversationsInstance && (
        <ConversationsPanel 
          instanceName={conversationsInstance}
          onClose={() => setConversationsInstance(null)}
        />
      )}
    </div>
  );
}