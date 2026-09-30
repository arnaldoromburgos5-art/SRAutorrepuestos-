-- SR Autorrepuestos: instalación completa (migraciones + datos de demostración).
-- Pegá TODO este archivo en Supabase > SQL Editor > New query y presioná Run. Usar sólo en una base vacía.

-- ===== 20260930000001_schema.sql =====
-- SR Autorrepuestos — esquema principal
-- Moneda base: guaraníes (PYG, sin decimales). Todos los importes se guardan como bigint.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'owner', 'admin', 'catalog_manager', 'order_operator', 'analyst');
create type public.product_status as enum ('draft', 'published', 'archived');
create type public.fitment_status as enum ('confirmed', 'unverified', 'incompatible');
create type public.stock_movement_type as enum ('initial', 'purchase_in', 'sale_out', 'reservation', 'release', 'adjustment', 'return_in');
create type public.order_status as enum ('pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled');
create type public.payment_status as enum ('pending', 'approved', 'rejected', 'refunded');
create type public.delivery_method as enum ('pickup', 'home', 'agency');
create type public.coupon_type as enum ('percent', 'fixed');
create type public.promotion_scope as enum ('all', 'category', 'brand', 'products');
create type public.return_status as enum ('requested', 'approved', 'received', 'refunded', 'rejected');
create type public.ai_action_status as enum ('pending', 'rejected', 'executed', 'failed', 'expired');

-- Normaliza códigos (SKU, OEM, referencias): mayúsculas, sin espacios ni signos.
create or replace function public.normalize_code(p text)
returns text language sql immutable parallel safe as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- unaccent no es IMMUTABLE; este envoltorio permite usarlo en índices.
create or replace function public.f_unaccent(p text)
returns text language sql immutable parallel safe
set search_path = public, extensions as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  document_type text check (document_type in ('CI', 'RUC', 'PASAPORTE')),
  document_number text,
  business_name text,
  role public.user_role not null default 'customer',
  is_wholesale boolean not null default false,
  marketing_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where role <> 'customer';
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Casa',
  recipient text not null,
  phone text not null,
  department text not null,
  city text not null,
  street text not null,
  reference text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  logo_url text,
  description text,
  country text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  sort integer not null default 0,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  brand_id uuid references public.brands (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  status public.product_status not null default 'draft',
  price bigint not null check (price >= 0),
  compare_at_price bigint check (compare_at_price is null or compare_at_price >= 0),
  wholesale_price bigint check (wholesale_price is null or wholesale_price >= 0),
  cost bigint check (cost is null or cost >= 0),
  tax_rate smallint not null default 10 check (tax_rate in (0, 5, 10)),
  is_universal boolean not null default false,
  specs jsonb not null default '{}'::jsonb,
  warranty_months integer check (warranty_months is null or warranty_months >= 0),
  warranty_text text,
  weight_grams integer check (weight_grams is null or weight_grams >= 0),
  variant_group uuid,
  variant_label text,
  min_stock integer not null default 0 check (min_stock >= 0),
  popularity integer not null default 0,
  search_text text not null default '',
  search_codes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_sku_norm_idx on public.products (public.normalize_code(sku));
create index products_status_idx on public.products (status);
create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand_id);
create index products_variant_idx on public.products (variant_group) where variant_group is not null;
create index products_search_trgm_idx on public.products using gin (search_text extensions.gin_trgm_ops);
create index products_codes_trgm_idx on public.products using gin (search_codes extensions.gin_trgm_ops);
create index products_fts_idx on public.products using gin (to_tsvector('simple', search_text));
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

create table public.product_references (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  kind text not null check (kind in ('oem', 'alternative', 'manufacturer')),
  code text not null,
  brand text,
  normalized_code text generated always as (public.normalize_code(code)) stored,
  unique (product_id, kind, code)
);
create index product_references_code_idx on public.product_references (normalized_code);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  alt text,
  sort integer not null default 0
);
create index product_images_product_idx on public.product_images (product_id, sort);

create table public.product_relations (
  product_id uuid not null references public.products (id) on delete cascade,
  related_id uuid not null references public.products (id) on delete cascade,
  kind text not null check (kind in ('related', 'complementary')),
  primary key (product_id, related_id, kind),
  check (product_id <> related_id)
);

-- ---------------------------------------------------------------------------
-- Vehículos y compatibilidad
-- ---------------------------------------------------------------------------
create table public.vehicle_makes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  make_id uuid not null references public.vehicle_makes (id) on delete cascade,
  name text not null,
  slug text not null,
  unique (make_id, slug)
);

create table public.vehicle_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.vehicle_models (id) on delete cascade,
  code text unique, -- código corto para importaciones, p. ej. TOY-HILUX-28D-16
  year_from integer not null check (year_from between 1950 and 2100),
  year_to integer check (year_to is null or year_to >= year_from),
  engine text not null,
  fuel text check (fuel in ('nafta', 'diesel', 'flex', 'hibrido', 'electrico', 'gnc')),
  transmission text,
  notes text
);
create index vehicle_versions_model_idx on public.vehicle_versions (model_id);

-- Un repuesto puede servir a muchos vehículos y viceversa.
-- Sin fila => "pendiente de verificar" (salvo productos universales).
create table public.product_fitments (
  product_id uuid not null references public.products (id) on delete cascade,
  version_id uuid not null references public.vehicle_versions (id) on delete cascade,
  status public.fitment_status not null default 'confirmed',
  notes text,
  source text,
  verified_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (product_id, version_id)
);
create index product_fitments_version_idx on public.product_fitments (version_id, status);

-- ---------------------------------------------------------------------------
-- Inventario y proveedores
-- ---------------------------------------------------------------------------
create table public.stock_levels (
  product_id uuid primary key references public.products (id) on delete cascade,
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  check (reserved <= on_hand)
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  type public.stock_movement_type not null,
  quantity integer not null,
  on_hand_after integer not null,
  reserved_after integer not null,
  reason text,
  order_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  source text not null default 'system',
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  ruc text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.supplier_products (
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  supplier_sku text,
  cost bigint check (cost is null or cost >= 0),
  lead_time_days integer,
  is_preferred boolean not null default false,
  primary key (supplier_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Promociones
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text,
  type public.coupon_type not null,
  value numeric(12, 2) not null check (value > 0),
  min_subtotal bigint not null default 0,
  max_discount bigint,
  category_id uuid references public.categories (id) on delete set null,
  brand_id uuid references public.brands (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  per_customer_limit integer,
  used_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (type <> 'percent' or value <= 90)
);
create unique index coupons_code_idx on public.coupons (upper(code));

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  percent numeric(5, 2) not null check (percent > 0 and percent <= 90),
  scope public.promotion_scope not null default 'all',
  category_id uuid references public.categories (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  product_ids uuid[] not null default '{}',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Envíos y configuración
-- ---------------------------------------------------------------------------
create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  method public.delivery_method not null,
  departments text[] not null default '{}',
  cost bigint not null default 0 check (cost >= 0),
  free_over bigint,
  eta text,
  active boolean not null default true,
  sort integer not null default 0
);

create table public.settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001) unique,
  user_id uuid references public.profiles (id) on delete set null,
  access_token uuid not null default gen_random_uuid(),
  status public.order_status not null default 'pending_payment',
  customer_name text not null,
  email text not null,
  phone text not null,
  document_type text,
  document_number text,
  business_name text,
  invoice_requested boolean not null default false,
  delivery_method public.delivery_method not null,
  shipping_zone_id uuid references public.shipping_zones (id) on delete set null,
  shipping_address jsonb,
  subtotal bigint not null,
  discount_total bigint not null default 0,
  shipping_cost bigint not null default 0,
  tax_total bigint not null default 0,
  total bigint not null,
  currency text not null default 'PYG',
  display_currency text not null default 'PYG',
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text,
  notes text,
  tracking_code text,
  carrier text,
  source text not null default 'web',
  ai_conversation_id uuid,
  needs_attention boolean not null default false,
  attention_note text,
  reservation_expires_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_email_idx on public.orders (lower(email));
create index orders_paid_idx on public.orders (paid_at) where paid_at is not null;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

-- Copia del producto al momento de la compra: el pedido no cambia si cambia el catálogo.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  sku text not null,
  name text not null,
  brand_name text,
  image_url text,
  unit_price bigint not null,
  original_unit_price bigint not null,
  quantity integer not null check (quantity > 0),
  discount bigint not null default 0,
  tax_rate smallint not null,
  line_total bigint not null,
  unit_cost bigint
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create sequence public.payment_process_seq start with 100001;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null,
  shop_process_id bigint not null unique default nextval('public.payment_process_seq'),
  provider_ref text,
  status public.payment_status not null default 'pending',
  amount bigint not null,
  currency text not null default 'PYG',
  authorization_code text,
  response_description text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

-- Idempotencia de notificaciones de la pasarela: la misma notificación se procesa una sola vez.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_key text not null,
  payment_id uuid references public.payments (id) on delete set null,
  payload jsonb,
  result text,
  created_at timestamptz not null default now(),
  unique (provider, event_key)
);

create table public.returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  items jsonb not null,
  reason text not null,
  status public.return_status not null default 'received',
  restock boolean not null default true,
  refund_amount bigint not null default 0,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index returns_order_idx on public.returns (order_id);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
create table public.customer_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  version_id uuid not null references public.vehicle_versions (id) on delete cascade,
  year integer not null,
  nickname text,
  created_at timestamptz not null default now()
);
create index customer_vehicles_user_idx on public.customer_vehicles (user_id);

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);
create index customer_notes_customer_idx on public.customer_notes (customer_id);

-- Listas de compra (pensadas para talleres).
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table public.shopping_list_items (
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  primary key (list_id, product_id)
);

-- Avisos de reposición.
create table public.stock_notifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  email text not null,
  user_id uuid references public.profiles (id) on delete set null,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, email)
);

-- ---------------------------------------------------------------------------
-- Contenido
-- ---------------------------------------------------------------------------
create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  cta_label text,
  link_url text,
  image_url text,
  placement text not null default 'hero' check (placement in ('hero', 'strip')),
  sort integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null default '',
  published boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Analítica, IA y control
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  user_id uuid,
  type text not null check (type in ('page_view', 'product_view', 'search', 'add_to_cart', 'begin_checkout', 'purchase', 'chat_open')),
  product_id uuid,
  query text,
  results_count integer,
  value bigint,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_type_idx on public.analytics_events (type, created_at);
create index analytics_events_session_idx on public.analytics_events (session_id);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('shopper', 'admin')),
  user_id uuid references public.profiles (id) on delete set null,
  session_id text,
  title text,
  handoff_requested boolean not null default false,
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, id);

-- Acciones propuestas por el asistente administrativo que requieren confirmación humana.
create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  action_type text not null,
  payload jsonb not null,
  summary text not null,
  required_permission text not null,
  status public.ai_action_status not null default 'pending',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index ai_actions_user_idx on public.ai_actions (requested_by, created_at desc);

create table public.handoff_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  name text,
  contact text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.user_role,
  source text not null check (source in ('admin_ui', 'admin_ai', 'system', 'webhook', 'import')),
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- ===== 20260930000002_functions.sql =====
-- SR Autorrepuestos — permisos, búsqueda, precios y operaciones críticas.
-- Las operaciones que tocan stock, pagos y pedidos viven acá para ejecutarse en una sola transacción.

-- ---------------------------------------------------------------------------
-- Roles y permisos (espejo de src/lib/permissions.ts)
-- ---------------------------------------------------------------------------
create or replace function public.role_permissions(r public.user_role)
returns text[] language sql immutable as $$
  select case r
    when 'owner' then array[
      'products.read','products.write','products.publish','prices.write','inventory.read','inventory.adjust',
      'suppliers.manage','vehicles.manage','orders.read','orders.manage','customers.read','customers.write',
      'customers.notes','promotions.manage','content.manage','analytics.read','settings.manage','users.manage',
      'audit.read','ai.admin']
    when 'admin' then array[
      'products.read','products.write','products.publish','prices.write','inventory.read','inventory.adjust',
      'suppliers.manage','vehicles.manage','orders.read','orders.manage','customers.read','customers.write',
      'customers.notes','promotions.manage','content.manage','analytics.read','settings.manage',
      'audit.read','ai.admin']
    when 'catalog_manager' then array[
      'products.read','products.write','products.publish','prices.write','inventory.read','inventory.adjust',
      'suppliers.manage','vehicles.manage','content.manage','ai.admin']
    when 'order_operator' then array[
      'products.read','inventory.read','orders.read','orders.manage','customers.read','customers.notes','ai.admin']
    when 'analyst' then array[
      'products.read','inventory.read','orders.read','customers.read','analytics.read','ai.admin']
    else '{}'::text[]
  end
$$;

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p = any(public.role_permissions(public.current_user_role())), false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() <> 'customer', false)
$$;

create or replace function public.require_perm(p text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm(p) then
    raise exception 'PERMISSION_DENIED:%', p using errcode = '42501';
  end if;
end $$;

create or replace function public.write_audit(
  p_source text, p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb, p_meta jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, actor_role, source, action, entity, entity_id, before, after, meta)
  values (auth.uid(), public.current_user_role(),
          case when p_source in ('admin_ui', 'admin_ai', 'system', 'webhook', 'import') then p_source else 'admin_ui' end,
          p_action, p_entity, p_entity_id, p_before, p_after, p_meta);
end $$;

-- Crea el perfil al registrarse.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'phone')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Nadie cambia su propio rol ni su condición mayorista sin permiso.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new; -- service role / tareas internas
  end if;
  if new.role is distinct from old.role and not public.has_perm('users.manage') then
    raise exception 'PERMISSION_DENIED:users.manage' using errcode = '42501';
  end if;
  if new.role = 'owner' and old.role <> 'owner' and public.current_user_role() <> 'owner' then
    raise exception 'PERMISSION_DENIED:owner' using errcode = '42501';
  end if;
  if new.is_wholesale is distinct from old.is_wholesale and not public.has_perm('customers.write') then
    raise exception 'PERMISSION_DENIED:customers.write' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
for each row execute function public.guard_profile_update();

-- Precios y publicación requieren permisos específicos además del permiso de edición.
create or replace function public.guard_product_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (
       new.price is distinct from old.price or new.cost is distinct from old.cost or
       new.compare_at_price is distinct from old.compare_at_price or new.wholesale_price is distinct from old.wholesale_price)
     and not public.has_perm('prices.write') then
    raise exception 'PERMISSION_DENIED:prices.write' using errcode = '42501';
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    if not public.has_perm('products.publish') then
      raise exception 'PERMISSION_DENIED:products.publish' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger products_guard before insert or update on public.products
for each row execute function public.guard_product_write();

-- ---------------------------------------------------------------------------
-- Texto de búsqueda (nombre, marca, categoría, SKU, OEM y referencias alternativas)
-- ---------------------------------------------------------------------------
create or replace function public.products_search_refresh()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_brand text;
  v_category text;
  v_refs text;
  v_ref_codes text;
begin
  select name into v_brand from public.brands where id = new.brand_id;
  select name into v_category from public.categories where id = new.category_id;
  select string_agg(code, ' '), string_agg(normalized_code, ' ')
    into v_refs, v_ref_codes
    from public.product_references where product_id = new.id;

  new.search_text := lower(public.f_unaccent(concat_ws(' ',
    new.name, new.short_description, v_brand, v_category, new.variant_label, new.sku, v_refs)));
  new.search_codes := concat_ws(' ', public.normalize_code(new.sku), v_ref_codes);
  return new;
