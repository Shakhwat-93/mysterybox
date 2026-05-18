import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Gift,
  MessageCircle,
  PackageCheck,
  RotateCcw,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  XCircle,
  Zap,
} from 'lucide-react';
import heroImage from '../assets/fdbc90e0-e521-4bce-8472-dc56029a47a9.webp';
import AdminPanel from './AdminPanel';
import { defaultPackages, defaultSettings } from './defaults';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const banglaDigits = new Map([
  ['0', '০'],
  ['1', '১'],
  ['2', '২'],
  ['3', '৩'],
  ['4', '৪'],
  ['5', '৫'],
  ['6', '৬'],
  ['7', '৭'],
  ['8', '৮'],
  ['9', '৯'],
]);

const englishDigits = new Map(Array.from(banglaDigits, ([en, banglaDigit]) => [banglaDigit, en]));

function bn(value) {
  return String(value)
    .split('')
    .map((digit) => banglaDigits.get(digit) ?? digit)
    .join('');
}

function toEnglishDigits(value) {
  return String(value)
    .split('')
    .map((digit) => englishDigits.get(digit) ?? digit)
    .join('');
}

function getTimeLeft() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(23, 59, 59, 999);
  const diff = Math.max(0, midnight.getTime() - now.getTime());

  return {
    hours: Math.floor(diff / 1000 / 60 / 60),
    minutes: Math.floor((diff / 1000 / 60) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function getCurrentRoute() {
  if (window.location.pathname.replace(/\/$/, '') === '/admin') return '/admin';
  return window.location.hash;
}

function App() {
  const [route, setRoute] = useState(getCurrentRoute);
  const [settings, setSettings] = useState(defaultSettings);
  const [packageOptions, setPackageOptions] = useState(defaultPackages);
  const [selectedPackage, setSelectedPackage] = useState(6);
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const onRouteChange = () => setRoute(getCurrentRoute());
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);

    if (window.location.hash === '#/admin' && window.location.pathname !== '/admin') {
      window.history.replaceState(null, '', '/admin');
      setRoute('/admin');
    }
    return () => {
      window.removeEventListener('hashchange', onRouteChange);
      window.removeEventListener('popstate', onRouteChange);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    async function loadLandingData() {
      const [settingsResult, packagesResult] = await Promise.all([
        supabase.from('site_settings').select('*').eq('id', 'main').maybeSingle(),
        supabase.from('package_options').select('*').order('display_order', { ascending: true }),
      ]);

      if (settingsResult.data) setSettings({ ...defaultSettings, ...settingsResult.data });
      if (packagesResult.data?.length) {
        setPackageOptions(packagesResult.data);
        const firstAvailable = packagesResult.data.find((item) => item.is_available && item.stock_quantity > 0);
        if (firstAvailable && !packagesResult.data.some((item) => item.packet_count === selectedPackage && item.is_available)) {
          setSelectedPackage(firstAvailable.packet_count);
        }
      }
    }

    loadLandingData();
  }, []);

  if (route === '/admin' || route === '#/admin') {
    return <AdminPanel />;
  }

  const pricePerPacket = Number(settings.price_per_packet || defaultSettings.price_per_packet);
  const deliveryCharge = Number(settings.delivery_charge || defaultSettings.delivery_charge);
  const subtotal = selectedPackage * pricePerPacket;
  const total = subtotal + deliveryCharge;

  const telegramMessage = settings.telegram_link || defaultSettings.telegram_link;
  const packages = packageOptions.map((item) => ({
    ...item,
    count: item.packet_count,
    disabled: !item.is_available || Number(item.stock_quantity) <= 0,
  }));

  const validate = () => {
    const nextErrors = {};
    const normalizedPhone = toEnglishDigits(form.phone).replace(/\s|-/g, '');

    if (!form.name.trim()) {
      nextErrors.name = 'আপনার নাম লিখুন';
    }

    if (!/^01[3-9]\d{8}$/.test(normalizedPhone)) {
      nextErrors.phone = 'সঠিক ১১ সংখ্যার মোবাইল নাম্বার দিন';
    }

    if (form.address.trim().length < 12) {
      nextErrors.address = 'ডেলিভারির জন্য সম্পূর্ণ ঠিকানা লিখুন';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.from('orders').insert({
        customer_name: form.name.trim(),
        phone: toEnglishDigits(form.phone).replace(/\s|-/g, ''),
        address: form.address.trim(),
        package_count: selectedPackage,
        subtotal,
        delivery_charge: deliveryCharge,
        total,
      });

      if (error) {
        setErrors({ submit: error.message });
        return;
      }
    }

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-ink">
      <EntryCelebration />
      <FallingConfetti />
      <TopOfferBar text={settings.top_bar_text} />

      <main>
        <ClassicHero
          settings={settings}
          timeLeft={timeLeft}
          telegramMessage={telegramMessage}
        />

        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-12">
          <PolicySection compact />
          <ReturnPolicySection />
          <CheckoutForm
            packages={packages}
            pricePerPacket={pricePerPacket}
            deliveryCharge={deliveryCharge}
            selectedPackage={selectedPackage}
            setSelectedPackage={setSelectedPackage}
            subtotal={subtotal}
            total={total}
            form={form}
            setForm={setForm}
            errors={errors}
            submitted={submitted}
            handleSubmit={handleSubmit}
            telegramMessage={telegramMessage}
          />
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
          <TrustGrid />
        </section>

        <FAQSection />
      </main>
    </div>
  );
}

