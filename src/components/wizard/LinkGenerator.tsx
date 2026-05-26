import React, { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Link2, Plus, Copy, Trash2, BarChart3, QrCode, Download, ExternalLink, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getUserId } from '@/services/user';

interface ShortLink {
  id: string;
  slug: string;
  title: string | null;
  phone: string;
  message: string | null;
  click_count: number;
  is_active: boolean;
  created_at: string;
}

interface ClickRow {
  id: string;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  utm_source: string | null;
  referrer: string | null;
  clicked_at: string;
}

function randomSlug(len = 6) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function shortUrlFor(slug: string) {
  return `${window.location.origin}/l/${slug}`;
}

export function LinkGenerator() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [customSlug, setCustomSlug] = useState("");

  const [qrLink, setQrLink] = useState<ShortLink | null>(null);
  const [statsLink, setStatsLink] = useState<ShortLink | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("short_links")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar links");
    else setLinks(data as ShortLink[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createLink = async () => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) return toast.error("Informe um número de WhatsApp válido");
    const slug = (customSlug.trim() || randomSlug()).toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) return toast.error("Slug inválido");

    setCreating(true);
    const userId = getUserId();
    if (!userId) { setCreating(false); return toast.error("Faça login"); }

    const { error } = await supabase.from("short_links").insert({
      user_id: userId,
      slug,
      title: title || null,
      phone: cleanPhone,
      message: message || null,
    });
    setCreating(false);
    if (error) {
      if (error.code === "23505") toast.error("Esse slug já está em uso, escolha outro");
      else toast.error("Erro ao criar link");
      return;
    }
    toast.success("Link criado!");
    setPhone(""); setMessage(""); setTitle(""); setCustomSlug("");
    load();
  };

  const deleteLink = async (id: string) => {
    if (!confirm("Excluir este link? Os cliques registrados serão perdidos.")) return;
    const { error } = await supabase.from("short_links").delete().eq("id", id);
    if (error) return toast.error("Erro ao excluir");
    toast.success("Link excluído");
    setLinks(links.filter(l => l.id !== id));
  };

  const toggleActive = async (link: ShortLink) => {
    const { error } = await supabase
      .from("short_links")
      .update({ is_active: !link.is_active })
      .eq("id", link.id);
    if (error) return toast.error("Erro");
    setLinks(links.map(l => l.id === link.id ? { ...l, is_active: !l.is_active } : l));
  };

  const copyUrl = (slug: string) => {
    navigator.clipboard.writeText(shortUrlFor(slug));
    toast.success("Link copiado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link2 className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Gerador de Links</h1>
          <p className="text-sm text-muted-foreground">Crie links curtos do WhatsApp com rastreamento de cliques</p>
        </div>
      </div>

      {/* Form */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Novo Link</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Título (opcional)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Campanha Black Friday"
              className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">WhatsApp (com DDI/DDD)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="55 11 91234 5678"
              className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Mensagem pré-preenchida (opcional)</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
            placeholder="Olá! Tenho interesse em..."
            className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Slug personalizado (opcional)</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{window.location.origin}/l/</span>
            <input value={customSlug} onChange={e => setCustomSlug(e.target.value)} placeholder="auto"
              className="flex-1 px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>
        <button onClick={createLink} disabled={creating}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar Link
        </button>
      </div>

      {/* List */}
      <div className="glass-card p-6">
        <h2 className="font-semibold mb-4">Meus Links ({links.length})</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : links.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum link criado ainda.</p>
        ) : (
          <div className="space-y-2">
            {links.map(link => (
              <div key={link.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30 hover:border-border transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{link.title || link.slug}</span>
                    {!link.is_active && <span className="text-[10px] px-2 py-0.5 rounded bg-destructive/20 text-destructive">Inativo</span>}
                  </div>
                  <a href={shortUrlFor(link.slug)} target="_blank" rel="noreferrer"
                    className="text-xs text-primary hover:underline truncate block">
                    {shortUrlFor(link.slug)}
                  </a>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    📱 +{link.phone} • {link.click_count} cliques
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyUrl(link.slug)} title="Copiar"
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => setQrLink(link)} title="QR Code"
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <QrCode className="w-4 h-4" />
                  </button>
                  <button onClick={() => setStatsLink(link)} title="Estatísticas"
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleActive(link)} title={link.is_active ? "Desativar" : "Ativar"}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">
                    {link.is_active ? "⏸" : "▶"}
                  </button>
                  <button onClick={() => deleteLink(link.id)} title="Excluir"
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {qrLink && <QRModal link={qrLink} onClose={() => setQrLink(null)} />}
      {statsLink && <StatsModal link={statsLink} onClose={() => setStatsLink(null)} />}
    </div>
  );
}

function QRModal({ link, onClose }: { link: ShortLink; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const url = shortUrlFor(link.slug);

  const download = () => {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qrcode-${link.slug}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-card p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">QR Code</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div ref={ref} className="bg-white p-4 rounded-lg flex items-center justify-center">
          <QRCodeCanvas value={url} size={240} level="H" />
        </div>
        <p className="text-xs text-center text-muted-foreground break-all">{url}</p>
        <button onClick={download}
          className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 flex items-center justify-center gap-2">
          <Download className="w-4 h-4" /> Baixar PNG
        </button>
      </div>
    </div>
  );
}

function StatsModal({ link, onClose }: { link: ShortLink; onClose: () => void }) {
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("link_clicks")
        .select("id,country,city,device,browser,os,utm_source,referrer,clicked_at")
        .eq("link_id", link.id)
        .order("clicked_at", { ascending: false })
        .limit(500);
      setClicks((data as ClickRow[]) || []);
      setLoading(false);
    })();
  }, [link.id]);

  const grouped = useMemo(() => {
    const by = (key: keyof ClickRow) => {
      const m = new Map<string, number>();
      clicks.forEach(c => {
        const k = (c[key] as string) || "Desconhecido";
        m.set(k, (m.get(k) || 0) + 1);
      });
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };
    return {
      sources: by("utm_source"),
      devices: by("device"),
      countries: by("country"),
      browsers: by("browser"),
    };
  }, [clicks]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-card p-6 max-w-3xl w-full max-h-[85vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Estatísticas — {link.title || link.slug}</h3>
            <p className="text-xs text-muted-foreground">{clicks.length} cliques registrados</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : clicks.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum clique ainda. Compartilhe o link!</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Cliques" value={String(clicks.length)} />
              <StatCard label="Origens únicas" value={String(grouped.sources.length)} />
              <StatCard label="Países" value={String(grouped.countries.length)} />
              <StatCard label="Dispositivos" value={String(grouped.devices.length)} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <BreakdownList title="Origem" items={grouped.sources} />
              <BreakdownList title="Dispositivo" items={grouped.devices} />
              <BreakdownList title="País" items={grouped.countries} />
              <BreakdownList title="Navegador" items={grouped.browsers} />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Cliques recentes</h4>
              <div className="rounded-lg border border-border/30 divide-y divide-border/30 max-h-64 overflow-y-auto">
                {clicks.slice(0, 50).map(c => (
                  <div key={c.id} className="px-3 py-2 text-xs flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {(c.utm_source || "direto")} • {c.device || "?"} • {c.browser || "?"}
                      </p>
                      <p className="text-muted-foreground truncate">
                        {[c.city, c.country].filter(Boolean).join(", ") || "Local desconhecido"}
                      </p>
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {new Date(c.clicked_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 border border-border/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function BreakdownList({ title, items }: { title: string; items: [string, number][] }) {
  const total = items.reduce((s, [, n]) => s + n, 0) || 1;
  return (
    <div className="rounded-lg border border-border/30 p-3 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados</p>
      ) : (
        items.slice(0, 5).map(([k, n]) => (
          <div key={k} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="capitalize truncate">{k}</span>
              <span className="text-muted-foreground">{n} ({Math.round((n / total) * 100)}%)</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(n / total) * 100}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}