import React from 'react';
import { useWizard } from '@/contexts/WizardContext';
import { MessageTemplates } from '../MessageTemplates';
import {
  Clock,
  MessageSquare,
  Sparkles,
  FileText,
  HelpCircle,
  Timer,
  Shuffle,
  Calendar,
} from 'lucide-react';

export function StepSettings() {
  const { settings, setSettings, addMessage } = useWizard();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Settings Cards */}
      <div className="space-y-4">

        {/* Interval Setting */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="font-semibold">Intervalo Entre Envios</h3>
                <p className="text-sm text-muted-foreground">
                  Tempo de espera entre cada mensagem enviada
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSettings({ intervalType: 'fixed' })}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                    settings.intervalType === 'fixed'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border hover:border-muted-foreground text-muted-foreground'
                  }`}
                >
                  <Timer className="w-4 h-4 mx-auto mb-1" />
                  <span className="font-medium">Fixo</span>
                </button>
                <button
                  onClick={() => setSettings({ intervalType: 'random' })}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                    settings.intervalType === 'random'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border hover:border-muted-foreground text-muted-foreground'
                  }`}
                >
                  <Shuffle className="w-4 h-4 mx-auto mb-1" />
                  <span className="font-medium">Aleatório</span>
                </button>
              </div>

              {settings.intervalType === 'fixed' ? (
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">
                    Intervalo (segundos)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={settings.fixedInterval}
                    onChange={(e) =>
                      setSettings({ fixedInterval: parseInt(e.target.value) || 5 })
                    }
                    className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Mínimo (segundos)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={settings.maxInterval - 1}
                      value={settings.minInterval}
                      onChange={(e) =>
                        setSettings({ minInterval: parseInt(e.target.value) || 3 })
                      }
                      className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">
                      Máximo (segundos)
                    </label>
                    <input
                      type="number"
                      min={settings.minInterval + 1}
                      max={300}
                      value={settings.maxInterval}
                      onChange={(e) =>
                        setSettings({ maxInterval: parseInt(e.target.value) || 10 })
                      }
                      className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Send Type Setting */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="font-semibold">Tipo de Envio</h3>
                <p className="text-sm text-muted-foreground">
                  Quantas mensagens cada contato receberá?
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSettings({ sendType: 'single' })}
                  className={`flex-1 py-4 px-4 rounded-lg border-2 transition-all text-left ${
                    settings.sendType === 'single'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <span className="block font-medium">Mensagem Única</span>
                  <span className="text-xs text-muted-foreground">
                    Cada contato recebe uma mensagem
                  </span>
                </button>
                <button
                  onClick={() => setSettings({ sendType: 'multiple' })}
                  className={`flex-1 py-4 px-4 rounded-lg border-2 transition-all text-left ${
                    settings.sendType === 'multiple'
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <span className="block font-medium">Múltiplas Mensagens</span>
                  <span className="text-xs text-muted-foreground">
                    Todas as mensagens são enviadas
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Setting */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">Variação com IA</h3>
                  <p className="text-sm text-muted-foreground">
                    Usar inteligência artificial para variar o texto das mensagens,
                    mantendo o mesmo sentido mas com palavras diferentes
                  </p>
                </div>
                <button
                  onClick={() => setSettings({ useAI: !settings.useAI })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    settings.useAI ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                      settings.useAI ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.useAI && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm animate-fade-in">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-muted-foreground">
                      A IA irá gerar variações automáticas de cada mensagem para
                      evitar detecção de spam e tornar a comunicação mais natural.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Message Randomization (only for multiple messages) */}
        {settings.sendType === 'multiple' && (
          <div className="glass-card p-6 space-y-4 animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Shuffle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="font-semibold">Ordem das Mensagens</h3>
                  <p className="text-sm text-muted-foreground">
                    Como as múltiplas mensagens serão enviadas para cada contato?
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setSettings({ messageRandomization: 'sequential' })}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                      settings.messageRandomization === 'sequential'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border hover:border-muted-foreground text-muted-foreground'
                    }`}
                  >
                    <span className="font-medium">Sequencial</span>
                  </button>
                  <button
                    onClick={() => setSettings({ messageRandomization: 'random' })}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                      settings.messageRandomization === 'random'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border hover:border-muted-foreground text-muted-foreground'
                    }`}
                  >
                    <span className="font-medium">Aleatória</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Templates Library Toggle */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Biblioteca de Templates</p>
                <p className="text-sm text-muted-foreground">
                  Salve e reutilize modelos de mensagens
                </p>
              </div>
            </div>
            <button
              onClick={() => setSettings({ templatesEnabled: !settings.templatesEnabled })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                settings.templatesEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${settings.templatesEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Templates Library Content */}
        {settings.templatesEnabled && (
          <div className="glass-card p-6 animate-fade-in">
            <MessageTemplates onUseTemplate={(content) => addMessage(content)} />
          </div>
        )}

        {/* Schedule Toggle */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Agendamento de Disparo</p>
                <p className="text-sm text-muted-foreground">
                  Restringir disparo a dias e horários específicos
                </p>
              </div>
            </div>
            <button
              onClick={() => setSettings({ scheduleEnabled: !settings.scheduleEnabled })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                settings.scheduleEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${settings.scheduleEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Schedule Config Content */}
        {settings.scheduleEnabled && (
          <div className="glass-card p-6 space-y-4 animate-fade-in">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Dias da Semana</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 0, label: 'Dom' },
                  { value: 1, label: 'Seg' },
                  { value: 2, label: 'Ter' },
                  { value: 3, label: 'Qua' },
                  { value: 4, label: 'Qui' },
                  { value: 5, label: 'Sex' },
                  { value: 6, label: 'Sáb' },
                ].map(day => (
                  <button
                    key={day.value}
                    onClick={() => {
                      const days = settings.scheduleWeekDays.includes(day.value)
                        ? settings.scheduleWeekDays.filter(d => d !== day.value)
                        : [...settings.scheduleWeekDays, day.value].sort();
                      setSettings({ scheduleWeekDays: days });
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      settings.scheduleWeekDays.includes(day.value)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Horário Início</label>
                <input
                  type="time"
                  value={settings.scheduleStartTime}
                  onChange={(e) => setSettings({ scheduleStartTime: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Horário Fim</label>
                <input
                  type="time"
                  value={settings.scheduleEndTime}
                  onChange={(e) => setSettings({ scheduleEndTime: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
              <p className="text-muted-foreground">
                O disparo será pausado automaticamente fora dos dias e horários selecionados e retomará no próximo horário permitido.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
