import { supabase } from '@/integrations/supabase/client';
import { getUserId } from '@/services/user';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'meta-llama/llama-3.3-70b-instruct',
];

const SYSTEM_PROMPT = `Você é um especialista em copywriting para WhatsApp.
Regras:
- Escreva em português brasileiro, tom natural e humano.
- Mensagem curta (no máximo 4 linhas), direta e sem soar como spam.
- NUNCA use links, emojis em excesso, ou CAIXA ALTA.
- Pode usar variáveis no formato {{nome}}, {{telefone}} e outros campos quando fizer sentido.
- Retorne APENAS o texto final da mensagem, sem explicações, sem aspas, sem títulos.`;

async function getApiKey(): Promise<string> {
  const userId = getUserId();
  if (!userId) throw new Error('Usuário não autenticado');

  const { data, error } = await supabase
    .from('ai_settings')
    .select('api_key')
    .eq('user_id', userId)
    .single();

  if (error || !data?.api_key) {
    throw new Error('Configure sua chave de API do OpenRouter em Configurações');
  }

  return data.api_key;
}

async function callOpenRouter(model: string, system: string, prompt: string) {
  const key = await getApiKey();
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Nexia',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token OpenRouter inválido');
    if (res.status === 402) throw new Error('Créditos OpenRouter esgotados');
    if (res.status === 429) throw new Error('Limite de requisições atingido');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = JSON.parse(text);
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  return content.trim();
}

export async function gerarMensagem(prompt: string, model: string): Promise<string> {
  return callOpenRouter(model, SYSTEM_PROMPT, prompt);
}

export async function variarMensagem(texto: string, quantidade: number, model: string): Promise<string[]> {
  const sys = `${SYSTEM_PROMPT}
Sua tarefa: reescrever a mensagem do usuário em ${quantidade} versões diferentes, preservando o sentido e quaisquer variáveis {{...}}.
Retorne APENAS as versões, uma por linha, separadas por "---" (três traços em uma linha), sem numeração nem comentários.`;

  const out = await callOpenRouter(model, sys, texto);
  return out
    .split(/^---\s*$/m)
    .map(v => v.trim())
    .filter(v => v.length > 0);
}
