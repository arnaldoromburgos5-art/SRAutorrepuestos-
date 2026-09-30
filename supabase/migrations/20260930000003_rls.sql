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
