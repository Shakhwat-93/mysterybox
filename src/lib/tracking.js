let configPromise;
let pixelInitialized = false;
let gtmInitialized = false;

function isAdminRoute() {
  return window.location.pathname.replace(/\/$/, '') === '/admin' || window.location.hash === '#/admin';
}

function loadScript(id, src) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function initMetaPixel(pixelId) {
  if (!pixelId || pixelInitialized) return;

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

  window.fbq('init', pixelId);
  pixelInitialized = true;
}

function initGtm(containerId) {
  if (!containerId || gtmInitialized) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  loadScript('gtm-script', `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`);
  gtmInitialized = true;
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

  if (config.gtmEnabled) initGtm(config.gtmContainerId);
  if (config.metaPixelEnabled) initMetaPixel(config.metaPixelId);
  if (config.metaPixelEnabled && window.fbq) window.fbq('track', 'PageView');

  return config;
}

export function createEventId(prefix = 'event') {
  if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function trackPurchase({ eventId, orderId, packageCount, subtotal, deliveryCharge, total, customer }) {
  if (typeof window === 'undefined' || isAdminRoute()) return;

  const config = await getPixelConfig();
  const customData = {
    value: Number(total || 0),
    currency: 'BDT',
    content_ids: [`mystery-box-${packageCount}`],
    content_name: `${packageCount} Packet Mystery Box`,
    content_type: 'product',
    num_items: Number(packageCount || 0),
    order_id: orderId,
  };

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'purchase',
    event_id: eventId,
    ecommerce: {
      transaction_id: orderId,
      value: Number(total || 0),
      currency: 'BDT',
      shipping: Number(deliveryCharge || 0),
      items: [
        {
          item_id: `mystery-box-${packageCount}`,
          item_name: `${packageCount} Packet Mystery Box`,
          price: Number(subtotal || 0),
          quantity: 1,
        },
      ],
    },
  });

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
