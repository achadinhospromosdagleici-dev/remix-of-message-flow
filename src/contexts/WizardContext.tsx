import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Campaign } from '@/components/wizard/CampaignHistory';
import { ActiveCampaign } from '@/components/wizard/ActiveCampaigns';
import { ScheduledCampaign } from '@/components/wizard/CampaignScheduler';
import { ABTest } from '@/components/wizard/ABTesting';
import { FollowUpConfig } from '@/components/wizard/FollowUpSettings';
import { CampaignMetrics } from '@/components/wizard/Dashboard';
import { ChatwootInbox, loadChatwootCredentialsWithFallback, saveChatwootCredentials } from '@/services/chatwoot';
import { loadUnoApiCredentials, testConnection, loadUnoApiCredentialsWithFallback, saveUnoApiCredentials } from '@/services/unoapi';
import { loadEvolutionCredentialsWithFallback, saveEvolutionCredentials } from '@/services/evolution';
import { loadEvolutionGoCredentialsWithFallback, saveEvolutionGoCredentials } from '@/services/evolutionGo';
import { loadWuzapiSettings, testConnection as testWuzapiConnection } from '@/services/wuzapi';
import { generateId } from '@/lib/id';

export interface DataRow {
  id: string;
  numero: string;
  isValid: boolean;
  errorMessage?: string;
  [key: string]: string | boolean | undefined;
}

export interface Message {
  id: string;
  content: string;
  aiVariations?: string[];
  mediaType?: 'text' | 'image' | 'audio' | 'video' | 'document' | 'buttons' | 'link' | 'list' | 'carousel' | 'contact';
  mediaUrl?: string;
  mediaCaption?: string;
  mediaFilename?: string;
  // Botões interativos (Evolution sendButtons) ou link "mascarado" no texto
  buttons?: MessageButton[];
  // Para tipo 'link': URL clicável anexada ao texto
  linkUrl?: string;
  // Optional button block title/footer
  btnTitle?: string;
  btnFooter?: string;
  // Para tipo 'list' / 'carousel'
  title?: string;
  footer?: string;
  sections?: unknown;
  cards?: unknown;
}

export interface MessageButton {
  id: string;
  type: 'url' | 'phone' | 'reply' | 'copy';
  label: string;          // Texto do botão (max 20 chars recomendado)
  value: string;          // URL, telefone (com DDI), ID de resposta, ou texto para copiar
}

export interface Instance {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  phoneNumber?: string;
}

export interface WizardSettings {
  hasHeader: boolean;
  intervalType: 'fixed' | 'random';
  fixedInterval: number;
  minInterval: number;
  maxInterval: number;
  sendType: 'single' | 'multiple';
  useAI: boolean;
  messageRandomization: 'random' | 'sequential';
  instanceRandomization: boolean;
  templatesEnabled: boolean;
}

interface WizardState {
  currentStep: number;
  data: DataRow[];
  columns: string[];
  messages: Message[];
  instances: Instance[];
  selectedInstances: string[];
  settings: WizardSettings;
  campaignHistory: Campaign[];
  // New features
  chatwootConnected: boolean;
  unoApiConnected: boolean;
  wuzapiConnected: boolean;
  chatwootInboxes: ChatwootInbox[];
  selectedInboxId: number | null;
  followUpConfig: FollowUpConfig;
  scheduledCampaigns: ScheduledCampaign[];
  abTests: ABTest[];
  metrics: CampaignMetrics;
  activeCampaigns: ActiveCampaign[];
  selectedApi: 'unoapi' | 'evolution' | 'evolution-go' | 'chatwoot' | 'wuzapi' | null;
}

