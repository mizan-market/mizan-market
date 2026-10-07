-- MIZAN MARKET: product fields + product-specific delivery charge
-- Run once in Supabase SQL Editor against an existing database.
-- Safe to re-run.

begin;

-- Existing databases may have an older products table. CREATE TABLE IF NOT EXISTS
-- does not add missing columns, so these ALTER statements are the root fix for
-- brand/discount_price/seo_keywords/schema-cache errors.
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists discount_price numeric(12,2);
alter table public.products add column if not exists seo_keywords text[];
alter table public.products add column if not exists seo_title text;
alter table public.products add column if not exists seo_description text;
alter table public.products add column if not exists delivery_charge numeric(12,2) not null default 0;

alter table public.order_items add column if not exists delivery_charge numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='products_delivery_charge_nonnegative'
      and conrelid='public.products'::regclass
  ) then
    alter table public.products add constraint products_delivery_charge_nonnegative check(delivery_charge >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='order_items_delivery_charge_nonnegative'
      and conrelid='public.order_items'::regclass
  ) then
    alter table public.order_items add constraint order_items_delivery_charge_nonnegative check(delivery_charge >= 0);
  end if;
end $$;

-- Money/data validation.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='products_discount_not_negative' and conrelid='public.products'::regclass) then
    alter table public.products add constraint products_discount_not_negative check(discount_price is null or discount_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='products_discount_not_above_selling' and conrelid='public.products'::regclass) then
    alter table public.products add constraint products_discount_not_above_selling check(discount_price is null or discount_price <= selling_price);
  end if;
end $$;

-- Explicit table privileges are required in addition to RLS policies.
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.product_images to anon, authenticated;
grant insert, update, delete on public.product_images to authenticated;
do $$
begin
  if to_regclass('public.inventory_transactions') is not null then
    grant select, insert on public.inventory_transactions to authenticated;
  end if;
end $$;
grant select on public.order_items to authenticated;

-- Admin-only product writes. Existing policies with the same names are replaced.
drop policy if exists products_public_read on public.products;
drop policy if exists products_admin_write on public.products;
create policy products_public_read on public.products
  for select using (available=true or public.is_admin());
create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Product image metadata follows the same admin rule.
drop policy if exists product_images_public_read on public.product_images;
drop policy if exists product_images_admin_write on public.product_images;
create policy product_images_public_read on public.product_images
  for select using (
    exists (
      select 1 from public.products p
      where p.id=product_id and (p.available=true or public.is_admin())
    )
  );
create policy product_images_admin_write on public.product_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Delivery is now product-specific. The selected delivery zone remains available
-- for location/ETA, but its charge is no longer added to the order.
create or replace function public.quote_cart(p_items jsonb,p_zone_id uuid)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  item jsonb; pid uuid; qty integer; p record; z record;
  subtotal numeric:=0; delivery numeric:=0; arr jsonb:='[]'::jsonb;
begin
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'cart_empty'; end if;
  select * into z from public.delivery_zones where id=p_zone_id and active=true;
  if not found then raise exception 'invalid_delivery_zone'; end if;

  for item in select * from jsonb_array_elements(p_items) loop
    pid:=(item->>'productId')::uuid;
    qty:=(item->>'qty')::integer;
    if qty is null or qty<1 then raise exception 'invalid_quantity'; end if;

    select * into p from public.products where id=pid and available=true;
    if not found then raise exception 'product_unavailable'; end if;
    if qty>p.stock_quantity then raise exception 'insufficient_stock'; end if;
    if qty<p.min_order_quantity then raise exception 'below_minimum_order'; end if;
    if p.max_order_quantity is not null and qty>p.max_order_quantity then raise exception 'above_maximum_order'; end if;

    subtotal:=subtotal+(coalesce(p.discount_price,p.selling_price)*qty);
    -- One delivery charge per distinct cart product line, not per unit.
    delivery:=delivery+coalesce(p.delivery_charge,0);
    arr:=arr||jsonb_build_array(jsonb_build_object(
      'productId',p.id,
      'name',p.name_bn,
      'qty',qty,
      'unitPrice',coalesce(p.discount_price,p.selling_price),
      'lineTotal',coalesce(p.discount_price,p.selling_price)*qty,
      'deliveryCharge',coalesce(p.delivery_charge,0)
    ));
  end loop;

  return jsonb_build_object(
    'items',arr,
    'subtotal',subtotal,
    'deliveryCharge',delivery,
    'total',subtotal+delivery,
    'zone',z.id
  );
end $$;

create or replace function public.create_pending_order(p_items jsonb,p_zone_id uuid,p_address jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare q jsonb; o_id uuid; o_number text; a_id uuid; item jsonb;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  q:=public.quote_cart(p_items,p_zone_id);

  insert into public.addresses(user_id,name,phone,division,district,upazila,area,detailed_address,postal_code)
  values(auth.uid(),p_address->>'name',p_address->>'phone',p_address->>'division',p_address->>'district',p_address->>'upazila',p_address->>'area',p_address->>'address',p_address->>'postal')
  returning id into a_id;

  o_number:='MM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.orders(order_number,customer_id,address_id,delivery_zone_id,status,subtotal,delivery_charge,total,payment_status)
  values(o_number,auth.uid(),a_id,p_zone_id,'pending_payment',
    (q->>'subtotal')::numeric,(q->>'deliveryCharge')::numeric,(q->>'total')::numeric,'pending')
  returning id into o_id;

  for item in select * from jsonb_array_elements(q->'items') loop
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,line_total,delivery_charge)
    values(o_id,(item->>'productId')::uuid,item->>'name',(item->>'qty')::integer,
      (item->>'unitPrice')::numeric,(item->>'lineTotal')::numeric,
      coalesce((item->>'deliveryCharge')::numeric,0));
  end loop;

  return jsonb_build_object('id',o_id,'order_number',o_number,'subtotal',q->>'subtotal',
    'deliveryCharge',q->>'deliveryCharge','total',q->>'total','status','pending_payment');
end $$;

revoke all on function public.quote_cart(jsonb,uuid) from public;
grant execute on function public.quote_cart(jsonb,uuid) to anon,authenticated;
revoke all on function public.create_pending_order(jsonb,uuid,jsonb) from public;
grant execute on function public.create_pending_order(jsonb,uuid,jsonb) to authenticated;

-- Ask PostgREST to reload its schema cache after DDL.
notify pgrst, 'reload schema';

commit;
