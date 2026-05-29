import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, Link2, Unlink, Loader2, Eye, EyeOff, QrCode, RefreshCw, CheckCircle2, Wifi, WifiOff, Plus, List, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/services/api';
import {
  EvolutionCredentials,
  EvolutionInstance,
  saveEvolutionCredentials,
  loadEvolutionCredentialsWithFallback,
  clearEvolutionCredentials,
  fetchInstances,
  findOrCreateInstance,
  getQRCode,
  getInstanceStatus,
  logoutInstance,
  loadSharedEvolutionCredentials,
} from '@/services/evolution';
import { ConversationsPanel } from './ConversationsPanel';
import { useAuth } from '@/contexts/AuthContext';

interface EvolutionConnectionProps {
  onInstancesLoaded?: (instances: EvolutionInstance[]) => void;
}

export function EvolutionConnection({ onInstancesLoaded }: EvolutionConnectionProps) {
  const { isSuperadmin, user } = useAuth();
  const [usingShared, setUsingShared] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [newInstanceName, setNewInstanceName] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [instances, setInstances] = useState<EvolutionInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [conversationsInstance, setConversationsInstance] = useState<string | null>(null);

  // QR flow
  const [activeInstance, setActiveInstance] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [timer, setTimer] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    (async () => {
      const own = await loadEvolutionCredentialsWithFallback();
      if (own) {
        setBaseUrl(own.baseUrl);
        setApiKey(own.apiKey);
        setIsConnected(true);
        setUsingShared(false);
        try {
          const list = await fetchInstances(own);
          setInstances(list);
          onInstancesLoaded?.(list);
        } catch { /* silent on init */ }
        return;
      }
      const shared = await loadSharedEvolutionCredentials();
      if (shared) {
        setBaseUrl(shared.baseUrl);
        setApiKey(shared.apiKey);
        setIsConnected(true);
        setUsingShared(true);
        try {
          const list = await fetchInstances(shared);
          setInstances(list);
          onInstancesLoaded?.(list);
        } catch { /* silent on init */ }
      }
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const getCreds = (): EvolutionCredentials => ({
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey: apiKey.trim(),
  });

  // ── Fetch all instances ──
  const handleFetchInstances = async (creds?: EvolutionCredentials) => {
    const c = creds || getCreds();
    setLoadingInstances(true);
    try {
      const list = await fetchInstances(c);
      // Register each connected instance to user in database
      for (const inst of list) {
        if (inst.status === 'open' || inst.status === 'connected') {
          await registerUserInstance(inst);
        }
      }
      setInstances(list);
      onInstancesLoaded?.(list);
    } catch (err: any) {
      toast.error(`Erro ao buscar instâncias: ${err.message}`);
    } finally {
      setLoadingInstances(false);
    }
  };

  // Save user's instance to database when connected
  const registerUserInstance = async (instance: EvolutionInstance) => {
    if (!user?.id) return;
    try {
      await api.upsert('user_instances', {
        user_id: user.id,
        instance_name: instance.instanceName,
        phone: instance.phone || '',
        profile_name: instance.profileName || '',
        status: 'connected',
      }, 'user_id,instance_name');
    } catch (err) {
      console.error('Error registering user instance:', err);
    }
  };

  // ── Connect API (save creds + fetch) ──
  const handleConnect = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      toast.error('Preencha URL e API Key');
      return;
    }
    setIsLoading(true);
    const creds = getCreds();
    try {
      await fetchInstances(creds); // test connection
      saveEvolutionCredentials(creds);
      setIsConnected(true);
      toast.success('Conectado à Evolution API!');
      await handleFetchInstances(creds);
    } catch (err: any) {
      toast.error(`Falha: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    clearEvolutionCredentials();
    setIsConnected(false);
    setInstances([]);
    setQrCode('');
    setActiveInstance('');
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    onInstancesLoaded?.([]);
    toast.success('Desconectado');
  };

  // ── Create new instance (anti-duplication) ──
  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      toast.error('Digite um nome para a instância');
      return;
    }
    setIsLoading(true);
    try {
      const result = await findOrCreateInstance(getCreds(), newInstanceName.trim());
      if (result.action === 'existing') {
        toast.info(`Instância "${result.instanceName}" já existe — reutilizando.`);
      } else {
        toast.success(`Instância "${result.instanceName}" criada!`);
      }
      if (result.qrcode) {
        setActiveInstance(result.instanceName);
        setQrCode(result.qrcode);
        startQrTimer(result.instanceName);
      }
      setNewInstanceName('');
      await handleFetchInstances();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Generate QR for an instance ──
  const handleGenerateQR = async (instName: string) => {
    setIsLoading(true);
    setActiveInstance(instName);
    try {
      const data = await getQRCode(getCreds(), instName);
      setQrCode(data.qrcode || '');
      startQrTimer(instName);
    } catch (err: any) {
      toast.error(`Erro ao gerar QR: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const startQrTimer = (instName: string) => {
    setTimer(30);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer(prev => {
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
        const status = await getInstanceStatus(getCreds(), instName);
        if (status.connected) {
          setQrCode('');
          clearInterval(pollRef.current!);
          clearInterval(timerRef.current!);
          toast.success(`WhatsApp conectado na instância "${instName}"! 🎉`);
          await handleFetchInstances();
        }
      } catch {}
    }, 5000);
  };

  const openInstances = instances.filter(i => i.status === 'open' || i.status === 'connected');
  const closedInstances = instances.filter(i => i.status !== 'open' && i.status !== 'connected');

  return (
    <div className="space-y-4">
      {usingShared && (
        <div className="glass-card p-3 border-primary/30 bg-primary/5 text-sm flex items-center gap-2">
          <Wifi className="w-4 h-4 text-primary" />
          <span>Você está usando a <strong>Evolution compartilhada</strong> do sistema (período de teste). Crie sua instância abaixo e escaneie o QR para conectar seu WhatsApp.</span>
        </div>
      )}
      {/* Status bar */}
      <div className={`glass-card p-4 flex items-center justify-between ${isConnected ? 'border-success/30' : 'border-border/50'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isConnected ? 'bg-success/10' : 'bg-warning/10'}`}>
            {isConnected ? <Wifi className="w-5 h-5 text-success" /> : <WifiOff className="w-5 h-5 text-warning" />}
          </div>
          <div>
            <p className="font-medium">{isConnected ? 'Evolution API Conectada' : 'Evolution API Desconectada'}</p>
            <p className="text-xs text-muted-foreground">
              {isConnected ? `${openInstances.length} instância(s) ativa(s) de ${instances.length}` : 'Configure URL e API Key'}
            </p>
          </div>
        </div>
        {isConnected && (
          <div className="flex items-center gap-2">
            <button onClick={() => handleFetchInstances()} disabled={loadingInstances}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loadingInstances ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <button onClick={handleDisconnect}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 transition-colors">
              <Unlink className="w-4 h-4" /> Desconectar
            </button>
          </div>
        )}
      </div>

      {/* Credentials Form */}
      {!isConnected && (
        <div className="glass-card p-6 space-y-4 animate-fade-in">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">URL da Evolution API</label>
            <input type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://sua-evolution-api.com"
              className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">API Key</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Sua API Key"
                className="w-full px-4 py-3 pr-12 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button onClick={handleConnect} disabled={isLoading}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
            {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Conectando...</> : <><Link2 className="w-4 h-4" /> Conectar</>}
          </button>
        </div>
      )}

      {/* Connected: Instances + Create */}
      {isConnected && (
        <>
          {/* Create new instance */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <Plus className="w-5 h-5 text-primary" />
              <p className="font-medium">Criar Nova Instância</p>
            </div>
            <div className="flex gap-2">
              <input type="text" value={newInstanceName} onChange={e => setNewInstanceName(e.target.value)}
                placeholder="Nome da instância" onKeyDown={e => e.key === 'Enter' && handleCreateInstance()}
                className="flex-1 px-4 py-2 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
              <button onClick={handleCreateInstance} disabled={isLoading || !newInstanceName.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              O sistema verifica automaticamente se já existe uma instância com este nome antes de criar.
            </p>
          </div>

          {/* QR Code display */}
          {qrCode && activeInstance && (
            <div className="glass-card p-6 space-y-4 animate-fade-in border-primary/30">
              <h3 className="font-medium text-center flex items-center justify-center gap-2">
                <QrCode className="w-5 h-5 text-primary" /> QR Code — {activeInstance}
              </h3>
              <div className="flex flex-col items-center gap-4">
                <div className="w-64 h-64 bg-white rounded-xl p-3 mx-auto">
                  <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code" className="w-full h-full object-contain" />
                </div>
                <p className="text-sm text-primary font-medium">Expira em {timer}s</p>
                <button onClick={() => handleGenerateQR(activeInstance)} disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted transition-colors text-sm">
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Novo QR
                </button>
              </div>
            </div>
          )}

          {/* Instances list */}
          {loadingInstances ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground text-sm">Buscando instâncias...</span>
            </div>
          ) : instances.length === 0 ? (
            <div className="glass-card p-6 text-center">
              <List className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma instância encontrada. Crie uma acima.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <List className="w-4 h-4" /> {instances.length} instância(s)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {instances.map(inst => {
                  const isOpen = inst.status === 'open' || inst.status === 'connected';
                  return (
                    <div key={inst.instanceName}
                      className={`glass-card p-4 ${isOpen ? 'border-success/30' : 'border-border/50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Smartphone className={`w-4 h-4 ${isOpen ? 'text-success' : 'text-muted-foreground'}`} />
                          <span className="font-medium text-sm">{inst.instanceName}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isOpen ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                          {isOpen ? 'Conectado' : 'Desconectado'}
                        </span>
                      </div>
                      {inst.phone && (
                        <p className="text-xs text-muted-foreground mb-2">{inst.phone}</p>
                      )}
                      {inst.profileName && (
                        <p className="text-xs text-muted-foreground mb-2">👤 {inst.profileName}</p>
                      )}
                      {isOpen && (
                        <div className="flex items-center gap-1 mt-1">
                          <CheckCircle2 className="w-3 h-3 text-success" />
                          <span className="text-xs text-success">Pronto para envio</span>
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        {!isOpen && (
                          <button onClick={() => handleGenerateQR(inst.instanceName)}
                            disabled={isLoading}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors flex items-center justify-center gap-1">
                            <QrCode className="w-3 h-3" /> Conectar
                          </button>
                        )}
                        {isOpen && (
                          <button onClick={() => setConversationsInstance(inst.instanceName)}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors flex items-center justify-center gap-1">
                            <MessageSquare className="w-3 h-3" /> Conversas
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

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