interface WizardContextType extends WizardState {
  setCurrentStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setData: (data: DataRow[] | ((prev: DataRow[]) => DataRow[])) => void;
  setColumns: (columns: string[] | ((prev: string[]) => string[])) => void;
  updateRow: (id: string, updates: Partial<DataRow>) => void;
  deleteRow: (id: string) => void;
  deleteRows: (ids: string[]) => void;
  addMessage: (content: string, media?: { mediaType?: Message['mediaType']; mediaUrl?: string; mediaCaption?: string; mediaFilename?: string }) => void;
  addRichMessage: (msg: Omit<Message, 'id'>) => void;
  updateMessage: (id: string, content: string) => void;
  updateRichMessage: (id: string, updates: Partial<Omit<Message, 'id'>>) => void;
  deleteMessage: (id: string) => void;
  moveMessage: (fromIndex: number, toIndex: number) => void;
  setSettings: (settings: Partial<WizardSettings>) => void;
  clearWizard: () => void;
  addInstance: (instance: Instance) => void;
  toggleInstanceSelection: (id: string) => void;
  setSelectedInstances: (ids: string[] | ((prev: string[]) => string[])) => void;
  selectAllInstances: () => void;
  deselectAllInstances: () => void;
  getValidCount: () => number;
  getInvalidCount: () => number;
  addCampaign: (campaign: Campaign) => void;
  reuseCampaign: (campaign: Campaign) => void;
  // New
  setChatwootConnected: (connected: boolean) => void;
  setUnoApiConnected: (connected: boolean) => void;
  setWuzapiConnected: (connected: boolean) => void;
  setChatwootInboxes: (inboxes: ChatwootInbox[]) => void;
  setSelectedInboxId: (id: number | null) => void;
  setFollowUpConfig: (config: FollowUpConfig) => void;
  setSelectedApi: (api: 'unoapi' | 'evolution' | 'evolution-go' | 'wuzapi' | null) => void;
  addScheduledCampaign: (campaign: ScheduledCampaign) => void;
  cancelScheduledCampaign: (id: string) => void;
  addABTest: (test: ABTest) => void;
  removeABTest: (id: string) => void;
  updateMetrics: (metrics: Partial<CampaignMetrics>) => void;
  addActiveCampaign: (campaign: ActiveCampaign) => void;
  updateActiveCampaign: (id: string, updates: Partial<ActiveCampaign>) => void;
  removeActiveCampaign: (id: string) => void;
}

const defaultSettings: WizardSettings = {
  hasHeader: true,
  intervalType: 'random',
  fixedInterval: 5,
  minInterval: 3,
  maxInterval: 10,
  sendType: 'single',
  useAI: false,
  messageRandomization: 'sequential',
  instanceRandomization: true,
  templatesEnabled: false,
};

const defaultFollowUpConfig: FollowUpConfig = {
  enabled: false,
  mode: 'greeting-then-all',
  greetingMessageIndex: 0,
  waitForReplyTimeout: 30,
  maxRetries: 1,
  retryInterval: 60,
};

const defaultMetrics: CampaignMetrics = {
  totalSent: 4800,
  totalDelivered: 4650,
  totalFailed: 150,
  totalReplied: 1240,
  totalOptOut: 23,
  deliveryRate: 96.9,
  replyRate: 25.8,
  failRate: 3.1,
  avgResponseTime: '12min',
  campaignCount: 3,
};

const sampleCampaignHistory: Campaign[] = [
  {
    id: '1',
    name: 'Black Friday 2024',
    date: new Date('2024-11-29T14:30:00'),
    totalContacts: 1500,
    sentCount: 1450,
    successCount: 1420,
    failedCount: 30,
    messages: ['Olá {{nome}}! 🎉 Aproveite 50% OFF em todos os produtos!', 'Ei {{nome}}, última chance! Desconto especial só até meia-noite!'],
    status: 'completed',
  },
  {
    id: '2',
    name: 'Natal - Promoção',
    date: new Date('2024-12-20T10:00:00'),
    totalContacts: 2000,
    sentCount: 1800,
    successCount: 1750,
    failedCount: 50,
    messages: ['{{nome}}, o Natal chegou! 🎄 Confira nossas ofertas especiais.'],
    status: 'partial',
  },
  {
    id: '3',
    name: 'Ano Novo',
    date: new Date('2024-12-31T08:00:00'),
    totalContacts: 500,
    sentCount: 500,
    successCount: 495,
    failedCount: 5,
    messages: ['Feliz Ano Novo, {{nome}}! 🎆 Que 2025 seja incrível!'],
    status: 'completed',
  },
];

