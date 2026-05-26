import { Router } from 'express';

const router = Router();

function buildAuthHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

async function fetchFirstSuccessful(requests) {
  let lastStatus = 500;
  let lastDetail = 'Nenhum endpoint compatível respondeu com sucesso';

  for (const request of requests) {
    try {
      const response = await fetch(request.endpoint, {
        method: request.method || 'GET',
        headers: request.headers,
        body: request.body,
      });

      if (response.ok) {
        const text = await response.text();
        return { ok: true, status: response.status, endpoint: request.endpoint, text };
      }

      lastStatus = response.status;
      lastDetail = await response.text();
    } catch (error) {
      lastDetail = String(error);
    }
  }

  return { ok: false, status: lastStatus, detail: lastDetail };
}

router.post('/', async (req, res) => {
  let currentAction = 'unknown';
  let currentBase = '';
  let currentInstanceName = '';

  try {
    const { action, baseUrl, apiKey, instanceName, to, message, webhookUrl, events } = req.body;

    currentAction = action || 'unknown';
    currentBase = baseUrl || '';
    currentInstanceName = instanceName || '';

    if (!baseUrl || !apiKey) {
      return res.status(400).json({ error: 'baseUrl and apiKey are required' });
    }

    const headers = buildAuthHeaders(apiKey);
    const base = baseUrl.replace(/\/$/, '');

    switch (action) {
      case 'fetchInstances': {
        const endpoints = [
          `${base}/instance/all`,
          `${base}/manager/api/instance/list`,
          `${base}/api/instance/list`,
        ];

        let lastError = '';
        let data = null;

        for (const endpoint of endpoints) {
          try {
            const fetchRes = await fetch(endpoint, { headers, method: 'GET' });
            if (fetchRes.ok) {
              data = await fetchRes.json();
              break;
            }
            lastError = await fetchRes.text();
          } catch (e) {
            lastError = String(e);
          }
        }

        if (!data) {
          return res.json({
            error: 'Nenhuma instância encontrada',
            detail: lastError,
            tried: endpoints,
            baseUrl: base,
          });
        }

        const instances = data?.data || data?.instances || data || [];

        const normalized = (Array.isArray(instances) ? instances : []).map((inst) => ({
          instanceName: inst.name || '',
          status: inst.connected ? 'open' : 'close',
          phone: inst.jid ? inst.jid.split('@')[0] : '',
          profileName: inst.profileName || '',
          profilePictureUrl: inst.profilePicUrl || '',
        }));

        const enriched = await Promise.all(
          normalized.map(async (inst) => {
            if (!inst.instanceName) return inst;
            try {
              const stateRes = await fetch(
                `${base}/manager/api/instance/connectionState/${inst.instanceName}`,
                { headers }
              );
              if (stateRes.ok) {
                const stateData = await stateRes.json();
                const state = stateData?.instance?.state || stateData?.state || inst.status;
                return {
                  ...inst,
                  status: state === 'open' || state === 'connected' ? 'open' : state,
                  phone: inst.phone || stateData?.instance?.owner || '',
                };
              }
            } catch {}
            return inst;
          })
        );

        return res.json({ instances: enriched });
      }

      case 'findOrCreate': {
        if (!instanceName) {
          return res.status(400).json({ error: 'instanceName is required' });
        }

        const listRes = await fetch(`${base}/instance/all`, { headers, method: 'GET' });
        let existingInstances = [];
        if (listRes.ok) {
          const data = await listRes.json();
          existingInstances = data?.data || data?.instances || data || [];
          if (!Array.isArray(existingInstances)) existingInstances = [];
        }

        const existing = existingInstances.find((inst) => inst.name === instanceName);

        if (existing) {
          return res.json({
            action: 'existing',
            instanceName: existing.name,
            status: existing.connected ? 'open' : 'close',
            phone: existing.jid ? existing.jid.split('@')[0] : '',
            message: 'Instância já existe, reutilizando.',
          });
        }

        const createRes = await fetch(`${base}/instance/create`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ instanceName }),
        });

        if (!createRes.ok) {
          const text = await createRes.text();
          return res.status(createRes.status).json({
            error: `Erro ao criar instância: ${createRes.status}`,
            detail: text,
          });
        }

        const created = await createRes.json();
        return res.json({
          action: 'created',
          instanceName,
          qrcode: created.qrcode?.base64 || created.base64 || created.qrcode || '',
          pairingCode: created.pairingCode || '',
          status: 'close',
        });
      }

      case 'connect': {
        if (!instanceName) {
          return res.status(400).json({ error: 'instanceName is required' });
        }

        const connectRes = await fetch(
          `${base}/manager/api/instance/connect/${instanceName}`,
          { headers }
        );

        if (!connectRes.ok) {
          const text = await connectRes.text();
          return res.status(connectRes.status).json({
            error: `Erro ao conectar: ${connectRes.status}`,
            detail: text,
          });
        }

        const data = await connectRes.json();
        return res.json({
          qrcode: data.base64 || data.qrcode?.base64 || '',
          pairingCode: data.pairingCode || data.code || '',
        });
      }

      case 'connectionState': {
        if (!instanceName) {
          return res.status(400).json({ error: 'instanceName is required' });
        }

        const stateRes = await fetch(
          `${base}/manager/api/instance/connectionState/${instanceName}`,
          { headers }
        );

        if (!stateRes.ok) {
          const text = await stateRes.text();
          return res.status(stateRes.status).json({
            error: `Erro ao verificar status: ${stateRes.status}`,
            detail: text,
          });
        }

        const stateData = await stateRes.json();
        const state = stateData?.instance?.state || stateData?.state || 'close';
        return res.json({
          instanceName,
          status: state,
          connected: state === 'open' || state === 'connected',
        });
      }

      case 'logout': {
        if (!instanceName) {
          return res.status(400).json({ error: 'instanceName is required' });
        }

        await fetch(`${base}/manager/api/instance/logout/${instanceName}`, {
          method: 'DELETE',
          headers,
        });

        return res.json({ success: true, message: 'Instância desconectada' });
      }

      case 'sendMessage': {
        if (!instanceName || !to || !message) {
          return res.status(400).json({
            error: 'instanceName, to, and message are required',
          });
        }

        const statusRes = await fetch(
          `${base}/manager/api/instance/connectionState/${instanceName}`,
          { headers }
        );

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          const state = statusData?.instance?.state || statusData?.state || 'close';
          if (state !== 'open' && state !== 'connected') {
            return res.status(422).json({
              error: 'Instância não está conectada',
              status: state,
              suggestion: 'reconnect',
              message: 'Reconecte a instância antes de enviar mensagens.',
            });
          }
        }

        const msgType = message.type || 'text';
        let endpoint = `${base}/message/sendText/${instanceName}`;
        let body;

        switch (msgType) {
          case 'text':
            body = { number: to, text: message.content };
            break;
          case 'image':
            endpoint = `${base}/message/sendMedia/${instanceName}`;
            body = {
              number: to,
              mediatype: 'image',
              media: message.mediaUrl,
              caption: message.caption || message.content,
            };
            break;
          case 'audio':
            endpoint = `${base}/message/sendWhatsAppAudio/${instanceName}`;
            body = { number: to, audio: message.mediaUrl };
            break;
          case 'video':
            endpoint = `${base}/message/sendMedia/${instanceName}`;
            body = {
              number: to,
              mediatype: 'video',
              media: message.mediaUrl,
              caption: message.caption || message.content,
            };
            break;
          case 'document':
            endpoint = `${base}/message/sendMedia/${instanceName}`;
            body = {
              number: to,
              mediatype: 'document',
              media: message.mediaUrl,
              caption: message.caption || '',
              fileName: message.filename || 'document',
            };
            break;
          case 'buttons': {
            endpoint = `${base}/message/sendButtons/${instanceName}`;
            const btns = Array.isArray(message.buttons) ? message.buttons : [];
            body = {
              number: to,
              title: message.title || '',
              description: message.content || '',
              footer: message.footer || '',
              buttons: btns.map((b, idx) => {
                if (b.type === 'url') {
                  return { type: 'url', displayText: b.label, url: b.value };
                }
                if (b.type === 'phone') {
                  return { type: 'call', displayText: b.label, phoneNumber: b.value };
                }
                return { type: 'reply', displayText: b.label, id: b.value || `btn_${idx}` };
              }),
            };
            break;
          }
          case 'link': {
            const linkText = message.linkUrl
              ? `${message.content}\n\n${message.linkUrl}`
              : message.content;
            body = { number: to, text: linkText, linkPreview: true };
            break;
          }
          case 'contact':
            endpoint = `${base}/message/sendContact/${instanceName}`;
            body = {
              number: to,
              contact: [
                {
                  fullName: message.contactName || message.content,
                  phoneNumber: message.contactNumber || '',
                },
              ],
            };
            break;
          case 'list': {
            endpoint = `${base}/message/sendList/${instanceName}`;
            const sections = Array.isArray(message.sections) ? message.sections : [];
            body = {
              number: to,
              title: message.title || '',
              description: message.content || '',
              buttonText: message.btnTitle || 'Selecionar',
              footerText: message.btnFooter || '',
              sections: sections.map((section) => ({
                title: section.title,
                rows: (section.rows || []).map((row, idx) => ({
                  title: row.title,
                  description: row.description || '',
                  rowId: row.rowId || row.id || `row_${idx}`,
                })),
              })),
            };
            break;
          }
          case 'carousel': {
            endpoint = `${base}/send/carousel/${instanceName}`;
            const cards = Array.isArray(message.cards) ? message.cards : [];
            body = {
              number: to,
              cards: cards.map((card) => ({
                header: card.image ? { imageUrl: card.image } : undefined,
                body: card.title ? { text: card.title } : undefined,
                footer: card.footer ? { text: card.footer } : undefined,
                action: {
                  buttons: (card.buttons || []).map((b, idx) => {
                    if (b.type === 'url') {
                      return { type: 'url', displayText: b.label, url: b.value };
                    }
                    if (b.type === 'phone') {
                      return { type: 'call', displayText: b.label, phoneNumber: b.value };
                    }
                    return { type: 'reply', displayText: b.label, id: b.value || `btn_${idx}` };
                  }),
                },
              })),
            };
            break;
          }
          default:
            body = { number: to, text: message.content };
        }

        const requestBody = JSON.stringify(body);
        const sendAttempts =
          msgType === 'text'
            ? [
                {
                  endpoint: `${base}/send/text`,
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    number: to,
                    text: message.content,
                    delay: 1200,
                  }),
                },
                { endpoint, method: 'POST', headers, body: requestBody },
              ]
            : [{ endpoint, method: 'POST', headers, body: requestBody }];

        const sendRes = await fetchFirstSuccessful(sendAttempts);

        if (!sendRes.ok) {
          return res.status(sendRes.status).json({
            error: `Erro ao enviar: ${sendRes.status}`,
            detail: sendRes.detail,
          });
        }

        const sendData = sendRes.text ? JSON.parse(sendRes.text) : null;
        return res.json({ success: true, data: sendData });
      }

      case 'setWebhook': {
        if (!instanceName || !webhookUrl) {
          return res.status(400).json({
            error: 'instanceName and webhookUrl are required',
          });
        }

        const webhookRes = await fetch(`${base}/webhook/${instanceName}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            events:
              events || ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
          }),
        });

        if (!webhookRes.ok) {
          const text = await webhookRes.text();
          return res.status(webhookRes.status).json({
            error: `Erro ao configurar webhook: ${webhookRes.status}`,
            detail: text,
          });
        }

        const webhookData = await webhookRes.json();
        return res.json({ success: true, webhookUrl, data: webhookData });
      }

      case 'removeWebhook': {
        if (!instanceName) {
          return res.status(400).json({ error: 'instanceName is required' });
        }

        const removeRes = await fetch(`${base}/webhook/${instanceName}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ enabled: false }),
        });

        if (!removeRes.ok) {
          const text = await removeRes.text();
          return res.status(removeRes.status).json({
            error: `Erro ao remover webhook: ${removeRes.status}`,
            detail: text,
          });
        }

        return res.json({ success: true, message: 'Webhook removido' });
      }

      case 'getWebhook': {
        if (!instanceName) {
          return res.status(400).json({ error: 'instanceName is required' });
        }

        const getRes = await fetch(`${base}/webhook/find/${instanceName}`, {
          headers,
        });

        if (!getRes.ok) {
          const text = await getRes.text();
          return res.status(getRes.status).json({
            error: `Erro ao buscar webhook: ${getRes.status}`,
            detail: text,
          });
        }

        const getData = await getRes.json();
        return res.json({
          enabled: getData.enabled || false,
          url: getData.url || '',
          events: getData.events || [],
        });
      }

      default:
        return res.status(400).json({ error: `Ação desconhecida: ${action}` });
    }
  } catch (error) {
    console.error(
      '[evolution-go-proxy] Error:',
      currentAction,
      currentBase,
      currentInstanceName,
      error.message
    );
    res.status(500).json({
      error: error.message,
      type: error.constructor?.name || typeof error,
      action: currentAction,
      baseUrl: currentBase,
      instanceName: currentInstanceName,
      details: error.cause || error.stack,
      hint: 'Verifique se o servidor Evolution Go API está acessível pela internet e se a URL está correta.',
    });
  }
});

export default router;