end $$;

create trigger products_search before insert or update of name, short_description, brand_id, category_id, sku, variant_label, updated_at
on public.products for each row execute function public.products_search_refresh();

create or replace function public.product_references_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.products set updated_at = now()
  where id = coalesce(new.product_id, old.product_id);
  return null;
end $$;

create trigger product_references_search after insert or update or delete on public.product_references
for each row execute function public.product_references_changed();

create or replace function public.brand_renamed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.products set updated_at = now() where brand_id = new.id;
  end if;
  return null;
end $$;

create trigger brands_search after update on public.brands
for each row execute function public.brand_renamed();

-- ---------------------------------------------------------------------------
-- Precios efectivos (promociones programadas)
-- ---------------------------------------------------------------------------
create or replace function public.promo_percent(p public.products)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(max(pr.percent), 0)
  from public.promotions pr
  where pr.active
    and pr.starts_at <= now()
    and (pr.ends_at is null or pr.ends_at > now())
    and (
      pr.scope = 'all'
      or (pr.scope = 'category' and (pr.category_id = p.category_id
          or pr.category_id = (select parent_id from public.categories where id = p.category_id)))
      or (pr.scope = 'brand' and pr.brand_id = p.brand_id)
      or (pr.scope = 'products' and p.id = any (pr.product_ids))
    )
$$;

-- Usable como columna calculada desde PostgREST: select=*,effective_price
create or replace function public.effective_price(p public.products)
returns bigint language sql stable security definer set search_path = public as $$
  select round(p.price * (100 - public.promo_percent(p)) / 100)::bigint
$$;

create or replace view public.catalog_products with (security_invoker = true) as
select
  p.id, p.sku, p.name, p.slug, p.short_description, p.status,
  p.brand_id, b.name as brand_name, b.slug as brand_slug,
  p.category_id, c.name as category_name, c.slug as category_slug,
  p.price,
  public.effective_price(p) as final_price,
  greatest(coalesce(p.compare_at_price, 0), p.price) as list_price,
  case when greatest(coalesce(p.compare_at_price, 0), p.price) > 0
       then round(100 - public.effective_price(p) * 100.0 / greatest(coalesce(p.compare_at_price, 0), p.price))::int
       else 0 end as discount_percent,
  p.tax_rate, p.is_universal, p.warranty_months, p.variant_group, p.variant_label,
  greatest(coalesce(s.on_hand, 0) - coalesce(s.reserved, 0), 0) as available,
  p.min_stock, p.popularity, p.created_at, p.published_at,
  (select i.url from public.product_images i where i.product_id = p.id order by i.sort limit 1) as image_url,
  p.search_text, p.search_codes
from public.products p
left join public.brands b on b.id = p.brand_id
left join public.categories c on c.id = p.category_id
left join public.stock_levels s on s.product_id = p.id;

-- ---------------------------------------------------------------------------
-- Compatibilidad
-- ---------------------------------------------------------------------------
create or replace function public.product_compatibility(p_product uuid, p_version uuid)
returns text language sql stable as $$
  select case
    when p_version is null then null
    when f.status = 'incompatible' then 'incompatible'
    when f.status = 'confirmed' then 'confirmed'
    when p.is_universal then 'confirmed'
    else 'unverified'
  end
  from public.products p
  left join public.product_fitments f on f.product_id = p.id and f.version_id = p_version
  where p.id = p_product
$$;

-- ---------------------------------------------------------------------------
-- Búsqueda del catálogo (respeta RLS: el público sólo ve productos publicados)
-- ---------------------------------------------------------------------------
create or replace function public.search_catalog(
  p_query text default null,
  p_category text default null,
  p_brands text[] default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_in_stock boolean default false,
  p_version uuid default null,
  p_compat text default 'all',
  p_sort text default 'relevance',
  p_limit integer default 24,
  p_offset integer default 0,
  p_on_sale boolean default false
)
returns table (
  id uuid, sku text, name text, slug text, short_description text,
  brand_name text, brand_slug text, category_name text, category_slug text,
  final_price bigint, list_price bigint, discount_percent integer, available integer,
  image_url text, is_universal boolean, variant_label text, popularity integer,
  compatibility text, relevance real, total_count bigint
)
language sql stable set search_path = public, extensions as $$
  with recursive
  params as (
    select
      nullif(trim(p_query), '') as q,
      public.normalize_code(p_query) as q_code,
      lower(public.f_unaccent(trim(coalesce(p_query, '')))) as q_text
  ),
  tsq as (
    select case when q is null then null else
      to_tsquery('simple', (
        select string_agg(w || ':*', ' & ')
        from regexp_split_to_table(regexp_replace(q_text, '[^a-z0-9ñ ]', ' ', 'g'), '\s+') w
        where w <> ''
      ))
    end as query
    from params
  ),
  cats as (
    select c.id from public.categories c where p_category is not null and c.slug = p_category
    union
    select c.id from public.categories c join cats on c.parent_id = cats.id
  ),
  base as (
    select
      cp.*,
      case
        when p_version is null then null
        when f.status = 'incompatible' then 'incompatible'
        when f.status = 'confirmed' then 'confirmed'
        when cp.is_universal then 'confirmed'
        else 'unverified'
      end as compat,
      case
        when prm.q is null then 0
        else
          (case when length(prm.q_code) >= 3 and (' ' || cp.search_codes || ' ') like ('% ' || prm.q_code || ' %') then 3 else 0 end)
          + (case when length(prm.q_code) >= 4 and cp.search_codes like ('%' || prm.q_code || '%') then 1.5 else 0 end)
          + (case when t.query is not null then ts_rank(to_tsvector('simple', cp.search_text), t.query) * 2 else 0 end)
          + extensions.similarity(cp.search_text, prm.q_text)
      end::real as rel,
      prm.q, prm.q_code, prm.q_text, t.query as tq
    from public.catalog_products cp
    cross join params prm
    cross join tsq t
    left join public.product_fitments f on f.product_id = cp.id and f.version_id = p_version
    where cp.status = 'published'
      and (p_category is null or cp.category_id in (select id from cats))
      and (p_brands is null or cardinality(p_brands) = 0 or cp.brand_slug = any (p_brands))
      and (p_min_price is null or cp.final_price >= p_min_price)
      and (p_max_price is null or cp.final_price <= p_max_price)
      and (not p_in_stock or cp.available > 0)
      and (not p_on_sale or cp.final_price < cp.list_price)
  ),
  matched as (
    select * from base b
    where b.q is null
       or (length(b.q_code) >= 3 and b.search_codes like ('%' || b.q_code || '%'))
       or (b.tq is not null and to_tsvector('simple', b.search_text) @@ b.tq)
       or extensions.word_similarity(b.q_text, b.search_text) > 0.45
  ),
  filtered as (
    select * from matched m
    where p_version is null
       or p_compat = 'all'
       or (p_compat = 'confirmed' and m.compat = 'confirmed')
       or (p_compat = 'exclude_incompatible' and m.compat <> 'incompatible')
  )
  select
    f.id, f.sku, f.name, f.slug, f.short_description,
    f.brand_name, f.brand_slug, f.category_name, f.category_slug,
    f.final_price, f.list_price, f.discount_percent, f.available,
    f.image_url, f.is_universal, f.variant_label, f.popularity,
    f.compat, f.rel, count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'price_asc' then f.final_price end asc nulls last,
    case when p_sort = 'price_desc' then f.final_price end desc nulls last,
    case when p_sort = 'newest' then f.published_at end desc nulls last,
    case when p_sort = 'relevance' and p_version is not null then
      case f.compat when 'confirmed' then 0 when 'unverified' then 1 else 2 end end asc nulls last,
    case when p_sort = 'relevance' then f.rel end desc nulls last,
    (f.available > 0) desc,
    f.popularity desc,
    f.name asc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------------------
-- Cotización del carrito: única fuente de verdad para precios, cupones y envío
-- Entrada: { items:[{product_id, quantity}], coupon_code, delivery_method, shipping_zone_id, user_id, email }
-- ---------------------------------------------------------------------------
create or replace function public.price_cart(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_items jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_user uuid := nullif(p ->> 'user_id', '')::uuid;
  v_email text := lower(nullif(trim(p ->> 'email'), ''));
  v_method public.delivery_method := coalesce(nullif(p ->> 'delivery_method', ''), 'pickup')::public.delivery_method;
  v_zone_id uuid := nullif(p ->> 'shipping_zone_id', '')::uuid;
  v_code text := upper(nullif(trim(p ->> 'coupon_code'), ''));
  v_wholesale boolean := false;
  v_lines jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_shipping bigint := 0;
  v_tax bigint := 0;
  v_row record;
  v_prod public.products;
  v_brand text;
  v_image text;
  v_available integer;
  v_unit bigint;
  v_coupon public.coupons;
  v_coupon_info jsonb := null;
  v_eligible bigint := 0;
  v_used integer;
  v_zone public.shipping_zones;
  v_line jsonb;
  v_assigned bigint := 0;
  v_idx integer := 0;
  v_eligible_count integer := 0;
  v_share bigint;
  v_out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('lines', '[]'::jsonb, 'errors', jsonb_build_array(jsonb_build_object('code', 'EMPTY_CART')),
      'subtotal', 0, 'discount_total', 0, 'shipping_cost', 0, 'tax_total', 0, 'total', 0);
  end if;
  if jsonb_array_length(v_items) > 60 then
    return jsonb_build_object('lines', '[]'::jsonb, 'errors', jsonb_build_array(jsonb_build_object('code', 'TOO_MANY_ITEMS')),
      'subtotal', 0, 'discount_total', 0, 'shipping_cost', 0, 'tax_total', 0, 'total', 0);
  end if;

  if v_user is not null then
    select coalesce(is_wholesale, false) into v_wholesale from public.profiles where id = v_user;
    v_wholesale := coalesce(v_wholesale, false);
  end if;

  for v_row in
    select (e ->> 'product_id')::uuid as product_id, sum(greatest((e ->> 'quantity')::int, 0))::int as quantity
    from jsonb_array_elements(v_items) e
    group by 1
    order by 1
  loop
    select * into v_prod from public.products where id = v_row.product_id;
    if not found or v_prod.status <> 'published' then
      v_errors := v_errors || jsonb_build_object('code', 'NOT_AVAILABLE', 'product_id', v_row.product_id);
      continue;
    end if;
    if v_row.quantity < 1 or v_row.quantity > 99 then
      v_errors := v_errors || jsonb_build_object('code', 'INVALID_QUANTITY', 'product_id', v_row.product_id, 'sku', v_prod.sku);
      continue;
    end if;

    select greatest(on_hand - reserved, 0) into v_available from public.stock_levels where product_id = v_prod.id;
    v_available := coalesce(v_available, 0);
    if v_row.quantity > v_available then
      v_errors := v_errors || jsonb_build_object('code', 'INSUFFICIENT_STOCK', 'product_id', v_prod.id,
        'sku', v_prod.sku, 'name', v_prod.name, 'available', v_available);
    end if;

    select name into v_brand from public.brands where id = v_prod.brand_id;
    select url into v_image from public.product_images where product_id = v_prod.id order by sort limit 1;

    v_unit := case when v_wholesale and v_prod.wholesale_price is not null
                   then least(v_prod.wholesale_price, public.effective_price(v_prod))
                   else public.effective_price(v_prod) end;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_prod.id, 'sku', v_prod.sku, 'name', v_prod.name, 'slug', v_prod.slug,
      'brand_name', v_brand, 'image_url', v_image, 'category_id', v_prod.category_id, 'brand_id', v_prod.brand_id,
      'unit_price', v_unit, 'original_unit_price', greatest(coalesce(v_prod.compare_at_price, 0), v_prod.price),
      'quantity', v_row.quantity, 'available', v_available, 'tax_rate', v_prod.tax_rate,
      'line_total', v_unit * v_row.quantity, 'discount', 0, 'unit_cost', v_prod.cost);
    v_subtotal := v_subtotal + v_unit * v_row.quantity;
  end loop;

  -- Cupón
  if v_code is not null then
    select * into v_coupon from public.coupons where upper(code) = v_code;
    if not found or not v_coupon.active then
      v_coupon_info := jsonb_build_object('code', v_code, 'valid', false, 'message', 'El cupón no existe o no está activo.');
    elsif v_coupon.starts_at is not null and v_coupon.starts_at > now() then
      v_coupon_info := jsonb_build_object('code', v_code, 'valid', false, 'message', 'El cupón todavía no está vigente.');
    elsif v_coupon.ends_at is not null and v_coupon.ends_at <= now() then
      v_coupon_info := jsonb_build_object('code', v_code, 'valid', false, 'message', 'El cupón está vencido.');
    elsif v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      v_coupon_info := jsonb_build_object('code', v_code, 'valid', false, 'message', 'El cupón alcanzó su límite de usos.');
    elsif v_subtotal < v_coupon.min_subtotal then
      v_coupon_info := jsonb_build_object('code', v_code, 'valid', false,
        'message', 'El cupón requiere una compra mínima de Gs. ' || to_char(v_coupon.min_subtotal, 'FM999G999G999G999') || '.');
    else
      if v_coupon.per_customer_limit is not null and v_email is not null then
        select count(*) into v_used from public.orders
        where coupon_id = v_coupon.id and lower(email) = v_email and status <> 'cancelled';
        if v_used >= v_coupon.per_customer_limit then
          v_coupon_info := jsonb_build_object('code', v_code, 'valid', false, 'message', 'Ya usaste este cupón.');
        end if;
      end if;

      if v_coupon_info is null then
        select coalesce(sum((l ->> 'line_total')::bigint), 0), count(*) into v_eligible, v_eligible_count
        from jsonb_array_elements(v_lines) l
        where (v_coupon.category_id is null
               or (l ->> 'category_id')::uuid = v_coupon.category_id
               or (select parent_id from public.categories where id = (l ->> 'category_id')::uuid) = v_coupon.category_id)
          and (v_coupon.brand_id is null or (l ->> 'brand_id')::uuid = v_coupon.brand_id);

        if v_eligible = 0 then
          v_coupon_info := jsonb_build_object('code', v_code, 'valid', false, 'message', 'Ningún producto del carrito aplica para este cupón.');
        else
          v_discount := case when v_coupon.type = 'percent'
                             then round(v_eligible * v_coupon.value / 100)::bigint
                             else least(v_coupon.value::bigint, v_eligible) end;
          if v_coupon.max_discount is not null then
            v_discount := least(v_discount, v_coupon.max_discount);
          end if;
          v_coupon_info := jsonb_build_object('code', v_coupon.code, 'valid', true, 'id', v_coupon.id,
            'message', coalesce(v_coupon.description, 'Cupón aplicado.'), 'discount', v_discount);
        end if;
      end if;
    end if;
  end if;

  -- Distribuye el descuento del cupón entre las líneas elegibles (para IVA y márgenes).
  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    if v_discount > 0 and v_eligible > 0
       and (v_coupon.category_id is null
            or (v_line ->> 'category_id')::uuid = v_coupon.category_id
            or (select parent_id from public.categories where id = (v_line ->> 'category_id')::uuid) = v_coupon.category_id)
       and (v_coupon.brand_id is null or (v_line ->> 'brand_id')::uuid = v_coupon.brand_id) then
      v_idx := v_idx + 1;
      if v_idx = v_eligible_count then
        v_share := v_discount - v_assigned;
      else
        v_share := round(v_discount * (v_line ->> 'line_total')::numeric / v_eligible)::bigint;
      end if;
      v_assigned := v_assigned + v_share;
      v_line := jsonb_set(v_line, '{discount}', to_jsonb(v_share));
    end if;
    v_tax := v_tax + round((((v_line ->> 'line_total')::bigint - (v_line ->> 'discount')::bigint)
                            * (v_line ->> 'tax_rate')::int)::numeric / (100 + (v_line ->> 'tax_rate')::int))::bigint;
    v_out := v_out || v_line;
  end loop;

  -- Envío
  if v_method <> 'pickup' then
    select * into v_zone from public.shipping_zones where id = v_zone_id and active and method = v_method;
    if not found then
      v_errors := v_errors || jsonb_build_object('code', 'SHIPPING_ZONE_REQUIRED');
    else
      v_shipping := case when v_zone.free_over is not null and v_subtotal - v_discount >= v_zone.free_over
                         then 0 else v_zone.cost end;
      v_tax := v_tax + round(v_shipping * 10 / 110.0)::bigint;
    end if;
  end if;

  return jsonb_build_object(
    'lines', v_out,
    'errors', v_errors,
    'coupon', v_coupon_info,
    'wholesale', v_wholesale,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'shipping_cost', v_shipping,
    'tax_total', v_tax,
    'total', v_subtotal - v_discount + v_shipping,
    'currency', 'PYG'
  );