const defaultState: WizardState = {
  currentStep: 1,
  data: [],
  columns: ['numero'],
  messages: [],
  instances: [],
  selectedInstances: [],
  settings: defaultSettings,
  campaignHistory: sampleCampaignHistory,
  chatwootConnected: false,
  unoApiConnected: false,
  wuzapiConnected: false,
  chatwootInboxes: [],
  selectedInboxId: null,
  followUpConfig: defaultFollowUpConfig,
  scheduledCampaigns: [],
  abTests: [],
  metrics: defaultMetrics,
  activeCampaigns: [],
  selectedApi: null,
};

const WizardContext = createContext<WizardContextType | undefined>(undefined);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wizard_state');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            ...defaultState,
            ...parsed,
            selectedInstances: Array.isArray(parsed.selectedInstances) ? parsed.selectedInstances : [],
            unoApiConnected: !!localStorage.getItem('unoapi_credentials'),
            wuzapiConnected: !!localStorage.getItem('wuzapi_credentials'),
          };
        } catch (e) {
          console.error('Error loading wizard state:', e);
        }
      }
    }
    return {
      ...defaultState,
      unoApiConnected: !!localStorage.getItem('unoapi_credentials'),
      wuzapiConnected: !!localStorage.getItem('wuzapi_credentials'),
    };
  });

  // Persistir estado no localStorage
  useEffect(() => {
    localStorage.setItem('wizard_state', JSON.stringify(state));
  }, [state]);

  // Load APIs from DB on mount and populate localStorage
  useEffect(() => {
    const preloadApis = async () => {
      try {
        const uno = await loadUnoApiCredentialsWithFallback();
        if (uno) localStorage.setItem('unoapi_credentials', JSON.stringify(uno));
        
        const evo = await loadEvolutionCredentialsWithFallback();
        if (evo) localStorage.setItem('evolution_credentials', JSON.stringify(evo));
        
        const evogo = await loadEvolutionGoCredentialsWithFallback();
        if (evogo) localStorage.setItem('evolution_go_credentials', JSON.stringify(evogo));
        
        const cw = await loadChatwootCredentialsWithFallback();
        if (cw) localStorage.setItem('chatwoot_credentials', JSON.stringify(cw));

        const wuz = await loadWuzapiSettings();
        if (wuz) localStorage.setItem('wuzapi_credentials', JSON.stringify(wuz));
      } catch (err) {
        console.error('[WizardContext] Error preloading APIs:', err);
      }
    };
    preloadApis();
  }, []);

  const setCurrentStep = (step: number) => setState(prev => ({ ...prev, currentStep: Math.max(1, Math.min(6, step)) }));
  const nextStep = () => setCurrentStep(state.currentStep + 1);
  const prevStep = () => setCurrentStep(state.currentStep - 1);
  const setData = (data: DataRow[] | ((prev: DataRow[]) => DataRow[])) => {
    setState(prev => ({
      ...prev,
      data: typeof data === 'function' ? data(prev.data) : (Array.isArray(data) ? data : [])
    }));
  };
  const setColumns = (columns: string[] | ((prev: string[]) => string[])) => {
    setState(prev => ({
      ...prev,
      columns: typeof columns === 'function' ? columns(prev.columns) : (Array.isArray(columns) ? columns : [])
    }));
  };
  const updateRow = (id: string, updates: Partial<DataRow>) => setState(prev => ({ ...prev, data: Array.isArray(prev.data) ? prev.data.map(row => (row.id === id ? { ...row, ...updates } : row)) : [] }));
  const deleteRow = (id: string) => setState(prev => ({ ...prev, data: Array.isArray(prev.data) ? prev.data.filter(row => row.id !== id) : [] }));
  const deleteRows = (ids: string[]) => setState(prev => ({ ...prev, data: Array.isArray(prev.data) ? prev.data.filter(row => !ids.includes(row.id)) : [] }));

  // Auto-check UnoAPI connection on mount and periodically
  const checkUnoApiConnection = useRef(false);
  
  useEffect(() => {
    const checkConnection = async () => {
      // Prevent multiple simultaneous checks
      if (checkUnoApiConnection.current) return;
      checkUnoApiConnection.current = true;
      
      try {
        const creds = loadUnoApiCredentials();
        if (creds) {
          const isOnline = await testConnection(creds);
          setUnoApiConnected(isOnline);
          console.log('[WizardContext] UnoAPI connection checked:', isOnline ? 'online' : 'offline');
        }
      } catch (err) {
        console.error('[WizardContext] UnoAPI connection check failed:', err);
        setUnoApiConnected(false);
      } finally {
        checkUnoApiConnection.current = false;
      }
    };

    // Check immediately on mount
    checkConnection();

    // Check every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    return () => clearInterval(interval);
  }, []);

  // Auto-check WuzAPI connection on mount and periodically
  const checkWuzapiConnection = useRef(false);

  useEffect(() => {
    const checkConnection = async () => {
      if (checkWuzapiConnection.current) return;
      checkWuzapiConnection.current = true;
      
      try {
        const creds = await loadWuzapiSettings();
        if (creds) {
          const result = await testWuzapiConnection(creds.baseUrl, creds.adminToken);
          setWuzapiConnected(result.success);
          console.log('[WizardContext] WuzAPI connection checked:', result.success ? 'online' : 'offline');
        }
      } catch (err) {
        console.error('[WizardContext] WuzAPI connection check failed:', err);
        setWuzapiConnected(false);
      } finally {
        checkWuzapiConnection.current = false;
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  const addMessage = (content: string, media?: { mediaType?: Message['mediaType']; mediaUrl?: string; mediaCaption?: string; mediaFilename?: string }) => {
    setState(prev => ({ ...prev, messages: [...prev.messages, { id: generateId(), content, ...media }] }));
  };
  const addRichMessage = (msg: Omit<Message, 'id'>) => {
    setState(prev => ({ ...prev, messages: [...prev.messages, { id: generateId(), ...msg }] }));
  };
  const updateMessage = (id: string, content: string) => setState(prev => ({ ...prev, messages: prev.messages.map(msg => msg.id === id ? { ...msg, content } : msg) }));
  const updateRichMessage = (id: string, updates: Partial<Omit<Message, 'id'>>) => setState(prev => ({ ...prev, messages: prev.messages.map(msg => msg.id === id ? { ...msg, ...updates } : msg) }));
  const deleteMessage = (id: string) => setState(prev => ({ ...prev, messages: prev.messages.filter(msg => msg.id !== id) }));
  const moveMessage = (fromIndex: number, toIndex: number) => setState(prev => {
    const msgs = [...prev.messages];
    const [moved] = msgs.splice(fromIndex, 1);
    msgs.splice(toIndex, 0, moved);
    return { ...prev, messages: msgs };
  });
  const setSettings = (settings: Partial<WizardSettings>) => setState(prev => ({ ...prev, settings: { ...prev.settings, ...settings } }));
  const addInstance = (instance: Instance) => setState(prev => ({ ...prev, instances: [...prev.instances, instance] }));
  const toggleInstanceSelection = (id: string) => setState(prev => {
    const current = Array.isArray(prev.selectedInstances) ? prev.selectedInstances : [];
    return { ...prev, selectedInstances: current.includes(id) ? current.filter(i => i !== id) : [...current, id] };
  });
  const setSelectedInstances = (ids: string[] | ((prev: string[]) => string[])) => setState(prev => {
    const current = Array.isArray(prev.selectedInstances) ? prev.selectedInstances : [];
    return { ...prev, selectedInstances: typeof ids === 'function' ? ids(current) : ids };
  });
  const selectAllInstances = () => setState(prev => ({ ...prev, selectedInstances: prev.instances.filter(i => i.status === 'active').map(i => i.id) }));
  const deselectAllInstances = () => setState(prev => ({ ...prev, selectedInstances: [] }));
  const getValidCount = () => (Array.isArray(state.data) ? state.data.filter(row => row.isValid).length : 0);
  const getInvalidCount = () => (Array.isArray(state.data) ? state.data.filter(row => !row.isValid).length : 0);
  const addCampaign = (campaign: Campaign) => setState(prev => ({ ...prev, campaignHistory: [campaign, ...prev.campaignHistory] }));
  const clearWizard = () => {
    setState(prev => ({
      ...prev,
      currentStep: 1,
      data: [],
      columns: ['numero'],
      messages: [],
      selectedInstances: [],
    }));
  };

  const reuseCampaign = (campaign: Campaign) => {
    const restoredMessages = campaign.messages.map(content => ({ id: generateId(), content }));
    // Reset to step 1 so the user can input the spreadsheet data required for the new dispatch
    setState(prev => ({ ...prev, messages: restoredMessages, currentStep: 1 }));
  };

  // New functions
  const setChatwootConnected = (connected: boolean) => setState(prev => ({ ...prev, chatwootConnected: connected }));
  const setUnoApiConnected = (connected: boolean) => setState(prev => ({ ...prev, unoApiConnected: connected }));
  const setWuzapiConnected = (connected: boolean) => setState(prev => ({ ...prev, wuzapiConnected: connected }));
  const setChatwootInboxes = (inboxes: ChatwootInbox[]) => setState(prev => ({ ...prev, chatwootInboxes: inboxes }));
  const setSelectedInboxId = (id: number | null) => setState(prev => ({ ...prev, selectedInboxId: id }));
  const setFollowUpConfig = (config: FollowUpConfig) => setState(prev => ({ ...prev, followUpConfig: config }));
  const setSelectedApi = (api: 'unoapi' | 'evolution' | 'evolution-go' | 'wuzapi' | null) => setState(prev => ({ ...prev, selectedApi: api, selectedInstances: [] }));
  const addScheduledCampaign = (campaign: ScheduledCampaign) => setState(prev => ({ ...prev, scheduledCampaigns: [...prev.scheduledCampaigns, campaign] }));
  const cancelScheduledCampaign = (id: string) => setState(prev => ({ ...prev, scheduledCampaigns: prev.scheduledCampaigns.map(c => c.id === id ? { ...c, status: 'cancelled' as const } : c) }));
  const addABTest = (test: ABTest) => setState(prev => ({ ...prev, abTests: [...prev.abTests, test] }));
  const removeABTest = (id: string) => setState(prev => ({ ...prev, abTests: prev.abTests.filter(t => t.id !== id) }));
  const updateMetrics = (metrics: Partial<CampaignMetrics>) => setState(prev => ({ ...prev, metrics: { ...prev.metrics, ...metrics } }));
  const addActiveCampaign = (campaign: ActiveCampaign) => setState(prev => ({ ...prev, activeCampaigns: [campaign, ...prev.activeCampaigns] }));
  const updateActiveCampaign = (id: string, updates: Partial<ActiveCampaign>) => setState(prev => ({ ...prev, activeCampaigns: prev.activeCampaigns.map(c => c.id === id ? { ...c, ...updates } : c) }));
  const removeActiveCampaign = (id: string) => setState(prev => ({ ...prev, activeCampaigns: prev.activeCampaigns.filter(c => c.id !== id) }));

  return (
    <WizardContext.Provider value={{
      ...state,
      setCurrentStep, nextStep, prevStep, setData, setColumns, updateRow, deleteRow, deleteRows,
      addMessage, addRichMessage, updateMessage, updateRichMessage, deleteMessage, moveMessage, setSettings, addInstance, toggleInstanceSelection,
      setSelectedInstances,
      selectAllInstances, deselectAllInstances, getValidCount, getInvalidCount, addCampaign, reuseCampaign,
      clearWizard,
      setChatwootConnected, setUnoApiConnected, setWuzapiConnected, setChatwootInboxes, setSelectedInboxId, setFollowUpConfig, setSelectedApi,
      addScheduledCampaign, cancelScheduledCampaign, addABTest, removeABTest, updateMetrics,
      addActiveCampaign, updateActiveCampaign, removeActiveCampaign,
    }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) throw new Error('useWizard must be used within a WizardProvider');
  return context;
}
