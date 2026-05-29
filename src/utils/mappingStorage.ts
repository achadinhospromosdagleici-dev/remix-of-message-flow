import { getUserId } from '@/services/user';
import { api } from '@/services/api';

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
    await api.upsert('phone_mappings', {
      original_phone: originalPhone,
      mapped_phone: mappedPhone,
    }, 'user_id,original_phone');
  }
}

async function loadMappingFromDb(): Promise<Record<string, string>> {
  const userId = getUserId();
  if (!userId) return {};
  const rows = await api.get('phone_mappings');
  const result: Record<string, string> = {};
  rows?.forEach((m: any) => { result[m.original_phone] = m.mapped_phone; });
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
    saveMappingToDb(mappings).catch(() => {});
  } catch {}
}

export function getMappingHistory(): MappingEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

export function autoMatchColumn(col: string): string | null {
  const name = col.toLowerCase().trim();
  const patterns: Record<string, RegExp[]> = {
    numero: [/^telefone$/, /^celular$/, /^whatsapp$/, /^fone$/, /^phone$/, /^mobile$/, /^contact$/,
             /^num/, /^tel/, /^cel/, /^whats/, /^fone/, /^phone/, /^mobile/],
    nome: [/^nome$/, /^name$/, /^cliente$/, /^contact.?name$/i, /^full.?name$/i, /^first.?name$/i,
           /^last.?name$/i, /^nome$/],
    email: [/^email$/, /^e-?mail$/i, /^correo$/],
    cpf: [/^cpf$/, /^documento$/, /^doc$/],
    cep: [/^cep$/, /^zip$/],
    cidade: [/^cidade$/, /^city$/, /^municipio$/],
    estado: [/^estado$/, /^state$/, /^uf$/],
    observacao: [/^obs/, /^observacao/, /^note/, /^notes/],
  };

  for (const [field, regexps] of Object.entries(patterns)) {
    if (regexps.some(r => r.test(name))) return field;
  }
  return null;
}

export async function tryAutoLoadFromDb(): Promise<void> {
  try {
    const history = getMappingHistory();
    if (history.length > 0) return;
    const dbMappings = await loadMappingFromDb();
    const entries: MappingEntry[] = Object.entries(dbMappings).map(([colName, mappedTo]) => ({
      columnName: colName, mappedTo, count: 1,
    }));
    if (entries.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}
