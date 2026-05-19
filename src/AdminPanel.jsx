import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert,
  ShoppingBag,
  XCircle,
} from 'lucide-react';
import { defaultPackages, defaultSettings } from './defaults';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'content', label: 'Content', icon: Settings },
  { id: 'pixel', label: 'Pixel Setup', icon: Settings },
  { id: 'stock', label: 'Stock', icon: Boxes },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
];

const orderStatuses = ['pending', 'confirmed', 'delivered', 'cancelled'];

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

const defaultPixelSettings = {
  id: 'main',
  meta_pixel_enabled: false,
  meta_pixel_id: '',
  meta_capi_enabled: false,
  meta_access_token: '',
  meta_test_event_code: '',
  gtm_enabled: false,
  gtm_container_id: '',
};

function AdminPanel() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(defaultSettings);
  const [pixelSettings, setPixelSettings] = useState(defaultPixelSettings);
  const [packages, setPackages] = useState(defaultPackages);
  const [orders, setOrders] = useState([]);
  const [courierCheckingIds, setCourierCheckingIds] = useState(new Set());
  const [newPackage, setNewPackage] = useState({
    packet_count: '',
    label: '',
    badge: '',
    stock_quantity: 0,
    is_available: true,
    display_order: 99,
  });

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const pendingOrders = orders.filter((order) => order.status === 'pending').length;
    const revenue = orders
      .filter((order) => order.status !== 'cancelled')
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const availablePackages = packages.filter((item) => item.is_available && item.stock_quantity > 0).length;

    return { totalOrders, pendingOrders, revenue, availablePackages };
  }, [orders, packages]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        await loadAdminData(data.session.user.id);
      } else {
        setLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        loadAdminData(nextSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadAdminData = async (userId = session?.user?.id) => {
    if (!isSupabaseConfigured || !userId) return;

    setLoading(true);
    setNotice('');

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id,email,is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profileData?.is_admin) {
      setProfile(profileData || null);
      setLoading(false);
      return;
    }

    setProfile(profileData);

    const [settingsResult, pixelResult, packagesResult, ordersResult] = await Promise.all([
      supabase.from('site_settings').select('*').eq('id', 'main').maybeSingle(),
      supabase.from('pixel_settings').select('*').eq('id', 'main').maybeSingle(),
      supabase.from('package_options').select('*').order('display_order', { ascending: true }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    if (settingsResult.data) setSettings({ ...defaultSettings, ...settingsResult.data });
    if (pixelResult.data) setPixelSettings({ ...defaultPixelSettings, ...pixelResult.data });
    if (packagesResult.data?.length) setPackages(packagesResult.data);
    if (ordersResult.data) setOrders(ordersResult.data);

    const firstError = settingsResult.error || pixelResult.error || packagesResult.error || ordersResult.error;
    if (firstError) setNotice(firstError.message);

    setLoading(false);
  };

  const signIn = async (event) => {
    event.preventDefault();
    setAuthError('');

    const { error } = await supabase.auth.signInWithPassword(authForm);
    if (error) setAuthError(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.hash = '';
  };

  useEffect(() => {
    if (!session?.access_token || !profile?.is_admin || !orders.length) return;

    const uncheckedOrders = orders.filter(
      (order) =>
        !order.courier_checked_at &&
        order.courier_check_status !== 'checking' &&
        !courierCheckingIds.has(order.id),
    );

    if (!uncheckedOrders.length) return;
    uncheckedOrders.slice(0, 3).forEach((order) => checkCourier(order.id));
  }, [orders, session?.access_token, profile?.is_admin, courierCheckingIds]);

  const checkCourier = async (orderId) => {
    if (!session?.access_token || courierCheckingIds.has(orderId)) return;

    setCourierCheckingIds((current) => new Set(current).add(orderId));
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId && !order.courier_checked_at
          ? { ...order, courier_check_status: 'checking' }
          : order,
      ),
    );

    let timeout;
    try {
      const controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 14000);
      const response = await fetch('/api/courier-check', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
        signal: controller.signal,
      }).then((result) => result.json());
      window.clearTimeout(timeout);

      if (response.pending) {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  ...response.order,
                  courier_check_status: 'error',
                  courier_check_error: response.error || 'Courier check is still processing. Please retry.',
                }
              : order,
          ),
        );
      } else if (response.order) {
        setOrders((current) =>
          current.map((order) => (order.id === orderId ? { ...order, ...response.order } : order)),
        );
      } else if (response.error) {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? { ...order, courier_check_status: 'error', courier_check_error: response.error }
              : order,
          ),
        );
      }
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Courier API response took too long.' : error.message;
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? { ...order, courier_check_status: 'error', courier_check_error: message }
            : order,
        ),
      );
    } finally {
      if (timeout) window.clearTimeout(timeout);
      setCourierCheckingIds((current) => {
        const next = new Set(current);
        next.delete(orderId);
        return next;
      });
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setNotice('');
    const { error } = await supabase.from('site_settings').upsert({ ...settings, id: 'main' });
    setSaving(false);
    setNotice(error ? error.message : 'Content settings saved.');
  };

  const savePixelSettings = async () => {
    setSaving(true);
    setNotice('');
    const metaPixelId = normalizeMetaPixelId(pixelSettings.meta_pixel_id);
    const gtmContainerId = normalizeGtmContainerId(pixelSettings.gtm_container_id);
    const payload = {
      ...pixelSettings,
      id: 'main',
      meta_pixel_enabled: Boolean(pixelSettings.meta_pixel_enabled || metaPixelId),
      meta_pixel_id: metaPixelId,
      meta_capi_enabled: Boolean(pixelSettings.meta_capi_enabled || (metaPixelId && pixelSettings.meta_access_token)),
      meta_access_token: String(pixelSettings.meta_access_token || '').trim(),
      meta_test_event_code: String(pixelSettings.meta_test_event_code || '').trim(),
      gtm_enabled: Boolean(pixelSettings.gtm_enabled || gtmContainerId),
      gtm_container_id: gtmContainerId,
    };
    const { error } = await supabase.from('pixel_settings').upsert(payload);
    setSaving(false);
    setNotice(error ? error.message : 'Pixel settings saved.');
  };

  const updatePackage = async (item, patch) => {
    const next = { ...item, ...patch };
    setPackages((current) => current.map((packageItem) => (packageItem.id === item.id ? next : packageItem)));
    const { error } = await supabase.from('package_options').update(patch).eq('id', item.id);
    setNotice(error ? error.message : 'Package updated.');
    if (error) loadAdminData();
  };

  const addPackage = async () => {
    const payload = {
      ...newPackage,
      packet_count: Number(newPackage.packet_count),
      stock_quantity: Number(newPackage.stock_quantity || 0),
      display_order: Number(newPackage.display_order || 99),
    };

    if (!payload.packet_count || !payload.label.trim()) {
      setNotice('Packet count and label are required.');
      return;
    }

    const { error } = await supabase.from('package_options').insert(payload);
    setNotice(error ? error.message : 'New package added.');
    if (!error) {
      setNewPackage({
        packet_count: '',
        label: '',
        badge: '',
        stock_quantity: 0,
        is_available: true,
        display_order: 99,
      });
      loadAdminData();
    }
  };

  const updateOrderStatus = async (order, status) => {
    setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, status } : item)));
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id);
    setNotice(error ? error.message : 'Order status updated.');
    if (error) loadAdminData();
  };

  if (!isSupabaseConfigured) {
    return <AdminShell warning="Supabase environment variables are missing. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." />;
  }

  if (loading) {
    return <AdminShell loading />;
  }

  if (!session) {
    return (
      <AdminShell>
        <form onSubmit={signIn} className="mx-auto max-w-md rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-zinc-100">
          <h1 className="text-3xl font-extrabold text-ink">Admin Login</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Login with your Supabase Auth admin account.</p>
          <label className="mt-6 block text-sm font-bold text-ink">
            Email
            <input
              type="email"
              value={authForm.email}
              onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
              className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-offer-500 focus:ring-4 focus:ring-orange-100"
              required
            />
          </label>
          <label className="mt-4 block text-sm font-bold text-ink">
            Password
            <input
              type="password"
              value={authForm.password}
              onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
              className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-offer-500 focus:ring-4 focus:ring-orange-100"
              required
            />
          </label>
          {authError ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{authError}</p> : null}
          <button className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-offer-600 px-5 py-3 font-bold text-white">
            Login
          </button>
        </form>
      </AdminShell>
    );
  }

  if (!profile?.is_admin) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-2xl rounded-[2rem] bg-white p-6 text-center shadow-soft ring-1 ring-zinc-100">
          <ShieldAlert className="mx-auto h-12 w-12 text-offer-600" />
          <h1 className="mt-4 text-3xl font-extrabold text-ink">Admin access needed</h1>
          <p className="mt-3 leading-7 text-zinc-600">
            Your account is logged in, but it is not marked as admin in the `profiles` table.
          </p>
          <button onClick={signOut} className="mt-6 rounded-2xl bg-ink px-5 py-3 font-bold text-white">
            Sign out
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell profile={profile} onRefresh={() => loadAdminData()} onSignOut={signOut}>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[250px_1fr] lg:px-8">
        <aside className="rounded-[1.5rem] bg-white p-3 shadow-soft ring-1 ring-zinc-100">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'mb-2 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition',
                activeTab === tab.id ? 'bg-offer-600 text-white' : 'text-zinc-700 hover:bg-orange-50 hover:text-offer-700',
              ].join(' ')}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </aside>

        <section className="min-w-0">
          {notice ? <div className="mb-4 rounded-2xl bg-orange-50 p-4 text-sm font-bold text-offer-700">{notice}</div> : null}
          {activeTab === 'overview' ? <Overview stats={stats} settings={settings} /> : null}
          {activeTab === 'content' ? (
            <ContentEditor settings={settings} setSettings={setSettings} onSave={saveSettings} saving={saving} />
          ) : null}
          {activeTab === 'pixel' ? (
            <PixelSetup settings={pixelSettings} setSettings={setPixelSettings} onSave={savePixelSettings} saving={saving} />
          ) : null}
          {activeTab === 'stock' ? (
            <StockManager
              packages={packages}
              onUpdate={updatePackage}
              newPackage={newPackage}
              setNewPackage={setNewPackage}
              onAddPackage={addPackage}
            />
          ) : null}
          {activeTab === 'orders' ? <OrdersTable orders={orders} onStatusChange={updateOrderStatus} onCourierCheck={checkCourier} /> : null}
        </section>
      </div>
    </AdminShell>
  );
}