function ClassicHero({ settings, timeLeft, telegramMessage }) {
  return (
    <section className="classic-hero relative isolate overflow-hidden border-b border-orange-100 bg-[#f7fafc] text-center">
      <CelebrationLayer />

      <div className="classic-hero-curve bg-offer-600 px-4 pb-20 pt-12 text-white sm:pb-24 sm:pt-16">
        <div className="mx-auto max-w-5xl">
          <h1 className="mx-auto max-w-[calc(100vw-32px)] break-words text-2xl font-extrabold leading-tight text-white sm:max-w-[760px] sm:text-4xl lg:text-5xl">
            {settings.highlight_title}
          </h1>
          <p className="mx-auto mt-5 max-w-[calc(100vw-32px)] break-words text-sm font-extrabold leading-7 text-indigo-950 [overflow-wrap:anywhere] sm:max-w-[760px] sm:text-2xl sm:leading-8">
            {settings.highlight_subtitle}
          </p>
        </div>
      </div>

      <div className="relative mx-auto -mt-14 flex max-w-5xl flex-col items-center px-4 pb-6 sm:-mt-16 sm:px-6 sm:pb-8">
        <div className="hero-image-frame w-full max-w-[calc(100vw-32px)] overflow-hidden rounded-lg bg-ink shadow-premium ring-4 ring-white sm:max-w-[520px]">
          <img
            src={heroImage}
            alt="Daraz Mystery Box surprise offer"
            width="1024"
            height="1024"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="hero-zoom-image aspect-square w-full object-cover"
          />
        </div>

        <ClassicCountdown timeLeft={timeLeft} />

        <a
          href={telegramMessage}
          target="_blank"
          rel="noreferrer"
          className="mt-7 inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-offer-600 px-7 py-4 text-base font-extrabold text-white shadow-[0_0_0_4px_rgba(34,197,94,0.28),0_12px_34px_rgba(234,88,12,0.28)] transition hover:-translate-y-0.5 hover:bg-offer-700"
        >
          টেলিগ্রাম চ্যানেলে জয়েন করুন
          <Send className="h-4 w-4" />
        </a>

        <div className="mt-12 w-full max-w-[calc(100vw-32px)] rounded-md border border-emerald-500 bg-offer-600 px-4 py-5 text-center text-base font-extrabold leading-8 text-white shadow-soft [overflow-wrap:anywhere] sm:max-w-none sm:text-xl sm:leading-9">
          বিঃদ্রঃ-অর্ডার করার আগে নিচের অর্ডার পলিসি ভালো করে পড়ে নিবেন
        </div>
      </div>
    </section>
  );
}