end $$;

-- ---------------------------------------------------------------------------
-- Vencimiento de reservas: libera stock de pedidos no pagados a tiempo
-- ---------------------------------------------------------------------------
create or replace function public.expire_pending_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_order record;
  v_item record;
  v_count integer := 0;
  v_stock public.stock_levels;
begin
  for v_order in
    select id from public.orders
    where status = 'pending_payment' and reservation_expires_at < now()
    for update skip locked
  loop
    for v_item in
      select product_id, sum(quantity)::int as qty from public.order_items
      where order_id = v_order.id and product_id is not null group by product_id order by product_id
    loop
      update public.stock_levels
         set reserved = greatest(reserved - v_item.qty, 0), updated_at = now()
       where product_id = v_item.product_id
      returning * into v_stock;
      if found then
        insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, order_id, source)
        values (v_item.product_id, 'release', v_item.qty, v_stock.on_hand, v_stock.reserved, 'Reserva vencida', v_order.id, 'system');
      end if;
    end loop;

    update public.orders
       set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Pago no recibido dentro del plazo de reserva'
     where id = v_order.id;
    insert into public.order_status_history (order_id, from_status, to_status, note)
    values (v_order.id, 'pending_payment', 'cancelled', 'Reserva vencida');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Creación de pedido: cotiza en el servidor y reserva stock en la misma transacción
-- ---------------------------------------------------------------------------
create or replace function public.create_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_quote jsonb;
  v_order public.orders;
  v_line jsonb;
  v_stock public.stock_levels;
  v_minutes integer;
  v_method public.delivery_method := coalesce(nullif(p ->> 'delivery_method', ''), 'pickup')::public.delivery_method;
begin
  perform public.expire_pending_orders();

  v_quote := public.price_cart(p);
  if jsonb_array_length(v_quote -> 'errors') > 0 then
    return jsonb_build_object('ok', false, 'errors', v_quote -> 'errors', 'quote', v_quote);
  end if;
  if (p ->> 'coupon_code') is not null and trim(p ->> 'coupon_code') <> ''
     and coalesce((v_quote -> 'coupon' ->> 'valid')::boolean, false) = false then
    return jsonb_build_object('ok', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'INVALID_COUPON', 'message', v_quote -> 'coupon' ->> 'message')),
      'quote', v_quote);
  end if;

  select coalesce((value ->> 'reservation_minutes')::int, 45) into v_minutes from public.settings where key = 'checkout';
  v_minutes := coalesce(v_minutes, 45);

  insert into public.orders (
    user_id, customer_name, email, phone, document_type, document_number, business_name, invoice_requested,
    delivery_method, shipping_zone_id, shipping_address, subtotal, discount_total, shipping_cost, tax_total, total,
    display_currency, coupon_id, coupon_code, notes, source, ai_conversation_id, reservation_expires_at
  ) values (
    nullif(p ->> 'user_id', '')::uuid,
    p ->> 'customer_name', lower(p ->> 'email'), p ->> 'phone',
    nullif(p ->> 'document_type', ''), nullif(p ->> 'document_number', ''), nullif(p ->> 'business_name', ''),
    coalesce((p ->> 'invoice_requested')::boolean, false),
    v_method,
    case when v_method = 'pickup' then null else nullif(p ->> 'shipping_zone_id', '')::uuid end,
    case when v_method = 'pickup' then null else p -> 'shipping_address' end,
    (v_quote ->> 'subtotal')::bigint, (v_quote ->> 'discount_total')::bigint, (v_quote ->> 'shipping_cost')::bigint,
    (v_quote ->> 'tax_total')::bigint, (v_quote ->> 'total')::bigint,
    coalesce(nullif(p ->> 'display_currency', ''), 'PYG'),
    nullif(v_quote -> 'coupon' ->> 'id', '')::uuid,
    case when coalesce((v_quote -> 'coupon' ->> 'valid')::boolean, false) then v_quote -> 'coupon' ->> 'code' end,
    nullif(p ->> 'notes', ''),
    case when nullif(p ->> 'ai_conversation_id', '') is not null then 'chatbot' else 'web' end,
    nullif(p ->> 'ai_conversation_id', '')::uuid,
    now() + make_interval(mins => v_minutes)
  ) returning * into v_order;

  for v_line in select value from jsonb_array_elements(v_quote -> 'lines') order by value ->> 'product_id'
  loop
    update public.stock_levels
       set reserved = reserved + (v_line ->> 'quantity')::int, updated_at = now()
     where product_id = (v_line ->> 'product_id')::uuid
       and on_hand - reserved >= (v_line ->> 'quantity')::int
    returning * into v_stock;
    if not found then
      raise exception 'INSUFFICIENT_STOCK:%', v_line ->> 'sku' using errcode = 'P0001';
    end if;

    insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, order_id, source)
    values ((v_line ->> 'product_id')::uuid, 'reservation', (v_line ->> 'quantity')::int,
            v_stock.on_hand, v_stock.reserved, 'Reserva por pedido', v_order.id, 'system');

    insert into public.order_items (order_id, product_id, sku, name, brand_name, image_url, unit_price, original_unit_price,
                                    quantity, discount, tax_rate, line_total, unit_cost)
    values (v_order.id, (v_line ->> 'product_id')::uuid, v_line ->> 'sku', v_line ->> 'name', v_line ->> 'brand_name',
            v_line ->> 'image_url', (v_line ->> 'unit_price')::bigint, (v_line ->> 'original_unit_price')::bigint,
            (v_line ->> 'quantity')::int, (v_line ->> 'discount')::bigint, (v_line ->> 'tax_rate')::smallint,
            (v_line ->> 'line_total')::bigint, nullif(v_line ->> 'unit_cost', '')::bigint);
  end loop;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_order.id, null, 'pending_payment', 'Pedido creado');

  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'number', v_order.number,
    'access_token', v_order.access_token, 'total', v_order.total,
    'reservation_expires_at', v_order.reservation_expires_at);
end $$;

-- ---------------------------------------------------------------------------
-- Confirmación de pago (idempotente). La llama el webhook de la pasarela.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_event_key text,
  p_approved boolean,
  p_amount bigint,
  p_currency text,
  p_authorization text default null,
  p_description text default null,
  p_payload jsonb default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event_id bigint;
  v_pay public.payments;
  v_order public.orders;
  v_item record;
  v_stock public.stock_levels;
  v_shortage text := null;
  v_prev public.order_status;
begin
  insert into public.payment_events (provider, event_key, payment_id, payload)
  select provider, p_event_key, id, p_payload from public.payments where id = p_payment_id
  on conflict (provider, event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    if not exists (select 1 from public.payments where id = p_payment_id) then
      return jsonb_build_object('result', 'unknown_payment');
    end if;
    return jsonb_build_object('result', 'duplicate');
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;

  if v_pay.status = 'approved' then
    update public.payment_events set result = 'already_approved' where id = v_event_id;
    return jsonb_build_object('result', 'already_approved', 'order_id', v_pay.order_id);
  end if;

  select * into v_order from public.orders where id = v_pay.order_id for update;

  if not p_approved then
    update public.payments set status = 'rejected', response_description = p_description, raw = p_payload where id = v_pay.id;
    update public.payment_events set result = 'rejected' where id = v_event_id;
    return jsonb_build_object('result', 'rejected', 'order_id', v_order.id);
  end if;

  if p_amount <> v_pay.amount or upper(p_currency) <> upper(v_pay.currency) then
    update public.payments set response_description = 'Monto o moneda no coinciden', raw = p_payload where id = v_pay.id;
    update public.orders set needs_attention = true,
      attention_note = 'La pasarela informó un monto distinto al del pedido. Revisar antes de despachar.'
     where id = v_order.id;
    update public.payment_events set result = 'amount_mismatch' where id = v_event_id;
    return jsonb_build_object('result', 'amount_mismatch', 'order_id', v_order.id);
  end if;

  update public.payments
     set status = 'approved', authorization_code = p_authorization, response_description = p_description, raw = p_payload
   where id = v_pay.id;

  v_prev := v_order.status;

  if v_order.status = 'pending_payment' then
    for v_item in
      select product_id, sum(quantity)::int as qty from public.order_items
      where order_id = v_order.id and product_id is not null group by product_id order by product_id
    loop
      update public.stock_levels
         set on_hand = on_hand - v_item.qty, reserved = reserved - v_item.qty, updated_at = now()
       where product_id = v_item.product_id
      returning * into v_stock;
      insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, order_id, source)
      values (v_item.product_id, 'sale_out', -v_item.qty, v_stock.on_hand, v_stock.reserved, 'Venta confirmada', v_order.id, 'webhook');
    end loop;
  elsif v_order.status = 'cancelled' then
    -- El pago llegó después de vencida la reserva: se intenta tomar stock disponible.
    for v_item in
      select product_id, sku, sum(quantity)::int as qty from public.order_items
      where order_id = v_order.id and product_id is not null group by product_id, sku order by product_id
    loop
      update public.stock_levels
         set on_hand = on_hand - v_item.qty, updated_at = now()
       where product_id = v_item.product_id and on_hand - reserved >= v_item.qty
      returning * into v_stock;
      if found then
        insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, order_id, source)
        values (v_item.product_id, 'sale_out', -v_item.qty, v_stock.on_hand, v_stock.reserved, 'Venta confirmada tras vencimiento', v_order.id, 'webhook');
      else
        v_shortage := concat_ws(', ', v_shortage, v_item.sku);
      end if;
    end loop;
  else
    update public.orders set needs_attention = true,
      attention_note = 'Se recibió un segundo pago aprobado para un pedido ya pagado. Evaluar reintegro.'
     where id = v_order.id;
    update public.payment_events set result = 'double_payment' where id = v_event_id;
    return jsonb_build_object('result', 'double_payment', 'order_id', v_order.id);
  end if;

  update public.orders
     set status = 'paid', paid_at = now(), cancelled_at = null, cancel_reason = null,
         needs_attention = (v_shortage is not null),
         attention_note = case when v_shortage is not null
           then 'Pago aprobado después del vencimiento sin stock suficiente para: ' || v_shortage else null end
   where id = v_order.id;

  update public.products p set popularity = p.popularity + i.qty
    from (select product_id, sum(quantity)::int as qty from public.order_items
          where order_id = v_order.id and product_id is not null group by product_id) i
   where p.id = i.product_id;

  if v_order.coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_order.coupon_id;
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, note)
  values (v_order.id, v_prev, 'paid', 'Pago aprobado por ' || v_pay.provider);
  update public.payment_events set result = 'approved' where id = v_event_id;

  return jsonb_build_object('result', 'approved', 'order_id', v_order.id, 'needs_attention', v_shortage is not null);
end $$;

-- ---------------------------------------------------------------------------
-- Operaciones del panel (validan permisos del usuario que llama)
-- ---------------------------------------------------------------------------
create or replace function public.set_order_status(
  p_order_id uuid, p_status public.order_status, p_note text default null,
  p_tracking text default null, p_carrier text default null, p_source text default 'admin_ui'
) returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_ok boolean;
  v_prev public.order_status;
begin
  perform public.require_perm('orders.manage');
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_prev := v_order.status;

  v_ok := case
    when v_order.status = 'paid' and p_status = 'preparing' then true
    when v_order.status = 'preparing' and p_status = 'shipped' and v_order.delivery_method <> 'pickup' then true
    when v_order.status = 'preparing' and p_status = 'delivered' and v_order.delivery_method = 'pickup' then true
    when v_order.status = 'shipped' and p_status = 'delivered' then true
    else false end;
  if not v_ok then
    raise exception 'INVALID_TRANSITION:%->%', v_order.status, p_status using errcode = 'P0001';
  end if;

  update public.orders set
    status = p_status,
    tracking_code = coalesce(p_tracking, tracking_code),
    carrier = coalesce(p_carrier, carrier),
    shipped_at = case when p_status = 'shipped' then now() else shipped_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, note, actor_id)
  values (p_order_id, v_prev, p_status, p_note, auth.uid());
  perform public.write_audit(p_source, 'order.status', 'order', p_order_id::text, null,
    jsonb_build_object('status', p_status, 'tracking', p_tracking, 'note', p_note));
  return v_order;
end $$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text, p_source text default 'admin_ui')
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_item record;
  v_stock public.stock_levels;
  v_prev public.order_status;
begin
  perform public.require_perm('orders.manage');
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_order.status in ('shipped', 'delivered', 'cancelled') then
    raise exception 'CANNOT_CANCEL:%', v_order.status using errcode = 'P0001';
  end if;
  v_prev := v_order.status;

  for v_item in
    select product_id, sum(quantity)::int as qty from public.order_items
    where order_id = p_order_id and product_id is not null group by product_id order by product_id
  loop
    if v_prev = 'pending_payment' then
      update public.stock_levels set reserved = greatest(reserved - v_item.qty, 0), updated_at = now()
       where product_id = v_item.product_id returning * into v_stock;
      insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, order_id, actor_id, source)
      values (v_item.product_id, 'release', v_item.qty, v_stock.on_hand, v_stock.reserved, 'Cancelación: ' || p_reason, p_order_id, auth.uid(), p_source);
    else
      update public.stock_levels set on_hand = on_hand + v_item.qty, updated_at = now()
       where product_id = v_item.product_id returning * into v_stock;
      insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, order_id, actor_id, source)
      values (v_item.product_id, 'return_in', v_item.qty, v_stock.on_hand, v_stock.reserved, 'Cancelación: ' || p_reason, p_order_id, auth.uid(), p_source);
    end if;
  end loop;

  update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason,
    needs_attention = (v_prev <> 'pending_payment'),
    attention_note = case when v_prev <> 'pending_payment' then 'Pedido pagado y cancelado: gestionar el reintegro del pago.' else attention_note end
  where id = p_order_id returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, note, actor_id)
  values (p_order_id, v_prev, 'cancelled', p_reason, auth.uid());
  perform public.write_audit(p_source, 'order.cancel', 'order', p_order_id::text,
    jsonb_build_object('status', v_prev), jsonb_build_object('status', 'cancelled', 'reason', p_reason));
  return v_order;