function AdminShell({ children, loading, warning, profile, onRefresh, onSignOut }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-ink">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <a href="/#/" className="inline-flex items-center gap-2 text-sm font-bold text-offer-700">
              <ArrowLeft className="h-4 w-4" />
              Back to landing page
            </a>
            <h1 className="mt-2 text-2xl font-extrabold">Mystery Box Admin</h1>
          </div>
          {profile ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-2xl bg-orange-50 px-4 py-2 text-sm font-bold text-offer-700">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button onClick={onSignOut} className="inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-2 text-sm font-bold text-white">
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {loading ? (
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-lg font-bold text-zinc-600">Loading admin...</div>
      ) : warning ? (
        <div className="mx-auto max-w-3xl px-4 py-16">
          <div className="rounded-[2rem] bg-white p-6 text-center shadow-soft ring-1 ring-zinc-100">
            <ShieldAlert className="mx-auto h-12 w-12 text-offer-600" />
            <p className="mt-4 font-bold text-zinc-700">{warning}</p>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Overview({ stats, settings }) {
  const cards = [
    { label: 'Total Orders', value: stats.totalOrders },
    { label: 'Pending Orders', value: stats.pendingOrders },
    { label: 'Active Packages', value: stats.availablePackages },
    { label: 'Revenue', value: `${stats.revenue} tk` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[1.5rem] bg-white p-5 shadow-soft ring-1 ring-zinc-100">
            <p className="text-sm font-bold text-zinc-500">{card.label}</p>
            <p className="mt-2 text-3xl font-black text-ink">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-zinc-100">
        <p className="text-sm font-bold uppercase text-offer-600">Current Offer</p>
        <h2 className="mt-3 text-3xl font-extrabold">{settings.hero_title}</h2>
        <p className="mt-3 leading-7 text-zinc-600">{settings.hero_description}</p>
      </div>
    </div>
  );
}

function ContentEditor({ settings, setSettings, onSave, saving }) {
  const fields = [
    ['top_bar_text', 'Top Bar Text'],
    ['highlight_title', 'Highlight Title'],
    ['highlight_subtitle', 'Highlight Subtitle'],
    ['hero_title', 'Hero Title'],
    ['hero_description', 'Hero Description'],
    ['telegram_link', 'Telegram Link'],
    ['price_per_packet', 'Price Per Packet'],
    ['delivery_charge', 'Delivery Charge'],
    ['order_block_days', 'Duplicate Order Block Days'],
  ];

  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-soft ring-1 ring-zinc-100 sm:p-6">
      <h2 className="text-2xl font-extrabold">Customize Landing Page</h2>
      <div className="mt-6 grid gap-4">
        {fields.map(([key, label]) => (
          <label key={key} className="block text-sm font-bold text-ink">
            {label}
            {key.includes('description') ? (
              <textarea
                value={settings[key] ?? ''}
                onChange={(event) => setSettings({ ...settings, [key]: event.target.value })}
                rows={3}
                className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-offer-500 focus:ring-4 focus:ring-orange-100"
              />
            ) : (
              <input
                type={key.includes('price') || key.includes('charge') || key.includes('days') ? 'number' : 'text'}
                value={settings[key] ?? ''}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    [key]: key.includes('price') || key.includes('charge') || key.includes('days') ? Number(event.target.value) : event.target.value,
                  })
                }
                className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-offer-500 focus:ring-4 focus:ring-orange-100"
              />
            )}
          </label>
        ))}
      </div>
      <button
        onClick={onSave}
        disabled={saving}
        className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-offer-600 px-5 py-3 font-bold text-white disabled:opacity-60"
      >
        <Save className="h-4 w-4" />
        {saving ? 'Saving...' : 'Save Content'}
      </button>
    </div>
  );
}

function PixelSetup({ settings, setSettings, onSave, saving }) {
  const update = (key, value) => setSettings({ ...settings, [key]: value });

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] bg-white p-5 shadow-soft ring-1 ring-zinc-100 sm:p-6">
        <p className="text-sm font-bold uppercase text-offer-600">Tracking</p>
        <h2 className="mt-2 text-2xl font-extrabold">Pixel Setup</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          Meta Pixel, Meta CAPI and GTM credentials save korle full website tracking active hobe. Access token browser-e expose hobe na.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ToggleField
            label="Enable Meta Pixel"
            checked={settings.meta_pixel_enabled}
            onChange={(value) => update('meta_pixel_enabled', value)}
          />
          <ToggleField
            label="Enable Meta CAPI"
            checked={settings.meta_capi_enabled}
            onChange={(value) => update('meta_capi_enabled', value)}
          />
          <TextField
            label="Meta Pixel ID or Full Pixel Code"
            value={settings.meta_pixel_id}
            onChange={(value) => update('meta_pixel_id', value)}
            placeholder="123456789012345 অথবা পুরো Meta Pixel code paste করুন"
            multiline
          />
          <TextField label="Meta CAPI Access Token" type="password" value={settings.meta_access_token} onChange={(value) => update('meta_access_token', value)} placeholder="EAAB..." />
          <TextField label="Meta Test Event Code" value={settings.meta_test_event_code} onChange={(value) => update('meta_test_event_code', value)} placeholder="TEST12345" />
          <ToggleField
            label="Enable Google Tag Manager"
            checked={settings.gtm_enabled}
            onChange={(value) => update('gtm_enabled', value)}
          />
          <TextField
            label="GTM Container ID or Full GTM Code"
            value={settings.gtm_container_id}
            onChange={(value) => update('gtm_container_id', value)}
            placeholder="GTM-NT67SQ58 অথবা পুরো GTM script/noscript code paste করুন"
            multiline
          />
        </div>

        <button
          onClick={onSave}
          disabled={saving}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-offer-600 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Pixel Setup'}
        </button>
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 p-4 text-sm font-bold text-ink">
      {label}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          'relative h-8 w-14 rounded-full transition',
          checked ? 'bg-offer-600' : 'bg-zinc-200',
        ].join(' ')}
        aria-pressed={checked}
      >
        <span
          className={[
            'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition',
            checked ? 'left-7' : 'left-1',
          ].join(' ')}
        />
      </button>
    </label>
  );
}

