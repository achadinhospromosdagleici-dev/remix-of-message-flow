import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Copy,
  Star,
  StarOff,
  Search,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { generateId } from '@/lib/id';

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  isFavorite: boolean;
  createdAt: Date;
}

const TEMPLATES_KEY = 'messageflow_templates';

async function saveTemplatesToDb(templates: MessageTemplate[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('message_templates').delete().eq('user_id', user.id);
  for (const t of templates) {
    await supabase.from('message_templates').upsert({
      user_id: user.id,
      name: t.name,
      content: t.content,
      media_type: 'text',
    }, { onConflict: 'user_id,name' });
  }
}

async function loadTemplatesFromDb(): Promise<MessageTemplate[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return defaultTemplates;
  const { data } = await supabase.from('message_templates').select('*').eq('user_id', user.id);
  if (!data?.length) return defaultTemplates;
  return data.map((t: any) => ({
    id: t.id,
    name: t.name,
    content: t.content,
    category: 'Personalizado',
    isFavorite: false,
    createdAt: new Date(t.created_at),
  }));
}

export async function loadTemplates(): Promise<MessageTemplate[]> {
  try {
    const stored = localStorage.getItem(TEMPLATES_KEY);
    if (stored) {
      return JSON.parse(stored, (key, value) =>
        key === 'createdAt' ? new Date(value) : value
      );
    }
  } catch {}
  return loadTemplatesFromDb();
}

export async function saveTemplates(templates: MessageTemplate[]): Promise<void> {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
  await saveTemplatesToDb(templates);
}

const defaultTemplates: MessageTemplate[] = [
  {
    id: '1',
    name: 'Saudação Inicial',
    content: 'Olá {{nome}}! 👋 Tudo bem? Aqui é da equipe {{empresa}}.',
    category: 'Saudação',
    isFavorite: true,
    createdAt: new Date(),
  },
  {
    id: '2',
    name: 'Promoção',
    content: '🎉 {{nome}}, temos uma oferta especial para você! Aproveite {{desconto}}% de desconto em todos os produtos. Válido até {{data_limite}}!',
    category: 'Marketing',
    isFavorite: false,
    createdAt: new Date(),
  },
  {
    id: '3',
    name: 'Follow-up',
    content: 'Oi {{nome}}! Vimos que você demonstrou interesse em {{produto}}. Posso te ajudar com mais informações? 😊',
    category: 'Follow-up',
    isFavorite: true,
    createdAt: new Date(),
  },
  {
    id: '4',
    name: 'Lembrete',
    content: '⏰ {{nome}}, não se esqueça! {{evento}} é amanhã às {{horario}}. Te esperamos!',
    category: 'Lembrete',
    isFavorite: false,
    createdAt: new Date(),
  },
];

const categories = ['Saudação', 'Marketing', 'Follow-up', 'Lembrete', 'Outro'];

interface MessageTemplatesProps {
  onUseTemplate: (content: string) => void;
}

export function MessageTemplates({ onUseTemplate }: MessageTemplatesProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>(defaultTemplates);
  useEffect(() => {
    loadTemplates().then(setTemplates).catch(() => {});
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('Outro');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const updateTemplates = (newList: MessageTemplate[]) => {
    setTemplates(newList);
    saveTemplates(newList);
  };

  const handleAdd = () => {
    if (!newName.trim() || !newContent.trim()) {
      toast.error('Preencha nome e conteúdo');
      return;
    }

    const newTemplate: MessageTemplate = {
      id: generateId(),
      name: newName.trim(),
      content: newContent.trim(),
      category: newCategory,
      isFavorite: false,
      createdAt: new Date(),
    };

    updateTemplates([newTemplate, ...templates]);
    setNewName('');
    setNewContent('');
    setShowForm(false);
    toast.success('Template salvo!');
  };

  const handleDelete = (id: string) => {
    updateTemplates(templates.filter((t) => t.id !== id));
    toast.success('Template removido');
  };

  const handleToggleFavorite = (id: string) => {
    updateTemplates(
      templates.map((t) => (t.id === id ? { ...t, isFavorite: !t.isFavorite } : t))
    );
  };

  const filtered = templates
    .filter((t) => filterCategory === 'all' || t.category === filterCategory)
    .filter(
      (t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Templates de Mensagens
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Template
        </button>
      </div>

      {/* New Template Form */}
      {showForm && (
        <div className="glass-card p-6 space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Nome</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Boas-vindas"
                className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Categoria</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Conteúdo da Mensagem</label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Use {{variavel}} para campos dinâmicos..."
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={handleAdd} className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
              Salvar Template
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-3 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar templates..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterCategory === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterCategory === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Templates List */}
      {filtered.length > 0 ? (
        <div className="grid gap-3">
          {filtered.map((template) => (
            <div key={template.id} className="glass-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggleFavorite(template.id)} className="text-muted-foreground hover:text-warning transition-colors">
                    {template.isFavorite ? <Star className="w-4 h-4 text-warning fill-warning" /> : <StarOff className="w-4 h-4" />}
                  </button>
                  <div>
                    <p className="font-medium text-sm">{template.name}</p>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md flex items-center gap-1 w-fit mt-1">
                      <Tag className="w-3 h-3" />
                      {template.category}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      onUseTemplate(template.content);
                      toast.success('Template aplicado!');
                    }}
                    className="px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    Usar
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(template.content);
                      toast.success('Copiado!');
                    }}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3 pl-7">
                {template.content}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum template encontrado</p>
        </div>
      )}
    </div>
  );
}
