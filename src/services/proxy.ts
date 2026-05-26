const PROXY_BASE = '/api/proxy';

export async function proxyCall(proxyName: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${PROXY_BASE}/${proxyName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const errorMsg = data.error || data.details?.error || `HTTP ${res.status}`;
    console.error(`[proxy] ${proxyName} error:`, res.status, {
      error: errorMsg,
      targetUrl: data.targetUrl,
      type: data.type,
      details: data.details,
      hint: data.hint,
    });
    throw new Error(errorMsg);
  }

  if (data?.error) {
    throw new Error(data.details?.error || data.error);
  }

  return data;
}
