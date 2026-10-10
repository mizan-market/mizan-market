-- MIZAN MARKET — Supabase/PostgreSQL schema
-- Safe-ish to re-run: policies/triggers are recreated. Existing product/order rows are not deleted.
create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('customer','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('pending_payment','payment_processing','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled','returned','refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('pending','processing','paid','failed','refunded'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,name text,phone text,role public.user_role not null default 'customer',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.categories(id uuid primary key default gen_random_uuid(),name_bn text not null,name_en text,slug text unique not null,parent_id uuid references public.categories(id),active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.products(id uuid primary key default gen_random_uuid(),sku text unique not null,name_bn text not null,name_en text,slug text unique not null,category_id uuid references public.categories(id),brand text,description text,short_description text,unit text,size text,stock_quantity integer not null default 0 check(stock_quantity>=0),min_order_quantity integer not null default 1 check(min_order_quantity>0),max_order_quantity integer,purchase_cost numeric(12,2),transportation_cost numeric(12,2),packaging_cost numeric(12,2),other_cost numeric(12,2),margin_type text check(margin_type in ('fixed','percentage')),margin_value numeric(12,2),selling_price numeric(12,2) not null check(selling_price>=0),discount_price numeric(12,2),available boolean not null default true,featured boolean not null default false,popular boolean not null default false,is_new boolean not null default false,public_pricing_enabled boolean not null default false,public_pricing_note text,delivery_charge numeric(12,2) not null default 0 check(delivery_charge>=0),seo_title text,seo_description text,seo_keywords text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.product_images(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id) on delete cascade,storage_path text not null,alt_text text,sort_order integer not null default 0,created_at timestamptz not null default now());
create table if not exists public.inventory_transactions(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),quantity_delta integer not null,reason text not null,admin_id uuid references public.profiles(id),created_at timestamptz not null default now());
create table if not exists public.delivery_zones(id uuid primary key default gen_random_uuid(),name text not null,charge numeric(12,2) not null check(charge>=0),estimated_delivery text,districts text[] not null default '{}',active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.addresses(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,name text not null,phone text not null,division text,district text,upazila text,area text,detailed_address text not null,postal_code text,created_at timestamptz not null default now());
create table if not exists public.orders(id uuid primary key default gen_random_uuid(),order_number text unique not null,customer_id uuid references public.profiles(id),address_id uuid references public.addresses(id),delivery_zone_id uuid references public.delivery_zones(id),status public.order_status not null default 'pending_payment',subtotal numeric(12,2) not null,delivery_charge numeric(12,2) not null,total numeric(12,2) not null,payment_status public.payment_status not null default 'pending',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,product_id uuid references public.products(id),product_name text not null,quantity integer not null check(quantity>0),unit_price numeric(12,2) not null,line_total numeric(12,2) not null,delivery_charge numeric(12,2) not null default 0 check(delivery_charge>=0));
create table if not exists public.payments(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,provider text not null,provider_transaction_id text,amount numeric(12,2) not null,status public.payment_status not null default 'pending',metadata jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(provider,provider_transaction_id));
create table if not exists public.wishlists(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,product_id uuid not null references public.products(id) on delete cascade,created_at timestamptz not null default now(),unique(user_id,product_id));
create table if not exists public.reviews(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id) on delete cascade,user_id uuid not null references public.profiles(id),order_id uuid references public.orders(id),rating integer not null check(rating between 1 and 5),review_text text,approved boolean not null default false,created_at timestamptz not null default now(),unique(product_id,user_id,order_id));
create table if not exists public.blog_posts(id uuid primary key default gen_random_uuid(),slug text unique not null,title_bn text not null,title_en text,excerpt text,content text not null,seo_title text,seo_description text,published boolean not null default false,published_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.faq(id uuid primary key default gen_random_uuid(),question_bn text not null,answer_bn text not null,sort_order integer not null default 0,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.site_settings(key text primary key,value jsonb not null default '{}',updated_at timestamptz not null default now());
create table if not exists public.audit_logs(id uuid primary key default gen_random_uuid(),admin_id uuid references public.profiles(id),action text not null,object_type text,object_id text,old_value jsonb,new_value jsonb,created_at timestamptz not null default now());
create table if not exists public.coupons(id uuid primary key default gen_random_uuid(),code text unique not null,discount_type text not null check(discount_type in ('fixed','percentage')),discount_value numeric(12,2) not null,active boolean not null default true,starts_at timestamptz,ends_at timestamptz);
create table if not exists public.coupon_usage(id uuid primary key default gen_random_uuid(),coupon_id uuid references public.coupons(id),user_id uuid references public.profiles(id),order_id uuid references public.orders(id),used_at timestamptz default now(),unique(coupon_id,user_id,order_id));

-- Add columns introduced after the first schema version without destroying existing data.
alter table public.products add column if not exists public_pricing_enabled boolean not null default false;
alter table public.products add column if not exists public_pricing_note text;
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists discount_price numeric(12,2);
alter table public.products add column if not exists seo_title text;
alter table public.products add column if not exists seo_description text;
alter table public.products add column if not exists seo_keywords text;
alter table public.products add column if not exists delivery_charge numeric(12,2) not null default 0;
alter table public.order_items add column if not exists delivery_charge numeric(12,2) not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname='products_delivery_charge_nonnegative' and conrelid='public.products'::regclass) then
    alter table public.products add constraint products_delivery_charge_nonnegative check(delivery_charge>=0);
  end if;
  if not exists (select 1 from pg_constraint where conname='order_items_delivery_charge_nonnegative' and conrelid='public.order_items'::regclass) then
    alter table public.order_items add constraint order_items_delivery_charge_nonnegative check(delivery_charge>=0);
  end if;
end $$;
alter table public.faq add column if not exists created_at timestamptz not null default now();
alter table public.faq add column if not exists updated_at timestamptz not null default now();
alter table public.categories add column if not exists updated_at timestamptz not null default now();

create index if not exists products_slug_idx on public.products(slug); create index if not exists products_category_idx on public.products(category_id); create index if not exists products_available_idx on public.products(available); create index if not exists orders_customer_idx on public.orders(customer_id); create index if not exists orders_status_idx on public.orders(status); create index if not exists product_images_product_idx on public.product_images(product_id); create index if not exists inventory_product_idx on public.inventory_transactions(product_id);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,name,role) values(new.id,coalesce(new.raw_user_meta_data->>'name',''),'customer') on conflict(id) do update set name=coalesce(public.profiles.name,excluded.name),updated_at=now(); return new; end $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin foreach t in array array['profiles','categories','products','delivery_zones','orders','payments','blog_posts','faq','site_settings'] loop execute format('drop trigger if exists touch_%I on public.%I',t,t); execute format('create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at()',t,t); end loop; end $$;

-- RLS
alter table public.profiles enable row level security; alter table public.categories enable row level security; alter table public.products enable row level security; alter table public.product_images enable row level security; alter table public.inventory_transactions enable row level security; alter table public.delivery_zones enable row level security; alter table public.addresses enable row level security; alter table public.orders enable row level security; alter table public.order_items enable row level security; alter table public.payments enable row level security; alter table public.wishlists enable row level security; alter table public.reviews enable row level security; alter table public.blog_posts enable row level security; alter table public.faq enable row level security; alter table public.site_settings enable row level security; alter table public.audit_logs enable row level security; alter table public.coupons enable row level security; alter table public.coupon_usage enable row level security;

-- Remove policies created by earlier versions so this migration is repeatable.
do $$ declare r record; begin for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('profiles','categories','products','product_images','inventory_transactions','delivery_zones','addresses','orders','order_items','payments','wishlists','reviews','blog_posts','faq','site_settings','audit_logs','coupons','coupon_usage') loop execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename); end loop; end $$;

create policy profiles_select on public.profiles for select using(id=auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update using(id=auth.uid() or public.is_admin()) with check(id=auth.uid() or public.is_admin());
create policy profiles_insert on public.profiles for insert with check(id=auth.uid() or public.is_admin());
create policy categories_public_read on public.categories for select using(active=true or public.is_admin());
create policy categories_admin_write on public.categories for all using(public.is_admin()) with check(public.is_admin());
create policy products_public_read on public.products for select using(available=true or public.is_admin());
create policy products_admin_write on public.products for all using(public.is_admin()) with check(public.is_admin());
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
create policy product_images_public_read on public.product_images for select using(exists(select 1 from public.products p where p.id=product_id and (p.available=true or public.is_admin())));
create policy product_images_admin_write on public.product_images for all using(public.is_admin()) with check(public.is_admin());
create policy inventory_admin on public.inventory_transactions for all using(public.is_admin()) with check(public.is_admin());
create policy zones_public_read on public.delivery_zones for select using(active=true or public.is_admin());
create policy zones_admin_write on public.delivery_zones for all using(public.is_admin()) with check(public.is_admin());
create policy addresses_own on public.addresses for all using(user_id=auth.uid() or public.is_admin()) with check(user_id=auth.uid() or public.is_admin());
create policy orders_own_read on public.orders for select using(customer_id=auth.uid() or public.is_admin());
create policy orders_admin_update on public.orders for update using(public.is_admin()) with check(public.is_admin());
create policy order_items_own_read on public.order_items for select using(exists(select 1 from public.orders o where o.id=order_id and (o.customer_id=auth.uid() or public.is_admin())));
create policy payments_own_read on public.payments for select using(exists(select 1 from public.orders o where o.id=order_id and (o.customer_id=auth.uid() or public.is_admin())));
create policy payments_admin_update on public.payments for update using(public.is_admin()) with check(public.is_admin());
create policy wishlists_own on public.wishlists for all using(user_id=auth.uid() or public.is_admin()) with check(user_id=auth.uid() or public.is_admin());
create policy reviews_public_read on public.reviews for select using(approved=true or user_id=auth.uid() or public.is_admin());
create policy reviews_admin on public.reviews for all using(public.is_admin()) with check(public.is_admin());
create policy blog_public_read on public.blog_posts for select using(published=true or public.is_admin());
create policy blog_admin on public.blog_posts for all using(public.is_admin()) with check(public.is_admin());
create policy faq_public_read on public.faq for select using(active=true or public.is_admin());
create policy faq_admin on public.faq for all using(public.is_admin()) with check(public.is_admin());
create policy settings_public_read on public.site_settings for select using(key in ('site','seo','contact','social','payment_public') or public.is_admin());
create policy settings_admin on public.site_settings for all using(public.is_admin()) with check(public.is_admin());
create policy audit_admin_read on public.audit_logs for select using(public.is_admin());
create policy audit_admin_insert on public.audit_logs for insert with check(public.is_admin());
create policy coupons_public_read on public.coupons for select using(active=true or public.is_admin());
create policy coupons_admin on public.coupons for all using(public.is_admin()) with check(public.is_admin());
create policy coupon_usage_own on public.coupon_usage for select using(user_id=auth.uid() or public.is_admin());

-- Product/stock/order helpers. These are server-side DB calculations; browser values are not trusted.
create or replace function public.quote_cart(p_items jsonb,p_zone_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare item jsonb; pid uuid; qty integer; p record; z record; subtotal numeric:=0; delivery numeric:=0; arr jsonb:='[]'::jsonb;
begin
 if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'cart_empty'; end if;
 select * into z from public.delivery_zones where id=p_zone_id and active=true; if not found then raise exception 'invalid_delivery_zone'; end if;
 for item in select * from jsonb_array_elements(p_items) loop
  pid:=(item->>'productId')::uuid; qty:=(item->>'qty')::integer; if qty is null or qty<1 then raise exception 'invalid_quantity'; end if;
  select * into p from public.products where id=pid and available=true; if not found then raise exception 'product_unavailable'; end if;
  if qty>p.stock_quantity then raise exception 'insufficient_stock'; end if;
  if qty<p.min_order_quantity then raise exception 'below_minimum_order'; end if;
  if p.max_order_quantity is not null and qty>p.max_order_quantity then raise exception 'above_maximum_order'; end if;
  subtotal:=subtotal+(coalesce(p.discount_price,p.selling_price)*qty);
  delivery:=delivery+coalesce(p.delivery_charge,0);
  arr:=arr||jsonb_build_array(jsonb_build_object('productId',p.id,'name',p.name_bn,'qty',qty,'unitPrice',coalesce(p.discount_price,p.selling_price),'lineTotal',coalesce(p.discount_price,p.selling_price)*qty,'deliveryCharge',coalesce(p.delivery_charge,0)));
 end loop;
 return jsonb_build_object('items',arr,'subtotal',subtotal,'deliveryCharge',delivery,'total',subtotal+delivery,'zone',z.id);
end $$;

create or replace function public.create_pending_order(p_items jsonb,p_zone_id uuid,p_address jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare q jsonb; o_id uuid; o_number text; a_id uuid; item jsonb;
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 q:=public.quote_cart(p_items,p_zone_id);
 insert into public.addresses(user_id,name,phone,division,district,upazila,area,detailed_address,postal_code) values(auth.uid(),p_address->>'name',p_address->>'phone',p_address->>'division',p_address->>'district',p_address->>'upazila',p_address->>'area',p_address->>'address',p_address->>'postal') returning id into a_id;
 o_number:='MM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.orders(order_number,customer_id,address_id,delivery_zone_id,status,subtotal,delivery_charge,total,payment_status) values(o_number,auth.uid(),a_id,p_zone_id,'pending_payment',(q->>'subtotal')::numeric,(q->>'deliveryCharge')::numeric,(q->>'total')::numeric,'pending') returning id into o_id;
 for item in select * from jsonb_array_elements(q->'items') loop insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,line_total,delivery_charge) values(o_id,(item->>'productId')::uuid,item->>'name',(item->>'qty')::integer,(item->>'unitPrice')::numeric,(item->>'lineTotal')::numeric,coalesce((item->>'deliveryCharge')::numeric,0)); end loop;
 return jsonb_build_object('id',o_id,'order_number',o_number,'subtotal',q->>'subtotal','deliveryCharge',q->>'deliveryCharge','total',q->>'total','status','pending_payment');
end $$;

create or replace function public.confirm_demo_payment(p_order_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o record; item record; enabled boolean:=false;
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 select coalesce((value->>'enabled')::boolean,false) into enabled from public.site_settings where key='demo_payment';
 if not enabled then raise exception 'demo_payment_disabled'; end if;
 select * into o from public.orders where id=p_order_id and customer_id=auth.uid() for update; if not found then raise exception 'order_not_found'; end if;
 if o.payment_status='paid' or o.status='confirmed' then return jsonb_build_object('ok',true,'order_number',o.order_number,'already_paid',true); end if;
 for item in select oi.product_id,oi.quantity from public.order_items oi where oi.order_id=o.id loop
   update public.products set stock_quantity=stock_quantity-item.quantity,updated_at=now() where id=item.product_id and stock_quantity>=item.quantity;
   if not found then raise exception 'insufficient_stock'; end if;
   insert into public.inventory_transactions(product_id,quantity_delta,reason,admin_id) values(item.product_id,-item.quantity,'demo payment order',null);
 end loop;
 update public.orders set status='confirmed',payment_status='paid',updated_at=now() where id=o.id;
 insert into public.payments(order_id,provider,provider_transaction_id,amount,status,metadata) values(o.id,'demo','DEMO-'||o.order_number,o.delivery_charge,'paid',jsonb_build_object('development_only',true));
 return jsonb_build_object('ok',true,'order_number',o.order_number,'status','confirmed');
end $$;

revoke all on function public.quote_cart(jsonb,uuid) from public; grant execute on function public.quote_cart(jsonb,uuid) to anon,authenticated;
revoke all on function public.create_pending_order(jsonb,uuid,jsonb) from public; grant execute on function public.create_pending_order(jsonb,uuid,jsonb) to authenticated;
revoke all on function public.confirm_demo_payment(uuid) from public; grant execute on function public.confirm_demo_payment(uuid) to authenticated;

-- Product image bucket. If Storage permissions differ in your Supabase project, review these policies in Storage.
insert into storage.buckets(id,name,public) values('product-images','product-images',true) on conflict(id) do update set public=true;
drop policy if exists product_images_public on storage.objects; drop policy if exists product_images_admin_insert on storage.objects; drop policy if exists product_images_admin_update on storage.objects; drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_public on storage.objects for select to anon,authenticated using(bucket_id='product-images');
create policy product_images_admin_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.is_admin());
create policy product_images_admin_update on storage.objects for update to authenticated using(bucket_id='product-images' and public.is_admin()) with check(bucket_id='product-images' and public.is_admin());
create policy product_images_admin_delete on storage.objects for delete to authenticated using(bucket_id='product-images' and public.is_admin());

-- Default demo/test setting is OFF. For local-only testing, admin can set it true temporarily:
-- update public.site_settings set value='{"enabled":true}' where key='demo_payment';
insert into public.site_settings(key,value) values('demo_payment','{"enabled":false}') on conflict(key) do nothing;

create or replace function public.cancel_my_order(p_order_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o record;
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 select * into o from public.orders where id=p_order_id and customer_id=auth.uid() for update;
 if not found then raise exception 'order_not_found'; end if;
 if o.status not in ('pending_payment','payment_processing','confirmed','processing') then raise exception 'order_not_cancellable'; end if;
 update public.orders set status='cancelled',updated_at=now() where id=o.id;
 return jsonb_build_object('ok',true,'order_number',o.order_number,'status','cancelled');
end $$;
revoke all on function public.cancel_my_order(uuid) from public; grant execute on function public.cancel_my_order(uuid) to authenticated;

create or replace function public.submit_review(p_product_id uuid,p_order_id uuid,p_rating integer,p_text text) returns jsonb language plpgsql security definer set search_path=public as $$
declare eligible boolean; rid uuid;
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 if p_rating<1 or p_rating>5 then raise exception 'invalid_rating'; end if;
 select exists(select 1 from public.orders o join public.order_items oi on oi.order_id=o.id where o.id=p_order_id and o.customer_id=auth.uid() and o.status='delivered' and oi.product_id=p_product_id) into eligible;
 if not eligible then raise exception 'review_requires_delivered_purchase'; end if;
 insert into public.reviews(product_id,user_id,order_id,rating,review_text,approved) values(p_product_id,auth.uid(),p_order_id,p_rating,p_text,false) returning id into rid;
 return jsonb_build_object('ok',true,'id',rid,'approved',false);
end $$;
revoke all on function public.submit_review(uuid,uuid,integer,text) from public; grant execute on function public.submit_review(uuid,uuid,integer,text) to authenticated;

-- Refresh PostgREST after schema changes.
notify pgrst, 'reload schema';