function TextField({ label, value, onChange, type = 'text', placeholder, multiline = false }) {
  const fieldClassName = 'mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-offer-500 focus:ring-4 focus:ring-orange-100';

  return (
    <label className="block text-sm font-bold text-ink">
      {label}
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className={`${fieldClassName} resize-y font-mono text-xs`}
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={fieldClassName}
        />
      )}
    </label>
  );
}

function StockManager({ packages, onUpdate, newPackage, setNewPackage, onAddPackage }) {
  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] bg-white p-5 shadow-soft ring-1 ring-zinc-100 sm:p-6">
        <h2 className="text-2xl font-extrabold">Stock In / Out Manager</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="p-3">Package</th>
                <th className="p-3">Badge</th>
                <th className="p-3">Stock</th>
                <th className="p-3">Availability</th>
                <th className="p-3">Order</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((item) => (
                <tr key={item.id || item.packet_count} className="border-t border-zinc-100">
                  <td className="p-3 font-bold">{item.label}</td>
                  <td className="p-3">
                    <input
                      value={item.badge || ''}
                      onChange={(event) => onUpdate(item, { badge: event.target.value })}
                      className="w-32 rounded-xl border border-zinc-200 px-3 py-2"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      value={item.stock_quantity}
                      onChange={(event) => onUpdate(item, { stock_quantity: Number(event.target.value) })}
                      className="w-24 rounded-xl border border-zinc-200 px-3 py-2"
                    />
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => onUpdate(item, { is_available: !item.is_available })}
                      className={[
                        'rounded-full px-3 py-1 text-xs font-black',
                        item.is_available ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                      ].join(' ')}
                    >
                      {item.is_available ? 'In Stock' : 'Out of Stock'}
                    </button>
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      value={item.display_order}
                      onChange={(event) => onUpdate(item, { display_order: Number(event.target.value) })}
                      className="w-20 rounded-xl border border-zinc-200 px-3 py-2"
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={() => onUpdate(item, { stock_quantity: item.stock_quantity + 1, is_available: true })} className="rounded-xl bg-emerald-50 px-3 py-2 font-bold text-emerald-700">
                        + Stock
                      </button>
                      <button onClick={() => onUpdate(item, { stock_quantity: Math.max(0, item.stock_quantity - 1) })} className="rounded-xl bg-orange-50 px-3 py-2 font-bold text-offer-700">
                        - Stock
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[2rem] bg-white p-5 shadow-soft ring-1 ring-zinc-100 sm:p-6">
        <h3 className="text-xl font-extrabold">Add New Package</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <input placeholder="Count" type="number" value={newPackage.packet_count} onChange={(event) => setNewPackage({ ...newPackage, packet_count: event.target.value })} className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <input placeholder="Label" value={newPackage.label} onChange={(event) => setNewPackage({ ...newPackage, label: event.target.value })} className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <input placeholder="Badge" value={newPackage.badge} onChange={(event) => setNewPackage({ ...newPackage, badge: event.target.value })} className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <input placeholder="Stock" type="number" value={newPackage.stock_quantity} onChange={(event) => setNewPackage({ ...newPackage, stock_quantity: event.target.value })} className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <input placeholder="Order" type="number" value={newPackage.display_order} onChange={(event) => setNewPackage({ ...newPackage, display_order: event.target.value })} className="rounded-2xl border border-zinc-200 px-4 py-3" />
          <button onClick={onAddPackage} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-offer-600 px-4 py-3 font-bold text-white">
            <PackagePlus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function OrdersTable({ orders, onStatusChange, onCourierCheck }) {
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) || null;

  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-soft ring-1 ring-zinc-100 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">Orders</h2>
          <p className="mt-1 text-sm font-bold text-zinc-500">Click an order to see package, status and courier ratio.</p>
        </div>
        <span className="w-fit rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-offer-700">
          {orders.length} total
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <div className="hidden rounded-2xl bg-zinc-50 px-4 py-3 text-xs font-black uppercase text-zinc-500 sm:grid sm:grid-cols-[1fr_0.8fr_1.4fr_0.6fr] sm:gap-4">
          <span>Name</span>
          <span>Phone</span>
          <span>Address</span>
          <span className="text-right">Amount</span>
        </div>

        {orders.map((order) => (
          <button
            key={order.id}
            type="button"
            onClick={() => setSelectedOrderId(order.id)}
            className="block w-full rounded-3xl border border-zinc-100 bg-white p-4 text-left shadow-[0_10px_30px_rgba(20,18,15,0.04)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-soft focus:outline-none focus:ring-4 focus:ring-orange-100"
          >
            <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_0.8fr_1.4fr_0.6fr] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase text-zinc-400 sm:hidden">Name</p>
                <p className="truncate text-base font-extrabold text-ink">{order.customer_name}</p>
                <p className="mt-1 text-xs font-bold text-zinc-400 sm:hidden">{order.package_count} packet · {order.status}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase text-zinc-400 sm:hidden">Phone</p>
                <p className="truncate text-sm font-bold text-zinc-700">{order.phone}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase text-zinc-400 sm:hidden">Address</p>
                <p className="line-clamp-2 text-sm font-semibold leading-6 text-zinc-600">{order.address}</p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                <p className="text-[11px] font-black uppercase text-zinc-400 sm:hidden">Amount</p>
                <p className="text-lg font-black text-offer-600">{order.total} tk</p>
              </div>
            </div>
          </button>
        ))}

        {!orders.length ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-3 font-bold text-zinc-600">No orders yet.</p>
          </div>
        ) : null}
      </div>

      <OrderDetailsModal
        order={selectedOrder}
        onClose={() => setSelectedOrderId(null)}
        onStatusChange={onStatusChange}
        onCourierCheck={onCourierCheck}
      />
    </div>
  );
}