function ClassicCountdown({ timeLeft }) {
  const items = [
    ['দিন', 0],
    ['ঘন্টা', timeLeft.hours],
    ['মিনিট', timeLeft.minutes],
    ['সেকেন্ড', timeLeft.seconds],
  ];

  return (
    <div className="mt-6 grid w-full max-w-[360px] grid-cols-4 gap-1 sm:max-w-[590px] sm:gap-4">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="min-w-0 rounded-md bg-offer-600 px-0.5 py-3 text-center text-white shadow-[0_0_0_2px_rgba(99,102,241,0.22),0_10px_22px_rgba(234,88,12,0.2)] ring-1 ring-orange-300 sm:px-2"
        >
          <div className="text-2xl font-black leading-none sm:text-6xl">{bn(String(value).padStart(2, '0'))}</div>
          <div className="mt-2 text-[10px] font-extrabold text-ink sm:text-xl">{label}</div>
        </div>
      ))}
    </div>
  );
}

function FallingConfetti() {
  const colors = ['#f97316', '#fb923c', '#facc15', '#34d399', '#111827', '#fed7aa'];
  const shapes = ['confetti-rect', 'confetti-circle', 'confetti-ribbon'];

  return (
    <div aria-hidden="true" className="falling-confetti pointer-events-none fixed inset-0 z-[65] overflow-hidden">
      {Array.from({ length: 72 }).map((_, index) => (
        <span
          key={index}
          className={`falling-confetti-piece ${shapes[index % shapes.length]}`}
          style={{
            '--x': `${(index * 37) % 100}vw`,
            '--drift': `${index % 2 === 0 ? '' : '-'}${24 + (index % 8) * 9}px`,
            '--size': `${6 + (index % 5) * 2}px`,
            '--duration': `${4.2 + (index % 7) * 0.34}s`,
            '--delay': `${index * 0.055}s`,
            '--rotate': `${180 + (index % 11) * 36}deg`,
            '--color': colors[index % colors.length],
          }}
        />
      ))}
    </div>
  );
}

function EntryCelebration() {
  const petals = [
    'bg-offer-500',
    'bg-orange-300',
    'bg-amber-300',
    'bg-rose-300',
    'bg-emerald-300',
    'bg-yellow-200',
  ];
  const symbols = ['✦', '✺', '✧', '✹'];

  return (
    <div aria-hidden="true" className="entry-celebration pointer-events-none fixed inset-0 z-10 overflow-hidden">
      <div className="celebration-side celebration-left">
        {Array.from({ length: 56 }).map((_, index) => (
          <span
            key={`left-${index}`}
            className={`celebration-petal ${petals[index % petals.length]}`}
            style={{
              '--i': index,
              '--y': `${8 + ((index * 11) % 76)}vh`,
              '--size': `${9 + (index % 6) * 3}px`,
              '--delay': `${index * 0.018}s`,
              '--spin': `${260 + (index % 8) * 44}deg`,
            }}
          />
        ))}
      </div>
      <div className="celebration-side celebration-right">
        {Array.from({ length: 56 }).map((_, index) => (
          <span
            key={`right-${index}`}
            className={`celebration-petal ${petals[(index + 2) % petals.length]}`}
            style={{
              '--i': index,
              '--y': `${10 + ((index * 13) % 74)}vh`,
              '--size': `${9 + (index % 6) * 3}px`,
              '--delay': `${index * 0.018}s`,
              '--spin': `${-260 - (index % 8) * 44}deg`,
            }}
          />
        ))}
      </div>
      <div className="celebration-flash celebration-flash-left" />
      <div className="celebration-flash celebration-flash-right" />
      <div className="celebration-fountain celebration-fountain-left" />
      <div className="celebration-fountain celebration-fountain-right" />
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={`symbol-left-${index}`}
          className="celebration-symbol celebration-symbol-left"
          style={{
            '--y': `${12 + ((index * 17) % 70)}vh`,
            '--delay': `${index * 0.045}s`,
            '--spin': `${180 + index * 18}deg`,
          }}
        >
          {symbols[index % symbols.length]}
        </span>
      ))}
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={`symbol-right-${index}`}
          className="celebration-symbol celebration-symbol-right"
          style={{
            '--y': `${14 + ((index * 19) % 68)}vh`,
            '--delay': `${index * 0.045}s`,
            '--spin': `${-180 - index * 18}deg`,
          }}
        >
          {symbols[(index + 1) % symbols.length]}
        </span>
      ))}
    </div>
  );
}

