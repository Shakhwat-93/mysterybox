<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

set_api_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

$orderId = '';
$claimed = null;

function courier_api_key(): string
{
    $rows = supabase_request('GET', 'courier_settings?select=api_key&id=eq.main');
    $savedKey = trim((string) ($rows[0]['api_key'] ?? ''));
    if ($savedKey !== '') {
        return $savedKey;
    }

    if (defined('BDCOURIER_API_KEY')) {
        $fallback = trim((string) BDCOURIER_API_KEY);
        if ($fallback !== '' && $fallback !== 'your-bdcourier-api-key') {
            return $fallback;
        }
    }

    return '';
}

try {
    require_admin();
    $body = read_json_body();
    $orderId = (string) ($body['orderId'] ?? '');
    $forceRetry = ($body['force'] ?? false) === true;

    if ($orderId === '') {
        json_response(400, ['ok' => false, 'error' => 'Missing orderId.']);
    }

    if ($forceRetry) {
        supabase_request(
            'PATCH',
            'orders?id=eq.' . rawurlencode($orderId) . '&courier_check_status=eq.error',
            [
                'courier_check_status' => 'pending',
                'courier_checked_at' => null,
                'courier_check_result' => null,
                'courier_check_error' => null,
            ]
        );
    }

    $claimedRows = supabase_rpc('claim_courier_check', ['target_order_id' => $orderId]);
    $claimed = $claimedRows[0] ?? null;

    if (!$claimed) {
        $existingRows = supabase_request(
            'GET',
            'orders?select=id,courier_check_status,courier_checked_at,courier_check_result,courier_check_error,updated_at&id=eq.' . rawurlencode($orderId)
        );
        $existing = $existingRows[0] ?? null;
        if (($existing['courier_check_status'] ?? '') === 'checking' && empty($existing['courier_checked_at'])) {
            json_response(200, [
                'ok' => false,
                'pending' => true,
                'cached' => true,
                'order' => $existing,
                'error' => 'Courier check is still processing. Retry after a few seconds.',
            ]);
        }
        json_response(200, ['ok' => true, 'cached' => true, 'order' => $existing]);
    }

    $apiKey = courier_api_key();
    if ($apiKey === '') {
        throw new RuntimeException('Missing courier API key. Set it from Admin > Courier Setup.');
    }

    $curl = curl_init('https://api.bdcourier.com/courier-check');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => json_encode(['phone' => normalize_phone((string) ($claimed['phone'] ?? ''))], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 8,
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
    if (!empty($claimed['id'])) {
        try {
            supabase_request(
                'PATCH',
                'orders?id=eq.' . rawurlencode((string) $claimed['id']),
                [
                    'courier_check_status' => 'error',
                    'courier_checked_at' => gmdate('c'),
                    'courier_check_result' => null,
                    'courier_check_error' => $error->getMessage(),
                ]
            );
        } catch (Throwable $ignored) {
        }
    }
    json_response(500, ['ok' => false, 'error' => $error->getMessage()]);
}