function OrderDetailsModal({ order, onClose, onStatusChange, onCourierCheck }) {
  if (!order) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-premium sm:max-w-5xl sm:rounded-[2rem] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-offer-600">Order Details</p>
            <h3 className="mt-1 truncate text-2xl font-extrabold text-ink">{order.customer_name}</h3>
            <p className="mt-1 text-sm font-bold text-zinc-500">{order.phone}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600"
            aria-label="Close details"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <DetailStat label="Package" value={`${order.package_count} packet`} />
          <DetailStat label="Subtotal" value={`${order.subtotal} tk`} />
          <DetailStat label="Total" value={`${order.total} tk`} highlight />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-3xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
            <p className="text-xs font-black uppercase text-zinc-400">Address</p>
            <p className="mt-2 text-sm font-bold leading-7 text-zinc-700">{order.address}</p>
          </div>
          <label className="rounded-3xl bg-zinc-50 p-4 text-sm font-bold text-ink ring-1 ring-zinc-100">
            Status
            <select
              value={order.status}
              onChange={(event) => onStatusChange(order, event.target.value)}
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 font-bold"
            >
              {orderStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 rounded-3xl border border-orange-100 bg-white p-4 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-offer-600">Courier Ratio</p>
              <h4 className="text-xl font-extrabold text-ink">Delivery history</h4>
            </div>
            {!order.courier_checked_at && order.courier_check_status !== 'checking' ? (
              <button
                type="button"
                onClick={() => onCourierCheck(order.id)}
                className="rounded-2xl bg-offer-600 px-4 py-2 text-xs font-black text-white"
              >
                {order.courier_check_status === 'error' ? 'Retry' : 'Check'}
              </button>
            ) : null}
          </div>
          <CourierSummary order={order} onCourierCheck={onCourierCheck} detailed />
        </div>
      </div>
    </div>
  );
}