function TopOfferBar({ text }) {
  return (
    <div className="sticky top-0 z-50 border-b border-orange-200 bg-offer-600 text-white shadow-sm">
      <div className="mx-auto flex min-h-12 max-w-7xl items-center justify-center gap-2 px-3 text-center text-xs font-bold leading-5 sm:px-4 sm:text-base">
        <Sparkles className="h-4 w-4 shrink-0 fill-white" />
        <span className="min-w-0 truncate sm:whitespace-normal">{text}</span>
      </div>
    </div>
  );
}

function CelebrationLayer() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {[...Array(16)].map((_, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={{
            left: `${(index * 17) % 100}%`,
            top: `${10 + ((index * 23) % 62)}%`,
            animationDelay: `${index * 0.24}s`,
          }}
        />
      ))}
    </div>
  );
}

function Countdown({ timeLeft }) {
  const items = [
    ['ঘন্টা', timeLeft.hours],
    ['মিনিট', timeLeft.minutes],
    ['সেকেন্ড', timeLeft.seconds],
  ];

  return (
    <div className="mt-7">
      <div className="mb-3 flex items-center justify-center gap-2 text-sm font-bold text-zinc-600 lg:justify-start">
        <Clock3 className="h-4 w-4 text-offer-600" />
        আজকের অফার শেষ হতে বাকি
      </div>
      <div className="grid max-w-md grid-cols-3 gap-2 sm:gap-3">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-2xl bg-white px-2 py-3 text-center shadow-soft ring-1 ring-orange-100 sm:px-4">
            <div className="text-2xl font-black text-offer-600 sm:text-3xl">{bn(String(value).padStart(2, '0'))}</div>
            <div className="mt-1 text-xs font-bold text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="text-xs font-bold text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-black text-ink sm:text-base">{value}</div>
    </div>
  );
}

