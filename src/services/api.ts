const API_DB = '/api/db';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function handleResponse(res: Response) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Build query string from filters object */
function qs(filters?: Record<string, string | number | undefined>): string {
  if (!filters) return '';
  const parts = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? '?' + parts.join('&') : '';
}

export const api = {
  async get(table: string, filters?: Record<string, string | number | undefined>) {
    const res = await fetch(`${API_DB}/${table}${qs(filters)}`, { headers: headers() });
    return handleResponse(res);
  },

  async getById(table: string, id: string) {
    const res = await fetch(`${API_DB}/${table}/${id}`, { headers: headers() });
    return handleResponse(res);
  },

  async post(table: string, body: Record<string, any>, onConflict?: string) {
    const url = `${API_DB}/${table}${onConflict ? `?onConflict=${onConflict}` : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  },

  async put(table: string, id: string, body: Record<string, any>) {
    const res = await fetch(`${API_DB}/${table}/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body),
    });
    return handleResponse(res);
  },

  async del(table: string, id: string) {
    const res = await fetch(`${API_DB}/${table}/${id}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return handleResponse(res);
  },

  /** Upsert helper: tries POST with onConflict, falls back to simple insert */
  async upsert(table: string, body: Record<string, any>, conflictCols: string) {
    return api.post(table, body, conflictCols);
  },
};
