import crypto from 'node:crypto';
import { createServiceClient, getClientIp, json, setCors } from './_supabase.js';

const WHITELISTED_PHONES = new Set(['01315183993', '01853864664']);

const duplicateMessage =
  'আপনি ইতিমধ্যে একটি অর্ডার দিয়েছেন তাই আর অর্ডার দিতে পারবেন না। বারবার অর্ডার দেওয়ার চেষ্টা করলে আপনার অর্ডারটি বাতিল হয়ে যেতে পারে। অর্ডার দেওয়ার ২৪ঘন্টা পরও যদি আপনার অর্ডার কনফার্ম করা না হয় তাহলে এসএমএস করুন👇\nWhatsApp : 01853864664';

function normalizePhone(value) {
  return String(value || '').replace(/[\s-]/g, '');
}

function sha256(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function validateOrder(body) {
  const name = String(body.name || '').trim();
  const phone = normalizePhone(body.phone);
  const address = String(body.address || '').trim();
  const packageCount = Number(body.packageCount);

  if (!name) return { error: 'আপনার নাম লিখুন' };
  if (!/^01[3-9]\d{8}$/.test(phone)) return { error: 'সঠিক ১১ সংখ্যার মোবাইল নাম্বার দিন' };
  if (address.length < 12) return { error: 'ডেলিভারির জন্য সম্পূর্ণ ঠিকানা লিখুন' };
  if (!Number.isInteger(packageCount) || packageCount <= 0) return { error: 'সঠিক প্যাকেট সিলেক্ট করুন' };

  return { name, phone, address, packageCount };
}

async function findDuplicateOrder(supabase, { deviceHash, ipHash, blockDays }) {
  if (!blockDays || blockDays <= 0 || (!deviceHash && !ipHash)) return null;

  const since = new Date(Date.now() - blockDays * 24 * 60 * 60 * 1000).toISOString();
  const filters = [];
  if (deviceHash) filters.push(`device_hash.eq.${deviceHash}`);
  if (ipHash) filters.push(`ip_hash.eq.${ipHash}`);

  const { data, error } = await supabase
    .from('orders')
    .select('id,created_at')
    .gte('created_at', since)
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const validated = validateOrder(body);
    if (validated.error) {
      json(res, 400, { ok: false, error: validated.error });
      return;
    }

    const supabase = createServiceClient();
    const { name, phone, address, packageCount } = validated;
    const bypassDuplicateGuard = WHITELISTED_PHONES.has(phone);
    const deviceHash = sha256(body.deviceId);
    const ipHash = sha256(getClientIp(req));

    const [settingsResult, packageResult] = await Promise.all([
      supabase
        .from('site_settings')
        .select('price_per_packet,delivery_charge,order_block_days')
        .eq('id', 'main')
        .maybeSingle(),
      supabase
        .from('package_options')
        .select('packet_count,is_available,stock_quantity')
        .eq('packet_count', packageCount)
        .maybeSingle(),
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (packageResult.error) throw packageResult.error;

    const selectedPackage = packageResult.data;
    if (!selectedPackage?.is_available || Number(selectedPackage.stock_quantity || 0) <= 0) {
      json(res, 409, { ok: false, error: 'এই প্যাকেটটি এখন অর্ডার করা যাবে না।' });
      return;
    }

    const settings = settingsResult.data || {};
    const blockDays = Math.max(0, Number(settings.order_block_days ?? 15));

    if (!bypassDuplicateGuard) {
      const duplicate = await findDuplicateOrder(supabase, { deviceHash, ipHash, blockDays });
      if (duplicate) {
        json(res, 409, {
          ok: false,
          blocked: true,
          message: duplicateMessage,
          duplicateOrderId: duplicate.id,
        });
        return;
      }
    }

    const pricePerPacket = Number(settings.price_per_packet || 59);
    const deliveryCharge = Number(settings.delivery_charge || 99);
    const subtotal = packageCount * pricePerPacket;
    const total = subtotal + deliveryCharge;
    const orderId = crypto.randomUUID();

    const { data: order, error: insertError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        customer_name: name,
        phone,
        address,
        package_count: packageCount,
        subtotal,
        delivery_charge: deliveryCharge,
        total,
        device_hash: deviceHash,
        ip_hash: ipHash,
      })
      .select('id,package_count,subtotal,delivery_charge,total')
      .single();

    if (insertError) throw insertError;

    json(res, 200, { ok: true, order });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}
