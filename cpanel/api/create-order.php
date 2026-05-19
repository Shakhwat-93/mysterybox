<?php
declare(strict_types=1);

require_once __DIR__ . '/common.php';

set_api_headers();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(405, ['error' => 'Method not allowed']);
}

const DUPLICATE_MESSAGE = "আপনি ইতিমধ্যে একটি অর্ডার দিয়েছেন তাই আর অর্ডার দিতে পারবেন না। বারবার অর্ডার দেওয়ার চেষ্টা করলে আপনার অর্ডারটি বাতিল হয়ে যেতে পারে। অর্ডার দেওয়ার ২৪ঘন্টা পরও যদি আপনার অর্ডার কনফার্ম করা না হয় তাহলে এসএমএস করুন👇\nWhatsApp : 01853864664";
const WHITELISTED_PHONES = ['01315183993', '01853864664'];

try {
    $body = read_json_body();
    $name = trim((string) ($body['name'] ?? ''));
    $phone = normalize_phone((string) ($body['phone'] ?? ''));
    $address = trim((string) ($body['address'] ?? ''));
    $packageCount = (int) ($body['packageCount'] ?? 0);

    if ($name === '') json_response(400, ['ok' => false, 'error' => 'আপনার নাম লিখুন']);
    if (!preg_match('/^01[3-9]\d{8}$/', $phone)) json_response(400, ['ok' => false, 'error' => 'সঠিক ১১ সংখ্যার মোবাইল নাম্বার দিন']);
    $addressLength = function_exists('mb_strlen') ? mb_strlen($address) : strlen($address);
    if ($addressLength < 12) json_response(400, ['ok' => false, 'error' => 'ডেলিভারির জন্য সম্পূর্ণ ঠিকানা লিখুন']);
    if ($packageCount <= 0) json_response(400, ['ok' => false, 'error' => 'সঠিক প্যাকেট সিলেক্ট করুন']);

    $settingsRows = supabase_request(
        'GET',
        'site_settings?select=price_per_packet,delivery_charge,order_block_days&id=eq.main'
    );
    $packageRows = supabase_request(
        'GET',
        'package_options?select=packet_count,is_available,stock_quantity&packet_count=eq.' . rawurlencode((string) $packageCount)
    );

    $settings = $settingsRows[0] ?? [];
    $selectedPackage = $packageRows[0] ?? null;

    if (!$selectedPackage || !($selectedPackage['is_available'] ?? false) || (int) ($selectedPackage['stock_quantity'] ?? 0) <= 0) {
        json_response(409, ['ok' => false, 'error' => 'এই প্যাকেটটি এখন অর্ডার করা যাবে না।']);
    }

    $deviceHash = sha256_or_null((string) ($body['deviceId'] ?? ''));
    $ipHash = sha256_or_null(client_ip());
    $blockDays = max(0, (int) ($settings['order_block_days'] ?? 15));
    $bypassDuplicateGuard = in_array($phone, WHITELISTED_PHONES, true);

    if (!$bypassDuplicateGuard && $blockDays > 0 && ($deviceHash || $ipHash)) {
        $since = gmdate('c', time() - ($blockDays * 24 * 60 * 60));
        $filters = [];
        if ($deviceHash) $filters[] = 'device_hash.eq.' . $deviceHash;
        if ($ipHash) $filters[] = 'ip_hash.eq.' . $ipHash;
        $duplicateRows = supabase_request(
            'GET',
            'orders?select=id,created_at&created_at=gte.' . rawurlencode($since) .
            '&or=(' . implode(',', $filters) . ')&order=created_at.desc&limit=1'
        );

        if (!empty($duplicateRows)) {
            json_response(409, [
                'ok' => false,
                'blocked' => true,
                'message' => DUPLICATE_MESSAGE,
                'duplicateOrderId' => $duplicateRows[0]['id'] ?? null,
            ]);
        }
    }

    $pricePerPacket = (int) ($settings['price_per_packet'] ?? 59);
    $deliveryCharge = (int) ($settings['delivery_charge'] ?? 99);
    $subtotal = $packageCount * $pricePerPacket;
    $total = $subtotal + $deliveryCharge;

    $orderPayload = [
        'id' => bin2hex(random_bytes(4)) . '-' . bin2hex(random_bytes(2)) . '-4' . substr(bin2hex(random_bytes(2)), 1) . '-' . dechex(random_int(8, 11)) . substr(bin2hex(random_bytes(2)), 1) . '-' . bin2hex(random_bytes(6)),
        'customer_name' => $name,
        'phone' => $phone,
        'address' => $address,
        'package_count' => $packageCount,
        'subtotal' => $subtotal,
        'delivery_charge' => $deliveryCharge,
        'total' => $total,
        'device_hash' => $deviceHash,
        'ip_hash' => $ipHash,
    ];

    $created = supabase_request(
        'POST',
        'orders?select=id,package_count,subtotal,delivery_charge,total',
        $orderPayload,
        ['Prefer: return=representation']
    );

    json_response(200, ['ok' => true, 'order' => $created[0] ?? $orderPayload]);
} catch (Throwable $error) {
    json_response(500, ['ok' => false, 'error' => $error->getMessage()]);
}
