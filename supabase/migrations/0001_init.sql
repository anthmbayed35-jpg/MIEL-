-- MIEL+ store schema. Run in the Supabase SQL editor (or `supabase db push`).
-- All app writes go through the server with the service-role key; RLS below also protects
-- direct access with the anon/authenticated keys (e.g. Realtime in the admin).

create extension if not exists "pgcrypto";

-- ---------- helpers ----------
create table if not exists admin_users (
  id uuid primary key,                       -- = auth.users.id
  email text not null unique,
  name text not null default '',
  role text not null default 'staff' check (role in ('owner','manager','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where id = auth.uid() and active)
$$;

create or replace function has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where id = auth.uid() and active and role = any(roles))
$$;

-- ---------- catalog ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null default 'single' check (kind in ('single','bundle')),
  name text not null,
  descriptor text not null default '',
  flavor text not null default '',
  description text not null default '',
  spec text not null default '',
  price numeric(10,2) not null default 0,            -- price of one pouch (or bundle)
  compare_at_price numeric(10,2),
  sachet_count int not null default 12,
  sachet_weight_g numeric(6,1),
  glow text not null default 'rgba(218,252,105,0.3)',
  chips jsonb not null default '[]',
  compare_spec text not null default '',
  facts jsonb not null default '[]',                -- [{label, value|null}]  null = TBC
  ingredients text,
  allergens text,
  warning text,
  how_to jsonb not null default '[]',
  why jsonb not null default '[]',
  faqs jsonb not null default '[]',
  bundle_items jsonb,                               -- [{product_id, qty}] when kind = 'bundle'
  seo_title text,
  seo_description text,
  og_image text,
  status text not null default 'draft' check (status in ('active','draft','archived')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  kind text not null default 'extra' check (kind in ('pouch-hero','flat-lay','sachet-open','ingredients','extra')),
  src text not null,                                -- generated base path, or full URL of an upload
  alt text not null default '',
  label text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product on product_images(product_id, sort);

-- ---------- inventory ----------
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references products(id) on delete cascade,
  sku text not null default '',
  on_hand int not null default 0 check (on_hand >= 0),
  low_stock_threshold int not null default 10,
  created_at timestamptz not null default now()
);

create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  lot_number text not null,
  expiry_date date,
  quantity int not null default 0,
  status text not null default 'incoming' check (status in ('incoming','received')),
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  delta int not null,
  reason text not null,                             -- sale, return, cancel_restore, receive, adjustment, damaged, ...
  note text not null default '',
  order_id uuid,
  batch_id uuid,
  actor text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item on stock_movements(inventory_item_id, created_at desc);

-- ---------- customers & orders ----------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,                       -- normalised +961XXXXXXXX
  email text,
  tags jsonb not null default '[]',
  notes text not null default '',
  blocked boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create sequence if not exists order_number_seq start 1001;

create table if not exists delivery_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  notes text not null default '',
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                        -- e.g. Beirut, Mount Lebanon, North ...
  fee numeric(10,2) not null default 0,
  free_over numeric(10,2),                          -- free delivery threshold; null = none
  eta text not null default '',
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number int not null unique,
  customer_id uuid references customers(id),
  status text not null default 'new' check (status in
    ('draft','new','confirmed','packed','out_for_delivery','delivered','cancelled','returned')),
  payment_method text not null default 'cod',
  payment_status text not null default 'pending' check (payment_status in ('pending','collected','refunded')),
  subtotal numeric(10,2) not null default 0,
  discount_total numeric(10,2) not null default 0,
  shipping_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  cod_amount_due numeric(10,2) not null default 0,
  cod_collected boolean not null default false,
  cod_settled_at timestamptz,
  discount_code text,
  region text not null default '',
  address text not null default '',
  customer_notes text not null default '',
  delivery_partner_id uuid references delivery_partners(id),
  tracking_number text not null default '',
  source text not null default 'web' check (source in ('web','whatsapp','manual')),
  utm_source text, utm_medium text, utm_campaign text,
  cancel_reason text,
  stock_deducted boolean not null default false,
  is_demo boolean not null default false,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status on orders(status, created_at desc);
create index if not exists orders_customer on orders(customer_id);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  name text not null,
  unit_price numeric(10,2) not null,
  qty int not null check (qty > 0)
);
create index if not exists order_items_order on order_items(order_id);

create table if not exists order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  type text not null,                               -- created, status, comment, payment, delivery, refund, ...
  message text not null default '',
  from_status text,
  to_status text,
  actor text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists order_events_order on order_events(order_id, created_at);

-- ---------- growth ----------
create table if not exists discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('percent','fixed','free_delivery')),
  value numeric(10,2) not null default 0,
  min_order numeric(10,2) not null default 0,
  product_ids jsonb,                                -- null = all products
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int,
  used_count int not null default 0,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists abandoned_checkouts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null default '',
  items jsonb not null default '[]',
  total numeric(10,2) not null default 0,
  recovered boolean not null default false,
  contacted_at timestamptz,
  utm_source text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists events (                 -- lightweight storefront funnel tracking
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('visit','add_to_cart','begin_checkout')),
  session_id text not null default '',
  path text not null default '',
  utm_source text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists events_type on events(type, created_at desc);

