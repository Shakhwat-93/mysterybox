<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function set_api_headers(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function json_response(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function supabase_request(string $method, string $path, ?array $body = null, array $headers = []): array
{
    $url = rtrim(SUPABASE_URL, '/') . '/rest/v1/' . ltrim($path, '/');
    $curl = curl_init($url);
    $baseHeaders = [
        'apikey: ' . SUPABASE_SERVICE_ROLE_KEY,
        'Authorization: Bearer ' . SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type: application/json',
    ];

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => array_merge($baseHeaders, $headers),
        CURLOPT_TIMEOUT => 25,
    ]);

    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    $raw = curl_exec($curl);
    $error = curl_error($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($raw === false) {
        throw new RuntimeException($error ?: 'Supabase request failed.');
    }

    $data = json_decode($raw, true);
    if ($status >= 400) {
        $message = is_array($data) ? ($data['message'] ?? $data['hint'] ?? $raw) : $raw;
        throw new RuntimeException((string) $message);
    }

    return is_array($data) ? $data : [];
}

function supabase_rpc(string $functionName, array $body = []): array
{
    return supabase_request('POST', 'rpc/' . rawurlencode($functionName), $body);
}

function supabase_auth_user(string $token): ?array
{
    $url = rtrim(SUPABASE_URL, '/') . '/auth/v1/user';
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . SUPABASE_SERVICE_ROLE_KEY,
            'Authorization: Bearer ' . $token,
        ],
        CURLOPT_TIMEOUT => 20,
    ]);

    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($raw === false || $status >= 400) return null;
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function bearer_token(): string
{
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', (string) $authorization, $match)) {
        return $match[1];
    }
    return '';
}

function require_admin(): array
{
    $token = bearer_token();
    if ($token === '') {
        json_response(401, ['ok' => false, 'error' => 'Missing admin session.']);
    }

    $user = supabase_auth_user($token);
    $userId = $user['id'] ?? null;
    if (!$userId) {
        json_response(401, ['ok' => false, 'error' => 'Invalid admin session.']);
    }

    $profiles = supabase_request('GET', 'profiles?select=is_admin&id=eq.' . rawurlencode((string) $userId));
    if (empty($profiles[0]['is_admin'])) {
        json_response(403, ['ok' => false, 'error' => 'Admin access required.']);
    }

    return $user;
}

function graph_request(string $url, array $payload): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 25,
    ]);

    $raw = curl_exec($curl);
    $error = curl_error($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if ($raw === false) {
        throw new RuntimeException($error ?: 'Meta request failed.');
    }

    $data = json_decode($raw, true);
    return ['status' => $status, 'data' => is_array($data) ? $data : ['raw' => $raw]];
}

function normalize_meta_pixel_id(?string $value): string
{
    $text = (string) $value;
    if (preg_match('/fbq\(\s*[\'"]init[\'"]\s*,\s*[\'"]?(\d{6,30})/i', $text, $match)) {
        return $match[1];
    }
    if (preg_match('/facebook\.com\/tr\?id=(\d{6,30})/i', $text, $match)) {
        return $match[1];
    }
    if (preg_match('/\b\d{6,30}\b/', $text, $match)) {
        return $match[0];
    }
    return '';
}

function normalize_gtm_container_id(?string $value): string
{
    if (preg_match('/GTM-[A-Z0-9]+/i', (string) $value, $match)) {
        return strtoupper($match[0]);
    }
    return '';
}

function normalize_phone(?string $value): string
{
    return preg_replace('/[\s-]+/', '', (string) $value) ?? '';
}

function normalize_bd_phone(?string $value): string
{
    $digits = preg_replace('/\D+/', '', (string) $value) ?? '';
    if (substr($digits, 0, 4) === '8801') return $digits;
    if (substr($digits, 0, 2) === '01') return '88' . $digits;
    return $digits;
}

function client_ip(): string
{
    $source = $_SERVER['HTTP_CF_CONNECTING_IP']
        ?? $_SERVER['HTTP_X_FORWARDED_FOR']
        ?? $_SERVER['HTTP_X_REAL_IP']
        ?? $_SERVER['REMOTE_ADDR']
        ?? '';
    return trim(explode(',', (string) $source)[0]);
}

function sha256_or_null(?string $value): ?string
{
    $normalized = strtolower(trim((string) $value));
    return $normalized === '' ? null : hash('sha256', $normalized);
}

function split_name(?string $value): array
{
    $parts = preg_split('/\s+/', strtolower(trim((string) $value))) ?: [];
    $parts = array_values(array_filter($parts));
    return [
        'firstName' => $parts[0] ?? '',
        'lastName' => count($parts) > 1 ? $parts[count($parts) - 1] : '',
    ];
}

function clean_nulls(array $value): array
{
    return array_filter($value, static fn ($item) => $item !== null && $item !== '');
}
