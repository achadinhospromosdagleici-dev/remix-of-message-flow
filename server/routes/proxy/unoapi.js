import { Router } from 'express';

const router = Router();

router.post('/', async (req, res) => {
  let targetUrl = '';
  let requestMethod = 'GET';

  try {
    const { baseUrl, token, endpoint, method, body: requestBody } = req.body;

    requestMethod = method || 'GET';

    if (!baseUrl || !token) {
      return res.status(400).json({ error: 'baseUrl and token are required' });
    }

    const cleanBase = baseUrl.replace(/\/$/, '');
    const rawEndpoint = endpoint || '/sessions';
    const cleanEndpoint = rawEndpoint.startsWith('/') ? rawEndpoint : `/${rawEndpoint}`;
    targetUrl = `${cleanBase}${cleanEndpoint}`;

    console.log('[unoapi-proxy] →', requestMethod, targetUrl);

    const response = await fetch(targetUrl, {
      method: requestMethod,
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      ...(requestBody && requestMethod !== 'GET' ? { body: JSON.stringify(requestBody) } : {}),
    });

    console.log('[unoapi-proxy] Response status:', response.status);

    let data;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { text, status: response.status };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: `HTTP ${response.status}`,
        details: data,
        targetUrl,
        method: requestMethod,
      });
    }

    res.json(data);
  } catch (error) {
    console.error('[unoapi-proxy] Error:', requestMethod, targetUrl, error.message);
    res.status(500).json({
      error: error.message,
      type: error.constructor?.name || typeof error,
      targetUrl,
      method: requestMethod,
      details: error.cause || error.stack,
      hint: 'Verifique se o servidor UnoAPI está acessível pela internet e se a URL está correta.',
    });
  }
});

export default router;
