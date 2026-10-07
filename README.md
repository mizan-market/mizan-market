# MIZAN MARKET — মীযান মার্কেট

**ন্যায্য দামে, সবার জন্য।**

এই project হলো Bangladesh-focused, single-seller e-commerce V1। React + Vite frontend, Supabase Auth/PostgreSQL/Storage এবং একটি ছোট Express API boundary ব্যবহার করা হয়েছে। Multi-vendor seller registration নেই।

## গুরুত্বপূর্ণ: কী কাজ করে

- Bangla default + English switcher
- Responsive mobile-first storefront
- Home / Products / Categories / Search / Product Details
- Cart + wishlist
- Supabase Auth: Register, Login, Logout, Forgot Password
- Customer profile, multiple addresses, order history, tracking
- Server/DB-side quote: product price + stock + product-specific delivery charge পুনরায় যাচাই; delivery zone শুধু location/ETA
- Delivery zones admin CRUD (location/ETA); delivery charge is stored per product
- Admin role protection (`profiles.role = 'admin'`)
- Admin product CRUD + price/stock/availability/featured/popular/new
- Purchase/transport/packaging/other cost + fixed/percentage margin calculator
- Product image storage bucket foundation
- Admin order status update
- Customer order cancellation for eligible states
- Inventory transaction table
- Review moderation foundation + delivered-purchase verification RPC
- Blog/FAQ/public content read layer
- Site/SEO settings table
- Audit log
- Print invoice view
- robots.txt + sitemap.xml + manifest + safe service worker
- Real payment gateway **not faked**
- Local TEST PAYMENT is available only when explicitly enabled for development

## 1. Requirements

- Windows 10/11
- Node.js 18+ (Node 20 LTS recommended)
- npm
- A Supabase project

## 2. Install

Open Command Prompt inside the project folder:

```bat
npm install
```

## 3. Environment variables

Create `.env.local` in the project root. Do NOT commit it.

```env
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_SITE_URL=http://localhost:5173
VITE_API_URL=http://localhost:8787
VITE_DEMO_MODE=true

# Local Node API
PORT=8787
SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
DEMO_PAYMENT_MODE=true
```

If your Supabase project uses the older `anon` key, `VITE_SUPABASE_ANON_KEY` is also supported by the frontend.

**Never use `service_role` in `.env.local` for the Vite frontend.**

### If you see `Invalid API key`

1. Supabase Dashboard খুলুন।
2. **Connect** / API credentials area থেকে current **Publishable key** (বা legacy anon key) কপি করুন।
3. `.env.local`-এ পুরোনো key-এর জায়গায় বসান।
4. Vite বন্ধ করুন: `Ctrl+C`
5. আবার `npm run dev`
6. Browser hard refresh: `Ctrl+Shift+R`

## 4. Supabase database

Supabase SQL Editor-এ existing database হলে আগে এই migration চালান:

```text
supabase/migrations/20261007_product_delivery_and_permissions.sql
```

এই migration পুরোনো `products` table-এ missing `brand`, `discount_price`, `seo_keywords` ও `delivery_charge` যোগ করে, explicit table privileges/RLS policies ঠিক করে এবং PostgREST schema cache reload করে।

নতুন database হলে `supabase/schema.sql` চালালেই পূর্ণ schema তৈরি হবে। Existing database-এ `schema.sql`-এর পাশাপাশি উপরের migration-টি ব্যবহার করুন।

তারপর demo data চাইলে:

```text
supabase/seed.sql
```

Seed data `DEMO` হিসেবে ব্যবহার করুন। Existing product slug থাকলে seed duplicate product তৈরি করবে না।

## 5. First admin তৈরি

প্রথমে website-এর **Register** page থেকে নিজের account তৈরি করুন। তারপর Supabase SQL Editor-এ:

```sql
UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'YOUR-EMAIL@example.com'
);
```

তারপর website থেকে Logout/Login করে `/admin` খুলুন।

এখানে কোনো admin password code-এ hard-code করা নেই।

## 6. Local development

Frontend:

```bat
npm run dev
```

API server (আরেকটি Command Prompt):

```bat
npm run server
```

Frontend: `http://localhost:5173`

API health: `http://localhost:8787/api/health`

### One-command style local run

দুটি terminal রাখাই সহজ:

Terminal 1:

```bat
npm run dev
```

Terminal 2:

```bat
npm run server
```

## 7. Local TEST PAYMENT

Production-এ fake payment নেই। Local testing-এর জন্য দুই জায়গায় explicit enable করতে হবে:

`.env.local`:

```env
VITE_DEMO_MODE=true
DEMO_PAYMENT_MODE=true
```

Supabase SQL:

```sql
UPDATE public.site_settings
SET value='{"enabled":true}'
WHERE key='demo_payment';
```

TEST PAYMENT শুধু local development-এর জন্য। Production-এ দুটোই OFF রাখুন:

```env
VITE_DEMO_MODE=false
DEMO_PAYMENT_MODE=false
```

