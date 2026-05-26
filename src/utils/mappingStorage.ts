import { supabase } from '@/integrations/supabase/client';
import { getUserId } from '@/services/user';

const STORAGE_KEY = 'column_mapping_history';

interface MappingEntry {
  columnName: string;
  mappedTo: string;
  count: number;
}

async function saveMappingToDb(mappings: Record<string, string>) {
  const userId = getUserId();
  if (!userId) return;
  for (const [originalPhone, mappedPhone] of Object.entries(mappings)) {
    if (mappedPhone === '_skip') continue;
    await supabase.from('phone_mappings').upsert({
      user_id: userId,
      original_phone: originalPhone,
      mapped_phone: mappedPhone,
    }, { onConflict: 'user_id,original_phone' });
  }
}

async function loadMappingFromDb(): Promise<Record<string, string>> {
  const userId = getUserId();
  if (!userId) return {};
  const { data } = await supabase.from('phone_mappings').select('*').eq('user_id', userId);
  const result: Record<string, string> = {};
  data?.forEach((m: any) => { result[m.original_phone] = m.mapped_phone; });
  return result;
}

export function saveMappingHistory(mappings: Record<string, string>) {
  try {
    const existing = getMappingHistory();
    Object.entries(mappings).forEach(([colName, mappedTo]) => {
      if (mappedTo === '_skip') return;
      const normalized = colName.toLowerCase().trim();
      const entry = existing.find(e => e.columnName === normalized);
      if (entry) { entry.mappedTo = mappedTo; entry.count++; }
      else { existing.push({ columnName: normalized, mappedTo, count: 1 }); }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    saveMappingToDb(mappings).catch(console.error);
  } catch {}
}

export function getMappingHistory(): MappingEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function autoMatchColumn(columnName: string): string | null {
  const normalized = columnName.toLowerCase().trim();

  // Check localStorage history first
  const history = getMappingHistory();
  const match = history.find(e => e.columnName === normalized);
  if (match) return match.mappedTo;

  // Built-in auto-match rules (ignoring accents/spaces)
  const rules: Record<string, RegExp> = {
    numero: /^(numero|telefone|phone|celular|whatsapp|fone|tel|mobile|cell|number)$/i,
    nome: /^(nome|name|nome_completo|full_name|primeiro_nome|first_name|contato|contact)$/i,
    email: /^(email|e-mail|e_mail|mail|correio)$/i,
    cpf: /^(cpf|cpf_cnpj|documento|document)$/i,
    empresa: /^(empresa|company|organizacao|organization|razao_social|firma)$/i,
    cidade: /^(cidade|city|municipio|localidade)$/i,
  };

  // Remove accents for matching
  const clean = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '_');

  for (const [field, regex] of Object.entries(rules)) {
    if (regex.test(clean) || regex.test(normalized)) {
      return field;
    }
  }

  return null;
}
