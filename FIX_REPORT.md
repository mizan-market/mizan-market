# MIZAN MARKET — Product/Delivery Root-Cause Fix Report

## Root causes found

1. `brand`, `discount_price`, and `seo_keywords` were already referenced by the frontend and present in the intended `schema.sql`, but `CREATE TABLE IF NOT EXISTS public.products` cannot add missing columns to an already-existing older `products` table. This caused the PostgREST/schema-cache column errors.
2. `permission denied for table products` can occur before RLS policy evaluation when the `authenticated` role lacks table privileges. The project had RLS policies but did not explicitly grant the required table privileges. The fix keeps RLS enabled and grants only the required product permissions.
3. The existing checkout calculated delivery from `delivery_zones.charge`, while the requested design requires a delivery charge saved on each product. The data flow was therefore incomplete for product-specific delivery.
4. Existing `order_items` did not snapshot product delivery charge. Without a snapshot, historical delivery values could not be represented independently from future product edits.

## Files changed

- `src/App.jsx`
  - Added product delivery charge to create/edit form.
  - Added validation for delivery charge, stock, quantity limits and discount price.
  - Product detail displays delivery charge separately.
  - Cart displays subtotal, delivery charge and total.
  - Order view shows item-level delivery snapshot and totals.
  - Admin order list shows subtotal, delivery and total.
  - Delivery zone remains available for location/ETA; its charge is not added to new product-delivery totals.

- `supabase/schema.sql`
  - Added migration-safe product/order-item delivery fields.
  - Added idempotent delivery/discount constraints.
  - Added explicit product table grants.
  - Updated server-side quote and order creation to use product delivery charges.
  - Added PostgREST schema reload notification.

- `supabase/migrations/20261007_product_delivery_and_permissions.sql`
  - Exact migration for an existing Supabase database.
  - Adds missing `brand`, `discount_price`, `seo_keywords`, SEO fields, `delivery_charge`, and order-item delivery snapshot.
  - Repairs product privileges/RLS without disabling security.
  - Replaces quote/order RPC logic with product-specific delivery calculation.
  - Reloads PostgREST schema cache.

- `supabase/seed.sql`
  - Demo products now include delivery charge.

- `README.md`
  - Documents the migration and the new delivery model.

## Delivery model

For new orders, delivery is charged once per distinct product line in the cart.

Example:
- Product A: ৳200 + delivery ৳60
- Product B: ৳300 + delivery ৳80
- Subtotal: ৳500
- Delivery: ৳140
- Total: ৳640

If Product A quantity is 2, its product-level delivery charge remains ৳60 once, not ৳120.

When the order is created, both the order-level delivery total and each order item's delivery charge are saved. Changing the product later does not change the old order.

## Security

RLS remains enabled. Product INSERT/UPDATE/DELETE is still restricted by `public.is_admin()`. No service-role key or database password is placed in frontend code. Table grants are explicit and RLS remains the authorization boundary.

## Verification

`node scripts/check-project.mjs` passes.

A full Vite build could not be completed in this environment because dependency installation timed out; the project did not originally contain `node_modules`. Run `npm install` followed by `npm run build` on the development/deployment machine.

## Database action still required

This environment does not have the user's Supabase database credentials, so I did not pretend to modify the live database.

For an existing Supabase database, run exactly:

`supabase/migrations/20261007_product_delivery_and_permissions.sql`

in Supabase SQL Editor once.

Do not manually add the columns one-by-one.
