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
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and is required for `/api/pixel-config` and `/api/meta-capi`. Do not expose it in client-side variables.

## Supabase Setup

The database schema lives in `supabase/schema.sql`.

It creates:

- `site_settings`
- `package_options`
- `orders`
- `profiles`
- `pixel_settings`
- RLS policies for public landing page reads and order creation
- Admin-only content, stock, order, and pixel credential management policies

After creating an admin user in Supabase Auth, mark that user as admin:

```sql
insert into public.profiles (id, email, is_admin)
select id, email, true
from auth.users
where email = 'admin@example.com'
on conflict (id) do update
set is_admin = true, email = excluded.email;
```