end $$;

create or replace function public.adjust_stock(
  p_product_id uuid, p_delta integer, p_type public.stock_movement_type, p_reason text, p_source text default 'admin_ui'
) returns public.stock_levels language plpgsql security definer set search_path = public as $$
declare
  v_stock public.stock_levels;
  v_before integer;
begin
  perform public.require_perm('inventory.adjust');
  if p_type not in ('initial', 'purchase_in', 'adjustment') then
    raise exception 'INVALID_MOVEMENT_TYPE' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if p_delta = 0 then
    raise exception 'ZERO_DELTA' using errcode = 'P0001';
  end if;
  if p_type = 'purchase_in' and p_delta < 0 then
    raise exception 'PURCHASE_MUST_BE_POSITIVE' using errcode = 'P0001';
  end if;

  insert into public.stock_levels (product_id) values (p_product_id) on conflict do nothing;
  select * into v_stock from public.stock_levels where product_id = p_product_id for update;
  v_before := v_stock.on_hand;
  if v_stock.on_hand + p_delta < v_stock.reserved then
    raise exception 'STOCK_BELOW_RESERVED:%', v_stock.reserved using errcode = 'P0001';
  end if;

  update public.stock_levels set on_hand = on_hand + p_delta, updated_at = now()
   where product_id = p_product_id returning * into v_stock;
  insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, actor_id, source)
  values (p_product_id, p_type, p_delta, v_stock.on_hand, v_stock.reserved, p_reason, auth.uid(), p_source);
  perform public.write_audit(p_source, 'inventory.adjust', 'product', p_product_id::text,
    jsonb_build_object('on_hand', v_before), jsonb_build_object('on_hand', v_stock.on_hand, 'delta', p_delta, 'reason', p_reason));
  return v_stock;
end $$;

create or replace function public.register_return(
  p_order_id uuid, p_items jsonb, p_reason text, p_restock boolean, p_refund bigint, p_source text default 'admin_ui'
) returns public.returns language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_entry jsonb;
  v_item public.order_items;
  v_prev_returned integer;
  v_stock public.stock_levels;
  v_return public.returns;
begin
  perform public.require_perm('orders.manage');
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_order.status not in ('shipped', 'delivered') then
    raise exception 'RETURN_REQUIRES_DELIVERED_ORDER' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = 'P0001';
  end if;
  if p_refund < 0 or p_refund > v_order.total then
    raise exception 'INVALID_REFUND' using errcode = 'P0001';
  end if;

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    select * into v_item from public.order_items
     where id = (v_entry ->> 'order_item_id')::uuid and order_id = p_order_id;
    if not found then
      raise exception 'ITEM_NOT_IN_ORDER' using errcode = 'P0001';
    end if;
    select coalesce(sum((e ->> 'quantity')::int), 0) into v_prev_returned
      from public.returns r, jsonb_array_elements(r.items) e
     where r.order_id = p_order_id and r.status <> 'rejected' and (e ->> 'order_item_id')::uuid = v_item.id;
    if (v_entry ->> 'quantity')::int < 1 or (v_entry ->> 'quantity')::int + v_prev_returned > v_item.quantity then
      raise exception 'INVALID_RETURN_QUANTITY:%', v_item.sku using errcode = 'P0001';
    end if;
    if p_restock and v_item.product_id is not null then
      insert into public.stock_levels (product_id) values (v_item.product_id) on conflict do nothing;
      update public.stock_levels set on_hand = on_hand + (v_entry ->> 'quantity')::int, updated_at = now()
       where product_id = v_item.product_id returning * into v_stock;
      insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, order_id, actor_id, source)
      values (v_item.product_id, 'return_in', (v_entry ->> 'quantity')::int, v_stock.on_hand, v_stock.reserved,
              'Devolución: ' || p_reason, p_order_id, auth.uid(), p_source);
    end if;
  end loop;

  insert into public.returns (order_id, items, reason, status, restock, refund_amount, created_by)
  values (p_order_id, p_items, p_reason, case when p_refund > 0 then 'refunded' else 'received' end, p_restock, p_refund, auth.uid())
  returning * into v_return;
  perform public.write_audit(p_source, 'order.return', 'order', p_order_id::text, null,
    jsonb_build_object('items', p_items, 'refund', p_refund, 'restock', p_restock, 'reason', p_reason));
  return v_return;
end $$;

-- ---------------------------------------------------------------------------
-- Inventario bajo mínimo
-- ---------------------------------------------------------------------------
create or replace function public.low_stock(p_limit integer default 100)
returns table (product_id uuid, sku text, name text, status public.product_status, on_hand integer, reserved integer,
               available integer, min_stock integer, brand_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_perm('inventory.read');
  return query
    select p.id, p.sku, p.name, p.status, coalesce(s.on_hand, 0), coalesce(s.reserved, 0),
           coalesce(s.on_hand, 0) - coalesce(s.reserved, 0), p.min_stock, b.name
    from public.products p
    left join public.stock_levels s on s.product_id = p.id
    left join public.brands b on b.id = p.brand_id
    where p.status <> 'archived'
      and coalesce(s.on_hand, 0) - coalesce(s.reserved, 0) <= p.min_stock
    order by (coalesce(s.on_hand, 0) - coalesce(s.reserved, 0)) - p.min_stock asc, p.name
    limit p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- Indicadores del panel. Definiciones:
--  * Ingresos: total (IVA incluido, con envío y descuentos) de pedidos cobrados en el período
--    (según fecha de pago) que no fueron cancelados después.
--  * Ticket promedio: ingresos / pedidos cobrados.
--  * Margen estimado: ventas netas de IVA − costo registrado, sólo sobre líneas con costo cargado.
--  * Cliente nuevo: su primer pedido cobrado ocurre dentro del período (por email).
--  * Conversión: sesiones con compra / sesiones con alguna visita. Abandono: sesiones que agregaron
--    al carrito y no compraron / sesiones que agregaron al carrito.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_metrics(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform public.require_perm('analytics.read');

  with sold as (
    select o.* from public.orders o
    where o.paid_at >= p_from and o.paid_at < p_to and o.status in ('paid', 'preparing', 'shipped', 'delivered')
  ),
  items as (
    select i.*, p.category_id,
           (i.line_total - i.discount) as net_with_tax,
           round((i.line_total - i.discount) * 100.0 / (100 + i.tax_rate)) as net_ex_tax
    from public.order_items i
    join sold s on s.id = i.order_id
    left join public.products p on p.id = i.product_id
  ),
  first_orders as (
    select lower(email) as email, min(paid_at) as first_paid
    from public.orders where paid_at is not null and status <> 'cancelled'
    group by lower(email)
  ),
  customers as (
    select distinct lower(s.email) as email, (f.first_paid >= p_from) as is_new
    from sold s join first_orders f on f.email = lower(s.email)
  ),
  sessions as (
    select session_id,
      bool_or(type = 'add_to_cart') as carted,
      bool_or(type = 'purchase') as purchased
    from public.analytics_events
    where created_at >= p_from and created_at < p_to
    group by session_id
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(total) from sold), 0),
    'orders', (select count(*) from sold),
    'avg_ticket', coalesce((select round(avg(total)) from sold), 0),
    'units', coalesce((select sum(quantity) from items), 0),
    'discounts', coalesce((select sum(discount_total) from sold), 0),
    'margin', coalesce((select sum(net_ex_tax - unit_cost * quantity) from items where unit_cost is not null), 0),
    'margin_coverage', coalesce((select round(100.0 * sum(net_with_tax) filter (where unit_cost is not null) / nullif(sum(net_with_tax), 0))
                                 from items), 0),
    'new_customers', (select count(*) from customers where is_new),
    'returning_customers', (select count(*) from customers where not is_new),
    'cancelled_paid', (select count(*) from public.orders where cancelled_at >= p_from and cancelled_at < p_to and paid_at is not null),
    'cancelled_unpaid', (select count(*) from public.orders where cancelled_at >= p_from and cancelled_at < p_to and paid_at is null),
    'returns', (select count(*) from public.returns where created_at >= p_from and created_at < p_to),
    'refunds', coalesce((select sum(refund_amount) from public.returns where created_at >= p_from and created_at < p_to), 0),
    'pending_fulfillment', (select count(*) from public.orders where status in ('paid', 'preparing')),
    'pending_payment', (select count(*) from public.orders where status = 'pending_payment'),
    'needs_attention', (select count(*) from public.orders where needs_attention),
    'low_stock', (select count(*) from public.products p left join public.stock_levels s on s.product_id = p.id
                  where p.status = 'published' and coalesce(s.on_hand, 0) - coalesce(s.reserved, 0) <= p.min_stock),
    'sessions', (select count(*) from sessions),
    'sessions_with_cart', (select count(*) from sessions where carted),
    'sessions_with_purchase', (select count(*) from sessions where purchased),
    'top_products', coalesce((select jsonb_agg(t) from (
        select i.product_id, i.name, i.sku, sum(i.quantity) as units, sum(i.net_with_tax) as revenue
        from items i group by i.product_id, i.name, i.sku order by sum(i.net_with_tax) desc limit 8) t), '[]'::jsonb),
    'top_categories', coalesce((select jsonb_agg(t) from (
        select coalesce(c.name, 'Sin categoría') as name, sum(i.quantity) as units, sum(i.net_with_tax) as revenue
        from items i left join public.categories c on c.id = i.category_id
        group by c.name order by sum(i.net_with_tax) desc limit 8) t), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(t order by t.day) from (
        select to_char(date_trunc('day', paid_at at time zone 'America/Asuncion'), 'YYYY-MM-DD') as day,
               sum(total) as revenue, count(*) as orders
        from sold group by 1) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Reportes de gestión: búsquedas sin resultados, baja rotación, reposición y rendimiento del chatbot.
create or replace function public.management_insights(p_days integer default 60)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
begin
  perform public.require_perm('analytics.read');
  with sales as (
    select i.product_id, sum(i.quantity) as units
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.paid_at >= now() - interval '30 days' and o.status <> 'cancelled' and i.product_id is not null
    group by i.product_id
  ),
  recent as (
    select distinct i.product_id
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.paid_at >= v_since and o.status <> 'cancelled'
  ),
  lead as (
    select product_id, min(coalesce(sp.lead_time_days, s.lead_time_days)) as days
    from public.supplier_products sp join public.suppliers s on s.id = sp.supplier_id
    group by product_id
  )
  select jsonb_build_object(
    'searches_without_results', coalesce((select jsonb_agg(t) from (
        select lower(trim(query)) as query, count(*) as times, max(created_at) as last_seen
        from public.analytics_events
        where type = 'search' and results_count = 0 and created_at >= v_since and coalesce(trim(query), '') <> ''
        group by lower(trim(query)) order by count(*) desc limit 25) t), '[]'::jsonb),
    'low_rotation', coalesce((select jsonb_agg(t) from (
        select p.id, p.sku, p.name, s.on_hand, (s.on_hand * coalesce(p.cost, p.price)) as stock_value
        from public.products p join public.stock_levels s on s.product_id = p.id
        where p.status = 'published' and s.on_hand > 0 and p.id not in (select product_id from recent where product_id is not null)
          and p.created_at < v_since
        order by s.on_hand * coalesce(p.cost, p.price) desc limit 25) t), '[]'::jsonb),
    'reorder_suggestions', coalesce((select jsonb_agg(t) from (
        select p.id, p.sku, p.name,
               coalesce(s.on_hand, 0) - coalesce(s.reserved, 0) as available,
               p.min_stock,
               round(coalesce(sa.units, 0) / 30.0, 2) as daily_sales,
               coalesce(l.days, 7) as lead_days,
               ceil(coalesce(sa.units, 0) / 30.0 * coalesce(l.days, 7) + p.min_stock
                    - (coalesce(s.on_hand, 0) - coalesce(s.reserved, 0)))::int as suggested_qty
        from public.products p
        left join public.stock_levels s on s.product_id = p.id
        left join sales sa on sa.product_id = p.id
        left join lead l on l.product_id = p.id
        where p.status = 'published'
          and ceil(coalesce(sa.units, 0) / 30.0 * coalesce(l.days, 7) + p.min_stock
                   - (coalesce(s.on_hand, 0) - coalesce(s.reserved, 0))) > 0
        order by coalesce(sa.units, 0) desc, p.name limit 30) t), '[]'::jsonb),
    'chatbot', jsonb_build_object(
        'conversations', (select count(*) from public.ai_conversations where kind = 'shopper' and created_at >= v_since),
        'handoffs', (select count(*) from public.ai_conversations where kind = 'shopper' and handoff_requested and created_at >= v_since),
        'assisted_orders', (select count(*) from public.orders where ai_conversation_id is not null and created_at >= v_since),
        'assisted_paid_orders', (select count(*) from public.orders where ai_conversation_id is not null and paid_at >= v_since
                                 and status <> 'cancelled'),
        'assisted_revenue', coalesce((select sum(total) from public.orders where ai_conversation_id is not null and paid_at >= v_since
                                      and status <> 'cancelled'), 0))
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Límite de uso (chatbots, formularios públicos)
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;

-- ===== 20260930000003_rls.sql =====
-- SR Autorrepuestos — políticas de acceso (RLS), permisos de funciones y almacenamiento.
-- Regla general: el comprador sólo ve sus datos; el personal accede según los permisos de su rol.
-- Las tablas sin políticas (rate_limits, payment_events) sólo son accesibles con la service role.

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_references enable row level security;
alter table public.product_images enable row level security;
alter table public.product_relations enable row level security;
alter table public.vehicle_makes enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.vehicle_versions enable row level security;
alter table public.product_fitments enable row level security;
alter table public.stock_levels enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.coupons enable row level security;
alter table public.promotions enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.returns enable row level security;
alter table public.customer_vehicles enable row level security;
alter table public.favorites enable row level security;
alter table public.customer_notes enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.stock_notifications enable row level security;
alter table public.banners enable row level security;
alter table public.pages enable row level security;
alter table public.analytics_events enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_actions enable row level security;
alter table public.handoff_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;

-- Perfiles ------------------------------------------------------------------
create policy profiles_self_select on public.profiles for select using (id = auth.uid() or public.has_perm('customers.read'));
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or public.has_perm('customers.write'))
  with check (id = auth.uid() or public.has_perm('customers.write'));
create policy profiles_users_manage on public.profiles for update using (public.has_perm('users.manage'))
  with check (public.has_perm('users.manage'));

create policy addresses_own on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy addresses_staff_read on public.addresses for select using (public.has_perm('customers.read'));

-- Catálogo (lectura pública de lo publicado) ------------------------------
create policy brands_read on public.brands for select using (true);
create policy brands_write on public.brands for all using (public.has_perm('products.write')) with check (public.has_perm('products.write'));

create policy categories_read on public.categories for select using (true);
create policy categories_write on public.categories for all using (public.has_perm('products.write')) with check (public.has_perm('products.write'));

create policy products_read on public.products for select using (status = 'published' or public.has_perm('products.read'));
create policy products_insert on public.products for insert with check (public.has_perm('products.write'));
create policy products_update on public.products for update using (public.has_perm('products.write')) with check (public.has_perm('products.write'));
create policy products_delete on public.products for delete using (public.has_perm('products.publish'));

create policy product_refs_read on public.product_references for select
  using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.has_perm('products.read'))));
