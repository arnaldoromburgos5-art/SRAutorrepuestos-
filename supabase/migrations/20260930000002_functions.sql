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
