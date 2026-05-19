<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

set_api_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

try {
    $settingsRows = supabase_request(
        'GET',
        'pixel_settings?select=meta_pixel_id,meta_capi_enabled,meta_access_token,meta_test_event_code&id=eq.main'
    );
    $settings = $settingsRows[0] ?? [];
    $metaPixelId = normalize_meta_pixel_id($settings['meta_pixel_id'] ?? '');
    $accessToken = (string) ($settings['meta_access_token'] ?? '');

    if (!($settings['meta_capi_enabled'] ?? false) || !$metaPixelId || !$accessToken) {
        json_response(200, ['ok' => false, 'skipped' => true, 'reason' => 'Meta CAPI is not configured.']);
    }

    $body = read_json_body();
    $eventId = (string) ($body['eventId'] ?? bin2hex(random_bytes(16)));
    $eventSourceUrl = (string) ($body['eventSourceUrl'] ?? ($_SERVER['HTTP_REFERER'] ?? ''));
    $customDataRequest = is_array($body['customData'] ?? null) ? $body['customData'] : [];
    $orderId = (string) ($customDataRequest['order_id'] ?? '');
    $customer = is_array($body['customer'] ?? null) ? $body['customer'] : [];

    if ($orderId === '') json_response(400, ['ok' => false, 'error' => 'Missing order_id.']);

    $orderRows = supabase_request(
        'GET',
        'orders?select=id,package_count,subtotal,delivery_charge,total&id=eq.' . rawurlencode($orderId)
    );
    $order = $orderRows[0] ?? null;

    if (!$order) json_response(404, ['ok' => false, 'error' => 'Order not found.']);

    $customData = [
        'value' => (float) ($order['total'] ?? 0),
        'currency' => 'BDT',
        'content_ids' => ['mystery-box-' . (string) ($order['package_count'] ?? '')],
        'content_name' => (string) ($order['package_count'] ?? '') . ' Packet Mystery Box',
        'content_type' => 'product',
        'num_items' => (int) ($order['package_count'] ?? 0),
        'order_id' => $order['id'],
    ];

    $nameParts = split_name((string) ($customer['name'] ?? ''));
    $userData = clean_nulls([
        'ph' => sha256_or_null(normalize_bd_phone((string) ($customer['phone'] ?? ''))),
        'fn' => sha256_or_null($nameParts['firstName'] ?: (string) ($customer['name'] ?? '')),
        'ln' => sha256_or_null($nameParts['lastName']),
        'external_id' => sha256_or_null((string) $order['id']),
        'client_user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
        'client_ip_address' => client_ip() ?: null,
        'fbp' => $_COOKIE['_fbp'] ?? null,
        'fbc' => $_COOKIE['_fbc'] ?? null,
    ]);

    $payload = [
        'data' => [[
            'event_name' => 'Purchase',
            'event_time' => time(),
            'event_id' => $eventId,
            'action_source' => 'website',
            'event_source_url' => $eventSourceUrl,
            'user_data' => $userData,
            'custom_data' => $customData,
        ]],
    ];

    if (!empty($settings['meta_test_event_code'])) {
        $payload['test_event_code'] = $settings['meta_test_event_code'];
    }

    $graphVersion = defined('META_GRAPH_VERSION') ? META_GRAPH_VERSION : 'v25.0';
    $result = graph_request(
        'https://graph.facebook.com/' . rawurlencode($graphVersion) . '/' . rawurlencode($metaPixelId) . '/events?access_token=' . rawurlencode($accessToken),
        $payload
    );

    json_response($result['status'] >= 200 && $result['status'] < 300 ? 200 : 502, [
        'ok' => $result['status'] >= 200 && $result['status'] < 300,
        'result' => $result['data'],
    ]);
} catch (Throwable $error) {
    json_response(500, ['ok' => false, 'error' => $error->getMessage()]);
}
