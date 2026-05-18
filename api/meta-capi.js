import crypto from 'node:crypto';
import { createServiceClient, json, setCors } from './_supabase.js';

const GRAPH_VERSION = 'v25.0';

function sha256(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex');
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
    if (!settings?.meta_capi_enabled || !settings?.meta_pixel_id || !settings?.meta_access_token) {
      json(res, 200, { ok: false, skipped: true, reason: 'Meta CAPI is not configured.' });
      return;
    }

    const body = req.body || {};
    const eventId = body.eventId || crypto.randomUUID();
    const eventSourceUrl = body.eventSourceUrl || req.headers.referer || '';
    const requestedCustomData = body.customData || {};
    const orderId = requestedCustomData.order_id;
    const customer = body.customer || {};
    const userAgent = req.headers['user-agent'];
    const forwardedFor = req.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwardedFor) ? forwardedFor[0] : String(forwardedFor || '').split(',')[0].trim();

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
      ph: sha256(customer.phone),
      fn: sha256(customer.name),
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

    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${settings.meta_pixel_id}/events?access_token=${encodeURIComponent(settings.meta_access_token)}`, {
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
