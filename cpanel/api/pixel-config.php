<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

set_api_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(405, ['error' => 'Method not allowed']);
}

try {
    $rows = supabase_request(
        'GET',
        'pixel_settings?select=meta_pixel_enabled,meta_pixel_id,meta_capi_enabled,meta_access_token,gtm_enabled,gtm_container_id,tiktok_pixel_enabled,tiktok_pixel_id,tiktok_events_enabled,tiktok_access_token&id=eq.main'
    );
    $settings = $rows[0] ?? [];
    $metaPixelId = normalize_meta_pixel_id($settings['meta_pixel_id'] ?? '');
    $gtmContainerId = normalize_gtm_container_id($settings['gtm_container_id'] ?? '');
    $tiktokPixelId = normalize_tiktok_pixel_id($settings['tiktok_pixel_id'] ?? '');

    json_response(200, [
        'metaPixelEnabled' => (bool) (($settings['meta_pixel_enabled'] ?? false) && $metaPixelId),
        'metaPixelId' => $metaPixelId,
        'metaCapiEnabled' => (bool) (($settings['meta_capi_enabled'] ?? false) && $metaPixelId && ($settings['meta_access_token'] ?? '')),
        'gtmEnabled' => (bool) (($settings['gtm_enabled'] ?? false) && $gtmContainerId),
        'gtmContainerId' => $gtmContainerId,
        'tiktokPixelEnabled' => (bool) (($settings['tiktok_pixel_enabled'] ?? false) && $tiktokPixelId),
        'tiktokPixelId' => $tiktokPixelId,
        'tiktokEventsEnabled' => (bool) (($settings['tiktok_events_enabled'] ?? false) && $tiktokPixelId && ($settings['tiktok_access_token'] ?? '')),
    ]);
} catch (Throwable $error) {
    json_response(200, [
        'metaPixelEnabled' => false,
        'metaPixelId' => '',
        'metaCapiEnabled' => false,
        'gtmEnabled' => false,
        'gtmContainerId' => '',
        'tiktokPixelEnabled' => false,
        'tiktokPixelId' => '',
        'tiktokEventsEnabled' => false,
        'error' => $error->getMessage(),
    ]);
}
