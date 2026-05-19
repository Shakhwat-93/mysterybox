import crypto from 'node:crypto';
import { createServiceClient, getClientIp, json, setCors } from './_supabase.js';

const GRAPH_VERSION = 'v25.0';

function normalizeMetaPixelId(value) {
  const text = String(value || '');
  const initMatch = text.match(/fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{6,30})/i);
  const urlMatch = text.match(/facebook\.com\/tr\?id=(\d{6,30})/i);
  const plainMatch = text.match(/\b\d{6,30}\b/);
  return (initMatch?.[1] || urlMatch?.[1] || plainMatch?.[0] || '').trim();
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
      .select('meta_pixel_id,meta_capi_enabled,meta_access_token,meta_test_event_code')
      .eq('id', 'main')
      .maybeSingle();

    if (error) throw error;
    const metaPixelId = normalizeMetaPixelId(settings?.meta_pixel_id);
    if (!settings?.meta_capi_enabled || !metaPixelId || !settings?.meta_access_token) {
      json(res, 200, { ok: false, skipped: true, reason: 'Meta CAPI is not configured.' });
      return;
    }

    const body = req.body || {};
    const eventId = body.eventId || crypto.randomUUID();
    const eventSourceUrl = body.eventSourceUrl || req.headers.referer || '';
    const requestedCustomData = body.customData || {};
    const orderId = requestedCustomData.order_id;
    const customer = body.customer || {};
    const { firstName, lastName } = splitName(customer.name);
    const userAgent = req.headers['user-agent'];
    const ipAddress = getClientIp(req);

    if (!orderId) {
      json(res, 400, { ok: false, error: 'Missing order_id.' });
      return;
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id,package_count,subtotal,delivery_charge,total')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) {
      json(res, 404, { ok: false, error: 'Order not found.' });
      return;
    }

    const customData = {
      value: Number(order.total || 0),
      currency: 'BDT',
      content_ids: [`mystery-box-${order.package_count}`],
      content_name: `${order.package_count} Packet Mystery Box`,
      content_type: 'product',
      num_items: Number(order.package_count || 0),
      order_id: order.id,
    };

    const userData = {
      ph: sha256(normalizeBdPhone(customer.phone)),
      fn: sha256(firstName || customer.name),
      ln: sha256(lastName),
      external_id: sha256(order.id),
      client_user_agent: userAgent,
      client_ip_address: ipAddress || undefined,
      fbp: getCookie(req, '_fbp'),
      fbc: getCookie(req, '_fbc'),
    };

    Object.keys(userData).forEach((key) => {
      if (!userData[key]) delete userData[key];
    });

    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'website',
          event_source_url: eventSourceUrl,
          user_data: userData,
          custom_data: customData,
        },
      ],
    };

    if (settings.meta_test_event_code) {
      payload.test_event_code = settings.meta_test_event_code;
    }

    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${metaPixelId}/events?access_token=${encodeURIComponent(settings.meta_access_token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    json(res, response.ok ? 200 : 502, { ok: response.ok, result });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
