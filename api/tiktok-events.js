import crypto from 'node:crypto';
import { createServiceClient, getClientIp, json, setCors } from './_supabase.js';

const TIKTOK_EVENTS_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const ALLOWED_EVENTS = new Set(['ViewContent', 'InitiateCheckout', 'CompletePayment']);

function normalizeTikTokPixelId(value) {
  const text = String(value || '').trim();
  const loadMatch = text.match(/ttq\.load\(\s*['"]([A-Z0-9]{8,40})['"]/i);
  const sdkMatch = text.match(/[?&]sdkid=([A-Z0-9]{8,40})/i);
  const plainMatch = text.match(/\b[A-Z0-9]{8,40}\b/i);
  return (loadMatch?.[1] || sdkMatch?.[1] || plainMatch?.[0] || '').trim().toUpperCase();
}

function sha256(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function normalizeBdPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('8801')) return digits;
  if (digits.startsWith('01')) return `88${digits}`;
  return digits;
}

function splitName(value) {
  const parts = String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function clean(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function buildUser({ req, customer = {}, eventId, ttp, ttclid }) {
  const { firstName, lastName } = splitName(customer.name);
  return clean({
    phone: sha256(normalizeBdPhone(customer.phone)),
    external_id: sha256(eventId || customer.phone || customer.name),
    fn: sha256(firstName || customer.name),
    ln: sha256(lastName),
    ttp: ttp || getCookie(req, '_ttp'),
    ttclid,
    ip: getClientIp(req),
    user_agent: req.headers['user-agent'],
  });
}

async function completePaymentProperties(supabase, requestedProperties) {
  const orderId = requestedProperties?.order_id;
  if (!orderId) return requestedProperties || {};

  const { data: order, error } = await supabase
    .from('orders')
    .select('id,package_count,subtotal,total')
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw error;
  if (!order) throw new Error('Order not found.');

  return {
    value: Number(order.total || 0),
    currency: 'BDT',
    content_type: 'product',
    contents: [
      {
        content_id: `mystery-box-${order.package_count}`,
        content_name: `${order.package_count} Packet Mystery Box`,
        content_category: 'Mystery Box',
        quantity: Number(order.package_count || 1),
        price: Number(order.subtotal || 0),
      },
    ],
    order_id: order.id,
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = createServiceClient();
    const { data: settings, error } = await supabase
      .from('pixel_settings')
      .select('tiktok_pixel_id,tiktok_events_enabled,tiktok_access_token,tiktok_test_event_code')
      .eq('id', 'main')
      .maybeSingle();

    if (error) throw error;

    const pixelId = normalizeTikTokPixelId(settings?.tiktok_pixel_id);
    const accessToken = String(settings?.tiktok_access_token || '').trim();
    if (!settings?.tiktok_events_enabled || !pixelId || !accessToken) {
      json(res, 200, { ok: false, skipped: true, reason: 'TikTok Events API is not configured.' });
      return;
    }

    const body = req.body || {};
    const eventName = String(body.eventName || '');
    if (!ALLOWED_EVENTS.has(eventName)) {
      json(res, 400, { ok: false, error: 'Unsupported TikTok event.' });
      return;
    }

    const eventId = String(body.eventId || crypto.randomUUID());
    const properties =
      eventName === 'CompletePayment'
        ? await completePaymentProperties(supabase, body.properties || {})
        : body.properties || {};

    const eventPayload = {
      event: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      user: buildUser({
        req,
        customer: body.customer || {},
        eventId,
        ttp: body.ttp,
        ttclid: body.ttclid,
      }),
      properties,
      page: clean({
        url: body.eventSourceUrl || req.headers.referer,
        referrer: body.referrer,
      }),
    };

    if (settings.tiktok_test_event_code) {
      eventPayload.test_event_code = settings.tiktok_test_event_code;
    }

    const response = await fetch(TIKTOK_EVENTS_URL, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_source: 'web',
        event_source_id: pixelId,
        data: [eventPayload],
      }),
    });

    const result = await response.json().catch(() => ({}));
    json(res, response.ok ? 200 : 502, { ok: response.ok, result });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
