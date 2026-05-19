let configPromise;
let pixelInitialized = false;
let gtmInitialized = false;
let viewItemTracked = false;
let beginCheckoutTracked = false;

function isAdminRoute() {
  return window.location.pathname.replace(/\/$/, '') === '/admin' || window.location.hash === '#/admin';
}

function loadScript(id, src) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
}

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

function injectGtmNoScript(containerId) {
  if (!containerId || document.getElementById('gtm-noscript-frame')) return;
  const iframe = document.createElement('iframe');
  iframe.id = 'gtm-noscript-frame';
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(containerId)}`;
  iframe.height = '0';
  iframe.width = '0';
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(iframe, document.body.firstChild);
}

function initMetaPixel(pixelId) {
  const normalizedPixelId = normalizeMetaPixelId(pixelId);
  if (!normalizedPixelId || pixelInitialized) return;

  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */

  window.fbq('init', normalizedPixelId);
  pixelInitialized = true;
}

function initGtm(containerId) {
  const normalizedContainerId = normalizeGtmContainerId(containerId);
  if (!normalizedContainerId || gtmInitialized) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  loadScript('gtm-script', `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(normalizedContainerId)}`);
  injectGtmNoScript(normalizedContainerId);
  gtmInitialized = true;
}

function ensureTrackingReady(config) {
  if (config?.gtmEnabled) initGtm(config.gtmContainerId);
  if (config?.metaPixelEnabled) initMetaPixel(config.metaPixelId);
}

export async function getPixelConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/pixel-config')
      .then((response) => response.json())
      .catch(() => ({
        metaPixelEnabled: false,
        metaPixelId: '',
        metaCapiEnabled: false,
        gtmEnabled: false,
        gtmContainerId: '',
      }));
  }

  return configPromise;
}

export async function initializeTracking() {
  if (typeof window === 'undefined' || isAdminRoute()) return null;

  window.dataLayer = window.dataLayer || [];
  const config = await getPixelConfig();

  ensureTrackingReady(config);
  if (config.metaPixelEnabled && window.fbq) window.fbq('track', 'PageView');

  return config;
}

export function createEventId(prefix = 'event') {
  if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function buildItem({ packageCount, subtotal }) {
  return {
    item_id: `mystery-box-${packageCount}`,
    item_name: `${packageCount} Packet Mystery Box`,
    item_category: 'Mystery Box',
    price: Number(subtotal || 0),
    quantity: 1,
  };
}

function normalizeCustomer(customer = {}) {
  const phone = String(customer.phone || '').replace(/[\s-]/g, '');
  const name = String(customer.name || '').trim();
  const address = String(customer.address || '').trim();

  return {
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
  };
}

function normalizeBdPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('8801')) return digits;
  if (digits.startsWith('01')) return `88${digits}`;
  return digits;
}

function splitName(value) {
  const parts = String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

async function sha256(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !window.crypto?.subtle) return '';

  const buffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function buildUserData(customer) {
  const normalized = normalizeCustomer(customer);
  const metaPhone = normalizeBdPhone(normalized.phone);
  const { firstName, lastName } = splitName(normalized.name);
  if (!normalized.name && !normalized.phone && !normalized.address) return {};

  const [phoneHash, firstNameHash, lastNameHash] = await Promise.all([
    sha256(metaPhone),
    sha256(firstName || normalized.name),
    sha256(lastName),
  ]);

  return {
    ...(normalized.phone ? { phone_number: normalized.phone } : {}),
    ...(normalized.name ? { name: normalized.name } : {}),
    ...(normalized.address ? { address: { street: normalized.address, country: 'BD' } } : {}),
    ...(phoneHash ? { sha256_phone_number: phoneHash, ph: phoneHash } : {}),
    ...(firstNameHash ? { sha256_first_name: firstNameHash, fn: firstNameHash } : {}),
    ...(lastNameHash ? { sha256_last_name: lastNameHash, ln: lastNameHash } : {}),
  };
}

function pushEcommerceEvent(eventName, ecommerce, extra = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({
    event: eventName,
    ...extra,
    ecommerce,
  });
}

export async function trackViewItem({ packageCount, subtotal, total }) {
  if (typeof window === 'undefined' || isAdminRoute() || viewItemTracked) return;
  viewItemTracked = true;

  const config = await getPixelConfig();
  ensureTrackingReady(config);
  const item = buildItem({ packageCount, subtotal });

  pushEcommerceEvent('view_item', {
    currency: 'BDT',
    value: Number(total || subtotal || 0),
    items: [item],
  });

  if (config.metaPixelEnabled && window.fbq) {
    window.fbq('track', 'ViewContent', {
      value: Number(total || subtotal || 0),
      currency: 'BDT',
      content_ids: [item.item_id],
      content_name: item.item_name,
      content_type: 'product',
    });
  }
}

export async function trackBeginCheckout({ packageCount, subtotal, deliveryCharge, total, customer, force = false }) {
  if (typeof window === 'undefined' || isAdminRoute() || (beginCheckoutTracked && !force)) return;
  if (!force) beginCheckoutTracked = true;

  const config = await getPixelConfig();
  ensureTrackingReady(config);
  const item = buildItem({ packageCount, subtotal });
  const customerDetails = normalizeCustomer(customer);
  const userData = await buildUserData(customer);

  pushEcommerceEvent(
    'begin_checkout',
    {
      currency: 'BDT',
      value: Number(total || 0),
      shipping: Number(deliveryCharge || 0),
      items: [item],
    },
    {
      ...(Object.keys(customerDetails).length ? { customer: customerDetails } : {}),
      ...(Object.keys(userData).length ? { user_data: userData } : {}),
    },
  );

  if (config.metaPixelEnabled && window.fbq) {
    window.fbq('track', 'InitiateCheckout', {
      value: Number(total || 0),
      currency: 'BDT',
      content_ids: [item.item_id],
      content_name: item.item_name,
      content_type: 'product',
      num_items: Number(packageCount || 0),
    });
  }
}

export async function trackPurchase({ eventId, orderId, packageCount, subtotal, deliveryCharge, total, customer }) {
  if (typeof window === 'undefined' || isAdminRoute()) return;

  const config = await getPixelConfig();
  ensureTrackingReady(config);
  const item = buildItem({ packageCount, subtotal });
  const customerDetails = normalizeCustomer(customer);
  const userData = await buildUserData(customer);
  const customData = {
    value: Number(total || 0),
    currency: 'BDT',
    content_ids: [item.item_id],
    content_name: item.item_name,
    content_type: 'product',
    num_items: Number(packageCount || 0),
    order_id: orderId,
  };

  pushEcommerceEvent(
    'purchase',
    {
      transaction_id: orderId,
      value: Number(total || 0),
      currency: 'BDT',
      shipping: Number(deliveryCharge || 0),
      items: [item],
    },
    {
      event_id: eventId,
      order_id: orderId,
      customer: customerDetails,
      user_data: userData,
    },
  );

  if (config.metaPixelEnabled && window.fbq) {
    window.fbq('track', 'Purchase', customData, { eventID: eventId });
  }

  if (config.metaCapiEnabled) {
    fetch('/api/meta-capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId,
        eventSourceUrl: window.location.href,
        customData,
        customer,
      }),
      keepalive: true,
    }).catch(() => {});
  }
}