-- ---------- content, settings, audit ----------
create table if not exists pages_content (          -- faq, announcement, hero, testimonials
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists settings (               -- store, tracking, notifications, policies, payment
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text not null default '',
  action text not null,
  entity text not null default '',
  entity_id text not null default '',
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created on audit_log(created_at desc);

-- ---------- atomic helpers ----------
create or replace function next_order_number() returns int
language sql as $$ select nextval('order_number_seq')::int $$;

-- Atomically change stock and record the movement. Raises 'insufficient_stock' unless p_allow_negative.
create or replace function adjust_stock(
  p_item uuid, p_delta int, p_reason text, p_note text default '',
  p_order uuid default null, p_actor text default '', p_demo boolean default false
) returns int
language plpgsql as $$
declare new_qty int;
begin
  update inventory_items set on_hand = on_hand + p_delta
   where id = p_item and on_hand + p_delta >= 0
   returning on_hand into new_qty;
  if new_qty is null then raise exception 'insufficient_stock'; end if;
  insert into stock_movements(inventory_item_id, delta, reason, note, order_id, actor, is_demo)
  values (p_item, p_delta, p_reason, p_note, p_order, p_actor, p_demo);
  return new_qty;
end $$;

-- ---------- row level security ----------
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

-- Public storefront reads (anon key): active products + their images, zones, public content
create policy "public read active products" on products for select using (status = 'active');
create policy "public read product images" on product_images for select
  using (exists (select 1 from products p where p.id = product_id and p.status = 'active'));
create policy "public read active zones" on shipping_zones for select using (active);
create policy "public read content" on pages_content for select using (true);

-- Admins can read everything (this is what Realtime subscriptions rely on)
do $$
declare t text;
begin
  foreach t in array array['admin_users','products','product_images','inventory_items','batches','stock_movements',
    'customers','delivery_partners','shipping_zones','orders','order_items','order_events','discounts',
    'abandoned_checkouts','events','pages_content','settings','audit_log']
  loop
    execute format('create policy "admin read %1$s" on %1$I for select using (is_admin())', t);
  end loop;
end $$;

-- Role-based writes. (The server also enforces roles before using the service key.)
create policy "staff+ write orders" on orders for all using (is_admin()) with check (is_admin());
create policy "staff+ write order_items" on order_items for all using (is_admin()) with check (is_admin());
create policy "staff+ write order_events" on order_events for all using (is_admin()) with check (is_admin());
create policy "staff+ write customers" on customers for all using (is_admin()) with check (is_admin());
create policy "staff+ write stock" on stock_movements for all using (is_admin()) with check (is_admin());
create policy "staff+ write inventory" on inventory_items for all using (is_admin()) with check (is_admin());
create policy "staff+ write batches" on batches for all using (is_admin()) with check (is_admin());

create policy "manager+ write products" on products for all
  using (has_role(array['owner','manager'])) with check (has_role(array['owner','manager']));
create policy "manager+ write images" on product_images for all
  using (has_role(array['owner','manager'])) with check (has_role(array['owner','manager']));
create policy "manager+ write discounts" on discounts for all
  using (has_role(array['owner','manager'])) with check (has_role(array['owner','manager']));
create policy "manager+ write zones" on shipping_zones for all
  using (has_role(array['owner','manager'])) with check (has_role(array['owner','manager']));
create policy "manager+ write partners" on delivery_partners for all
  using (has_role(array['owner','manager'])) with check (has_role(array['owner','manager']));
create policy "manager+ write content" on pages_content for all
  using (has_role(array['owner','manager'])) with check (has_role(array['owner','manager']));
create policy "manager+ write abandoned" on abandoned_checkouts for all
  using (has_role(array['owner','manager'])) with check (has_role(array['owner','manager']));

create policy "owner write settings" on settings for all
  using (has_role(array['owner'])) with check (has_role(array['owner']));
create policy "owner write admin_users" on admin_users for all
  using (has_role(array['owner'])) with check (has_role(array['owner']));
-- audit_log and events: written only by the server (service role). No client write policies.

-- Realtime: broadcast new orders to the admin
alter publication supabase_realtime add table orders;

-- Storage bucket for product images (public read; writes via service role only)
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;
