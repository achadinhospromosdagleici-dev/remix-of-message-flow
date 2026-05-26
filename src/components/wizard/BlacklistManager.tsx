import React, { useState, useEffect } from 'react';
import {
  Ban,
  Plus,
  Trash2,
  Upload,
  Shield,
  Search,
  AlertTriangle,
  FileText,
  Clipboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { readFileAsText } from '@/utils/fileReader';
import { supabase } from '@/integrations/supabase/client';
import { getUserId } from '@/services/user';

const BLACKLIST_KEY = 'messageflow_blacklist';
const OPT_OUT_KEYWORDS = ['SAIR', 'PARAR', 'CANCELAR', 'STOP', 'REMOVER', 'NAO QUERO', 'NÃO QUERO'];

async function saveBlacklistToDb(list: string[]): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  await supabase.from('blacklist').delete().eq('user_id', userId);
  for (const phone of list) {
    await supabase.from('blacklist').upsert({
      user_id: userId,
      phone,
      reason: 'manual',
    }, { onConflict: 'user_id,phone' });
  }
}

async function loadBlacklistFromDb(): Promise<string[]> {
  const userId = getUserId();
  if (!userId) return [];
  const { data } = await supabase.from('blacklist').select('phone').eq('user_id', userId);
  return data?.map((t: any) => t.phone) ?? [];
}

export async function loadBlacklist(): Promise<string[]> {
  try {
    const stored = localStorage.getItem(BLACKLIST_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return loadBlacklistFromDb();
}

export async function saveBlacklist(list: string[]): Promise<void> {
  localStorage.setItem(BLACKLIST_KEY, JSON.stringify(list));
  await saveBlacklistToDb(list);
}

export function isOptOutMessage(content: string): boolean {
  const upper = content.toUpperCase().trim();
  return OPT_OUT_KEYWORDS.some((kw) => upper.includes(kw));
}

interface BlacklistManagerProps {
  onBlacklistChange?: (list: string[]) => void;
}

export function BlacklistManager({ onBlacklistChange }: BlacklistManagerProps) {
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const list = await loadBlacklist();
      setBlacklist(list);
      setLoading(false);
    }
    load();
  }, []);

  const updateBlacklist = (newList: string[]) => {
    setBlacklist(newList);
    saveBlacklist(newList);
    onBlacklistChange?.(newList);
  };

  const handleAdd = async () => {
    if (!newNumber.trim()) {
      toast.error('Digite um número');
      return;
    }
    const normalized = newNumber.replace(/\D/g, '');
    if (blacklist.some((p) => p.replace(/\D/g, '') === normalized)) {
      toast.error('Número já está na blacklist');
      return;
    }
    updateBlacklist([...blacklist, newNumber.trim()]);
    setNewNumber('');
    toast.success('Número adicionado à blacklist');
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const phones = text.split(/[\n,\t;]+/).map(p => p.replace(/\D/g, '')).filter(p => p.length > 8);
      const newPhones = phones.filter(p => !blacklist.some((b) => b.replace(/\D/g, '') === p));
      if (newPhones.length === 0) {
        toast.error('Nenhum número válido encontrado');
        return;
      }
      updateBlacklist([...blacklist, ...newPhones]);
      toast.success(`${newPhones.length} números adicionados`);
    } catch {
      toast.error('Erro ao colar números');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await readFileAsText(file);
      const phones = text.split(/[\n,\t;,]+/).map(p => p.replace(/\D/g, '')).filter(p => p.length > 8);
      const newPhones = phones.filter(p => !blacklist.some((b) => b.replace(/\D/g, '') === p));
      if (newPhones.length === 0) {
        toast.error('Nenhum número válido encontrado');
        return;
      }
      updateBlacklist([...blacklist, ...newPhones]);
      toast.success(`${newPhones.length} números importados`);
    } catch {
      toast.error('Erro ao ler arquivo');
    }
  };

  const handleRemove = (phone: string) => {
    updateBlacklist(blacklist.filter((p) => p !== phone));
    toast.success('Número removido da blacklist');
  };

  const handleClearAll = () => {
    updateBlacklist([]);
    toast.success('Blacklist limpa');
  };

  const filteredList = blacklist.filter((p) =>
    p.replace(/\D/g, '').includes(searchQuery.replace(/\D/g, ''))
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Blacklist / Opt-out
        </h3>
        <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded-md">
          {blacklist.length} número(s)
        </span>
      </div>

      {/* Opt-out keywords info */}
      <div className="glass-card p-4 border-warning/20 bg-warning/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium">Detecção Automática de Opt-out</p>
            <p className="text-xs text-muted-foreground mt-1">
              Quando um contato responder com palavras como <strong>SAIR</strong>, <strong>PARAR</strong>, <strong>CANCELAR</strong> ou <strong>STOP</strong>, ele será automaticamente adicionado à blacklist.
            </p>
          </div>
        </div>
      </div>

      {/* Add Number */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="Digite o número para bloquear"
          className="flex-1 px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="px-4 py-3 rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors flex items-center gap-2"
        >
          <Ban className="w-4 h-4" />
          Bloquear
        </button>
        <button
          onClick={handlePaste}
          className="px-3 py-3 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted text-sm flex items-center gap-2"
          title="Colar números da clipboard"
        >
          <Clipboard className="w-4 h-4" />
          Colar
        </button>
        <label className="px-3 py-3 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted text-sm cursor-pointer flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Importar
          <input type="file" accept=".csv,.txt,.xls,.xlsx" onChange={handleFileUpload} className="hidden" />
        </label>
      </div>

      {/* Search */}
      {blacklist.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar na blacklist..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      )}

      {/* Blacklist */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Carregando blacklist...
        </div>
      ) : filteredList.length > 0 ? (
        <div className="glass-card p-4 space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
          {filteredList.map((phone) => (
            <div key={phone} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <Ban className="w-4 h-4 text-destructive" />
                <span className="text-sm font-mono">{phone}</span>
              </div>
              <button
                onClick={() => handleRemove(phone)}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-8 text-center">
          <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum número na blacklist</p>
        </div>
      )}

      {blacklist.length > 0 && (
        <button
          onClick={handleClearAll}
          className="w-full py-2 rounded-lg bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 transition-colors"
        >
          Limpar toda a blacklist
        </button>
      )}
    </div>
  );
}