create policy product_refs_write on public.product_references for all using (public.has_perm('products.write')) with check (public.has_perm('products.write'));

create policy product_images_read on public.product_images for select
  using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'published' or public.has_perm('products.read'))));
create policy product_images_write on public.product_images for all using (public.has_perm('products.write')) with check (public.has_perm('products.write'));

create policy product_relations_read on public.product_relations for select using (true);
create policy product_relations_write on public.product_relations for all using (public.has_perm('products.write')) with check (public.has_perm('products.write'));

create policy vehicle_makes_read on public.vehicle_makes for select using (true);
create policy vehicle_makes_write on public.vehicle_makes for all using (public.has_perm('vehicles.manage')) with check (public.has_perm('vehicles.manage'));
create policy vehicle_models_read on public.vehicle_models for select using (true);
create policy vehicle_models_write on public.vehicle_models for all using (public.has_perm('vehicles.manage')) with check (public.has_perm('vehicles.manage'));
create policy vehicle_versions_read on public.vehicle_versions for select using (true);
create policy vehicle_versions_write on public.vehicle_versions for all using (public.has_perm('vehicles.manage')) with check (public.has_perm('vehicles.manage'));

create policy fitments_read on public.product_fitments for select using (true);
create policy fitments_write on public.product_fitments for all using (public.has_perm('products.write')) with check (public.has_perm('products.write'));

-- Inventario: la disponibilidad es pública; los movimientos sólo pasan por funciones.
create policy stock_levels_read on public.stock_levels for select using (true);
create policy stock_movements_read on public.stock_movements for select using (public.has_perm('inventory.read'));

create policy suppliers_read on public.suppliers for select using (public.has_perm('suppliers.manage') or public.has_perm('inventory.read'));
create policy suppliers_write on public.suppliers for all using (public.has_perm('suppliers.manage')) with check (public.has_perm('suppliers.manage'));
create policy supplier_products_read on public.supplier_products for select using (public.has_perm('suppliers.manage') or public.has_perm('inventory.read'));
create policy supplier_products_write on public.supplier_products for all using (public.has_perm('suppliers.manage')) with check (public.has_perm('suppliers.manage'));

-- Promociones (los precios públicos se calculan con funciones SECURITY DEFINER).
create policy coupons_manage on public.coupons for all using (public.has_perm('promotions.manage')) with check (public.has_perm('promotions.manage'));
create policy coupons_analytics on public.coupons for select using (public.has_perm('analytics.read'));
create policy promotions_read_active on public.promotions for select
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()) or public.has_perm('promotions.manage') or public.has_perm('analytics.read'));
create policy promotions_manage on public.promotions for all using (public.has_perm('promotions.manage')) with check (public.has_perm('promotions.manage'));

-- Envíos y configuración ----------------------------------------------------
create policy shipping_zones_read on public.shipping_zones for select using (active or public.has_perm('settings.manage'));
create policy shipping_zones_write on public.shipping_zones for all using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

create policy settings_public_read on public.settings for select using (is_public or public.is_staff());
create policy settings_write on public.settings for all using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

-- Pedidos: se crean sólo mediante create_order (service role). ----------------
create policy orders_own_read on public.orders for select using (user_id = auth.uid() or public.has_perm('orders.read'));
create policy orders_staff_update on public.orders for update using (public.has_perm('orders.manage')) with check (public.has_perm('orders.manage'));

