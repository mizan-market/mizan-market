-- Compatibility columns let the same checkout RPC work with both the older schema.sql
-- and the current production database. All additions are non-destructive.
alter table public.addresses add column if not exists full_name text not null default '';
alter table public.addresses add column if not exists address_line text not null default '';
alter table public.addresses add column if not exists city text not null default '';
alter table public.addresses add column if not exists name text not null default '';
alter table public.addresses add column if not exists division text;
alter table public.addresses add column if not exists district text;
alter table public.addresses add column if not exists upazila text;
alter table public.addresses add column if not exists detailed_address text not null default '';
alter table public.orders add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists customer_id uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists address_id uuid references public.addresses(id) on delete set null;
alter table public.orders add column if not exists customer_name text not null default '';
alter table public.orders add column if not exists customer_phone text not null default '';
alter table public.orders add column if not exists division text;
alter table public.orders add column if not exists district text;
alter table public.orders add column if not exists upazila text;
alter table public.orders add column if not exists union_name text;
alter table public.orders add column if not exists address text;
alter table public.orders add column if not exists total numeric(12,2) not null default 0;
alter table public.orders add column if not exists total_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists status text not null default 'pending_payment';
alter table public.orders add column if not exists order_status text not null default 'pending' check (order_status in ('pending','confirmed','processing','shipped','delivered','cancelled','returned'));
alter table public.orders add column if not exists payment_method text;
alter table public.order_items add column if not exists product_sku text;
alter table public.order_items add column if not exists line_total numeric(12,2) not null default 0;
alter table public.order_items add column if not exists total_price numeric(12,2) not null default 0;

create or replace function public.create_pending_order(p_items jsonb, p_zone_id uuid, p_address jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare q jsonb; o_id uuid; o_number text; a_id uuid; item jsonb; qty integer; pid uuid;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if coalesce(trim(p_address->>'name'), '') = ''
     or coalesce(trim(p_address->>'phone'), '') = ''
     or coalesce(trim(p_address->>'district'), '') = ''
     or coalesce(trim(p_address->>'address'), '') = '' then
    raise exception 'delivery_details_required';
  end if;

  q := public.quote_cart(p_items, p_zone_id);

  -- Reserve stock inside the order transaction so concurrent orders cannot oversell.
  for item in select * from jsonb_array_elements(q->'items') loop
    pid := (item->>'productId')::uuid;
    qty := (item->>'qty')::integer;
    update public.products set stock_quantity = stock_quantity - qty, updated_at = now()
      where id = pid and available = true and stock_quantity >= qty;
    if not found then raise exception 'insufficient_stock'; end if;
  end loop;

  insert into public.addresses(
    user_id, full_name, phone, address_line, city, area, postal_code,
    name, division, district, upazila, detailed_address
  )
  values (
    auth.uid(), trim(p_address->>'name'), trim(p_address->>'phone'), trim(p_address->>'address'),
    concat_ws(', ', nullif(trim(p_address->>'division'), ''), nullif(trim(p_address->>'district'), ''), nullif(trim(p_address->>'upazila'), '')),
    coalesce(nullif(trim(p_address->>'area'), ''), ''), nullif(trim(p_address->>'postal'), ''),
    trim(p_address->>'name'), coalesce(nullif(trim(p_address->>'division'), ''), ''),
    coalesce(nullif(trim(p_address->>'district'), ''), ''), coalesce(nullif(trim(p_address->>'upazila'), ''), ''),
    trim(p_address->>'address')
  ) returning id into a_id;

  o_number := 'MM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.orders(
    user_id, customer_id, order_number, customer_name, customer_phone, address_id,
    division, district, upazila, union_name, address, delivery_zone_id, delivery_charge,
    subtotal, total, total_amount, status, order_status, payment_status, payment_method
  )
  values (
    auth.uid(), auth.uid(), o_number, trim(p_address->>'name'), trim(p_address->>'phone'), a_id,
    nullif(trim(p_address->>'division'), ''), nullif(trim(p_address->>'district'), ''),
    nullif(trim(p_address->>'upazila'), ''), nullif(trim(p_address->>'area'), ''),
    trim(p_address->>'address'), p_zone_id, (q->>'deliveryCharge')::numeric,
    (q->>'subtotal')::numeric, (q->>'total')::numeric, (q->>'total')::numeric,
    'pending_payment', 'pending', 'pending', 'cod'
  ) returning id into o_id;

  for item in select * from jsonb_array_elements(q->'items') loop
    insert into public.order_items(
      order_id, product_id, product_name, product_sku, quantity,
      unit_price, line_total, total_price, delivery_charge
    )
    values (
      o_id, (item->>'productId')::uuid, item->>'name',
      (select sku from public.products where id = (item->>'productId')::uuid),
      (item->>'qty')::integer, (item->>'unitPrice')::numeric,
      (item->>'lineTotal')::numeric, (item->>'lineTotal')::numeric,
      coalesce((item->>'deliveryCharge')::numeric, 0)
    );
  end loop;

  return jsonb_build_object(
    'id', o_id, 'order_number', o_number, 'subtotal', q->>'subtotal',
    'deliveryCharge', q->>'deliveryCharge', 'total', q->>'total',
    'status', 'pending', 'payment_status', 'pending', 'payment_method', 'cod'
  );
end;
$$;

create or replace function public.restore_stock_on_order_cancel()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.order_status is distinct from 'cancelled' and new.order_status = 'cancelled' then
    update public.products p set stock_quantity = p.stock_quantity + items.quantity, updated_at = now()
    from (
      select product_id, sum(quantity)::integer as quantity
      from public.order_items where order_id = new.id and product_id is not null group by product_id
    ) items where p.id = items.product_id;
  end if;
  return new;
end;
$$;
drop trigger if exists restore_stock_after_order_cancel on public.orders;
create trigger restore_stock_after_order_cancel after update of order_status on public.orders
for each row execute function public.restore_stock_on_order_cancel();
revoke execute on function public.restore_stock_on_order_cancel() from public, anon, authenticated;

create or replace function public.cancel_my_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare updated_id uuid;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  update public.orders set order_status='cancelled', status='cancelled', updated_at=now()
    where id=p_order_id and user_id=auth.uid() and customer_id=auth.uid()
      and order_status in ('pending','confirmed')
    returning id into updated_id;
  if updated_id is null then raise exception 'order_cannot_be_cancelled'; end if;
  return jsonb_build_object('ok',true,'order_id',updated_id);
end;
$$;
revoke all on function public.create_pending_order(jsonb, uuid, jsonb) from public;
grant execute on function public.create_pending_order(jsonb, uuid, jsonb) to authenticated;
revoke all on function public.cancel_my_order(uuid) from public;
grant execute on function public.cancel_my_order(uuid) to authenticated;
notify pgrst, 'reload schema';
