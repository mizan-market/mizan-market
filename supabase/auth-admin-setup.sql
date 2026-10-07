-- Run this once in Supabase SQL Editor for MIZAN MARKET Auth + Admin.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name',''), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

do $$ begin
  create policy "profile insert own" on public.profiles
  for insert with check (id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin update products" on public.products
  for update using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin insert products" on public.products
  for insert with check (public.is_admin());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admin delete products" on public.products
  for delete using (public.is_admin());
exception when duplicate_object then null; end $$;
