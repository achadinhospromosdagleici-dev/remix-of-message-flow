import React, { useState, useEffect, useRef } from 'react';
import { useWizard, Instance } from '@/contexts/WizardContext';
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  Clock,
  Shuffle,
  Check,
  Loader2,
  RefreshCw,
  WifiOff,
  Phone,
  Zap,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  loadUnoApiCredentials,
  loadUnoApiCredentialsWithFallback,
  fetchInstances as fetchUnoInstances,
  UnoApiInstance,
} from '@/services/unoapi';
import {
  loadEvolutionCredentials,
  loadEvolutionCredentialsWithFallback,
  loadSharedEvolutionCredentials,
  resolveEvolutionCredentials,
  fetchInstances as fetchEvoInstances,
  EvolutionInstance,
} from '@/services/evolution';
import {
  loadEvolutionGoCredentials,
  loadEvolutionGoCredentialsWithFallback,
  isEvolutionGoConnected,
  fetchEvolutionGoInstances,
  EvolutionGoInstance,
} from '@/services/evolutionGo';
import {
  loadChatwootCredentials,
  loadChatwootCredentialsWithFallback,
  fetchInboxes,
  ChatwootInbox,
} from '@/services/chatwoot';
import {
  loadWuzapiSettings,
  WuzapiInstanceDb,
} from '@/services/wuzapi';
import { useSharedEvolution } from '@/hooks/useSharedEvolution';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export function StepInstances() {
  const {
    instances,
    selectedInstances,
    toggleInstanceSelection,
    selectAllInstances,
    deselectAllInstances,
    settings,
    setSettings,
    unoApiConnected,
    selectedApi,
    setSelectedApi,
    setSelectedInstances,
  } = useWizard();
  const { user } = useAuth();

  const [unoInstances, setUnoInstances] = useState<UnoApiInstance[]>([]);
  const [evoInstances, setEvoInstances] = useState<EvolutionInstance[]>([]);
  const [evoGoInstances, setEvoGoInstances] = useState<EvolutionGoInstance[]>([]);
  const [chatwootInboxes, setChatwootInboxes] = useState<ChatwootInbox[]>([]);
  const [wuzInstances, setWuzInstances] = useState<WuzapiInstanceDb[]>([]);
  const [userInstances, setUserInstances] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef<boolean | 'done'>(false);

  const [hasEvolution, setHasEvolution] = useState(false);
  const hasSharedEvolution = useSharedEvolution();
  const [hasEvolutionGo, setHasEvolutionGo] = useState(false);
  const [hasChatwoot, setHasChatwoot] = useState(false);
  const [hasWuzapi, setHasWuzapi] = useState(false);
  React.useEffect(() => {
    async function checkApis(checkDb = false) {
      // Evolution
      const evoLocal = loadEvolutionCredentials();
      if (evoLocal) setHasEvolution(true);
      else if (checkDb) {
        const evoDb = await loadEvolutionCredentialsWithFallback();
        setHasEvolution(!!evoDb);
      }

      // Evolution Go
      const evoGoLocal = loadEvolutionGoCredentials();
      if (evoGoLocal) setHasEvolutionGo(true);
      else if (checkDb) {
        const evoGoDb = await loadEvolutionGoCredentialsWithFallback();
        setHasEvolutionGo(!!evoGoDb);
      }

      // Chatwoot
      const cwLocal = loadChatwootCredentials();
      if (cwLocal) setHasChatwoot(true);
      else if (checkDb) {
        const cwDb = await loadChatwootCredentialsWithFallback();
        setHasChatwoot(!!cwDb);
      }

      // WuzAPI
      const wuzLocal = await loadWuzapiSettings();
      if (wuzLocal) setHasWuzapi(true);
    }
    checkApis(true);

    // Auto-refresh periodically to pick up settings changes (only checks localStorage to prevent DB spam)
    const interval = setInterval(() => {
      checkApis(false);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const hasAnyApi = unoApiConnected || hasEvolution || !!hasSharedEvolution || hasEvolutionGo || hasChatwoot || hasWuzapi;

  // Fetch user's registered instances (for filtering when using shared Evolution)
  React.useEffect(() => {
    async function fetchUserInstances() {
      if (!user?.id) return;
      try {
        const data = (await api.get('user_instances', { status: 'connected' })) || [];
        setUserInstances(data.map((r: any) => r.instance_name));
      } catch (err) {
        console.error('Error fetching user instances:', err);
      }
    }
    fetchUserInstances();
  }, [user]);

  const handleSelectApi = (api: 'unoapi' | 'evolution' | 'evolution-go' | 'wuzapi') => {
    setSelectedApi(api);
  };

  // Auto-detect API on first load
  React.useEffect(() => {
    if (!selectedApi && hasLoadedRef.current !== 'done') {
      if (unoApiConnected) {
        setSelectedApi('unoapi');
      } else if (hasEvolutionGo) {
        setSelectedApi('evolution-go');
      } else if (hasEvolution || hasSharedEvolution) {
        setSelectedApi('evolution');
      } else if (hasWuzapi) {
        setSelectedApi('wuzapi');
      }
      hasLoadedRef.current = 'done';
    }
  }, [unoApiConnected, hasEvolution, hasSharedEvolution, hasEvolutionGo, hasWuzapi]);

  React.useEffect(() => {
    console.log('[StepInstances] unoApiConnected:', unoApiConnected);
    if (!hasLoadedRef.current || unoApiConnected) {
      loadAllInstances();
      hasLoadedRef.current = true;
    }
  }, [unoApiConnected]);

  React.useEffect(() => {
    // Also call on initial mount
    if (!hasLoadedRef.current) {
      console.log('[StepInstances] Mount - loading instances');
      loadAllInstances();
      hasLoadedRef.current = true;
    }

    // Auto-refresh instances every 15 seconds
    const interval = setInterval(() => {
      if (!loading) {
        loadAllInstances(false);
      }
    }, 15000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Cleanup orphaned selections (instances no longer available)
  React.useEffect(() => {
    if (loading) return;
    const validIds = new Set(mergedInstances.map(i => i.id));
    if (mergedInstances.length === 0) return; // no real instances loaded yet, keep defaults
    const orphans = selectedInstances.filter(id => !validIds.has(id));
    if (orphans.length > 0) {
      orphans.forEach(id => toggleInstanceSelection(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evoInstances, unoInstances, evoGoInstances, chatwootInboxes, loading]);

  const loadAllInstances = async (showLoading = true) => {
    console.log('[StepInstances] loadAllInstances called');
    if (showLoading) setLoading(true);
    const promises: Promise<void>[] = [];

    // UnoAPI
    const unoCreds = await loadUnoApiCredentialsWithFallback();
    if (unoCreds) {
      promises.push(
        fetchUnoInstances(unoCreds)
          .then(({ instances: fetched }) => {
            console.log('[StepInstances] UnoAPI instances fetched:', fetched);
            setUnoInstances(fetched);
          })
          .catch((err) => {
            console.error('[StepInstances] UnoAPI fetch error:', err);
            setUnoInstances([]);
          })
      );
    }

    // Evolution - try user's own first, then shared (for trial users)
    let evoCreds = await resolveEvolutionCredentials();
    console.log('[StepInstances] Evolution creds (resolved):', evoCreds ? 'found' : 'not found');
    if (!evoCreds) {
      // Try loading from database as fallback
      const credsFromDb = await loadEvolutionCredentialsWithFallback();
      if (credsFromDb) {
        console.log('[StepInstances] Evolution creds from DB found, using...');
        evoCreds = credsFromDb;
      }
    }
    if (evoCreds) {
      promises.push(
        fetchEvoInstances(evoCreds)
          .then((fetched) => {
            console.log('[StepInstances] Evolution instances fetched:', fetched);
            setEvoInstances(fetched);
          })
          .catch((err) => {
            console.error('[StepInstances] Evolution fetch error:', err);
            setEvoInstances([]);
          })
      );
    }

    // Evolution Go
    const evoGoCreds = await loadEvolutionGoCredentialsWithFallback();
    if (evoGoCreds) {
      promises.push(
        fetchEvolutionGoInstances(evoGoCreds)
          .then((fetched) => {
            console.log('[StepInstances] Evolution Go instances fetched:', fetched);
            setEvoGoInstances(fetched);
          })
          .catch((err) => {
            console.error('[StepInstances] Evolution Go fetch error:', err);
            setEvoGoInstances([]);
          })
      );
    }

    // Chatwoot
    const cwCreds = await loadChatwootCredentialsWithFallback();
    if (cwCreds) {
      promises.push(
        fetchInboxes(cwCreds)
          .then((fetched) => {
            console.log('[StepInstances] Chatwoot inboxes fetched:', fetched);
            setChatwootInboxes(fetched);
          })
          .catch((err) => {
            console.error('[StepInstances] Chatwoot fetch error:', err);
            setChatwootInboxes([]);
          })
      );
    }

    // WuzAPI
    const wuzCreds = await loadWuzapiSettings();
    if (wuzCreds && user?.id) {
      promises.push(
        api.get('wuzapi_instances')
          .then((data) => {
            setWuzInstances((data || []) as WuzapiInstanceDb[]);
          })
          .catch((err) => {
            console.error('[StepInstances] WuzAPI fetch error:', err);
            setWuzInstances([]);
          })
      );
    }

    await Promise.all(promises);
    if (showLoading) setLoading(false);
  };

// Merge all sources into unified Instance[]
  // When using shared Evolution, only show user's own registered instances
  const shouldFilterByUser = hasSharedEvolution && userInstances.length > 0;
  const mergedInstances: Instance[] = [
    ...(Array.isArray(evoGoInstances) ? evoGoInstances.map((ei) => ({
      id: `evogo_${ei.instanceName}`,
      name: ei.profileName || ei.instanceName,
      status: (ei.status === 'open' || ei.status === 'connected' ? 'active' : 'inactive') as Instance['status'],
      phoneNumber: ei.phone || undefined,
      source: 'evolution-go' as const,
    })) : []),
    ...(Array.isArray(evoInstances) ? evoInstances
      .filter((ei) => !shouldFilterByUser || (Array.isArray(userInstances) && userInstances.includes(ei.instanceName)))
      .map((ei) => ({
        id: `evo_${ei.instanceName}`,
        name: ei.profileName || ei.instanceName,
        status: (ei.status === 'open' || ei.status === 'connected' ? 'active' : 'inactive') as Instance['status'],
        phoneNumber: ei.phone || undefined,
        source: 'evolution' as const,
      })) : []),
    ...(unoApiConnected && Array.isArray(unoInstances) && unoInstances.length > 0
      ? unoInstances.map((ui) => ({
          id: `uno_${ui.phone}`,
          name: ui.name || ui.phone,
          status: (ui.status === 'connected' ? 'active' : 'inactive') as Instance['status'],
          phoneNumber: ui.phone,
          source: 'unoapi' as const,
        }))
      : []),
    ...(hasChatwoot && Array.isArray(chatwootInboxes) && chatwootInboxes.length > 0
      ? chatwootInboxes.map((ib) => ({
          id: `chatwoot_${ib.id}`,
          name: ib.name || `Caixa ${ib.id}`,
          status: 'active' as Instance['status'],
          phoneNumber: ib.phone_number || undefined,
          source: 'chatwoot' as const,
        }))
      : []),
    ...(Array.isArray(wuzInstances) && wuzInstances.length > 0
      ? wuzInstances.map((wi) => ({
          id: `wuz_${wi.id}`,
          name: wi.name,
          status: (wi.status === 'connected' ? 'active' : 'inactive') as Instance['status'],
          phoneNumber: wi.phone || undefined,
          source: 'wuzapi' as const,
        }))
      : []),
  ];

  const displayInstances = mergedInstances;
  const activeInstances = displayInstances.filter((i) => i.status === 'active');
  
  const selectedSource = selectedInstances.length > 0 
    ? (displayInstances.find(i => i.id === selectedInstances[0]) as any)?.source 
    : null;

  const handleSelectAll = () => {
    if (selectedSource) {
      // If already selecting a specific source, only select others from that same source
      const ids = displayInstances.filter(i => i.status === 'active' && (i as any).source === selectedSource).map(i => i.id);
      setSelectedInstances(ids);
    } else {
      // If none selected, find the first available source and select its active instances
      if (activeInstances.length > 0) {
        const firstSource = (activeInstances[0] as any).source;
        const ids = activeInstances.filter(i => (i as any).source === firstSource).map(i => i.id);
        setSelectedInstances(ids);
      }
    }
  };

  const getStatusIcon = (status: Instance['status']) => {
    switch (status) {
      case 'active': return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'inactive': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'pending': return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const getStatusLabel = (status: Instance['status']) => {
    switch (status) {
      case 'active': return 'Conectado';
      case 'inactive': return 'Desconectado';
      case 'pending': return 'Pendente';
    }
  };

  const getSourceBadge = (source: string) => {
    if (source === 'evolution-go') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 font-medium">EvoGo</span>;
    if (source === 'evolution') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Evolution</span>;
    if (source === 'unoapi') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">UnoAPI</span>;
    if (source === 'chatwoot') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-medium">Chatwoot</span>;
    if (source === 'wuzapi') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium">WuzAPI</span>;
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* Sources info */}
      {hasAnyApi && (
        <div className="glass-card p-4 border-primary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Phone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Números Disponíveis</p>
                <p className="text-sm text-muted-foreground">
                  {loading ? 'Buscando...' : (
                    <>
                      {evoInstances.length > 0 && <span>{evoInstances.length} Evolution</span>}
                      {evoInstances.length > 0 && (unoInstances.length > 0 || evoGoInstances.length > 0 || chatwootInboxes.length > 0 || wuzInstances.length > 0) && ' · '}
                      {unoInstances.length > 0 && <span>{unoInstances.length} UnoAPI</span>}
                      {unoInstances.length > 0 && (evoGoInstances.length > 0 || chatwootInboxes.length > 0 || wuzInstances.length > 0) && ' · '}
                      {evoGoInstances.length > 0 && <span>{evoGoInstances.length} Evo Go</span>}
                      {evoGoInstances.length > 0 && (chatwootInboxes.length > 0 || wuzInstances.length > 0) && ' · '}
                      {chatwootInboxes.length > 0 && <span>{chatwootInboxes.length} Chatwoot</span>}
                      {chatwootInboxes.length > 0 && wuzInstances.length > 0 && ' · '}
                      {wuzInstances.length > 0 && <span>{wuzInstances.length} WuzAPI</span>}
                      {evoInstances.length === 0 && unoInstances.length === 0 && evoGoInstances.length === 0 && chatwootInboxes.length === 0 && wuzInstances.length === 0 && 'Nenhum número encontrado'}
                    </>
                  )}
                </p>
              </div>
            </div>
            <button onClick={() => loadAllInstances()} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>
      )}

      {/* No API warning */}
      {!hasAnyApi && (
        <div className="glass-card p-4 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-warning">Nenhuma API conectada</p>
              <p className="text-sm text-muted-foreground mt-1">
                Vá em Configurações e conecte uma API de WhatsApp (Evolution API, UnoAPI, WuzAPI etc) para buscar seus números.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* API connected but no instances found */}
      {hasAnyApi && !loading && displayInstances.length === 0 && (
        <div className="glass-card p-4 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-warning">Nenhuma instância encontrada</p>
              <p className="text-sm text-muted-foreground mt-1">
                A API está configurada, mas nenhuma instância foi criada ainda.
                Acesse <strong>Configurações → Gerenciador de Instâncias</strong> para conectar um número de WhatsApp via QR Code.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Randomization Toggle */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shuffle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Randomização de Instâncias</p>
              <p className="text-sm text-muted-foreground">Alternar automaticamente entre os números selecionados</p>
            </div>
          </div>
          <button
            onClick={() => setSettings({ instanceRandomization: !settings.instanceRandomization })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              settings.instanceRandomization ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
              settings.instanceRandomization ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={handleSelectAll}
            className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
            Selecionar Ativos
          </button>
          <button onClick={deselectAllInstances}
            className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 transition-colors">
            Limpar Seleção
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Buscando números...</span>
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayInstances.map((instance) => {
            const isSelected = selectedInstances.includes(instance.id);
            const isActive = instance.status === 'active';
            const source = (instance as any).source || 'default';
            const isSourceDisabled = Boolean(selectedSource && selectedSource !== source);
            const showDisabledVisuals = !isActive || isSourceDisabled;

            return (
              <div
                key={instance.id}
                onClick={() => {
                  if (!isActive) return;
                  if (isSourceDisabled) {
                    import('sonner').then(({ toast }) => toast.error('Você não pode misturar instâncias de APIs diferentes.'));
                    return;
                  }
                  toggleInstanceSelection(instance.id);
                }}
                className={`instance-card ${instance.status} ${isSelected ? 'selected' : ''} ${showDisabledVisuals ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      instance.status === 'active' ? 'bg-success/10' :
                      instance.status === 'inactive' ? 'bg-destructive/10' : 'bg-warning/10'
                    }`}>
                      <Smartphone className={`w-5 h-5 ${
                        instance.status === 'active' ? 'text-success' :
                        instance.status === 'inactive' ? 'text-destructive' : 'text-warning'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{instance.name}</p>
                        {getSourceBadge(source)}
                      </div>
                      <p className="text-xs text-muted-foreground">{instance.phoneNumber || 'Sem número'}</p>
                    </div>
                  </div>
                  {isSelected && isActive && (
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {getStatusIcon(instance.status)}
                  <span className={`text-sm ${
                    instance.status === 'active' ? 'text-success' :
                    instance.status === 'inactive' ? 'text-destructive' : 'text-warning'
                  }`}>
                    {getStatusLabel(instance.status)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selection summary */}
      {selectedInstances.length > 0 && (
        <div className="glass-card p-4 border-primary/30 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span><strong>{selectedInstances.length}</strong> número(s) selecionado(s)</span>
            </div>
            {settings.instanceRandomization && selectedInstances.length > 1 && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Shuffle className="w-4 h-4" /> Randomização ativa
              </span>
            )}
          </div>
        </div>
      )}

      {/* No active warning */}
      {!loading && displayInstances.length > 0 && activeInstances.length === 0 && (
        <div className="glass-card p-4 border-warning/30 bg-warning/5">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-warning shrink-0" />
            <div>
              <p className="font-medium text-warning">Nenhum número ativo</p>
              <p className="text-sm text-muted-foreground mt-1">
                Conecte um número via QR Code no <strong>Gerenciador de Instâncias</strong> em Configurações para ativar o envio.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
