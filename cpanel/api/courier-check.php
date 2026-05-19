<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

set_api_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

try {
    require_admin();
    $body = read_json_body();
    $orderId = (string) ($body['orderId'] ?? '');

    if ($orderId === '') {
        json_response(400, ['ok' => false, 'error' => 'Missing orderId.']);
    }

    $claimedRows = supabase_rpc('claim_courier_check', ['target_order_id' => $orderId]);
    $claimed = $claimedRows[0] ?? null;

    if (!$claimed) {
        $existingRows = supabase_request(
            'GET',
            'orders?select=id,courier_check_status,courier_checked_at,courier_check_result,courier_check_error&id=eq.' . rawurlencode($orderId)
        );
        json_response(200, ['ok' => true, 'cached' => true, 'order' => $existingRows[0] ?? null]);
    }

    if (!defined('BDCOURIER_API_KEY') || BDCOURIER_API_KEY === '' || BDCOURIER_API_KEY === 'your-bdcourier-api-key') {
        throw new RuntimeException('Missing BDCOURIER_API_KEY.');
    }

    $curl = curl_init('https://api.bdcourier.com/courier-check');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . BDCOURIER_API_KEY,
        ],
        CURLOPT_POSTFIELDS => json_encode(['phone' => normalize_phone((string) ($claimed['phone'] ?? ''))], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 25,
    ]);

    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($raw === false) {
        throw new RuntimeException($error ?: 'Courier API request failed.');
    }

    $result = json_decode($raw, true);
    if (!is_array($result)) $result = ['raw' => $raw];
    $success = $status >= 200 && $status < 300 && (($result['status'] ?? '') !== 'error');

    $payload = $success
        ? [
            'courier_check_status' => 'success',
            'courier_checked_at' => gmdate('c'),
            'courier_check_result' => $result,
            'courier_check_error' => null,
        ]
        : [
            'courier_check_status' => 'error',
            'courier_checked_at' => gmdate('c'),
            'courier_check_result' => $result,
            'courier_check_error' => (string) ($result['message'] ?? $result['error'] ?? ('Courier API failed with status ' . $status)),
        ];

    $updatedRows = supabase_request(
        'PATCH',
        'orders?id=eq.' . rawurlencode($orderId) . '&select=id,courier_check_status,courier_checked_at,courier_check_result,courier_check_error',
        $payload,
        ['Prefer: return=representation']
    );

    json_response(200, [
        'ok' => $success,
        'cached' => false,
        'order' => $updatedRows[0] ?? null,
        'error' => $success ? null : $payload['courier_check_error'],
    ]);
} catch (Throwable $error) {
    json_response(500, ['ok' => false, 'error' => $error->getMessage()]);
}
