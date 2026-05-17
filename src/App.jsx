import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  Box,
  CheckCircle2,
  Clock3,
  Gift,
  MessageCircle,
  PackageCheck,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  XCircle,
  Zap,
} from 'lucide-react';
import heroImage from '../assets/fdbc90e0-e521-4bce-8472-dc56029a47a9.jpg';

const TELEGRAM_LINK = 'https://t.me/DarzMysteryBox24';
const PRICE_PER_PACKET = 59;
const DELIVERY_CHARGE = 99;

const packages = [
  { count: 6, label: '৬ প্যাকেট', badge: 'Popular', disabled: false },
  { count: 7, label: '৭ প্যাকেট', badge: 'স্টক আউট', disabled: true },
  { count: 10, label: '১০ প্যাকেট', badge: 'Best Value', disabled: false },
];

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

function App() {
  const [selectedPackage, setSelectedPackage] = useState(6);
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    note: '',
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const subtotal = selectedPackage * PRICE_PER_PACKET;
  const total = subtotal + DELIVERY_CHARGE;

  const telegramMessage = TELEGRAM_LINK;

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

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setSubmitted(true);
  };

  const scrollToCheckout = () => {
    document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-ink">
      <EntryCelebration />
      <FallingConfetti />
      <TopOfferBar />

      <main>
        <section className="relative isolate overflow-hidden border-b border-orange-100 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.18),transparent_32%),linear-gradient(180deg,#fff7ed_0%,#ffffff_74%)]">
          <CelebrationLayer />

          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-14 pt-8 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-20 lg:pt-12">
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              className="flex flex-col justify-center"
            >
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-offer-700 shadow-soft ring-1 ring-orange-100">
                  <Zap className="h-4 w-4 fill-offer-500 text-offer-500" />
                  আজকের Flash Offer চলছে
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 ring-1 ring-emerald-100">
                  <ShieldCheck className="h-4 w-4" />
                  Cash on Delivery
                </span>
              </div>

              <p className="mb-3 text-sm font-bold uppercase tracking-normal text-offer-600">
                Limited Mystery Drop
              </p>
              <h1 className="max-w-3xl break-words text-3xl font-extrabold leading-[1.12] tracking-normal text-ink sm:text-5xl lg:text-6xl">
                মাত্র <span className="text-offer-600">৫৯ টাকায়</span> Daraz Mystery Box Surprise
              </h1>
              <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-zinc-700">
                সারপ্রাইজ প্যাকেট অর্ডার করুন, ঘরে বসে Cash on Delivery-তে রিসিভ করুন।
                প্রতিটি প্যাকেটে কী থাকবে সেটাই আসল মিস্ট্রি।
              </p>

              <Countdown timeLeft={timeLeft} />

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={scrollToCheckout}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-offer-600 px-6 py-4 text-base font-bold text-white shadow-premium transition hover:-translate-y-0.5 hover:bg-offer-700 focus:outline-none focus:ring-4 focus:ring-orange-200"
                >
                  <ShoppingCart className="h-5 w-5" />
                  এখনই অর্ডার করুন
                </button>
                <a
                  href={TELEGRAM_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-base font-bold text-ink shadow-soft ring-1 ring-zinc-200 transition hover:-translate-y-0.5 hover:ring-orange-200"
                >
                  <MessageCircle className="h-5 w-5 text-offer-600" />
                  Telegram Support
                </a>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
              className="relative"
            >
              <div className="absolute -right-3 -top-3 z-10 rounded-2xl bg-ink px-4 py-3 text-sm font-black text-white shadow-soft sm:right-4">
                প্রতি প্যাকেট {bn(PRICE_PER_PACKET)} টাকা
              </div>
              <div className="overflow-hidden rounded-[2rem] bg-white p-3 shadow-premium ring-1 ring-orange-100">
                <img
                  src={heroImage}
                  alt="Daraz Mystery Box surprise offer"
                  className="aspect-square w-full rounded-[1.45rem] object-cover"
                />
              </div>
              <div className="absolute -bottom-5 left-4 right-4 rounded-3xl bg-white p-4 shadow-soft ring-1 ring-orange-100 sm:left-8 sm:right-8">
          <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
                  <MiniStat label="Delivery" value="৯৯ টাকা" />
                  <MiniStat label="Offer" value="আজই" />
                  <MiniStat label="Stock" value="Limited" />
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-20">
          <TrustGrid />
          <CheckoutForm
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

        <PolicySection />
        <FAQSection />
      </main>

      <MobileStickyCTA onClick={scrollToCheckout} />
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
    <div aria-hidden="true" className="entry-celebration pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-orange-50/45 via-white/10 to-transparent" />
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

function TopOfferBar() {
  return (
    <div className="sticky top-0 z-50 border-b border-orange-200 bg-offer-600 text-white shadow-sm">
      <div className="mx-auto flex min-h-12 max-w-7xl items-center justify-center gap-2 px-3 text-center text-xs font-bold leading-5 sm:px-4 sm:text-base">
        <Sparkles className="h-4 w-4 shrink-0 fill-white" />
        <span className="min-w-0 truncate sm:whitespace-normal">আজকের Flash Offer চলছে - প্রতি প্যাকেট মাত্র ৫৯ টাকা</span>
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
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-600">
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
    <div className="flex flex-col justify-center">
      <div className="mb-7">
        <p className="text-sm font-bold uppercase tracking-normal text-offer-600">Why order now</p>
        <h2 className="mt-3 text-3xl font-extrabold leading-tight text-ink sm:text-4xl">
          অফারটা সহজ, পরিষ্কার, আর অর্ডার করতে একদম দ্রুত।
        </h2>
        <p className="mt-4 text-base leading-7 text-zinc-600">
          অপ্রয়োজনীয় জটিলতা নেই। প্যাকেট সিলেক্ট করুন, ঠিকানা দিন, তারপর অর্ডার কনফার্ম করুন।
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, delay: index * 0.04 }}
            className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-zinc-100"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-offer-600">
              <item.icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-extrabold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{item.text}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CheckoutForm({
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
    <motion.section
      id="checkout"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      className="scroll-mt-20 rounded-[2rem] bg-white p-4 shadow-premium ring-1 ring-orange-100 sm:p-6 lg:p-7"
    >
      <div className="mb-6 flex flex-col gap-4 border-b border-zinc-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-normal text-offer-700">
            <ShoppingCart className="h-3.5 w-3.5" />
            Quick Checkout
          </p>
          <h2 className="mt-3 text-2xl font-extrabold text-ink sm:text-3xl">আপনার অর্ডার দিন</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            ৭ প্যাকেট স্টক আউট। ৬ অথবা ১০ প্যাকেট সিলেক্ট করে অর্ডার করুন।
          </p>
        </div>
        <div className="rounded-2xl bg-ink px-4 py-3 text-white">
          <div className="text-xs font-bold text-orange-100">Total</div>
          <div className="text-2xl font-black">{bn(total)} টাকা</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="rounded-3xl bg-emerald-50 p-6 ring-1 ring-emerald-100"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white">
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
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="mb-3 block text-sm font-extrabold text-ink">প্যাকেট সিলেক্ট করুন</label>
              <div className="grid gap-3 sm:grid-cols-3">
                {packages.map((item) => {
                  const active = selectedPackage === item.count;
                  const itemSubtotal = item.count * PRICE_PER_PACKET;

                  return (
                    <button
                      key={item.count}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => setSelectedPackage(item.count)}
                      className={[
                        'relative min-h-[116px] rounded-3xl border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-orange-100',
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
                      <span className="block text-xl font-extrabold text-ink">{item.label}</span>
                      <span className="mt-2 block text-sm font-bold text-zinc-600">
                        {item.count} x {PRICE_PER_PACKET} = {bn(itemSubtotal)} টাকা
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

            <Textarea
              label="নোট (ঐচ্ছিক)"
              value={form.note}
              onChange={(event) => updateField('note', event.target.value)}
              placeholder="ডেলিভারি সময় বা বিশেষ নির্দেশনা"
            />

            <div className="rounded-3xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
              <PriceRow label={`${bn(selectedPackage)} প্যাকেট সাবটোটাল`} value={`${bn(subtotal)} টাকা`} />
              <PriceRow label="ডেলিভারি চার্জ" value={`${bn(DELIVERY_CHARGE)} টাকা`} />
              <div className="mt-3 flex items-center justify-between border-t border-zinc-200 pt-3">
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
          </motion.form>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function Input({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-extrabold text-ink">{label}</span>
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
      <span className="mb-2 block text-sm font-extrabold text-ink">{label}</span>
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
    <div className="flex items-center justify-between py-1.5 text-sm font-bold text-zinc-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PolicySection() {
  const policies = [
    'সম্পূর্ণ Cash on Delivery-তে অর্ডার করতে পারবেন।',
    'সর্বনিম্ন ৬/৭/১০ প্যাকেট অর্ডার করতে হবে।',
    '৭ প্যাকেট বর্তমানে স্টক আউট, তাই অর্ডার করা যাবে না।',
    'আপনি যত প্যাকেট অর্ডার করবেন, সব একসাথে একটি বড় বক্সে ডেলিভারি হবে।',
    '৫৯ টাকার Daraz Mystery Box Close Box হিসেবে ডেলিভারি করা হবে।',
    'Daraz Mystery Box চেক করে নেওয়ার সুযোগ নেই।',
    'ভেতরে কী থাকবে সেটি সম্পূর্ণ সারপ্রাইজ এবং আপনার ভাগ্যের উপর নির্ভর করবে।',
  ];

  return (
    <section className="bg-zinc-50 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <p className="text-sm font-bold uppercase tracking-normal text-offer-600">Order Policy</p>
          <h2 className="mt-3 text-3xl font-extrabold text-ink sm:text-4xl">অর্ডার করার আগে জেনে নিন</h2>
        </div>

        <div className="rounded-[2rem] bg-white p-5 shadow-soft ring-1 ring-zinc-100 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            {policies.map((policy, index) => (
              <motion.div
                key={policy}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: index * 0.03 }}
                className="flex gap-3 rounded-2xl bg-white p-3"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <BadgeCheck className="h-4 w-4" />
                </span>
                <p className="text-sm font-bold leading-7 text-zinc-700">{policy}</p>
              </motion.div>
            ))}
          </div>
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
      q: '৭ প্যাকেট কেন অর্ডার করা যাচ্ছে না?',
      a: '৭ প্যাকেট অপশনটি বর্তমানে স্টক আউট। এখন ৬ অথবা ১০ প্যাকেট অর্ডার করা যাবে।',
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
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-extrabold text-ink">
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

function MobileStickyCTA({ onClick }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-100 bg-white/92 p-3 shadow-[0_-16px_40px_rgba(20,18,15,0.08)] backdrop-blur md:hidden">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-offer-600 px-5 py-3 text-base font-bold text-white shadow-premium"
      >
        <Box className="h-5 w-5" />
        অর্ডার করুন
      </button>
    </div>
  );
}

export default App;
