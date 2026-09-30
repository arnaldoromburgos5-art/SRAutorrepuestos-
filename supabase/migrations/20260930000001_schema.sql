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
