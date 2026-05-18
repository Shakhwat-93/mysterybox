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
    const payload = {
      ...pixelSettings,
      id: 'main',
      meta_pixel_id: String(pixelSettings.meta_pixel_id || '').trim(),
      meta_access_token: String(pixelSettings.meta_access_token || '').trim(),
      meta_test_event_code: String(pixelSettings.meta_test_event_code || '').trim(),
      gtm_container_id: String(pixelSettings.gtm_container_id || '').trim(),
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
          {activeTab === 'orders' ? <OrdersTable orders={orders} onStatusChange={updateOrderStatus} /> : null}
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
          <TextField label="Meta Pixel ID" value={settings.meta_pixel_id} onChange={(value) => update('meta_pixel_id', value)} placeholder="123456789012345" />
          <TextField label="Meta CAPI Access Token" type="password" value={settings.meta_access_token} onChange={(value) => update('meta_access_token', value)} placeholder="EAAB..." />
          <TextField label="Meta Test Event Code" value={settings.meta_test_event_code} onChange={(value) => update('meta_test_event_code', value)} placeholder="TEST12345" />
          <ToggleField
            label="Enable Google Tag Manager"
            checked={settings.gtm_enabled}
            onChange={(value) => update('gtm_enabled', value)}
          />
          <TextField label="GTM Container ID" value={settings.gtm_container_id} onChange={(value) => update('gtm_container_id', value)} placeholder="GTM-XXXXXXX" />
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

function TextField({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <label className="block text-sm font-bold text-ink">
      {label}
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-zinc-200 px-4 py-3 outline-none focus:border-offer-500 focus:ring-4 focus:ring-orange-100"
      />
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

function OrdersTable({ orders, onStatusChange }) {
  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-soft ring-1 ring-zinc-100 sm:p-6">
      <h2 className="text-2xl font-extrabold">Orders</h2>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="p-3">Customer</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Package</th>
              <th className="p-3">Total</th>
              <th className="p-3">Address</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-zinc-100">
                <td className="p-3 font-bold">{order.customer_name}</td>
                <td className="p-3">{order.phone}</td>
                <td className="p-3">{order.package_count} packet</td>
                <td className="p-3 font-bold">{order.total} tk</td>
                <td className="max-w-xs p-3 text-zinc-600">{order.address}</td>
                <td className="p-3">
                  <select
                    value={order.status}
                    onChange={(event) => onStatusChange(order, event.target.value)}
                    className="rounded-xl border border-zinc-200 px-3 py-2 font-bold"
                  >
                    {orderStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-3 font-bold text-zinc-600">No orders yet.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AdminPanel;
