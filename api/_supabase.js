import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function json(res, status, payload) {
  res.status(status).json(payload);
}

export function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const value = Array.isArray(forwardedFor) ? forwardedFor[0] : String(forwardedFor || realIp || '');
  return value.split(',')[0].trim();
}

export function getBearerToken(req) {
  const authorization = req.headers.authorization || req.headers.Authorization || '';
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

export async function requireAdmin(req, supabase) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Missing admin session.' };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) return { ok: false, status: 401, error: 'Invalid admin session.' };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) return { ok: false, status: 403, error: 'Admin access required.' };
  return { ok: true, user: userData.user };
}