এবং DB:

```sql
UPDATE public.site_settings
SET value='{"enabled":false}'
WHERE key='demo_payment';
```

## 8. Real payment gateway এখনও pending

V1 architecture delivery-charge payment-এর জন্য প্রস্তুত, কিন্তু bKash/Nagad/SSLCommerz/Stripe credentials ও provider callback ছাড়া সত্যিকারের payment verification করা যায় না। তাই production-এ button দেখাবে **Payment gateway pending** এবং fake success দেবে না।

Real gateway যোগ করার সময় অবশ্যই:

- server-side price/stock recalculation
- provider callback/webhook verification
- provider transaction ID/idempotency
- only verified payment => `confirmed`
- inventory decrement inside verified DB transaction

follow করতে হবে।

## 9. Delivery charge কীভাবে কাজ করে

Admin → `/admin` → **পণ্য** → নতুন/এডিট product-এ `Delivery charge` field-এ product-এর delivery charge দিন।

উদাহরণ:
- Selling price: ৳200
- Delivery charge: ৳60

Product price-এর মধ্যে delivery charge যোগ করা হয় না।

Checkout-এ:
- Subtotal = product final price × quantity
- Delivery = প্রতিটি distinct cart product-এর saved delivery charge একবার
- Total = Subtotal + Delivery

একই product-এর quantity 2 হলেও তার product-level delivery charge একবার ধরা হয়। দুইটি আলাদা product হলে দুইটির delivery charge যোগ হয়। Order তৈরি হলে প্রতিটি order item-এ delivery charge snapshot এবং order-এ মোট delivery charge সংরক্ষণ হয়, তাই পরে product-এর charge বদলালেও পুরোনো order বদলায় না।

Delivery zone এখনও location/ETA-এর জন্য ব্যবহৃত হয়; zone-এর পুরোনো `charge` নতুন product-delivery calculation-এ যোগ করা হয় না।

## 10. Product price কীভাবে change করবেন

Admin login → `/admin` → **পণ্য** → product Edit → `Selling price` → Save.

অথবা নতুন product-এ:

- Purchase cost
- Transportation
- Packaging
- Other cost
- Margin type: percentage/fixed
- Margin value

দিলে calculated price দেখাবে। Final selling price admin explicitly সেট করতে পারবেন। Internal cost public product card-এ দেখানো হয় না।

## 11. Product image

Supabase Storage-এ `product-images` bucket schema migration তৈরি করে। Admin-only upload policy রাখা হয়েছে। Product image metadata `product_images` table-এ থাকে।

## 12. Order flow

Customer:

1. Register/Login
2. Product browse
3. Add to cart
4. Checkout
5. Address
6. Delivery zone
7. DB/server quote
8. Delivery-charge payment
9. Verified payment → Confirmed
10. Admin processes
11. Customer tracks status

COD V1-এ নেই।

## 13. Security rules

- Frontend price trusted নয়।
- `quote_cart()` DB function live product price/stock/zone reload করে।
- `create_pending_order()` DB function final order values তৈরি করে।
- Admin writes RLS protected।
- Customer order/address access নিজের user-এর মধ্যে সীমিত।
- Service-role key frontend-এ নেই।
- Admin audit log রাখা হয়েছে।

## 14. SEO

Included:

- clean product/category URLs
- dynamic title/description/canonical
- Open Graph
- robots.txt
- sitemap.xml
- manifest
- semantic headings

Before production, `public/sitemap.xml`-এর `https://mizanmarket.pages.dev`-এর জায়গায় actual domain দিন এবং product/category/blog URLs যোগ করুন।

Google Search Console verification/Analytics values `site_settings` বা environment/configuration অনুযায়ী যোগ করা যাবে। কোনো tracking ID না থাকলে কিছুই load করার দরকার নেই।

## 15. Build test

```bat
npm run build
```

Production preview:

```bat
npm run preview
```

## 16. GitHub

```bat
git init
git add .
git commit -m "MIZAN MARKET production V1"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

`.gitignore`-এ `.env.local` রাখা আছে।

## 17. Cloudflare Pages

Typical settings:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Node: 20 or newer
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL`, `VITE_API_URL`, optional verification/analytics values

Important: The Express API is not automatically hosted by Cloudflare Pages. For production, move the API operations to Supabase Edge Functions or Cloudflare Workers, or host the Node API on another free-compatible service. Do not put a service-role secret into the browser.

## 18. What cannot honestly be called complete/free yet

1. Real bKash/Nagad/SSLCommerz/Stripe payment connection needs provider account/configuration and must be verified.
2. Production email/SMS/WhatsApp notifications need external providers.
3. Cloudflare Pages does not run this Express API by itself; use Workers/Edge Functions or another compatible host.
4. Real legal policy text must come from the business owner/legal adviser; this project does not invent legal claims.
5. Real supplier/product data, images, delivery charges and business contact details must be entered by the owner.

No fake payment, fake review, fake customer, or fake business certification is claimed by this project.
