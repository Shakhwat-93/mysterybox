import { createServiceClient, json, setCors } from './_supabase.js';

function normalizeGtmContainerId(value) {
  const match = String(value || '').match(/GTM-[A-Z0-9]+/i);
  return match ? match[0].toUpperCase() : '';
}

function normalizeMetaPixelId(value) {
  const text = String(value || '');
  const initMatch = text.match(/fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{6,30})/i);
  const urlMatch = text.match(/facebook\.com\/tr\?id=(\d{6,30})/i);
  const plainMatch = text.match(/\b\d{6,30}\b/);
  return (initMatch?.[1] || urlMatch?.[1] || plainMatch?.[0] || '').trim();
}

function normalizeTikTokPixelId(value) {
  const text = String(value || '').trim();
  const loadMatch = text.match(/ttq\.load\(\s*['"]([A-Z0-9]{8,40})['"]/i);
  const sdkMatch = text.match(/[?&]sdkid=([A-Z0-9]{8,40})/i);
  const plainMatch = text.match(/\b[A-Z0-9]{8,40}\b/i);
  return (loadMatch?.[1] || sdkMatch?.[1] || plainMatch?.[0] || '').trim().toUpperCase();
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('pixel_settings')
      .select('meta_pixel_enabled,meta_pixel_id,meta_capi_enabled,meta_access_token,gtm_enabled,gtm_container_id,tiktok_pixel_enabled,tiktok_pixel_id,tiktok_events_enabled,tiktok_access_token')
      .eq('id', 'main')
      .maybeSingle();

    if (error) throw error;

    const metaPixelId = normalizeMetaPixelId(data?.meta_pixel_id);
    const gtmContainerId = normalizeGtmContainerId(data?.gtm_container_id);
    const tiktokPixelId = normalizeTikTokPixelId(data?.tiktok_pixel_id);

    json(res, 200, {
      metaPixelEnabled: Boolean(data?.meta_pixel_enabled && metaPixelId),
      metaPixelId,
      metaCapiEnabled: Boolean(data?.meta_capi_enabled && metaPixelId && data?.meta_access_token),
      gtmEnabled: Boolean(data?.gtm_enabled && gtmContainerId),
      gtmContainerId,
      tiktokPixelEnabled: Boolean(data?.tiktok_pixel_enabled && tiktokPixelId),
      tiktokPixelId,
      tiktokEventsEnabled: Boolean(data?.tiktok_events_enabled && tiktokPixelId && data?.tiktok_access_token),
    });
  } catch (error) {
    json(res, 200, {
      metaPixelEnabled: false,
      metaPixelId: '',
      metaCapiEnabled: false,
      gtmEnabled: false,
      gtmContainerId: '',
      tiktokPixelEnabled: false,
      tiktokPixelId: '',
      tiktokEventsEnabled: false,
      error: error.message,
    });
  }
}
