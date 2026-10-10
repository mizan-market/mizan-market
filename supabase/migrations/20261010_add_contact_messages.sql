create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  phone text not null check (char_length(trim(phone)) between 5 and 30),
  email text check (email is null or char_length(email) <= 254),
  message text not null check (char_length(trim(message)) between 10 and 4000),
  status text not null default 'new' check (status in ('new','read','replied','closed')),
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists contact_messages_public_insert on public.contact_messages;
drop policy if exists contact_messages_admin_read on public.contact_messages;
drop policy if exists contact_messages_admin_update on public.contact_messages;
create policy contact_messages_public_insert on public.contact_messages
  for insert to anon, authenticated
  with check (
    char_length(trim(name)) between 1 and 100
    and char_length(trim(phone)) between 5 and 30
    and char_length(trim(message)) between 10 and 4000
    and (email is null or char_length(email) <= 254)
    and status = 'new'
  );
create policy contact_messages_admin_read on public.contact_messages
  for select to authenticated using (public.is_admin());
create policy contact_messages_admin_update on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant insert on public.contact_messages to anon, authenticated;
grant select, update on public.contact_messages to authenticated;
notify pgrst, 'reload schema';
