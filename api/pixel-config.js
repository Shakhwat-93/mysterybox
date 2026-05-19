import { createServiceClient, json, setCors } from './_supabase.js';

function normalizeGtmContainerId(value) {
  const match = String(value || '').match(/GTM-[A-Z0-9]+/i);
  return match ? match[0].toUpperCase() : '';
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
      .select('meta_pixel_enabled,meta_pixel_id,meta_capi_enabled,gtm_enabled,gtm_container_id')
      .eq('id', 'main')
      .maybeSingle();

    if (error) throw error;

    const gtmContainerId = normalizeGtmContainerId(data?.gtm_container_id);

    json(res, 200, {
      metaPixelEnabled: Boolean(data?.meta_pixel_enabled && data?.meta_pixel_id),
      metaPixelId: data?.meta_pixel_id || '',
      metaCapiEnabled: Boolean(data?.meta_capi_enabled),
      gtmEnabled: Boolean(data?.gtm_enabled && gtmContainerId),
      gtmContainerId,
    });
  } catch (error) {
    json(res, 200, {
      metaPixelEnabled: false,
      metaPixelId: '',
      metaCapiEnabled: false,
      gtmEnabled: false,
      gtmContainerId: '',
      error: error.message,
    });
  }
}