function DetailStat({ label, value, highlight = false }) {
  return (
    <div className={['rounded-3xl p-4 ring-1', highlight ? 'bg-orange-50 text-offer-700 ring-orange-100' : 'bg-zinc-50 text-ink ring-zinc-100'].join(' ')}>
      <p className="text-xs font-black uppercase opacity-70">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function CourierSummary({ order, onCourierCheck, detailed = false }) {
  const status = order.courier_check_status || 'pending';
  const result = order.courier_check_result;
  const data = result?.data || {};
  const summary = data.summary;
  const courierItems = Object.entries(data).filter(([key, value]) => key !== 'summary' && value?.name);
  const reports = Array.isArray(result?.reports) ? result.reports : [];

  if (status === 'checking') {
    return (
      <div className="rounded-2xl bg-orange-50 p-3 text-xs font-bold text-offer-700 ring-1 ring-orange-100">
        <span className="inline-flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Checking courier history...
        </span>
        <p className="mt-1 text-[11px] text-orange-500">Normally 5-10 seconds. Slow hole auto error save hobe.</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700 ring-1 ring-red-100">
        <p>{order.courier_check_error || 'Courier check failed.'}</p>
        <button onClick={() => onCourierCheck(order.id)} className="mt-2 rounded-xl bg-white px-3 py-1.5 text-red-700 ring-1 ring-red-100">
          Check again
        </button>
      </div>
    );
  }

  if (!order.courier_checked_at || !result) {
    return (
      <button
        onClick={() => onCourierCheck(order.id)}
        className="inline-flex items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-700 ring-1 ring-zinc-200"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Check courier
      </button>
    );
  }

  if (detailed) {
    return (
      <CourierIntelligence
        order={order}
        summary={summary}
        courierItems={courierItems}
        reports={reports}
      />
    );
  }

  return (
    <div className="space-y-2">
      {summary ? (
        <div className={['grid grid-cols-4 gap-1 rounded-2xl bg-emerald-50 p-2 text-center font-black text-emerald-800 ring-1 ring-emerald-100', detailed ? 'text-xs sm:text-sm' : 'text-[11px]'].join(' ')}>
          <span>Total<br />{summary.total_parcel ?? 0}</span>
          <span>Success<br />{summary.success_parcel ?? 0}</span>
          <span>Cancel<br />{summary.cancelled_parcel ?? 0}</span>
          <span>Ratio<br />{summary.success_ratio ?? 0}%</span>
        </div>
      ) : null}

      <div className="grid gap-1">
        {courierItems.map(([key, item]) => (
          <div key={key} className={['flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-2 py-1.5 font-bold text-zinc-700', detailed ? 'text-xs sm:text-sm' : 'text-[11px]'].join(' ')}>
            <span className="truncate">{item.name}</span>
            <span className="shrink-0 text-emerald-700">{item.success_parcel ?? 0}/{item.total_parcel ?? 0}</span>
            <span className="shrink-0 text-red-600">C {item.cancelled_parcel ?? 0}</span>
          </div>
        ))}
      </div>

      {reports.length ? (
        <div className={['rounded-xl bg-red-50 px-2 py-1.5 font-bold text-red-700 ring-1 ring-red-100', detailed ? 'text-xs sm:text-sm' : 'text-[11px]'].join(' ')}>
          Fraud reports: {reports.length}
        </div>
      ) : null}

      <p className="text-[10px] font-bold text-zinc-400">
        Checked: {new Date(order.courier_checked_at).toLocaleString()}
      </p>
    </div>
  );
}

function CourierIntelligence({ order, summary, courierItems, reports }) {
  const total = Number(summary?.total_parcel || 0);
  const success = Number(summary?.success_parcel || 0);
  const cancelled = Number(summary?.cancelled_parcel || 0);
  const ratio = Number(summary?.success_ratio || 0);
  const riskLevel = ratio >= 90 && reports.length === 0 ? 'low' : ratio >= 70 ? 'medium' : 'high';
  const riskClass = riskLevel === 'low' ? 'text-emerald-600' : riskLevel === 'medium' ? 'text-orange-600' : 'text-red-600';

  return (
    <div className="overflow-hidden rounded-3xl bg-slate-50 ring-1 ring-slate-200">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-indigo-600" />
          <h5 className="text-sm font-black uppercase tracking-normal text-ink">Courier Ratio Intelligence</h5>
        </div>
        <p className="text-xs font-black text-slate-400">
          Synced {new Date(order.courier_checked_at).toLocaleString([], { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <RatioCard label="Success Ratio" value={`${ratio}%`} />
        <RatioCard label="Total Parcels" value={total} />
        <RatioCard label="Successful" value={success} />
        <RatioCard label="Cancelled" value={cancelled} />
        <RatioCard label="Risk Level" value={riskLevel} valueClassName={riskClass} />
      </div>

      <div className="mx-4 mb-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200">
        <div className="hidden grid-cols-[1.1fr_1.5fr_0.8fr_0.8fr_0.9fr_1.6fr] gap-4 bg-slate-100 px-5 py-4 text-xs font-black uppercase text-slate-400 lg:grid">
          <span>Logo</span>
          <span>Courier</span>
          <span>Total</span>
          <span>Success</span>
          <span>Cancelled</span>
          <span>Success Ratio</span>
        </div>

        <div className="divide-y divide-slate-100">
          {courierItems.map(([key, item]) => (
            <CourierIntelligenceRow key={key} item={item} />
          ))}
          {!courierItems.length ? (
            <div className="p-5 text-sm font-bold text-slate-500">No courier history found.</div>
          ) : null}
        </div>
      </div>

      {reports.length ? (
        <div className="mx-4 mb-4 rounded-3xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-100">
          Fraud reports found: {reports.length}
        </div>
      ) : null}
    </div>
  );
}

function RatioCard({ label, value, valueClassName = 'text-ink' }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className={['mt-2 text-2xl font-black', valueClassName].join(' ')}>{value}</p>
    </div>
  );
}

function CourierIntelligenceRow({ item }) {
  const ratio = Number(item.success_ratio || 0);
  const logoText = String(item.name || '?').slice(0, 2).toUpperCase();

  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[1.1fr_1.5fr_0.8fr_0.8fr_0.9fr_1.6fr] lg:items-center lg:gap-4 lg:px-5">
      <div className="flex items-center gap-3 lg:block">
        {item.logo ? (
          <img src={item.logo} alt={item.name} className="h-10 w-24 object-contain object-left" loading="lazy" />
        ) : (
          <div className="flex h-10 w-24 items-center text-sm font-black text-slate-400">{item.name}</div>
        )}
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700 ring-1 ring-slate-200 lg:hidden">
          {logoText}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700 ring-1 ring-slate-200 lg:inline-flex">
          {logoText}
        </span>
        <p className="text-base font-black text-ink">{item.name}</p>
      </div>

      <MetricLabel label="Total" value={item.total_parcel ?? 0} />
      <MetricLabel label="Success" value={item.success_parcel ?? 0} className="text-emerald-600" />
      <MetricLabel label="Cancelled" value={item.cancelled_parcel ?? 0} className="text-red-600" />

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-black uppercase text-slate-400 lg:hidden">Success Ratio</span>
          <span className="text-sm font-black text-ink">{ratio}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }} />
        </div>
      </div>
    </div>
  );
}

function MetricLabel({ label, value, className = 'text-ink' }) {
  return (
    <div className="flex items-center justify-between gap-3 lg:block">
      <span className="text-xs font-black uppercase text-slate-400 lg:hidden">{label}</span>
      <span className={['text-base font-black', className].join(' ')}>{value}</span>
    </div>
  );
}

export default AdminPanel;
