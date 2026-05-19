# Daraz Mystery Box Flash Offer Landing Page

Premium Bangla-first React landing page for a Daraz Mystery Box flash offer.

## Tech Stack

- Vite
- React
- Tailwind CSS
- Framer Motion
- lucide-react

## Features

- Premium orange and white offer design
- Bangla typography with polished font hierarchy
- Entry celebration animation and falling confetti
- Countdown offer section
- 6/7/10 packet selector with visual selection indicator
- Live subtotal, delivery charge, and total calculation
- Bangladeshi phone number validation
- Dedicated order success page
- Supabase-backed content, order, and stock management
- Admin panel at `/admin`
- Admin-managed Meta Pixel, GTM, and Meta CAPI tracking setup
- Server-side duplicate order guard by device/IP with admin-adjustable block days
- One-time cached courier history check for each order in the admin panel
- Vercel-ready build setup

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

## Vercel Settings

Vercel should auto-detect this as a Vite project.

- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

Add these environment variables in Vercel:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
BDCOURIER_API_KEY=your-bdcourier-api-key # optional fallback; preferred setup is Admin > Courier Setup
```

`SUPABASE_SERVICE_ROLE_KEY` and `BDCOURIER_API_KEY` are server-only. Do not expose them in client-side variables. Courier key can also be saved securely from the admin panel and will be used before the fallback env value.

## Supabase Setup

The database schema lives in `supabase/schema.sql`.

It creates:

- `site_settings`
- `package_options`
- `orders`
- `profiles`
- `pixel_settings`
- `courier_settings`
- RLS policies for public landing page reads, admin management, and locked-down server-side order creation
- Admin-only content, stock, order, courier, and pixel credential management policies

After creating an admin user in Supabase Auth, mark that user as admin:

```sql
insert into public.profiles (id, email, is_admin)
select id, email, true
from auth.users
where email = 'admin@example.com'
on conflict (id) do update
set is_admin = true, email = excluded.email;
```
