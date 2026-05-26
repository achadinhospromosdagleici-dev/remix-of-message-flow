import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Users, Plus, Power, Calendar, Save, Loader2, Eye, EyeOff, Server,
  Trash2, Crown, Mail, Edit2, Check, X,
} from 'lucide-react';

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  trial_started_at: string;
  trial_ends_at: string;
  notes: string | null;
  created_at: string;
  last_seen_at: string | null;
  roles?: string[];
}

interface SharedEvolution {
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

export function SuperAdminPanel() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTrial, setEditTrial] = useState('');

  // Shared Evolution
  const [shared, setShared] = useState<SharedEvolution>({ baseUrl: '', apiKey: '', enabled: false });
  const [showKey, setShowKey] = useState(false);
  const [savingShared, setSavingShared] = useState(false);

  // Create user
  const [newEmail, setNewEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [profRes, rolesRes, settingsRes] = await Promise.all([
        (supabase as any).from('profiles').select('*').order('created_at', { ascending: false }),
        (supabase as any).from('user_roles').select('user_id, role'),
        (supabase as any).from('system_settings').select('value').eq('key', 'shared_evolution').maybeSingle(),
      ]);

      const rolesMap = new Map<string, string[]>();
      ((rolesRes.data as Array<{ user_id: string; role: string }>) || []).forEach(r => {
        if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
        rolesMap.get(r.user_id)!.push(r.role);
      });

      const list = ((profRes.data as ProfileRow[]) || []).map(p => ({ ...p, roles: rolesMap.get(p.id) || [] }));
      setProfiles(list);

      if (settingsRes.data?.value) {
        const v = settingsRes.data.value as SharedEvolution;
        setShared({ baseUrl: v.baseUrl || '', apiKey: v.apiKey || '', enabled: !!v.enabled });
      }
    } catch (err: any) {
      toast.error('Erro ao carregar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const toggleActive = async (p: ProfileRow) => {
    const { error } = await (supabase as any)
      .from('profiles').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) return toast.error(error.message);
    toast.success(p.is_active ? 'Conta desativada' : 'Conta ativada');
    loadAll();
  };

  const startEditTrial = (p: ProfileRow) => {
    setEditingId(p.id);
    setEditTrial(p.trial_ends_at.slice(0, 16));
  };

  const saveTrial = async (id: string) => {
    const { error } = await (supabase as any)
      .from('profiles').update({ trial_ends_at: new Date(editTrial).toISOString() }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Trial atualizado');
    setEditingId(null);
    loadAll();
  };

  const extendTrial = async (p: ProfileRow, days: number) => {
    const base = new Date(p.trial_ends_at).getTime() > Date.now()
      ? new Date(p.trial_ends_at)
      : new Date();
    base.setDate(base.getDate() + days);
    const { error } = await (supabase as any)
      .from('profiles').update({ trial_ends_at: base.toISOString() }).eq('id', p.id);
    if (error) return toast.error(error.message);
    toast.success(`+${days} dia(s)`);
    loadAll();
  };

  const deleteProfile = async (p: ProfileRow) => {
    if (p.id === user?.id) return toast.error('Você não pode excluir a si mesmo');
    if (!confirm(`Excluir conta ${p.email}? Os dados de auth dela permanecerão até serem removidos manualmente.`)) return;
    const { error } = await (supabase as any).from('profiles').delete().eq('id', p.id);
    if (error) return toast.error(error.message);
    toast.success('Perfil removido');
    loadAll();
  };

  const saveShared = async () => {
    setSavingShared(true);
    try {
      const { error } = await (supabase as any).from('system_settings')
        .update({ value: shared, updated_by: user?.id })
        .eq('key', 'shared_evolution');
      if (error) throw error;
      toast.success('Evolution compartilhada salva');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingShared(false);
    }
  };

  const createUser = async () => {
    if (!newEmail || !newPass) return toast.error('Preencha e-mail e senha');
    setCreating(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPass, fullName: newName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Conta criada para ${newEmail}`);
      setNewEmail(''); setNewPass(''); setNewName('');
      setTimeout(loadAll, 800);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Shared Evolution */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold">Evolution compartilhada (trial)</h3>
            <p className="text-xs text-muted-foreground">Usada automaticamente por contas em período de teste que não configuraram sua própria Evolution.</p>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="shared-enabled" checked={shared.enabled}
              onChange={e => setShared({ ...shared, enabled: e.target.checked })} />
            <label htmlFor="shared-enabled" className="text-sm font-medium">Ativar Evolution compartilhada para trial</label>
          </div>
          
          {shared.enabled && (
            <div className="pl-6 space-y-3 border-l-2 border-primary/30 animate-fade-in">
              <div>
                <label className="text-xs text-muted-foreground">URL Evolution</label>
                <input value={shared.baseUrl} onChange={e => setShared({ ...shared, baseUrl: e.target.value })}
                  placeholder="https://sua-evolution-api.com"
                  className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">API Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={shared.apiKey}
                    onChange={e => setShared({ ...shared, apiKey: e.target.value })}
                    className="w-full px-3 py-2 pr-10 rounded-lg bg-muted/50 border border-border/50 text-sm" />
                  <button type="button" onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <button onClick={saveShared} disabled={savingShared || !shared.enabled}
            className="self-start flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {savingShared ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
        </div>
      </div>

      {/* Create user */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Plus className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Criar nova conta</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome (opcional)"
            className="px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm" />
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemplo.com"
            className="px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm" />
          <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Senha (mín. 6)"
            className="px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm" />
        </div>
        <button onClick={createUser} disabled={creating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar conta
        </button>
      </div>

      {/* Users list */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Contas ({profiles.length})</h3>
          </div>
        </div>
        <div className="space-y-2">
          {profiles.map(p => {
            const isSuper = p.roles?.includes('superadmin');
            const dl = daysLeft(p.trial_ends_at);
            const expired = dl <= 0 && !isSuper;
            return (
              <div key={p.id} className={`p-4 rounded-lg border ${p.is_active && !expired ? 'border-border/50 bg-muted/20' : 'border-destructive/30 bg-destructive/5'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm truncate">{p.email}</span>
                      {isSuper && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                          <Crown className="w-3 h-3" /> SUPERADMIN
                        </span>
                      )}
                      {!p.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">DESATIVADA</span>}
                      {expired && p.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning">TRIAL EXPIRADO</span>}
                    </div>
                    {p.full_name && <p className="text-xs text-muted-foreground mt-1">{p.full_name}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Cadastro: {fmt(p.created_at)}</span>
                      {editingId === p.id ? (
                        <span className="flex items-center gap-1">
                          <input type="datetime-local" value={editTrial} onChange={e => setEditTrial(e.target.value)}
                            className="px-2 py-1 rounded bg-muted/50 border border-border/50 text-xs" />
                          <button onClick={() => saveTrial(p.id)} className="text-success"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditingId(null)} className="text-destructive"><X className="w-3 h-3" /></button>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          Trial até: {fmt(p.trial_ends_at)} ({isSuper ? '∞' : `${dl}d`})
                          <button onClick={() => startEditTrial(p)} className="ml-1 text-primary hover:opacity-70">
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {!isSuper && (
                      <button onClick={() => extendTrial(p, 3)}
                        className="px-2 py-1 rounded text-xs bg-muted hover:bg-muted/80">+3d</button>
                    )}
                    {!isSuper && (
                      <button onClick={() => extendTrial(p, 7)}
                        className="px-2 py-1 rounded text-xs bg-muted hover:bg-muted/80">+7d</button>
                    )}
                    {!isSuper && (
                      <button onClick={() => extendTrial(p, 30)}
                        className="px-2 py-1 rounded text-xs bg-muted hover:bg-muted/80">+30d</button>
                    )}
                    <button onClick={() => toggleActive(p)} disabled={isSuper && p.id === user?.id}
                      className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${p.is_active ? 'bg-warning/10 text-warning hover:bg-warning/20' : 'bg-success/10 text-success hover:bg-success/20'} disabled:opacity-50`}>
                      <Power className="w-3 h-3" /> {p.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                    {!isSuper && (
                      <button onClick={() => deleteProfile(p)}
                        className="px-2 py-1 rounded text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center gap-1">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
