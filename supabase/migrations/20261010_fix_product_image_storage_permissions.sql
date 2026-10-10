-- Fix product image uploads and admin audit writes for MIZAN MARKET.
-- Safe to rerun. Existing products, orders, and image metadata are preserved.

drop policy if exists "Public can read MIZAN product images" on storage.objects;
drop policy if exists "Admins upload MIZAN product images" on storage.objects;
drop policy if exists "Admins update MIZAN product images" on storage.objects;
drop policy if exists "Admins delete MIZAN product images" on storage.objects;

create policy "Public can read MIZAN product images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images');

create policy "Admins upload MIZAN product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and public.is_admin());

create policy "Admins update MIZAN product images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and public.is_admin())
with check (bucket_id = 'product-images' and public.is_admin());

create policy "Admins delete MIZAN product images"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and public.is_admin());

grant select, insert on public.audit_logs to authenticated;
drop policy if exists "Admins insert audit logs" on public.audit_logs;
create policy "Admins insert audit logs"
on public.audit_logs for insert to authenticated
with check (public.is_admin());

notify pgrst, 'reload schema';
