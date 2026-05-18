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
- 6/7/10 packet selector with 7 packet disabled as stock out
- Live subtotal, delivery charge, and total calculation
- Bangladeshi phone number validation
- Order success state with Telegram support CTA
- Supabase-backed content, order, and stock management
- Admin panel at `/#/admin`
- Mobile sticky order button
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
```

## Supabase Setup

The database schema lives in `supabase/schema.sql`.

It creates:

- `site_settings`
- `package_options`
- `orders`
- `profiles`
- RLS policies for public landing page reads and order creation
- Admin-only content, stock, and order management policies

After creating an admin user in Supabase Auth, mark that user as admin:

```sql
insert into public.profiles (id, email, is_admin)
select id, email, true
from auth.users
where email = 'admin@example.com'
on conflict (id) do update
set is_admin = true, email = excluded.email;
```
