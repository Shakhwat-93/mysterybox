<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

set_api_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

const TIKTOK_EVENTS_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
const TIKTOK_ALLOWED_EVENTS = ['ViewContent', 'InitiateCheckout', 'CompletePayment'];

function tiktok_complete_payment_properties(array $properties): array
{
    $orderId = (string) ($properties['order_id'] ?? '');
    if ($orderId === '') return $properties;

    $rows = supabase_request(
        'GET',
        'orders?select=id,package_count,subtotal,total&id=eq.' . rawurlencode($orderId)
    );
    $order = $rows[0] ?? null;
    if (!$order) {
        throw new RuntimeException('Order not found.');
    }

    return [
        'value' => (float) ($order['total'] ?? 0),
        'currency' => 'BDT',
        'content_type' => 'product',
        'contents' => [[
            'content_id' => 'mystery-box-' . (string) ($order['package_count'] ?? ''),
            'content_name' => (string) ($order['package_count'] ?? '') . ' Packet Mystery Box',
            'content_category' => 'Mystery Box',
            'quantity' => (int) ($order['package_count'] ?? 1),
            'price' => (float) ($order['subtotal'] ?? 0),
        ]],
        'order_id' => $order['id'],
    ];
}

function tiktok_user(array $body, string $eventId): array
{
    $customer = is_array($body['customer'] ?? null) ? $body['customer'] : [];
    $nameParts = split_name((string) ($customer['name'] ?? ''));

    return clean_nulls([
        'phone' => sha256_or_null(normalize_bd_phone((string) ($customer['phone'] ?? ''))),
        'external_id' => sha256_or_null($eventId ?: (string) ($customer['phone'] ?? '') ?: (string) ($customer['name'] ?? '')),
        'fn' => sha256_or_null($nameParts['firstName'] ?: (string) ($customer['name'] ?? '')),
        'ln' => sha256_or_null($nameParts['lastName']),
        'ttp' => (string) ($body['ttp'] ?? ($_COOKIE['_ttp'] ?? '')),
        'ttclid' => (string) ($body['ttclid'] ?? ''),
        'ip' => client_ip() ?: null,
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
    ]);
}

function tiktok_request(array $payload, string $accessToken): array
{
    $curl = curl_init(TIKTOK_EVENTS_URL);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Access-Token: ' . $accessToken,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 25,
    ]);

    $raw = curl_exec($curl);
    $error = curl_error($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($raw === false) {
        throw new RuntimeException($error ?: 'TikTok Events API request failed.');
    }

    $data = json_decode($raw, true);
    return ['status' => $status, 'data' => is_array($data) ? $data : ['raw' => $raw]];
}

try {
    $settingsRows = supabase_request(
        'GET',
        'pixel_settings?select=tiktok_pixel_id,tiktok_events_enabled,tiktok_access_token,tiktok_test_event_code&id=eq.main'
    );
    $settings = $settingsRows[0] ?? [];
    $pixelId = normalize_tiktok_pixel_id($settings['tiktok_pixel_id'] ?? '');
    $accessToken = trim((string) ($settings['tiktok_access_token'] ?? ''));

    if (!($settings['tiktok_events_enabled'] ?? false) || !$pixelId || !$accessToken) {
        json_response(200, ['ok' => false, 'skipped' => true, 'reason' => 'TikTok Events API is not configured.']);
    }

    $body = read_json_body();
    $eventName = (string) ($body['eventName'] ?? '');
    if (!in_array($eventName, TIKTOK_ALLOWED_EVENTS, true)) {
        json_response(400, ['ok' => false, 'error' => 'Unsupported TikTok event.']);
    }

    $eventId = (string) ($body['eventId'] ?? bin2hex(random_bytes(16)));
    $properties = is_array($body['properties'] ?? null) ? $body['properties'] : [];
    if ($eventName === 'CompletePayment') {
        $properties = tiktok_complete_payment_properties($properties);
    }

    $event = [
        'event' => $eventName,
        'event_time' => time(),
        'event_id' => $eventId,
        'user' => tiktok_user($body, $eventId),
        'properties' => $properties,
        'page' => clean_nulls([
            'url' => (string) ($body['eventSourceUrl'] ?? ($_SERVER['HTTP_REFERER'] ?? '')),
            'referrer' => (string) ($body['referrer'] ?? ''),
        ]),
    ];

    if (!empty($settings['tiktok_test_event_code'])) {
        $event['test_event_code'] = (string) $settings['tiktok_test_event_code'];
    }

    $result = tiktok_request([
        'event_source' => 'web',
        'event_source_id' => $pixelId,
        'data' => [$event],
    ], $accessToken);

    json_response($result['status'] >= 200 && $result['status'] < 300 ? 200 : 502, [
        'ok' => $result['status'] >= 200 && $result['status'] < 300,
        'result' => $result['data'],
    ]);
} catch (Throwable $error) {
    json_response(500, ['ok' => false, 'error' => $error->getMessage()]);
}
