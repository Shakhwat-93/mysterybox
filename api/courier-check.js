import { createServiceClient, json, requireAdmin, setCors } from './_supabase.js';

const COURIER_API_URL = 'https://api.bdcourier.com/courier-check';

function normalizePhone(value) {
  return String(value || '').replace(/[\s-]/g, '');
}

async function getCourierApiKey(supabase) {
  const { data, error } = await supabase
    .from('courier_settings')
    .select('api_key')
    .eq('id', 'main')
    .maybeSingle();

  if (error) throw error;
  return String(data?.api_key || process.env.BDCOURIER_API_KEY || '').trim();
}

export default async function handler(req, res) {
  setCors(res);
  let supabase;
  let orderId;
  let claimed;

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    supabase = createServiceClient();
    const admin = await requireAdmin(req, supabase);
    if (!admin.ok) {
      json(res, admin.status, { ok: false, error: admin.error });
      return;
    }

    orderId = req.body?.orderId;
    const forceRetry = req.body?.force === true;
    if (!orderId) {
      json(res, 400, { ok: false, error: 'Missing orderId.' });
      return;
    }

    if (forceRetry) {
      const { error: resetError } = await supabase
        .from('orders')
        .update({
          courier_check_status: 'pending',
          courier_checked_at: null,
          courier_check_result: null,
          courier_check_error: null,
        })
        .eq('id', orderId)
        .eq('courier_check_status', 'error');

      if (resetError) throw resetError;
    }

    const { data: claimedRows, error: claimError } = await supabase.rpc('claim_courier_check', {
      target_order_id: orderId,
    });

    if (claimError) throw claimError;

    claimed = claimedRows?.[0];
    if (!claimed) {
      const { data: existing, error: existingError } = await supabase
        .from('orders')
        .select('id,courier_check_status,courier_checked_at,courier_check_result,courier_check_error,updated_at')
        .eq('id', orderId)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing?.courier_check_status === 'checking' && !existing?.courier_checked_at) {
        json(res, 200, {
          ok: false,
          pending: true,
          cached: true,
          order: existing,
          error: 'Courier check is still processing. Retry after a few seconds.',
        });
        return;
      }

      json(res, 200, { ok: true, cached: true, order: existing });
      return;
    }

    const apiKey = await getCourierApiKey(supabase);
    if (!apiKey) throw new Error('Missing courier API key. Set it from Admin > Courier Setup.');

    const response = await fetch(COURIER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: normalizePhone(claimed.phone) }),
      signal: AbortSignal.timeout(8000),
    });

    const result = await response.json().catch(() => ({}));
    const success = response.ok && result?.status !== 'error';

    const updatePayload = success
      ? {
          courier_check_status: 'success',
          courier_checked_at: new Date().toISOString(),
          courier_check_result: result,
          courier_check_error: null,
        }
      : {
          courier_check_status: 'error',
          courier_checked_at: new Date().toISOString(),
          courier_check_result: result || null,
          courier_check_error: result?.message || result?.error || `Courier API failed with status ${response.status}`,
        };

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select('id,courier_check_status,courier_checked_at,courier_check_result,courier_check_error')
      .maybeSingle();

    if (updateError) throw updateError;

    json(res, 200, {
      ok: success,
      cached: false,
      order: updated,
      error: success ? undefined : updatePayload.courier_check_error,
    });
  } catch (error) {
    if (supabase && claimed?.id) {
      await supabase
        .from('orders')
        .update({
          courier_check_status: 'error',
          courier_checked_at: new Date().toISOString(),
          courier_check_result: null,
          courier_check_error: error.name === 'TimeoutError' ? 'Courier API response took too long.' : error.message,
        })
        .eq('id', claimed.id);
    }
    json(res, 500, { ok: false, error: error.message });
  }
}
