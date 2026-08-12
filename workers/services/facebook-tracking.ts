import type { Env } from '../app';

// Interface for tracking data row
export interface TrackingData {
  id: number;
  phone: string;
  automation_id: string;
  ctwaclid: string | null;
  source_id: string | null;
  page_id: string | null;
  campanha: string | null;
  campanha_id: string | null;
  conjunto_anuncio: string | null;
  conjunto_anuncio_id: string | null;
  anuncio: string | null;
  anuncio_id: string | null;
  titulo: string | null;
  url_anuncio: string | null;
  thumbnail_url: string | null;
  tipo_anuncio: string | null;
  link_whatsapp: string | null;
  mensagem_lead: string | null;
  nome: string | null;
  fbp: string | null;
  client_ip_address: string | null;
  client_user_agent: string | null;
  created_at: string;
}

// Hash a string using SHA256 (Web Crypto API available in Workers)
async function sha256Hash(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get tracking data for a phone
export async function getTrackingData(
  db: D1Database,
  phone: string,
  automationId: string
): Promise<TrackingData | null> {
  // 1. Tentar primeiro obter o registro que possui um ctwaclid válido (origem de anúncio pago)
  const adTracking = await db.prepare(
    'SELECT * FROM tracking_data WHERE phone = ? AND automation_id = ? AND ctwaclid IS NOT NULL ORDER BY created_at DESC LIMIT 1'
  ).bind(phone, automationId).first<TrackingData>();

  if (adTracking) {
    return adTracking;
  }

  // 2. Se não houver, obter o registro mais recente (lead orgânico/sem ctwaclid)
  return db.prepare(
    'SELECT * FROM tracking_data WHERE phone = ? AND automation_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(phone, automationId).first<TrackingData>();
}

/**
 * Busca os nomes de Campanha, Conjunto de Anúncio e Anúncio da Facebook Marketing API
 * usando o source_id (Ad ID) retornado no externalAdReply do CTWA.
 */
export async function fetchAdCampaignInfo(
  sourceId: string,
  accessToken: string
): Promise<{ campanha: string | null; campanha_id: string | null; conjunto_anuncio: string | null; conjunto_anuncio_id: string | null; anuncio: string | null; anuncio_id: string | null } | null> {
  if (!sourceId || !accessToken) return null;

  try {
    // Buscar o anúncio com seus campos e os nomes hierárquicos
    const url = `https://graph.facebook.com/v21.0/${sourceId}?fields=name,adset{name,id},campaign{name,id}&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { method: 'GET' });
    
    if (!res.ok) {
      console.error(`[FacebookTracking] Marketing API error for ad ${sourceId}: ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    console.log(`[FacebookTracking] Ad info resolved for ${sourceId}: campaign=${data.campaign?.name}, adset=${data.adset?.name}, ad=${data.name}`);

    return {
      campanha: data.campaign?.name || null,
      campanha_id: data.campaign?.id || null,
      conjunto_anuncio: data.adset?.name || null,
      conjunto_anuncio_id: data.adset?.id || null,
      anuncio: data.name || null,
      anuncio_id: sourceId,
    };
  } catch (err) {
    console.error(`[FacebookTracking] Error fetching ad info for ${sourceId}:`, err);
    return null;
  }
}

// Save tracking data when lead arrives (from ad click)
// Uses UPSERT (INSERT OR IGNORE) to avoid duplicate entries per phone+automation+ctwaclid
export async function saveTrackingData(
  db: D1Database,
  phone: string,
  automationId: string,
  data: Partial<TrackingData>
): Promise<void> {
  // Verificar se já existe um registro com o mesmo phone + automation_id + ctwaclid
  const ctwa = data.ctwaclid || null;
  if (ctwa) {
    const existing = await db.prepare(
      'SELECT id FROM tracking_data WHERE phone = ? AND automation_id = ? AND ctwaclid = ? LIMIT 1'
    ).bind(phone, automationId, ctwa).first();
    
    if (existing) {
      console.log(`[FacebookTracking] Tracking already exists for ${phone} with ctwaclid, skipping insert`);
      return;
    }
  }

  await db.prepare(`
    INSERT INTO tracking_data (phone, automation_id, ctwaclid, source_id, page_id, campanha, campanha_id, conjunto_anuncio, conjunto_anuncio_id, anuncio, anuncio_id, titulo, url_anuncio, thumbnail_url, tipo_anuncio, link_whatsapp, mensagem_lead, nome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    phone, automationId,
    ctwa, data.source_id || null, data.page_id || null,
    data.campanha || null, data.campanha_id || null,
    data.conjunto_anuncio || null, data.conjunto_anuncio_id || null,
    data.anuncio || null, data.anuncio_id || null,
    data.titulo || null, data.url_anuncio || null, data.thumbnail_url || null,
    data.tipo_anuncio || null, data.link_whatsapp || null,
    data.mensagem_lead || null, data.nome || null
  ).run();
}

// Send LeadSubmitted event
export async function sendLeadEvent(
  db: D1Database | null | undefined,
  automationId: string | null | undefined,
  pixelId: string,
  accessToken: string,
  opts: {
    phone: string;
    name?: string;
    trackingData: TrackingData | null;
    leadId: string;
    wabaId?: string | null;
    pageId?: string | null;
    contentName?: string;
  }
): Promise<boolean> {
  if (!opts.trackingData?.ctwaclid) {
    console.log(`[FacebookTracking] Ignorando envio de evento LeadSubmitted para ${opts.phone} - ctwaclid ausente (Lead Orgânico)`);
    return true;
  }
  const hashedPhone = await sha256Hash(opts.phone);
  const eventTime = Math.floor(Date.now() / 1000);
  const eventId = `lead_${opts.leadId}`;

  const payload = {
    data: [{
      action_source: 'business_messaging',
      event_name: 'LeadSubmitted',
      event_id: eventId,
      event_time: eventTime,
      messaging_channel: 'whatsapp',
      user_data: {
        ...(opts.trackingData?.ctwaclid ? { ctwa_clid: opts.trackingData.ctwaclid } : {}),
        external_id: opts.leadId,
        ph: hashedPhone,
        ...(opts.wabaId ? { waba_id: opts.wabaId } : {}),
        ...((opts.pageId || opts.trackingData?.page_id) ? { page_id: opts.pageId || opts.trackingData?.page_id } : {}),
      },
      custom_data: {
        content_name: opts.contentName || 'recheios a prova de fogo',
      },
    }],
  };

  return await sendToFacebook(db, automationId, pixelId, accessToken, payload, 'LeadSubmitted', eventId, opts.phone);
}

// Send Purchase event (Purchase 1 - basic data)
export async function sendPurchaseEvent(
  db: D1Database | null | undefined,
  automationId: string | null | undefined,
  pixelId: string,
  accessToken: string,
  opts: {
    phone: string;
    trackingData: TrackingData | null;
    leadId: string;
    value: number;
    contentName?: string;
    wabaId?: string | null;
    pageId?: string | null;
  }
): Promise<boolean> {
  if (!opts.trackingData?.ctwaclid) {
    console.log(`[FacebookTracking] Ignorando envio de evento Purchase 1 para ${opts.phone} - ctwaclid ausente (Lead Orgânico)`);
    return true;
  }
  const hashedPhone = await sha256Hash(opts.phone);
  const eventTime = Math.floor(Date.now() / 1000);
  const eventId = `purchase_${opts.leadId}`;

  const payload = {
    data: [{
      action_source: 'business_messaging',
      event_name: 'Purchase',
      event_id: eventId,
      event_time: eventTime,
      messaging_channel: 'whatsapp',
      user_data: {
        ...(opts.trackingData?.ctwaclid ? { ctwa_clid: opts.trackingData.ctwaclid } : {}),
        external_id: opts.leadId,
        ph: hashedPhone,
        ...(opts.wabaId ? { waba_id: opts.wabaId } : {}),
        ...((opts.pageId || opts.trackingData?.page_id) ? { page_id: opts.pageId || opts.trackingData?.page_id } : {}),
      },
      custom_data: {
        currency: 'BRL',
        value: opts.value,
        content_name: opts.contentName || 'recheios a prova de fogo',
      },
    }],
  };

  return await sendToFacebook(db, automationId, pixelId, accessToken, payload, 'Purchase', eventId, opts.phone);
}

// Send Purchase 2 event (with name + email for deduplication)
export async function sendPurchaseEventWithDetails(
  db: D1Database | null | undefined,
  automationId: string | null | undefined,
  pixelId: string,
  accessToken: string,
  opts: {
    phone: string;
    trackingData: TrackingData | null;
    leadId: string;
    value: number;
    firstName?: string;
    lastName?: string;
    email?: string;
    contentName?: string;
    wabaId?: string | null;
    pageId?: string | null;
  }
): Promise<boolean> {
  if (!opts.trackingData?.ctwaclid) {
    console.log(`[FacebookTracking] Ignorando envio de evento Purchase 2 para ${opts.phone} - ctwaclid ausente (Lead Orgânico)`);
    return true;
  }
  const hashedPhone = await sha256Hash(opts.phone);
  const eventTime = Math.floor(Date.now() / 1000);
  const eventId = `purchase_${opts.leadId}`;

  const userData: Record<string, string> = {
    ph: hashedPhone,
  };

  if (opts.trackingData?.ctwaclid) userData.ctwa_clid = opts.trackingData.ctwaclid;
  if (opts.pageId || opts.trackingData?.page_id) {
    userData.page_id = (opts.pageId || opts.trackingData?.page_id) as string;
  }
  if (opts.wabaId) userData.waba_id = opts.wabaId;
  if (opts.firstName) userData.fn = await sha256Hash(opts.firstName);
  if (opts.lastName) userData.ln = await sha256Hash(opts.lastName);
  if (opts.email) userData.em = await sha256Hash(opts.email);

  const payload = {
    data: [{
      action_source: 'business_messaging',
      event_name: 'Purchase',
      event_id: eventId,  // Same event_id for dedup
      event_time: eventTime,
      messaging_channel: 'whatsapp',
      user_data: userData,
      custom_data: {
        currency: 'BRL',
        value: opts.value,
        content_name: opts.contentName || 'recheios a prova de fogo',
      },
    }],
  };

  return await sendToFacebook(db, automationId, pixelId, accessToken, payload, 'Purchase', eventId, opts.phone);
}

// Core function to send to Facebook and log execution
async function sendToFacebook(
  db: D1Database | null | undefined,
  automationId: string | null | undefined,
  pixelId: string,
  accessToken: string,
  payload: any,
  eventName: string,
  eventId: string,
  phone: string
): Promise<boolean> {
  // ── CAMADA DE DEDUPLICAÇÃO DE SEGURANÇA ──
  if (db && eventId) {
    try {
      if (eventName === 'Purchase') {
        const userData = payload.data[0]?.user_data;
        const isEnriched = !!(userData?.em || userData?.fn);

        if (isEnriched) {
          // Para Purchase 2 (Enriquecido): só pular se já enviamos um Purchase enriquecido com sucesso
          const alreadySentEnriched = await db.prepare(`
            SELECT id FROM facebook_tracking_logs 
            WHERE event_id = ? AND status = 'success' AND (payload LIKE '%"em"%' OR payload LIKE '%"fn"%')
            LIMIT 1
          `).bind(eventId).first();
          
          if (alreadySentEnriched) {
            console.log(`[FacebookTracking] Evento Purchase 2 (Enriquecido) com ID ${eventId} já foi enviado com sucesso. Pulando.`);
            return true;
          }
        } else {
          // Para Purchase 1 (Básico): pular se já enviamos QUALQUER Purchase (básico ou enriquecido) com sucesso
          const alreadySentAny = await db.prepare(`
            SELECT id FROM facebook_tracking_logs 
            WHERE event_id = ? AND status = 'success'
            LIMIT 1
          `).bind(eventId).first();
          
          if (alreadySentAny) {
            console.log(`[FacebookTracking] Evento Purchase 1 (Básico) com ID ${eventId} já foi enviado anteriormente. Pulando.`);
            return true;
          }
        }
      } else {
        // Para outros eventos (ex: LeadSubmitted)
        const alreadySent = await db.prepare(`
          SELECT id FROM facebook_tracking_logs 
          WHERE event_id = ? AND status = 'success'
          LIMIT 1
        `).bind(eventId).first();
        
        if (alreadySent) {
          console.log(`[FacebookTracking] Evento ${eventName} com ID ${eventId} já foi enviado anteriormente com sucesso. Pulando.`);
          return true;
        }
      }
    } catch (dedupErr) {
      console.error('[FacebookTracking] Erro na verificação de deduplicação:', dedupErr);
    }
  }

  let status: 'success' | 'error' = 'success';
  let responseText = '';

  try {
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    responseText = await res.text();

    if (!res.ok) {
      console.error('[FacebookTracking] Error:', res.status, responseText);
      status = 'error';
    } else {
      console.log('[FacebookTracking] Success:', responseText);
      status = 'success';
    }
  } catch (error) {
    console.error('[FacebookTracking] Exception:', error);
    status = 'error';
    responseText = String(error);
  } finally {
    // Escrever log no banco D1 e remover os antigos com limite de 2 dias em background (sem bloquear)
    if (db && automationId) {
      try {
        await db.prepare(`
          INSERT INTO facebook_tracking_logs (automation_id, event_name, event_id, phone, status, payload, response)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          automationId,
          eventName,
          eventId,
          phone,
          status,
          JSON.stringify(payload),
          responseText
        ).run();

        // Remove os logs antigos (mantém apenas os últimos 2 dias)
        await db.prepare(`
          DELETE FROM facebook_tracking_logs 
          WHERE created_at < datetime('now', '-2 days')
        `).run();
      } catch (logErr) {
        console.error('[FacebookTracking] Falha ao salvar ou limpar logs de rastreamento:', logErr);
      }
    }
  }

  return status === 'success';
}

