-- MIEL+ security hardening. Run AFTER 0001_init.sql (SQL editor, once).
--
-- Model: every app request uses the server-only service_role key (which bypasses RLS) after the application has
-- checked the person's role. This file makes the database safe even if someone gets hold of the PUBLIC anon key
-- (it is public by design) or a team member's own JWT: the anon role can only read what the storefront shows,
-- and authenticated team members are limited by role, with deletes reserved for the owner.

-- ---------------------------------------------------------------------------------------------
-- 1. Drop every policy from 0001 (they are replaced below)
-- ---------------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table batches add column if not exists is_demo boolean not null default false;

-- ---------------------------------------------------------------------------------------------
-- 2. Privileges: start from nothing for anon / authenticated, then grant back only what is needed
-- ---------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- The server (service_role) keeps full access; it also bypasses RLS. (Supabase grants this by default; stated here so the file stands alone.)
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Storefront (anon): read-only, and only these four tables (RLS narrows them further)
grant select on products, product_images, shipping_zones, pages_content to anon;
-- Team members (authenticated): table access is then limited per role by RLS below
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Stock and order-number functions can only be run by the server (service_role), never via the public API
grant execute on function adjust_stock(uuid, int, text, text, uuid, text, boolean) to service_role;
grant execute on function next_order_number() to service_role;
grant execute on function is_admin() to authenticated;
grant execute on function has_role(text[]) to authenticated;

-- Used once, when going live, to make the first real order #1001 (refuses if any real order exists)
create or replace function reset_order_sequence() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from orders where is_demo = false) then raise exception 'real_orders_exist'; end if;
  perform setval('order_number_seq', 1000, true);
end $$;
revoke execute on function reset_order_sequence() from public, anon, authenticated;
grant execute on function reset_order_sequence() to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Row-level security (already enabled in 0001; repeated so this file stands alone)
-- ---------------------------------------------------------------------------------------------
alter table admin_users enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table inventory_items enable row level security;
alter table batches enable row level security;
alter table stock_movements enable row level security;
alter table customers enable row level security;
alter table delivery_partners enable row level security;
alter table shipping_zones enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;
alter table discounts enable row level security;
alter table abandoned_checkouts enable row level security;
alter table events enable row level security;
alter table pages_content enable row level security;
alter table settings enable row level security;
alter table audit_log enable row level security;

-- ---------------------------------------------------------------------------------------------
-- 4. Public storefront (anon): ONLY active products, their images, active zones, public content.
--    Orders, customers, settings, discounts, drafts, unapproved testimonials: unreadable.
--    Orders are created by the checkout server action (service role), never directly by the public.
-- ---------------------------------------------------------------------------------------------
create policy "public: active products" on products for select to anon using (status = 'active');
create policy "public: images of active products" on product_images for select to anon
  using (exists (select 1 from products p where p.id = product_id and p.status = 'active'));
create policy "public: active zones" on shipping_zones for select to anon using (active);
create policy "public: site content" on pages_content for select to anon using (key in ('faq', 'announcement', 'hero'));

-- ---------------------------------------------------------------------------------------------
-- 5. Team members (authenticated), by role. owner > manager > staff. Deletes are owner-only.
-- ---------------------------------------------------------------------------------------------
-- reads
do $$
declare t text;
begin
  foreach t in array array['products','product_images','inventory_items','batches','stock_movements','customers','delivery_partners',
    'shipping_zones','orders','order_items','order_events','discounts','abandoned_checkouts','pages_content']
  loop
    execute format('create policy "team: read %1$s" on %1$I for select to authenticated using (is_admin())', t);
  end loop;
end $$;
create policy "team: read own record" on admin_users for select to authenticated using (id = auth.uid() or has_role(array['owner']));
create policy "owner+manager: read settings" on settings for select to authenticated using (has_role(array['owner','manager']));
create policy "owner+manager: read audit log" on audit_log for select to authenticated using (has_role(array['owner','manager']));
create policy "owner+manager: read events" on events for select to authenticated using (has_role(array['owner','manager']));

-- day-to-day work: any active team member may create and update (never delete)
do $$
declare t text;
begin
  foreach t in array array['orders','order_items','order_events','customers','inventory_items','batches']
  loop
    execute format('create policy "team: insert %1$s" on %1$I for insert to authenticated with check (is_admin())', t);
    execute format('create policy "team: update %1$s" on %1$I for update to authenticated using (is_admin()) with check (is_admin())', t);
    execute format('create policy "owner: delete %1$s" on %1$I for delete to authenticated using (has_role(array[''owner'']))', t);
  end loop;
end $$;
-- stock history is append-only: nobody can edit or delete it through the API
create policy "team: insert stock movements" on stock_movements for insert to authenticated with check (is_admin());

-- catalogue, pricing and growth: owner or manager may create and update; only the owner may delete
do $$
declare t text;
begin
  foreach t in array array['products','product_images','discounts','shipping_zones','delivery_partners','pages_content','abandoned_checkouts']
  loop
    execute format('create policy "manager+: insert %1$s" on %1$I for insert to authenticated with check (has_role(array[''owner'',''manager'']))', t);
    execute format('create policy "manager+: update %1$s" on %1$I for update to authenticated using (has_role(array[''owner'',''manager''])) with check (has_role(array[''owner'',''manager'']))', t);
    execute format('create policy "owner: delete %1$s" on %1$I for delete to authenticated using (has_role(array[''owner'']))', t);
  end loop;
end $$;

-- settings and team: owner only
create policy "owner: write settings" on settings for all to authenticated using (has_role(array['owner'])) with check (has_role(array['owner']));
create policy "owner: write team" on admin_users for all to authenticated using (has_role(array['owner'])) with check (has_role(array['owner']));
-- audit_log and events: written only by the server (service role). No client write policy exists.

-- ---------------------------------------------------------------------------------------------
-- 6. No Realtime broadcast of order data (the admin polls through the server instead)
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'orders') then
    alter publication supabase_realtime drop table orders;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 7. Storage: product images are public to READ by URL (names are unguessable UUIDs), cannot be listed by the
--    public, and only owner/manager may write. The bucket itself limits size (8 MB) and type.
-- ---------------------------------------------------------------------------------------------
update storage.buckets
   set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
 where id = 'product-images';

drop policy if exists "admins manage product images" on storage.objects;
create policy "admins manage product images" on storage.objects for all to authenticated
  using (bucket_id = 'product-images' and has_role(array['owner', 'manager']))
  with check (bucket_id = 'product-images' and has_role(array['owner', 'manager']));
