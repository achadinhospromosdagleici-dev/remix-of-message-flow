import React, { useState } from 'react';
import {
  FlaskConical,
  MessageSquare,
  BarChart3,
  Plus,
  Trash2,
  Shuffle,
} from 'lucide-react';
import { toast } from 'sonner';
import { generateId } from '@/lib/id';

export interface ABTest {
  id: string;
  name: string;
  variants: ABVariant[];
  isActive: boolean;
}

export interface ABVariant {
  id: string;
  name: string;
  content: string;
  weight: number; // percentage 0-100
  sentCount: number;
  replyCount: number;
}

interface ABTestingProps {
  tests: ABTest[];
  onAddTest: (test: ABTest) => void;
  onRemoveTest: (id: string) => void;
  onUseVariant: (content: string) => void;
}

export function ABTesting({ tests, onAddTest, onRemoveTest, onUseVariant }: ABTestingProps) {
  const [showForm, setShowForm] = useState(false);
  const [testName, setTestName] = useState('');
  const [variantA, setVariantA] = useState('');
  const [variantB, setVariantB] = useState('');
  const [splitRatio, setSplitRatio] = useState(50);

  const handleCreate = () => {
    if (!testName.trim() || !variantA.trim() || !variantB.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }

    const newTest: ABTest = {
      id: generateId(),
      name: testName.trim(),
      isActive: true,
      variants: [
        {
          id: generateId(),
          name: 'Variante A',
          content: variantA.trim(),
          weight: splitRatio,
          sentCount: 0,
          replyCount: 0,
        },
        {
          id: generateId(),
          name: 'Variante B',
          content: variantB.trim(),
          weight: 100 - splitRatio,
          sentCount: 0,
          replyCount: 0,
        },
      ],
    };

    onAddTest(newTest);
    setTestName('');
    setVariantA('');
    setVariantB('');
    setShowForm(false);
    toast.success('Teste A/B criado!');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          Teste A/B de Mensagens
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Teste
        </button>
      </div>

      {/* Info */}
      <div className="glass-card p-4 border-primary/20 bg-primary/5">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Teste A/B</strong> permite comparar duas versões de mensagem para descobrir qual tem melhor taxa de resposta. Os contatos são divididos automaticamente.
        </p>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="glass-card p-6 space-y-4 animate-fade-in">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Nome do Teste</label>
            <input
              type="text"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
              placeholder="Ex: Teste Saudação Formal vs Informal"
              className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">A</span>
                Variante A
              </label>
              <textarea
                value={variantA}
                onChange={(e) => setVariantA(e.target.value)}
                placeholder="Primeira versão da mensagem..."
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">B</span>
                Variante B
              </label>
              <textarea
                value={variantB}
                onChange={(e) => setVariantB(e.target.value)}
                placeholder="Segunda versão da mensagem..."
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
          </div>

          {/* Split Ratio */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground flex items-center gap-2">
              <Shuffle className="w-4 h-4" />
              Divisão de Tráfego: {splitRatio}% / {100 - splitRatio}%
            </label>
            <input
              type="range"
              min={10}
              max={90}
              value={splitRatio}
              onChange={(e) => setSplitRatio(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Variante A: {splitRatio}%</span>
              <span>Variante B: {100 - splitRatio}%</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleCreate} className="flex-1 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
              Criar Teste A/B
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-3 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tests List */}
      {tests.length > 0 ? (
        <div className="space-y-4">
          {tests.map((test) => (
            <div key={test.id} className="glass-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{test.name}</p>
                  <p className="text-xs text-muted-foreground">{test.variants.length} variantes</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${test.isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {test.isActive ? 'Ativo' : 'Finalizado'}
                  </span>
                  <button
                    onClick={() => onRemoveTest(test.id)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                {test.variants.map((variant) => {
                  const replyRate = variant.sentCount > 0 ? ((variant.replyCount / variant.sentCount) * 100).toFixed(1) : '0.0';
                  return (
                    <div key={variant.id} className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{variant.name}</span>
                        <span className="text-xs text-muted-foreground">{variant.weight}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{variant.content}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span>Enviados: {variant.sentCount}</span>
                        <span>Respostas: {replyRate}%</span>
                      </div>
                      <button
                        onClick={() => onUseVariant(variant.content)}
                        className="w-full py-1.5 rounded-md bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors"
                      >
                        Usar esta variante
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-8 text-center">
          <FlaskConical className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum teste A/B criado</p>
        </div>
      )}
    </div>
  );
}