function TrustGrid() {
  const items = [
    {
      icon: PackageCheck,
      title: 'Cash on Delivery',
      text: 'প্রোডাক্ট হাতে পেয়ে পেমেন্ট করার সুবিধা।',
    },
    {
      icon: Truck,
      title: '৯৯ টাকা Delivery',
      text: 'সারা বাংলাদেশে একই ডেলিভারি চার্জ।',
    },
    {
      icon: Gift,
      title: 'Random Surprise',
      text: 'প্রতিটি প্যাকেটেই থাকবে মিস্ট্রি আইটেম।',
    },
    {
      icon: Zap,
      title: 'Limited Offer',
      text: 'আজকের স্টক শেষ হলে অফার বন্ধ হতে পারে।',
    },
  ];

  return (
    <div className="flex flex-col justify-center text-center lg:text-left">
      <div className="mb-7">
        <div className="mx-auto max-w-2xl rounded-3xl bg-ink px-5 py-7 text-center text-white shadow-premium ring-1 ring-black/10 sm:px-8 sm:py-8 lg:mx-0">
          <p className="text-2xl font-extrabold leading-9 sm:text-3xl">সতর্ক বার্তা ✍️✍️✍️</p>
          <p className="mt-4 break-words text-xl font-extrabold leading-9 [overflow-wrap:anywhere] sm:text-2xl sm:leading-10">
            Mystery Box মানে আপনার ভাগ্যের পরীক্ষা!
          </p>
          <p className="mt-3 break-words text-lg font-bold leading-8 text-white/90 [overflow-wrap:anywhere] sm:text-xl">
            সম্পূর্ণ টাকা পরিশোধ করে পণ্যটি আনবক্স করবেন,
          </p>
          <p className="mt-4 text-2xl font-extrabold leading-9">ধন্যবাদ 💗</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <div
            key={item.title}
            className="soft-reveal rounded-3xl bg-white p-5 text-center shadow-soft ring-1 ring-zinc-100 lg:text-left"
            style={{ animationDelay: `${index * 0.04}s` }}
          >
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-offer-600 lg:mx-0">
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-extrabold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckoutForm({
  packages,
  pricePerPacket,
  deliveryCharge,
  selectedPackage,
  setSelectedPackage,
  subtotal,
  total,
  form,
  setForm,
  errors,
  submitted,
  handleSubmit,
  telegramMessage,
}) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  return (
    <section
      id="checkout"
      className="soft-reveal scroll-mt-20 rounded-[2rem] bg-white p-4 text-center shadow-premium ring-1 ring-orange-100 sm:p-6 lg:p-7 lg:text-left"
    >
      <div className="mb-6 flex flex-col items-center gap-4 border-b border-zinc-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-normal text-offer-700">
            <ShoppingCart className="h-3.5 w-3.5" />
            Quick Checkout
          </p>
          <h2 className="mt-3 text-2xl font-extrabold text-ink sm:text-3xl">আপনার অর্ডার দিন</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            ৬, ৭ অথবা ১০ প্যাকেট সিলেক্ট করে সহজে Cash on Delivery-তে অর্ডার করুন।
          </p>
        </div>
        <div className="rounded-2xl bg-ink px-4 py-3 text-center text-white">
          <div className="text-xs font-bold text-orange-100">Total</div>
          <div className="text-2xl font-black">{bn(total)} টাকা</div>
        </div>
      </div>

      {submitted ? (
          <div className="success-reveal rounded-3xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100 lg:text-left">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white lg:mx-0">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-2xl font-extrabold text-emerald-950">অর্ডার তথ্য প্রস্তুত</h3>
            <p className="mt-3 leading-7 text-emerald-900">
              আপনার অর্ডার ডিটেইলস নেওয়া হয়েছে। দ্রুত কনফার্মেশনের জন্য Telegram-এ যোগাযোগ করুন।
            </p>
            <a
              href={telegramMessage}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-offer-600 px-5 py-4 text-base font-bold text-white shadow-premium transition hover:bg-offer-700 sm:w-auto"
            >
              <Send className="h-5 w-5" />
              Telegram-এ কনফার্ম করুন
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="mb-3 block text-sm font-extrabold text-ink">প্যাকেট সিলেক্ট করুন</label>
              <div className="grid gap-3 sm:grid-cols-3">
                {packages.map((item) => {
                  const active = selectedPackage === item.count;
                  const itemSubtotal = item.count * pricePerPacket;

                  return (
                    <button
                      key={item.count}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => setSelectedPackage(item.count)}
                      className={[
                        'relative min-h-[116px] rounded-3xl border p-4 text-center transition focus:outline-none focus:ring-4 focus:ring-orange-100 sm:text-left',
                        active
                          ? 'border-offer-500 bg-orange-50 shadow-soft'
                          : 'border-zinc-200 bg-white hover:border-orange-200',
                        item.disabled ? 'cursor-not-allowed bg-zinc-50 opacity-70' : '',
                      ].join(' ')}
                      aria-pressed={active}
                    >
                      <span
                        className={[
                          'absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold',
                          item.disabled ? 'bg-zinc-200 text-zinc-600' : 'bg-offer-600 text-white',
                        ].join(' ')}
                      >
                        {item.badge}
                      </span>
                      <span className="flex items-center justify-center gap-2 pr-20 text-xl font-extrabold text-ink sm:justify-start">
                        <span
                          aria-hidden="true"
                          className={[
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition',
                            active
                              ? 'border-offer-600 bg-offer-600 text-white shadow-[0_6px_16px_rgba(234,88,12,0.24)]'
                              : 'border-orange-200 bg-white text-transparent',
                            item.disabled ? 'border-zinc-200 bg-zinc-100 text-transparent shadow-none' : '',
                          ].join(' ')}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                        {item.label}
                      </span>
                      <span className="mt-2 block text-sm font-bold text-zinc-600">
                        {item.count} x {pricePerPacket} = {bn(itemSubtotal)} টাকা
                      </span>
                      {item.disabled ? (
                        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-red-600">
                          <XCircle className="h-4 w-4" />
                          অর্ডার করা যাবে না
                        </span>
                      ) : (
                        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" />
                          Available
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="আপনার নাম"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                error={errors.name}
                placeholder="যেমন: মোহাম্মদ হাসান"
              />
              <Input
                label="মোবাইল নাম্বার"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                error={errors.phone}
                placeholder="01XXXXXXXXX"
                inputMode="tel"
              />
            </div>

            <Textarea
              label="সম্পূর্ণ ঠিকানা"
              value={form.address}
              onChange={(event) => updateField('address', event.target.value)}
              error={errors.address}
              placeholder="জেলা, থানা, এলাকা, বাসা/রোড নাম্বার"
            />

            <div className="rounded-3xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
              <PriceRow label={`${bn(selectedPackage)} প্যাকেট সাবটোটাল`} value={`${bn(subtotal)} টাকা`} />
              <PriceRow label="ডেলিভারি চার্জ" value={`${bn(deliveryCharge)} টাকা`} />
              <div className="mt-3 flex items-center justify-between gap-4 border-t border-zinc-200 pt-3 text-left">
                <span className="text-base font-extrabold text-ink">সর্বমোট</span>
                <span className="text-2xl font-black text-offer-600">{bn(total)} টাকা</span>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-offer-600 px-5 py-4 text-base font-bold text-white shadow-premium transition hover:-translate-y-0.5 hover:bg-offer-700 focus:outline-none focus:ring-4 focus:ring-orange-200"
            >
              <ShoppingCart className="h-5 w-5" />
              অর্ডার কনফার্ম করুন
            </button>
            {errors.submit ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{errors.submit}</p> : null}
          </form>
        )}
    </section>
  );
}

function Input({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-center text-sm font-extrabold text-ink sm:text-left">{label}</span>
      <input
        {...props}
        className={[
          'min-h-13 w-full rounded-2xl border bg-white px-4 py-3 text-base font-semibold text-ink outline-none transition placeholder:text-zinc-400 focus:border-offer-500 focus:ring-4 focus:ring-orange-100',
          error ? 'border-red-300' : 'border-zinc-200',
        ].join(' ')}
      />
      {error ? <span className="mt-2 block text-sm font-bold text-red-600">{error}</span> : null}
    </label>
  );
}

function Textarea({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-center text-sm font-extrabold text-ink sm:text-left">{label}</span>
      <textarea
        {...props}
        rows={3}
        className={[
          'w-full resize-none rounded-2xl border bg-white px-4 py-3 text-base font-semibold text-ink outline-none transition placeholder:text-zinc-400 focus:border-offer-500 focus:ring-4 focus:ring-orange-100',
          error ? 'border-red-300' : 'border-zinc-200',
        ].join(' ')}
      />
      {error ? <span className="mt-2 block text-sm font-bold text-red-600">{error}</span> : null}
    </label>
  );
}

function PriceRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-left text-sm font-bold text-zinc-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PolicySection({ compact = false }) {
  const policies = [
    'সম্পূর্ণ Cash on Delivery-তে অর্ডার করতে পারবেন।',
    'সর্বনিম্ন ৬/৭/১০ প্যাকেট অর্ডার করতে হবে।',
    '৬/৭/১০ প্যাকেট সবগুলোই বর্তমানে অর্ডার করা যাবে।',
    'আপনি যত প্যাকেট অর্ডার করবেন, সব একসাথে একটি বড় বক্সে ডেলিভারি হবে।',
    '৫৯ টাকার Daraz Mystery Box Close Box হিসেবে ডেলিভারি করা হবে।',
    'Daraz Mystery Box চেক করে নেওয়ার সুযোগ নেই।',
    'ভেতরে কী থাকবে সেটি সম্পূর্ণ সারপ্রাইজ এবং আপনার ভাগ্যের উপর নির্ভর করবে।',
  ];

  return (
    <section className={compact ? '' : 'bg-zinc-50 py-14 sm:py-20'}>
      <div className={compact ? '' : 'mx-auto max-w-5xl px-4 sm:px-6 lg:px-8'}>
        <div className="mb-5 text-center">
          <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xl font-extrabold text-ink shadow-[0_0_0_4px_rgba(34,197,94,0.18),0_10px_30px_rgba(20,18,15,0.08)] ring-1 ring-emerald-200">
            🎁 অর্ডার পলিসি
            <ShoppingCart className="h-5 w-5" />
          </span>
        </div>

        <div className="rounded-md border border-orange-300 bg-offer-600 p-5 shadow-soft">
          <div className="space-y-3">
            {policies.map((policy, index) => (
              <div
                key={policy}
                className="soft-reveal flex items-start gap-3 text-left"
                style={{ animationDelay: `${index * 0.03}s` }}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-white">
                  <BadgeCheck className="h-3.5 w-3.5" />
                </span>
                <p className="text-sm font-bold leading-6 text-white sm:text-base">{policy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReturnPolicySection() {
  const returnPolicies = [
    'আপনার পার্সেল ডেলিভারি হওয়ার পর আপনি যদি মনে করেন আপনার পার্সেল কোনো সমস্যা হয়েছে/হতে পারে, অবশ্যই বাসায় নিয়ে আনবক্স করার সময় একটি ভিডিও করবেন। ডেলিভারির ২৪ ঘন্টার মধ্যে আমাদের হটলাইনে যোগাযোগ করবেন এবং রিটার্ন রিকোয়েস্ট পাঠাবেন।',
    'রিটার্ন রিকোয়েস্ট পাঠানোর দুই থেকে তিন দিনের ভিতর আপনার বাসা থেকে আমাদের ডেলিভারি ম্যান পার্সেলটি রিটার্ন নিয়ে আসবে।',
    'ডেলিভারি ম্যান আপনার থেকে রিটার্ন পার্সেল নিয়ে আসার এক দিনের ভিতর আপনার পেমেন্ট রিফান্ড পেয়ে যাবেন। বিকাশ/নগদ/রকেট/অথবা ব্যাংক একাউন্টের মাধ্যমে পেমেন্ট নিতে পারবেন।',
  ];

  return (
    <section>
      <div className="mb-5 text-center">
        <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-xl font-extrabold text-white shadow-[0_0_0_4px_rgba(14,165,233,0.16),0_10px_30px_rgba(2,132,199,0.2)]">
          <ShoppingCart className="h-5 w-5" />
          ❌ রিটার্ন পলিসি👇
        </span>
      </div>

      <div className="overflow-hidden rounded-md border border-sky-200 bg-white p-5 shadow-soft ring-1 ring-sky-50">
        <div className="space-y-4">
          {returnPolicies.map((policy, index) => (
            <div key={policy} className="soft-reveal flex min-w-0 items-start gap-3 text-left" style={{ animationDelay: `${index * 0.04}s` }}>
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                <RotateCcw className="h-3.5 w-3.5" />
              </span>
              <p className="min-w-0 break-words text-[13px] font-bold leading-7 text-red-600 [overflow-wrap:anywhere] sm:text-base">{policy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  const faqs = [
    {
      q: 'আমি কি বক্স খুলে দেখে নিতে পারব?',
      a: 'না। এটি Mystery Box, তাই Close Box হিসেবে ডেলিভারি হবে এবং আগে চেক করার সুযোগ নেই।',
    },
    {
      q: 'ডেলিভারি চার্জ কত?',
      a: 'সারা বাংলাদেশে ডেলিভারি চার্জ মাত্র ৯৯ টাকা।',
    },
    {
      q: '৭ প্যাকেট কি অর্ডার করা যাবে?',
      a: 'হ্যাঁ। ৭ প্যাকেট বর্তমানে stock available, তাই ৬/৭/১০ যেকোনো প্যাকেজ সিলেক্ট করে অর্ডার করা যাবে।',
    },
    {
      q: 'কী ধরনের আইটেম পাব?',
      a: 'এটি সারপ্রাইজ অফার। প্যাকেটের ভেতরের আইটেম random, তাই নির্দিষ্ট আইটেমের গ্যারান্টি নেই।',
    },
  ];

  return (
    <section className="pb-28 pt-14 sm:pb-20 sm:pt-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <p className="text-sm font-bold uppercase tracking-normal text-offer-600">FAQ</p>
          <h2 className="mt-3 text-3xl font-extrabold text-ink sm:text-4xl">কমন প্রশ্নের উত্তর</h2>
        </div>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-3xl bg-white p-5 shadow-soft ring-1 ring-zinc-100 open:ring-orange-200"
            >
              <summary className="flex cursor-pointer list-none items-center justify-center gap-4 text-center text-base font-extrabold text-ink sm:justify-between sm:text-left">
                {faq.q}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-offer-600 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 leading-7 text-zinc-600">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default App;