create policy order_items_read on public.order_items for select
  using (public.has_perm('orders.read') or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy order_history_read on public.order_status_history for select
  using (public.has_perm('orders.read') or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy payments_read on public.payments for select
  using (public.has_perm('orders.read') or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy returns_read on public.returns for select
  using (public.has_perm('orders.read') or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Datos del cliente -----------------------------------------------------------
create policy customer_vehicles_own on public.customer_vehicles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy customer_vehicles_staff on public.customer_vehicles for select using (public.has_perm('customers.read'));
create policy favorites_own on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shopping_lists_own on public.shopping_lists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shopping_list_items_own on public.shopping_list_items for all
  using (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid()));
create policy stock_notifications_own on public.stock_notifications for select using (user_id = auth.uid() or public.has_perm('products.read'));

-- Notas internas: acceso restringido.
create policy customer_notes_restricted on public.customer_notes for all
  using (public.has_perm('customers.notes')) with check (public.has_perm('customers.notes') and author_id = auth.uid());

-- Contenido -------------------------------------------------------------------
create policy banners_read on public.banners for select
  using ((active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or public.has_perm('content.manage'));
create policy banners_write on public.banners for all using (public.has_perm('content.manage')) with check (public.has_perm('content.manage'));
create policy pages_read on public.pages for select using (published or public.has_perm('content.manage'));
create policy pages_write on public.pages for all using (public.has_perm('content.manage')) with check (public.has_perm('content.manage'));

-- Analítica, IA y auditoría ----------------------------------------------------------
create policy analytics_read on public.analytics_events for select using (public.has_perm('analytics.read'));

create policy ai_conversations_own on public.ai_conversations for select
  using ((kind = 'admin' and user_id = auth.uid()) or (kind = 'shopper' and public.has_perm('analytics.read')));
create policy ai_conversations_admin_insert on public.ai_conversations for insert
  with check (kind = 'admin' and user_id = auth.uid() and public.has_perm('ai.admin'));
create policy ai_conversations_admin_update on public.ai_conversations for update
  using (kind = 'admin' and user_id = auth.uid()) with check (kind = 'admin' and user_id = auth.uid());
create policy ai_messages_own on public.ai_messages for select
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.kind = 'admin' and c.user_id = auth.uid()));
create policy ai_messages_admin_insert on public.ai_messages for insert
  with check (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.kind = 'admin' and c.user_id = auth.uid()));

create policy ai_actions_own on public.ai_actions for select using (requested_by = auth.uid() or public.has_perm('audit.read'));
create policy ai_actions_insert on public.ai_actions for insert with check (requested_by = auth.uid() and public.has_perm('ai.admin'));
create policy ai_actions_update on public.ai_actions for update using (requested_by = auth.uid()) with check (requested_by = auth.uid());

create policy handoff_staff on public.handoff_requests for select using (public.has_perm('orders.read'));
create policy handoff_staff_update on public.handoff_requests for update using (public.has_perm('orders.manage')) with check (public.has_perm('orders.manage'));

create policy audit_read on public.audit_log for select using (public.has_perm('audit.read'));
create policy audit_insert on public.audit_log for insert with check (public.is_staff() and actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Funciones: las operaciones críticas sólo desde el servidor (service role)
-- ---------------------------------------------------------------------------
revoke execute on function public.price_cart(jsonb) from public, anon, authenticated;
revoke execute on function public.create_order(jsonb) from public, anon, authenticated;
revoke execute on function public.confirm_payment(uuid, text, boolean, bigint, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.expire_pending_orders() from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, text, jsonb, jsonb, jsonb) from public, anon;

revoke execute on function public.set_order_status(uuid, public.order_status, text, text, text, text) from public, anon;
revoke execute on function public.cancel_order(uuid, text, text) from public, anon;
revoke execute on function public.adjust_stock(uuid, integer, public.stock_movement_type, text, text) from public, anon;
revoke execute on function public.register_return(uuid, jsonb, text, boolean, bigint, text) from public, anon;
revoke execute on function public.low_stock(integer) from public, anon;
revoke execute on function public.dashboard_metrics(timestamptz, timestamptz) from public, anon;
revoke execute on function public.management_insights(integer) from public, anon;

grant execute on function public.write_audit(text, text, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text, text, text, text) to authenticated;
grant execute on function public.cancel_order(uuid, text, text) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, public.stock_movement_type, text, text) to authenticated;
grant execute on function public.register_return(uuid, jsonb, text, boolean, bigint, text) to authenticated;
grant execute on function public.low_stock(integer) to authenticated;
grant execute on function public.dashboard_metrics(timestamptz, timestamptz) to authenticated;
grant execute on function public.management_insights(integer) to authenticated;

grant execute on function public.price_cart(jsonb) to service_role;
grant execute on function public.create_order(jsonb) to service_role;
grant execute on function public.confirm_payment(uuid, text, boolean, bigint, text, text, text, jsonb) to service_role;
grant execute on function public.expire_pending_orders() to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Almacenamiento: imágenes de productos (lectura pública, escritura con permiso)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

create policy product_images_bucket_read on storage.objects for select using (bucket_id = 'product-images');
create policy product_images_bucket_insert on storage.objects for insert
  with check (bucket_id = 'product-images' and public.has_perm('products.write'));
create policy product_images_bucket_update on storage.objects for update
  using (bucket_id = 'product-images' and public.has_perm('products.write'));
create policy product_images_bucket_delete on storage.objects for delete
  using (bucket_id = 'product-images' and public.has_perm('products.write'));

-- ===== seed.sql =====
-- SR Autorrepuestos — datos de demostración.
-- IMPORTANTE: precios, códigos y compatibilidades son ilustrativos. Reemplazalos por datos reales
-- (catálogo del proveedor o base técnica) antes de publicar la tienda.

-- Configuración ---------------------------------------------------------------
insert into public.settings (key, value, is_public) values
('store', '{
  "name": "SR Autorrepuestos",
  "legal_name": "SR Autorrepuestos",
  "ruc": "",
  "phone": "+595 21 000 000",
  "whatsapp": "+595 981 000 000",
  "email": "ventas@srautorrepuestos.com.py",
  "address": "Asunción, Paraguay",
  "hours": "Lunes a viernes de 8:00 a 18:00 · Sábados de 8:00 a 12:00"
}', true),
('currency', '{
  "base": "PYG",
  "rates": { "USD": 7800, "BRL": 1420 },
  "note": "Cotización de referencia: 1 USD = 7.800 Gs. · 1 BRL = 1.420 Gs. Los pagos se procesan en guaraníes."
}', true),
('checkout', '{ "reservation_minutes": 45, "guest_checkout": true }', true),
('policies', '{
  "shipping": "Retiro sin costo en nuestro local. Envíos a domicilio en Asunción y Gran Asunción en 24 a 48 h hábiles. Envíos al interior por agencia de transporte en 2 a 4 días hábiles.",
  "warranty": "Todos los repuestos tienen garantía del fabricante contra defectos de fabricación. El plazo figura en cada producto. La garantía no cubre fallas por instalación incorrecta ni desgaste normal.",
  "returns": "Podés devolver productos sin uso, en su empaque original y con la factura, dentro de los 7 días de recibidos. Las piezas eléctricas instaladas no admiten devolución salvo falla de fábrica.",
  "payment": "Aceptamos tarjetas de crédito y débito. Los precios incluyen IVA."
}', true),
('assistant', '{ "handoff_contact": "WhatsApp +595 981 000 000", "shopper_enabled": true, "admin_enabled": true }', false);

insert into public.shipping_zones (name, method, departments, cost, free_over, eta, sort) values
('Asunción', 'home', array['Asunción'], 25000, 1500000, '24 a 48 h hábiles', 1),
('Gran Asunción (Central)', 'home', array['Central'], 35000, 2000000, '24 a 72 h hábiles', 2),
('Interior del país', 'agency', array['Alto Paraná','Itapúa','Cordillera','Paraguarí','Guairá','Caaguazú','Caazapá','Misiones','Ñeembucú','Amambay','Canindeyú','Presidente Hayes','Concepción','San Pedro','Alto Paraguay','Boquerón'], 40000, 3000000, '2 a 4 días hábiles', 3);

-- Marcas y categorías -------------------------------------------------------------
insert into public.brands (name, slug, country, is_featured) values
('Bosch', 'bosch', 'Alemania', true),
('NGK', 'ngk', 'Japón', true),
('Mann-Filter', 'mann-filter', 'Alemania', true),
('Monroe', 'monroe', 'Estados Unidos', true),
('Cofap', 'cofap', 'Brasil', false),
('Fras-le', 'fras-le', 'Brasil', true),
('Nakata', 'nakata', 'Brasil', false),
('Moura', 'moura', 'Brasil', true),
('Gates', 'gates', 'Estados Unidos', false),
('SKF', 'skf', 'Suecia', false),
('Castrol', 'castrol', 'Reino Unido', true),
('Denso', 'denso', 'Japón', false),
('Valeo', 'valeo', 'Francia', false),
('TRW', 'trw', 'Alemania', false),
('Sachs', 'sachs', 'Alemania', false),
('Philips', 'philips', 'Países Bajos', false);

insert into public.categories (name, slug, icon, sort, is_featured, description) values
('Frenos', 'frenos', 'disc', 1, true, 'Pastillas, discos y componentes del sistema de frenos.'),
('Filtros', 'filtros', 'filter', 2, true, 'Filtros de aceite, aire, combustible y habitáculo.'),
('Suspensión', 'suspension', 'move-vertical', 3, true, 'Amortiguadores, rótulas, bujes y componentes de dirección.'),
('Encendido', 'encendido', 'zap', 4, true, 'Bujías, bobinas y cables.'),
('Eléctrico', 'electrico', 'battery-charging', 5, true, 'Baterías, lámparas y componentes eléctricos.'),
('Lubricantes', 'lubricantes', 'droplet', 6, true, 'Aceites de motor, caja y fluidos.'),
('Motor', 'motor', 'cog', 7, true, 'Distribución, correas, bombas y juntas.'),
('Embrague', 'embrague', 'circle-dot', 8, false, 'Kits de embrague y componentes.');

insert into public.categories (parent_id, name, slug, icon, sort)
select c.id, v.name, v.slug, c.icon, v.sort
from (values
  ('frenos', 'Pastillas de freno', 'pastillas-de-freno', 1),
  ('frenos', 'Discos de freno', 'discos-de-freno', 2),
  ('frenos', 'Líquido de frenos', 'liquido-de-frenos', 3),
  ('filtros', 'Filtros de aceite', 'filtros-de-aceite', 1),
  ('filtros', 'Filtros de aire', 'filtros-de-aire', 2),
  ('filtros', 'Filtros de combustible', 'filtros-de-combustible', 3),
  ('filtros', 'Filtros de habitáculo', 'filtros-de-habitaculo', 4),
  ('suspension', 'Amortiguadores', 'amortiguadores', 1),
  ('suspension', 'Rótulas y extremos', 'rotulas-y-extremos', 2),
  ('encendido', 'Bujías', 'bujias', 1),
  ('encendido', 'Bobinas', 'bobinas', 2),
  ('electrico', 'Baterías', 'baterias', 1),
  ('electrico', 'Lámparas', 'lamparas', 2),
  ('lubricantes', 'Aceites de motor', 'aceites-de-motor', 1),
  ('motor', 'Distribución', 'distribucion', 1),
  ('motor', 'Bombas de agua', 'bombas-de-agua', 2),
  ('embrague', 'Kits de embrague', 'kits-de-embrague', 1)
) as v(parent, name, slug, sort)
join public.categories c on c.slug = v.parent;

-- Vehículos -------------------------------------------------------------------
insert into public.vehicle_makes (name, slug) values
('Toyota', 'toyota'), ('Kia', 'kia'), ('Hyundai', 'hyundai'), ('Nissan', 'nissan'),
('Chevrolet', 'chevrolet'), ('Volkswagen', 'volkswagen'), ('Mitsubishi', 'mitsubishi');

insert into public.vehicle_models (make_id, name, slug)
select m.id, v.name, v.slug
from (values
  ('toyota', 'Hilux', 'hilux'), ('toyota', 'Corolla', 'corolla'), ('toyota', 'Vitz', 'vitz'),
  ('toyota', 'Fortuner', 'fortuner'), ('toyota', 'RAV4', 'rav4'),
  ('kia', 'Picanto', 'picanto'), ('kia', 'Sportage', 'sportage'), ('kia', 'Rio', 'rio'),
  ('hyundai', 'HB20', 'hb20'), ('hyundai', 'Tucson', 'tucson'), ('hyundai', 'Creta', 'creta'),
  ('nissan', 'Frontier', 'frontier'), ('nissan', 'March', 'march'), ('nissan', 'Versa', 'versa'),
  ('chevrolet', 'Onix', 'onix'), ('chevrolet', 'S10', 's10'),
  ('volkswagen', 'Gol', 'gol'), ('volkswagen', 'Amarok', 'amarok'),
  ('mitsubishi', 'L200', 'l200')
) as v(make, name, slug)
join public.vehicle_makes m on m.slug = v.make;

insert into public.vehicle_versions (model_id, code, year_from, year_to, engine, fuel, transmission)
select mo.id, v.code, v.y1, v.y2, v.engine, v.fuel, v.trans
from (values
  ('toyota', 'hilux', 'TOY-HILUX-30D-05', 2005, 2015, '3.0 D-4D (1KD-FTV)', 'diesel', 'Manual / Automática'),
  ('toyota', 'hilux', 'TOY-HILUX-24D-16', 2016, null, '2.4 D-4D (2GD-FTV)', 'diesel', 'Manual'),
  ('toyota', 'hilux', 'TOY-HILUX-28D-16', 2016, null, '2.8 D-4D (1GD-FTV)', 'diesel', 'Manual / Automática'),
  ('toyota', 'corolla', 'TOY-COROL-18-14', 2014, 2019, '1.8 Dual VVT-i (2ZR-FE)', 'nafta', 'Manual / CVT'),
  ('toyota', 'corolla', 'TOY-COROL-20-20', 2020, null, '2.0 Dynamic Force (M20A)', 'nafta', 'CVT'),
  ('toyota', 'vitz', 'TOY-VITZ-10-11', 2011, 2019, '1.0 (1KR-FE)', 'nafta', 'CVT'),
  ('toyota', 'vitz', 'TOY-VITZ-13-11', 2011, 2019, '1.3 (1NR-FE)', 'nafta', 'CVT'),
  ('toyota', 'fortuner', 'TOY-FORT-28D-16', 2016, null, '2.8 D-4D (1GD-FTV)', 'diesel', 'Automática'),
  ('toyota', 'rav4', 'TOY-RAV4-20-19', 2019, null, '2.0 Dynamic Force (M20A)', 'nafta', 'CVT'),
  ('kia', 'picanto', 'KIA-PICA-10-17', 2017, null, '1.0 Kappa', 'nafta', 'Manual'),
  ('kia', 'picanto', 'KIA-PICA-12-17', 2017, null, '1.2 Kappa', 'nafta', 'Manual / Automática'),
  ('kia', 'sportage', 'KIA-SPOR-20-16', 2016, 2021, '2.0 Nu MPI', 'nafta', 'Automática'),
  ('kia', 'sportage', 'KIA-SPOR-20D-16', 2016, 2021, '2.0 CRDi', 'diesel', 'Automática'),
  ('kia', 'rio', 'KIA-RIO-14-17', 2017, 2023, '1.4 Kappa', 'nafta', 'Manual / Automática'),
  ('hyundai', 'hb20', 'HYU-HB20-10-19', 2019, null, '1.0 Kappa', 'nafta', 'Manual'),
  ('hyundai', 'hb20', 'HYU-HB20-16-19', 2019, null, '1.6 Gamma', 'nafta', 'Automática'),
  ('hyundai', 'tucson', 'HYU-TUCS-20-16', 2016, 2021, '2.0 Nu MPI', 'nafta', 'Automática'),
  ('hyundai', 'tucson', 'HYU-TUCS-20D-16', 2016, 2021, '2.0 CRDi', 'diesel', 'Automática'),
  ('hyundai', 'creta', 'HYU-CRET-16-17', 2017, null, '1.6 Gamma', 'nafta', 'Manual / Automática'),
  ('nissan', 'frontier', 'NIS-FRON-23D-16', 2016, null, '2.3 dCi Biturbo (YS23)', 'diesel', 'Manual / Automática'),
  ('nissan', 'march', 'NIS-MARC-16-12', 2012, 2020, '1.6 (HR16DE)', 'nafta', 'Manual'),
  ('nissan', 'versa', 'NIS-VERS-16-12', 2012, 2019, '1.6 (HR16DE)', 'nafta', 'Manual / CVT'),
  ('chevrolet', 'onix', 'CHE-ONIX-14-13', 2013, 2019, '1.4 SPE/4', 'flex', 'Manual'),
  ('chevrolet', 'onix', 'CHE-ONIX-10T-20', 2020, null, '1.0 Turbo', 'nafta', 'Manual / Automática'),
  ('chevrolet', 's10', 'CHE-S10-28D-12', 2012, null, '2.8 Duramax', 'diesel', 'Manual / Automática'),
  ('volkswagen', 'gol', 'VW-GOL-16-13', 2013, 2023, '1.6 MSI', 'flex', 'Manual'),
  ('volkswagen', 'amarok', 'VW-AMAR-20D-10', 2010, null, '2.0 TDI', 'diesel', 'Manual / Automática'),
  ('mitsubishi', 'l200', 'MIT-L200-24D-16', 2016, null, '2.4 MIVEC (4N15)', 'diesel', 'Manual / Automática')
) as v(make, model, code, y1, y2, engine, fuel, trans)
join public.vehicle_makes ma on ma.slug = v.make
join public.vehicle_models mo on mo.make_id = ma.id and mo.slug = v.model;

-- Productos -------------------------------------------------------------------
insert into public.products (sku, name, slug, short_description, description, brand_id, category_id, status,
                             price, compare_at_price, cost, is_universal, specs, warranty_months, min_stock, weight_grams)
select v.sku, v.name, v.slug, v.short, v.descr, b.id, c.id, 'published',
       v.price, v.compare, v.cost, v.universal, v.specs::jsonb, v.warranty, v.min_stock, v.weight
from (values
  ('SR-FRE-0001', 'Pastillas de freno delanteras cerámicas', 'pastillas-freno-delanteras-bosch-hilux', 'Juego de 4 pastillas cerámicas de bajo polvo para eje delantero.',
   'Pastillas de compuesto cerámico con chapa antirruido y indicador de desgaste. Menor emisión de polvo y funcionamiento silencioso. Se recomienda revisar el estado de los discos al reemplazarlas.',
   'bosch', 'pastillas-de-freno', 395000, 440000, 240000, false, '{"Posición":"Delantera","Material":"Cerámico","Piezas":"4","Indicador de desgaste":"Sí"}', 12, 4, 1900),
  ('SR-FRE-0002', 'Pastillas de freno delanteras semimetálicas', 'pastillas-freno-delanteras-frasle-hilux', 'Juego de pastillas semimetálicas para uso intensivo y carga.',
   'Compuesto semimetálico de alto coeficiente de fricción, pensado para camionetas con carga o uso en caminos de tierra.',
   'fras-le', 'pastillas-de-freno', 285000, null, 165000, false, '{"Posición":"Delantera","Material":"Semimetálico","Piezas":"4"}', 6, 4, 2000),
  ('SR-FRE-0003', 'Pastillas de freno delanteras', 'pastillas-freno-delanteras-trw-corolla', 'Pastillas delanteras con cámara de ruido y chaflanes.',
   'Pastillas con formulación de bajo ruido para autos de pasajeros. Incluyen accesorios de montaje.',
   'trw', 'pastillas-de-freno', 265000, null, 150000, false, '{"Posición":"Delantera","Material":"Orgánico de baja metalicidad","Piezas":"4"}', 12, 3, 1300),
  ('SR-FRE-0004', 'Pastillas de freno delanteras', 'pastillas-freno-delanteras-frasle-hb20', 'Juego de pastillas delanteras para compactos.',
   'Pastillas con compuesto orgánico para uso urbano, desgaste parejo y bajo ruido.',
   'fras-le', 'pastillas-de-freno', 185000, null, 98000, false, '{"Posición":"Delantera","Material":"Orgánico","Piezas":"4"}', 6, 4, 1100),
  ('SR-FRE-0005', 'Disco de freno delantero ventilado', 'disco-freno-delantero-trw-hilux', 'Disco ventilado delantero, se vende por unidad.',
   'Disco ventilado de fundición gris con tratamiento anticorrosión. Se recomienda reemplazar en pares y junto con las pastillas.',
   'trw', 'discos-de-freno', 520000, null, 320000, false, '{"Posición":"Delantera","Tipo":"Ventilado","Diámetro":"319 mm","Unidades":"1"}', 12, 2, 9800),
  ('SR-FRE-0006', 'Disco de freno delantero', 'disco-freno-delantero-bosch-corolla', 'Disco delantero ventilado para Corolla, por unidad.',
   'Disco ventilado con balanceo de fábrica. Se vende por unidad; reemplazar siempre de a pares.',
   'bosch', 'discos-de-freno', 410000, null, 250000, false, '{"Posición":"Delantera","Tipo":"Ventilado","Diámetro":"275 mm","Unidades":"1"}', 12, 2, 7200),
  ('SR-FRE-0007', 'Líquido de frenos DOT 4 500 ml', 'liquido-frenos-dot4-bosch-500', 'Líquido sintético DOT 4 de alto punto de ebullición.',
   'Líquido de frenos sintético DOT 4. Compatible con sistemas que especifican DOT 3 o DOT 4. No mezclar con DOT 5 (silicona).',
   'bosch', 'liquido-de-frenos', 58000, null, 32000, true, '{"Norma":"DOT 4","Contenido":"500 ml","Punto de ebullición seco":"265 °C"}', null, 10, 600),
  ('SR-FIL-0001', 'Filtro de aceite', 'filtro-aceite-mann-hilux-diesel', 'Filtro de aceite de cartucho para motores diésel GD.',
   'Elemento filtrante de cartucho con juntas incluidas. Reemplazar en cada cambio de aceite.',
   'mann-filter', 'filtros-de-aceite', 78000, null, 42000, false, '{"Tipo":"Cartucho","Juntas incluidas":"Sí"}', 6, 10, 250),
  ('SR-FIL-0002', 'Filtro de aceite', 'filtro-aceite-bosch-toyota-nafta', 'Filtro de aceite roscado para motores nafteros Toyota.',
   'Filtro roscado con válvula antirretorno de silicona. Apto para aceites sintéticos.',
   'bosch', 'filtros-de-aceite', 52000, null, 27000, false, '{"Tipo":"Roscado","Rosca":"M20 x 1.5","Válvula antirretorno":"Silicona"}', 6, 12, 220),
  ('SR-FIL-0003', 'Filtro de aceite', 'filtro-aceite-mann-kia-hyundai', 'Filtro de aceite roscado para motores Kappa y Gamma.',
   'Filtro roscado para motores de Kia y Hyundai. Medio filtrante de celulosa reforzada.',
   'mann-filter', 'filtros-de-aceite', 48000, null, 24000, false, '{"Tipo":"Roscado","Rosca":"3/4-16 UNF"}', 6, 12, 200),
  ('SR-FIL-0004', 'Filtro de aire de motor', 'filtro-aire-mann-hilux', 'Filtro de aire de panel para Hilux y Fortuner.',
   'Filtro de aire con medio filtrante de alta retención de polvo, ideal para caminos de tierra. Revisar cada 10.000 km.',
   'mann-filter', 'filtros-de-aire', 145000, null, 82000, false, '{"Forma":"Panel","Uso recomendado":"Caminos con polvo"}', 6, 6, 500),
  ('SR-FIL-0005', 'Filtro de aire de motor', 'filtro-aire-bosch-corolla', 'Filtro de aire de panel para Corolla.',
   'Filtro de panel con marco de poliuretano y alta capacidad de retención.',
   'bosch', 'filtros-de-aire', 98000, null, 52000, false, '{"Forma":"Panel"}', 6, 6, 350),
  ('SR-FIL-0006', 'Filtro de combustible diésel', 'filtro-combustible-bosch-hilux', 'Filtro de combustible con separador de agua.',
   'Filtro de combustible para sistemas common rail con separación de agua. Fundamental para cuidar los inyectores.',
   'bosch', 'filtros-de-combustible', 165000, 185000, 95000, false, '{"Tipo":"Cartucho","Separador de agua":"Sí"}', 6, 5, 400),
  ('SR-FIL-0007', 'Filtro de habitáculo con carbón activado', 'filtro-habitaculo-mann-toyota', 'Filtro de aire acondicionado con carbón activado.',
   'Retiene polen, polvo y olores. Se recomienda cambiar cada 15.000 km o una vez al año.',
   'mann-filter', 'filtros-de-habitaculo', 115000, null, 58000, false, '{"Tipo":"Carbón activado"}', 6, 6, 250),
  ('SR-SUS-0001', 'Amortiguador delantero a gas', 'amortiguador-delantero-monroe-hilux', 'Amortiguador delantero bitubo presurizado, por unidad.',
   'Amortiguador a gas de doble tubo con válvulas de respuesta progresiva. Se recomienda reemplazar por pares del mismo eje.',
   'monroe', 'amortiguadores', 680000, null, 420000, false, '{"Posición":"Delantera","Tipo":"Gas bitubo","Unidades":"1"}', 12, 2, 2800),
  ('SR-SUS-0002', 'Amortiguador trasero a gas', 'amortiguador-trasero-monroe-hilux', 'Amortiguador trasero para camioneta, por unidad.',
   'Amortiguador trasero de alto recorrido para uso con carga.',
   'monroe', 'amortiguadores', 620000, null, 380000, false, '{"Posición":"Trasera","Tipo":"Gas bitubo","Unidades":"1"}', 12, 2, 2600),
  ('SR-SUS-0003', 'Amortiguador delantero', 'amortiguador-delantero-cofap-hb20', 'Amortiguador delantero tipo McPherson, por unidad.',
   'Amortiguador McPherson presurizado. Reemplazar por pares.',
   'cofap', 'amortiguadores', 455000, null, 270000, false, '{"Posición":"Delantera","Tipo":"McPherson","Unidades":"1"}', 12, 2, 2400),
  ('SR-SUS-0004', 'Rótula de suspensión inferior', 'rotula-inferior-nakata-hilux', 'Rótula inferior con perno y tuerca.',
   'Rótula forjada con guardapolvo reforzado. Incluye tuerca autofrenante.',
   'nakata', 'rotulas-y-extremos', 210000, null, 118000, false, '{"Posición":"Inferior","Incluye":"Tuerca"}', 6, 3, 900),
  ('SR-ENC-0001', 'Bujía de iridio', 'bujia-iridio-ngk-toyota', 'Bujía de iridio de larga duración, por unidad.',
   'Electrodo central de iridio de 0,6 mm para chispa estable y mayor duración. Se vende por unidad.',
   'ngk', 'bujias', 92000, null, 51000, false, '{"Electrodo":"Iridio","Rosca":"12 mm","Unidades":"1"}', 12, 16, 60),
  ('SR-ENC-0002', 'Bujía de níquel', 'bujia-niquel-ngk-kia-hyundai', 'Bujía convencional de níquel, por unidad.',
   'Bujía de uso estándar. Reemplazar según el plan de mantenimiento del fabricante.',
   'ngk', 'bujias', 36000, null, 18000, false, '{"Electrodo":"Níquel","Rosca":"14 mm","Unidades":"1"}', 6, 16, 55),
  ('SR-ENC-0003', 'Bobina de encendido', 'bobina-encendido-denso-toyota', 'Bobina de encendido tipo lápiz.',
   'Bobina individual por cilindro. Ante fallas de encendido intermitentes se recomienda diagnóstico previo.',
   'denso', 'bobinas', 480000, null, 300000, false, '{"Tipo":"Lápiz","Conector":"4 pines"}', 12, 2, 350),
  ('SR-ELE-0001', 'Batería 12V 70Ah', 'bateria-moura-70ah', 'Batería libre de mantenimiento 70 Ah, polo positivo derecho.',
   'Batería de plomo-calcio libre de mantenimiento. Verificar dimensiones y posición de polos antes de comprar.',
   'moura', 'baterias', 1150000, null, 780000, false, '{"Voltaje":"12 V","Capacidad":"70 Ah","CCA":"600 A","Polo positivo":"Derecho","Medidas":"278 x 175 x 175 mm"}', 18, 3, 18500),
  ('SR-ELE-0002', 'Batería 12V 90Ah', 'bateria-moura-90ah', 'Batería 90 Ah para camionetas diésel.',
   'Batería de alta capacidad de arranque para motores diésel. Libre de mantenimiento.',
   'moura', 'baterias', 1480000, 1590000, 990000, false, '{"Voltaje":"12 V","Capacidad":"90 Ah","CCA":"760 A","Polo positivo":"Derecho","Medidas":"306 x 173 x 225 mm"}', 18, 3, 23500),
  ('SR-ELE-0003', 'Batería 12V 45Ah', 'bateria-moura-45ah', 'Batería compacta para autos chicos.',
   'Batería libre de mantenimiento para compactos. Confirmar medidas del alojamiento.',
   'moura', 'baterias', 820000, null, 540000, false, '{"Voltaje":"12 V","Capacidad":"45 Ah","CCA":"400 A","Polo positivo":"Derecho","Medidas":"212 x 175 x 175 mm"}', 18, 3, 12000),
  ('SR-ELE-0004', 'Lámpara H4 12V 60/55W', 'lampara-h4-philips', 'Lámpara halógena H4 de luz alta y baja.',
   'Lámpara halógena H4 estándar. Se vende por unidad.',
   'philips', 'lamparas', 38000, null, 19000, false, '{"Tipo":"H4","Potencia":"60/55 W","Voltaje":"12 V"}', 3, 20, 40),
  ('SR-ELE-0005', 'Lámpara H7 12V 55W', 'lampara-h7-philips', 'Lámpara halógena H7.',
   'Lámpara halógena H7 estándar. Se vende por unidad.',
   'philips', 'lamparas', 42000, null, 21000, false, '{"Tipo":"H7","Potencia":"55 W","Voltaje":"12 V"}', 3, 20, 40),
  ('SR-LUB-0001', 'Aceite de motor 15W-40 diésel 4 L', 'aceite-castrol-15w40-4l', 'Aceite mineral multigrado para motores diésel.',
   'Aceite para motores diésel con o sin turbo. Verificá en el manual la especificación requerida por tu motor.',
   'castrol', 'aceites-de-motor', 265000, null, 175000, true, '{"Viscosidad":"15W-40","Tipo":"Mineral","Norma":"API CI-4","Contenido":"4 L"}', null, 12, 3600),
  ('SR-LUB-0002', 'Aceite de motor 5W-30 sintético 4 L', 'aceite-castrol-5w30-4l', 'Aceite 100 % sintético para motores nafteros modernos.',
   'Aceite sintético de baja viscosidad. Verificá en el manual la especificación requerida por tu motor.',
   'castrol', 'aceites-de-motor', 345000, 375000, 225000, true, '{"Viscosidad":"5W-30","Tipo":"Sintético","Norma":"API SP","Contenido":"4 L"}', null, 12, 3500),
  ('SR-LUB-0003', 'Aceite de motor 0W-20 sintético 4 L', 'aceite-castrol-0w20-4l', 'Aceite sintético de muy baja viscosidad para motores recientes.',
   'Especificado por varios fabricantes japoneses y coreanos para motores nafteros recientes.',
   'castrol', 'aceites-de-motor', 360000, null, 238000, true, '{"Viscosidad":"0W-20","Tipo":"Sintético","Norma":"API SP / ILSAC GF-6","Contenido":"4 L"}', null, 8, 3500),
  ('SR-MOT-0001', 'Kit de correa de distribución con tensor', 'kit-distribucion-gates-hyundai-kia', 'Correa, tensor y polea guía.',
   'Kit completo de distribución. El reemplazo debe hacerlo personal calificado; una instalación incorrecta puede dañar el motor.',
   'gates', 'distribucion', 890000, null, 560000, false, '{"Incluye":"Correa, tensor y polea guía"}', 12, 2, 1400),
  ('SR-MOT-0002', 'Bomba de agua', 'bomba-agua-skf-toyota-diesel', 'Bomba de agua con junta.',
   'Bomba de agua con rodamiento sellado y junta incluida. Se recomienda reemplazar el refrigerante al instalarla.',
   'skf', 'bombas-de-agua', 640000, null, 400000, false, '{"Incluye":"Junta","Material del impulsor":"Metálico"}', 12, 2, 2100),
  ('SR-MOT-0003', 'Correa poly-V de accesorios', 'correa-poly-v-gates-hilux', 'Correa de accesorios 7 canales.',
   'Correa de accesorios de EPDM de larga duración.',
   'gates', 'distribucion', 185000, null, 102000, false, '{"Canales":"7","Material":"EPDM"}', 12, 3, 300),
  ('SR-EMB-0001', 'Kit de embrague', 'kit-embrague-sachs-hilux', 'Disco, placa y rulemán de empuje.',
   'Kit completo de embrague para transmisión manual. Recomendamos rectificar o verificar el volante motor al instalar.',
   'sachs', 'kits-de-embrague', 2150000, null, 1450000, false, '{"Incluye":"Disco, placa y rulemán","Diámetro":"275 mm"}', 12, 1, 9500),
  ('SR-EMB-0002', 'Kit de embrague', 'kit-embrague-valeo-gol', 'Kit de embrague para Gol 1.6.',
   'Kit de embrague con disco, placa y rulemán para transmisión manual.',
   'valeo', 'kits-de-embrague', 1250000, null, 820000, false, '{"Incluye":"Disco, placa y rulemán","Diámetro":"200 mm"}', 12, 1, 6200)
) as v(sku, name, slug, short, descr, brand, category, price, compare, cost, universal, specs, warranty, min_stock, weight)
join public.brands b on b.slug = v.brand
join public.categories c on c.slug = v.category;

-- Imágenes ilustrativas por categoría (reemplazar por fotos reales).
insert into public.product_images (product_id, url, alt, sort)
select p.id, '/placeholders/' || coalesce(parent.slug, c.slug) || '.svg', p.name, 0
from public.products p
join public.categories c on c.id = p.category_id
left join public.categories parent on parent.id = c.parent_id;

-- Referencias (OEM y alternativas) — códigos de demostración.
insert into public.product_references (product_id, kind, code, brand)
select p.id, v.kind, v.code, v.brand
from (values
  ('SR-FRE-0001', 'oem', '04465-0K290', 'Toyota'), ('SR-FRE-0001', 'manufacturer', '0986BB0921', 'Bosch'),
  ('SR-FRE-0001', 'alternative', 'PD/1502', 'Fras-le'),
  ('SR-FRE-0002', 'oem', '04465-0K290', 'Toyota'), ('SR-FRE-0002', 'manufacturer', 'PD/1502', 'Fras-le'),
  ('SR-FRE-0003', 'oem', '04465-02220', 'Toyota'), ('SR-FRE-0003', 'manufacturer', 'GDB3480', 'TRW'),
  ('SR-FRE-0004', 'oem', '58101-1JA00', 'Hyundai'), ('SR-FRE-0004', 'manufacturer', 'PD/1433', 'Fras-le'),
  ('SR-FRE-0005', 'oem', '43512-0K120', 'Toyota'), ('SR-FRE-0005', 'manufacturer', 'DF7942', 'TRW'),
  ('SR-FRE-0006', 'oem', '43512-02330', 'Toyota'),
  ('SR-FIL-0001', 'oem', '04152-YZZA1', 'Toyota'), ('SR-FIL-0001', 'manufacturer', 'HU 7019 z', 'Mann-Filter'),
  ('SR-FIL-0002', 'oem', '90915-YZZE1', 'Toyota'), ('SR-FIL-0002', 'manufacturer', '0986B01106', 'Bosch'),
  ('SR-FIL-0003', 'oem', '26300-35505', 'Hyundai'), ('SR-FIL-0003', 'manufacturer', 'W 811/80', 'Mann-Filter'),
  ('SR-FIL-0004', 'oem', '17801-0L040', 'Toyota'), ('SR-FIL-0004', 'manufacturer', 'C 27 013', 'Mann-Filter'),
  ('SR-FIL-0005', 'oem', '17801-0T030', 'Toyota'),
  ('SR-FIL-0006', 'oem', '23390-0L070', 'Toyota'), ('SR-FIL-0006', 'manufacturer', 'F026402809', 'Bosch'),
  ('SR-FIL-0007', 'oem', '87139-0K060', 'Toyota'), ('SR-FIL-0007', 'manufacturer', 'CUK 1919', 'Mann-Filter'),
  ('SR-SUS-0001', 'oem', '48510-0K500', 'Toyota'), ('SR-SUS-0001', 'manufacturer', 'G8205', 'Monroe'),
  ('SR-SUS-0002', 'oem', '48531-0K500', 'Toyota'),
  ('SR-SUS-0003', 'oem', '54651-1S000', 'Hyundai'),
  ('SR-SUS-0004', 'oem', '43330-09780', 'Toyota'), ('SR-SUS-0004', 'manufacturer', 'N 4001', 'Nakata'),
  ('SR-ENC-0001', 'oem', '90919-01253', 'Toyota'), ('SR-ENC-0001', 'manufacturer', 'ILKAR7B11', 'NGK'),
  ('SR-ENC-0002', 'oem', '18855-10060', 'Hyundai'), ('SR-ENC-0002', 'manufacturer', 'BKR6E-11', 'NGK'),
  ('SR-ENC-0003', 'oem', '90919-02258', 'Toyota'), ('SR-ENC-0003', 'manufacturer', '673-1305', 'Denso'),
  ('SR-MOT-0001', 'oem', '24312-2B000', 'Hyundai'), ('SR-MOT-0001', 'manufacturer', 'K015603XS', 'Gates'),
  ('SR-MOT-0002', 'oem', '16100-09D00', 'Toyota'), ('SR-MOT-0002', 'manufacturer', 'VKPC 91815', 'SKF'),
  ('SR-MOT-0003', 'oem', '90916-02728', 'Toyota'), ('SR-MOT-0003', 'manufacturer', '7PK2010', 'Gates'),
  ('SR-EMB-0001', 'oem', '31250-0K271', 'Toyota'), ('SR-EMB-0001', 'manufacturer', '3000 951 569', 'Sachs'),
  ('SR-EMB-0002', 'manufacturer', '828538', 'Valeo')
) as v(sku, kind, code, brand)
join public.products p on p.sku = v.sku;

-- Compatibilidades (fitments). Sin fila = "pendiente de verificar".
insert into public.product_fitments (product_id, version_id, status, source)
select p.id, vv.id, v.status::public.fitment_status, 'Datos de demostración'
from (values
  ('SR-FRE-0001', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FRE-0001', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FRE-0001', 'TOY-FORT-28D-16', 'confirmed'), ('SR-FRE-0001', 'TOY-HILUX-30D-05', 'incompatible'),
  ('SR-FRE-0002', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FRE-0002', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FRE-0002', 'TOY-FORT-28D-16', 'unverified'),
  ('SR-FRE-0003', 'TOY-COROL-18-14', 'confirmed'), ('SR-FRE-0003', 'TOY-COROL-20-20', 'incompatible'),
  ('SR-FRE-0004', 'HYU-HB20-10-19', 'confirmed'), ('SR-FRE-0004', 'HYU-HB20-16-19', 'confirmed'),
  ('SR-FRE-0004', 'KIA-RIO-14-17', 'unverified'),
  ('SR-FRE-0005', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FRE-0005', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FRE-0005', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-FRE-0006', 'TOY-COROL-18-14', 'confirmed'),
  ('SR-FIL-0001', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FIL-0001', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FIL-0001', 'TOY-FORT-28D-16', 'confirmed'), ('SR-FIL-0001', 'TOY-HILUX-30D-05', 'incompatible'),
  ('SR-FIL-0002', 'TOY-COROL-18-14', 'confirmed'), ('SR-FIL-0002', 'TOY-VITZ-13-11', 'confirmed'),
  ('SR-FIL-0002', 'TOY-VITZ-10-11', 'confirmed'), ('SR-FIL-0002', 'TOY-COROL-20-20', 'unverified'),
  ('SR-FIL-0003', 'KIA-PICA-10-17', 'confirmed'), ('SR-FIL-0003', 'KIA-PICA-12-17', 'confirmed'),
  ('SR-FIL-0003', 'KIA-RIO-14-17', 'confirmed'), ('SR-FIL-0003', 'HYU-HB20-10-19', 'confirmed'),
  ('SR-FIL-0003', 'HYU-HB20-16-19', 'confirmed'), ('SR-FIL-0003', 'HYU-CRET-16-17', 'confirmed'),
  ('SR-FIL-0004', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FIL-0004', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FIL-0004', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-FIL-0005', 'TOY-COROL-18-14', 'confirmed'),
  ('SR-FIL-0006', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FIL-0006', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FIL-0006', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-FIL-0007', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FIL-0007', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FIL-0007', 'TOY-FORT-28D-16', 'confirmed'), ('SR-FIL-0007', 'TOY-COROL-18-14', 'confirmed'),
  ('SR-FIL-0007', 'TOY-COROL-20-20', 'confirmed'), ('SR-FIL-0007', 'TOY-RAV4-20-19', 'confirmed'),
  ('SR-SUS-0001', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-SUS-0001', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-SUS-0002', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-SUS-0002', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-SUS-0003', 'HYU-HB20-10-19', 'confirmed'), ('SR-SUS-0003', 'HYU-HB20-16-19', 'confirmed'),
  ('SR-SUS-0004', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-SUS-0004', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-SUS-0004', 'TOY-FORT-28D-16', 'unverified'),
  ('SR-ENC-0001', 'TOY-COROL-18-14', 'confirmed'), ('SR-ENC-0001', 'TOY-COROL-20-20', 'unverified'),
  ('SR-ENC-0001', 'TOY-VITZ-13-11', 'confirmed'),
  ('SR-ENC-0002', 'KIA-PICA-10-17', 'confirmed'), ('SR-ENC-0002', 'KIA-PICA-12-17', 'confirmed'),
  ('SR-ENC-0002', 'HYU-HB20-10-19', 'confirmed'), ('SR-ENC-0002', 'KIA-RIO-14-17', 'confirmed'),
  ('SR-ENC-0003', 'TOY-COROL-18-14', 'confirmed'), ('SR-ENC-0003', 'TOY-VITZ-13-11', 'unverified'),
  ('SR-ELE-0001', 'TOY-COROL-18-14', 'confirmed'), ('SR-ELE-0001', 'TOY-COROL-20-20', 'confirmed'),
  ('SR-ELE-0001', 'HYU-TUCS-20-16', 'confirmed'), ('SR-ELE-0001', 'KIA-SPOR-20-16', 'confirmed'),
  ('SR-ELE-0002', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-ELE-0002', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-ELE-0002', 'TOY-FORT-28D-16', 'confirmed'), ('SR-ELE-0002', 'NIS-FRON-23D-16', 'confirmed'),
  ('SR-ELE-0002', 'CHE-S10-28D-12', 'confirmed'), ('SR-ELE-0002', 'MIT-L200-24D-16', 'confirmed'),
  ('SR-ELE-0002', 'VW-AMAR-20D-10', 'unverified'),
  ('SR-ELE-0003', 'TOY-VITZ-10-11', 'confirmed'), ('SR-ELE-0003', 'TOY-VITZ-13-11', 'confirmed'),
  ('SR-ELE-0003', 'KIA-PICA-10-17', 'confirmed'), ('SR-ELE-0003', 'KIA-PICA-12-17', 'confirmed'),
  ('SR-ELE-0003', 'HYU-HB20-10-19', 'confirmed'), ('SR-ELE-0003', 'NIS-MARC-16-12', 'confirmed'),
  ('SR-ELE-0004', 'TOY-HILUX-30D-05', 'confirmed'), ('SR-ELE-0004', 'TOY-VITZ-13-11', 'confirmed'),
  ('SR-ELE-0004', 'NIS-MARC-16-12', 'confirmed'), ('SR-ELE-0004', 'VW-GOL-16-13', 'confirmed'),
  ('SR-ELE-0004', 'KIA-PICA-10-17', 'confirmed'),
  ('SR-ELE-0005', 'HYU-TUCS-20-16', 'confirmed'), ('SR-ELE-0005', 'KIA-SPOR-20-16', 'confirmed'),
  ('SR-MOT-0001', 'HYU-HB20-16-19', 'confirmed'), ('SR-MOT-0001', 'HYU-CRET-16-17', 'confirmed'),
  ('SR-MOT-0001', 'KIA-RIO-14-17', 'unverified'),
  ('SR-MOT-0002', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-MOT-0002', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-MOT-0002', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-MOT-0003', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-MOT-0003', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-EMB-0001', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-EMB-0001', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-EMB-0002', 'VW-GOL-16-13', 'confirmed')
) as v(sku, code, status)
join public.products p on p.sku = v.sku
join public.vehicle_versions vv on vv.code = v.code;

-- Productos relacionados y complementarios.
insert into public.product_relations (product_id, related_id, kind)
select a.id, b.id, v.kind
from (values
  ('SR-FRE-0001', 'SR-FRE-0005', 'complementary'), ('SR-FRE-0001', 'SR-FRE-0007', 'complementary'),
  ('SR-FRE-0001', 'SR-FRE-0002', 'related'), ('SR-FRE-0002', 'SR-FRE-0001', 'related'),
  ('SR-FRE-0002', 'SR-FRE-0005', 'complementary'), ('SR-FRE-0005', 'SR-FRE-0001', 'complementary'),
  ('SR-FRE-0003', 'SR-FRE-0006', 'complementary'), ('SR-FRE-0003', 'SR-FRE-0007', 'complementary'),
  ('SR-FRE-0006', 'SR-FRE-0003', 'complementary'),
  ('SR-FIL-0001', 'SR-LUB-0001', 'complementary'), ('SR-FIL-0001', 'SR-FIL-0004', 'complementary'),
  ('SR-FIL-0001', 'SR-FIL-0006', 'complementary'),
  ('SR-FIL-0002', 'SR-LUB-0003', 'complementary'), ('SR-FIL-0002', 'SR-FIL-0005', 'complementary'),
  ('SR-FIL-0003', 'SR-LUB-0002', 'complementary'),
  ('SR-SUS-0001', 'SR-SUS-0002', 'complementary'), ('SR-SUS-0001', 'SR-SUS-0004', 'complementary'),
  ('SR-SUS-0002', 'SR-SUS-0001', 'complementary'),
  ('SR-MOT-0002', 'SR-MOT-0003', 'complementary'),
  ('SR-ELE-0001', 'SR-ELE-0002', 'related'), ('SR-ELE-0002', 'SR-ELE-0001', 'related'),
  ('SR-ENC-0001', 'SR-ENC-0003', 'complementary')
) as v(a, b, kind)
join public.products a on a.sku = v.a
join public.products b on b.sku = v.b;

-- Stock inicial.
insert into public.stock_levels (product_id, on_hand)
select p.id, v.qty
from (values
  ('SR-FRE-0001', 14), ('SR-FRE-0002', 9), ('SR-FRE-0003', 7), ('SR-FRE-0004', 3), ('SR-FRE-0005', 6),
  ('SR-FRE-0006', 4), ('SR-FRE-0007', 40), ('SR-FIL-0001', 35), ('SR-FIL-0002', 42), ('SR-FIL-0003', 8),
  ('SR-FIL-0004', 18), ('SR-FIL-0005', 11), ('SR-FIL-0006', 4), ('SR-FIL-0007', 16), ('SR-SUS-0001', 8),
  ('SR-SUS-0002', 6), ('SR-SUS-0003', 0), ('SR-SUS-0004', 5), ('SR-ENC-0001', 48), ('SR-ENC-0002', 60),
  ('SR-ENC-0003', 3), ('SR-ELE-0001', 7), ('SR-ELE-0002', 5), ('SR-ELE-0003', 2), ('SR-ELE-0004', 70),
  ('SR-ELE-0005', 55), ('SR-LUB-0001', 30), ('SR-LUB-0002', 24), ('SR-LUB-0003', 5), ('SR-MOT-0001', 3),
  ('SR-MOT-0002', 4), ('SR-MOT-0003', 9), ('SR-EMB-0001', 2), ('SR-EMB-0002', 0)
) as v(sku, qty)
join public.products p on p.sku = v.sku;

insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, source)
select product_id, 'initial', on_hand, on_hand, 0, 'Carga inicial de demostración', 'system'
from public.stock_levels;

-- Proveedores -------------------------------------------------------------------
insert into public.suppliers (name, contact_name, email, phone, lead_time_days, notes) values
('Distribuidora Frenos del Sur', 'Carlos Benítez', 'ventas@frenosdelsur.example', '+595 21 111 111', 5, 'Frenos y suspensión. Entregas martes y jueves.'),
('Importadora Filtromax', 'Laura Giménez', 'pedidos@filtromax.example', '+595 21 222 222', 3, 'Filtros y lubricantes.'),
('Eléctrica Central', 'Diego Ortiz', 'contacto@electricacentral.example', '+595 21 333 333', 7, 'Baterías y encendido. Importación desde Brasil.');

insert into public.supplier_products (supplier_id, product_id, cost, lead_time_days, is_preferred)
select s.id, p.id, p.cost, s.lead_time_days, true
from public.products p
join public.categories c on c.id = p.category_id
left join public.categories parent on parent.id = c.parent_id
join public.suppliers s on s.name = case
  when coalesce(parent.slug, c.slug) in ('frenos', 'suspension', 'embrague', 'motor') then 'Distribuidora Frenos del Sur'
  when coalesce(parent.slug, c.slug) in ('filtros', 'lubricantes') then 'Importadora Filtromax'
  else 'Eléctrica Central' end;

-- Promociones y contenido -------------------------------------------------------
insert into public.coupons (code, description, type, value, min_subtotal, per_customer_limit, active) values
('BIENVENIDO10', '10 % de descuento en tu primera compra desde Gs. 300.000', 'percent', 10, 300000, 1, true),
('TALLER50', 'Gs. 50.000 de descuento en compras desde Gs. 1.000.000', 'fixed', 50000, 1000000, null, true);

insert into public.promotions (name, percent, scope, category_id, starts_at, ends_at)
select 'Semana de frenos', 10, 'category', c.id, now() - interval '1 day', now() + interval '14 days'
from public.categories c where c.slug = 'frenos';

insert into public.banners (title, subtitle, cta_label, link_url, placement, sort) values
('Repuestos que encajan con tu vehículo', 'Elegí marca, modelo y año y te mostramos lo que es compatible.', 'Buscar repuestos', '/catalogo', 'hero', 1),
('Semana de frenos: 10 % off', 'Pastillas, discos y líquido de frenos con descuento por tiempo limitado.', 'Ver ofertas', '/catalogo?categoria=frenos', 'hero', 2),
('Envíos a todo el país', 'Retiro en el local, entrega en Asunción y Central, y agencia al interior.', null, '/p/envios', 'strip', 1);

insert into public.pages (slug, title, body) values
('envios', 'Envíos y retiro', E'## Retiro en el local\nSin costo. Te avisamos cuando tu pedido esté listo.\n\n## Envío a domicilio\nAsunción y Gran Asunción en 24 a 72 horas hábiles. El costo se calcula en el checkout según la zona.\n\n## Envío al interior\nDespachamos por agencia de transporte en 2 a 4 días hábiles. Te enviamos el número de guía por correo.'),
('garantia', 'Garantía', E'Todos los repuestos cuentan con garantía del fabricante contra defectos de fabricación. El plazo se indica en cada producto.\n\nLa garantía no cubre fallas por instalación incorrecta, uso indebido ni desgaste normal. Para iniciar un reclamo, escribinos con tu número de pedido.'),
('devoluciones', 'Cambios y devoluciones', E'Podés devolver productos sin uso, en su empaque original y con la factura, dentro de los 7 días de recibidos.\n\nLas piezas eléctricas instaladas no admiten devolución salvo falla de fábrica comprobada.'),
('terminos', 'Términos y condiciones', E'Los precios incluyen IVA y se expresan en guaraníes. Los montos en reales y dólares son de referencia.\n\nLa compatibilidad informada se basa en los datos técnicos disponibles. Ante dudas, consultanos antes de comprar.'),
('privacidad', 'Privacidad', E'Usamos tus datos sólo para procesar tus pedidos y, si lo aceptás, para enviarte novedades. Podés pedir la baja o eliminación de tus datos en cualquier momento.');

-- Pedidos históricos de demostración (para ver el panel con datos) ------------------------
do $$
declare
  v_i integer;
  v_order uuid;
  v_paid timestamptz;
  v_status public.order_status;
  v_prod record;
  v_qty integer;
  v_sub bigint;
  v_names text[] := array['Juan Pérez','María González','Carlos Benítez','Ana Martínez','Luis Ramírez','Sofía Duarte',
                          'Taller El Rápido','Jorge Villalba','Paola Cáceres','Diego Acosta','Lucía Fernández','Mecánica Don Pedro'];
  v_n integer;
  v_stock public.stock_levels;
begin
  perform setseed(0.42);
  for v_i in 1..70 loop
    v_n := 1 + floor(random() * array_length(v_names, 1))::int;
    v_paid := now() - make_interval(days => floor(random() * 60)::int, hours => floor(random() * 10)::int);
    v_status := case
      when v_paid > now() - interval '2 days' then (array['paid','preparing']::public.order_status[])[1 + floor(random() * 2)::int]
      when v_paid > now() - interval '5 days' then 'shipped'
      else 'delivered' end;

    insert into public.orders (customer_name, email, phone, delivery_method, subtotal, total, status, paid_at, created_at,
                               shipped_at, delivered_at, reservation_expires_at)
    values (v_names[v_n], lower(replace(v_names[v_n], ' ', '.')) || '@demo.com.py', '+595 981 000 ' || lpad(v_n::text, 3, '0'),
            (array['pickup','home','agency']::public.delivery_method[])[1 + floor(random() * 3)::int],
            0, 0, v_status, v_paid, v_paid - interval '20 minutes',
            case when v_status in ('shipped','delivered') then v_paid + interval '1 day' end,
            case when v_status = 'delivered' then v_paid + interval '3 days' end,
            v_paid + interval '25 minutes')
    returning id into v_order;

    v_sub := 0;
    for v_prod in
      select p.*, (select url from public.product_images i where i.product_id = p.id limit 1) as img
      from public.products p order by random() limit 1 + floor(random() * 3)::int
    loop
      v_qty := case when v_prod.price < 100000 then 2 + floor(random() * 4)::int else 1 + floor(random() * 2)::int end;
      insert into public.order_items (order_id, product_id, sku, name, image_url, unit_price, original_unit_price, quantity,
                                      tax_rate, line_total, unit_cost)
      values (v_order, v_prod.id, v_prod.sku, v_prod.name, v_prod.img, v_prod.price, v_prod.price, v_qty, v_prod.tax_rate,
              v_prod.price * v_qty, v_prod.cost);
      v_sub := v_sub + v_prod.price * v_qty;
      update public.products set popularity = popularity + v_qty where id = v_prod.id;
    end loop;

    update public.orders set subtotal = v_sub, total = v_sub, tax_total = round(v_sub / 11.0) where id = v_order;
    insert into public.order_status_history (order_id, from_status, to_status, note, created_at)
    values (v_order, 'pending_payment', 'paid', 'Pago aprobado (demostración)', v_paid);
  end loop;

  -- Algunas cancelaciones por falta de pago.
  for v_i in 1..6 loop
    insert into public.orders (customer_name, email, phone, delivery_method, subtotal, total, status, created_at,
                               cancelled_at, cancel_reason)
    values ('Cliente de prueba ' || v_i, 'prueba' || v_i || '@demo.com.py', '+595 981 111 000', 'pickup', 250000, 250000,
            'cancelled', now() - make_interval(days => v_i * 7), now() - make_interval(days => v_i * 7) + interval '45 minutes',
            'Pago no recibido dentro del plazo de reserva');
  end loop;

  -- Eventos de navegación para conversión y abandono.
  for v_i in 1..400 loop
    insert into public.analytics_events (session_id, type, created_at)
    values ('demo-' || v_i, 'page_view', now() - make_interval(days => floor(random() * 60)::int));
    if random() < 0.45 then
      insert into public.analytics_events (session_id, type, created_at)
      values ('demo-' || v_i, 'add_to_cart', now() - make_interval(days => floor(random() * 60)::int));
      if random() < 0.35 then
        insert into public.analytics_events (session_id, type, created_at)
        values ('demo-' || v_i, 'purchase', now() - make_interval(days => floor(random() * 60)::int));
      end if;
    end if;
  end loop;

  insert into public.analytics_events (session_id, type, query, results_count, created_at) values
  ('demo-s1', 'search', 'pastillas ranger 2018', 0, now() - interval '3 days'),
  ('demo-s2', 'search', 'pastillas ranger 2018', 0, now() - interval '2 days'),
  ('demo-s3', 'search', 'radiador hilux', 0, now() - interval '5 days'),
  ('demo-s4', 'search', 'kit embrague sportage', 0, now() - interval '1 day'),
  ('demo-s5', 'search', 'filtro aceite', 6, now() - interval '1 day');
end $$;
