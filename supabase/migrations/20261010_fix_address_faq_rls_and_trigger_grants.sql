-- Repair customer address and public FAQ access without exposing private rows.
drop policy if exists addresses_own on public.addresses;
create policy addresses_own on public.addresses
  for all to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
grant select, insert, update, delete on public.addresses to authenticated;

drop policy if exists faq_public_read on public.faq;
drop policy if exists faq_admin_manage on public.faq;
create policy faq_public_read on public.faq
  for select to anon, authenticated
  using (active = true);
create policy faq_admin_manage on public.faq
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
grant select on public.faq to anon, authenticated;
grant insert, update, delete on public.faq to authenticated;

-- These functions are invoked by triggers, not directly by API clients.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
notify pgrst, 'reload schema';