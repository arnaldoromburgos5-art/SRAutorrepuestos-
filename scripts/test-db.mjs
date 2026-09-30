// Prueba las migraciones y la lógica crítica (pedidos, stock, pagos, permisos) en un Postgres embebido (PGlite).
// Uso: node scripts/test-db.mjs
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite({ extensions: { pg_trgm, unaccent } });

// Réplica mínima de lo que Supabase provee: roles, auth.users, auth.uid() y storage.
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth to anon, authenticated, service_role;
`);

const dir = new URL("../supabase/migrations/", import.meta.url);
for (const file of readdirSync(dir).sort()) {
  await db.exec(readFileSync(new URL(file, dir), "utf8"));
  console.log("✓ migración", file);
}
await db.exec(`grant usage on schema extensions to anon, authenticated, service_role;
               grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
               grant usage, select on all sequences in schema public to anon, authenticated, service_role;`);
await db.exec(readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8"));
console.log("✓ seed");

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;

// Actuar como un usuario concreto (RLS + auth.uid()).
async function as(role, uid, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

// --- Búsqueda ---------------------------------------------------------------
const hilux = await one(`select id from vehicle_versions where code = 'TOY-HILUX-28D-16'`);
const byOem = await all(`select sku, compatibility from search_catalog(p_query => '04465 0K290')`);
assert.ok(byOem.some((r) => r.sku === "SR-FRE-0001"), "busca por código OEM con espacios");
const byText = await all(`select sku from search_catalog(p_query => 'pastilla freno')`);
assert.ok(byText.length >= 3, "búsqueda por texto con prefijos");
const byTypo = await all(`select sku from search_catalog(p_query => 'amortiguadr')`);
assert.ok(byTypo.length >= 1, "tolera errores de tipeo");
const compat = await all(`select sku, compatibility from search_catalog(p_version => $1, p_category => 'frenos', p_compat => 'exclude_incompatible')`, [hilux.id]);
assert.ok(compat.every((r) => r.compatibility !== "incompatible"));
assert.equal(compat[0].compatibility, "confirmed", "confirmados primero");
const anonSearch = await as("anon", null, () => all(`select sku from search_catalog(p_query => 'pastillas')`));
assert.ok(anonSearch.length > 0, "anon puede buscar");
console.log("✓ búsqueda:", byOem.length, "por OEM,", compat.length, "compatibles con Hilux 2.8");

// Precio con promoción (10 % en frenos).
const pad = await one(`select price, final_price, discount_percent from catalog_products where sku = 'SR-FRE-0001'`);
assert.equal(Number(pad.final_price), 355500);
console.log("✓ promoción aplicada:", pad.price, "→", pad.final_price, `(${pad.discount_percent}% sobre lista)`);

// --- Cotización y pedido ----------------------------------------------------------
const p1 = await one(`select id from products where sku = 'SR-FIL-0001'`);
const p2 = await one(`select id from products where sku = 'SR-LUB-0001'`);
const zone = await one(`select id from shipping_zones where name = 'Asunción'`);
const cart = {
  items: [{ product_id: p1.id, quantity: 2 }, { product_id: p2.id, quantity: 2 }],
  coupon_code: "bienvenido10", delivery_method: "home", shipping_zone_id: zone.id,
  email: "Nuevo@Cliente.com", customer_name: "Cliente Nuevo", phone: "0981123456",
  shipping_address: { department: "Asunción", city: "Asunción", street: "Mcal. López 123" },
};
const quote = (await one(`select price_cart($1::jsonb) as q`, [JSON.stringify(cart)])).q;
assert.equal(quote.errors.length, 0);
assert.equal(quote.subtotal, 2 * 78000 + 2 * 265000);
assert.equal(quote.discount_total, Math.round(quote.subtotal * 0.1));
assert.equal(quote.shipping_cost, 25000);
assert.equal(quote.total, quote.subtotal - quote.discount_total + 25000);
console.log("✓ cotización:", quote.subtotal, "- cupón", quote.discount_total, "+ envío", quote.shipping_cost, "=", quote.total);

const stockBefore = await one(`select on_hand, reserved from stock_levels where product_id = $1`, [p1.id]);
const created = (await one(`select create_order($1::jsonb) as r`, [JSON.stringify(cart)])).r;
assert.equal(created.ok, true, JSON.stringify(created));
let stock = await one(`select on_hand, reserved from stock_levels where product_id = $1`, [p1.id]);
assert.equal(stock.reserved, stockBefore.reserved + 2, "reserva stock");
assert.equal(stock.on_hand, stockBefore.on_hand);
console.log("✓ pedido", created.number, "creado; stock reservado");

// No se puede vender más de lo disponible.
const tooMuch = (await one(`select create_order($1::jsonb) as r`, [JSON.stringify({ ...cart, coupon_code: null,
  items: [{ product_id: p1.id, quantity: 99 }] })])).r;
assert.equal(tooMuch.ok, false);
assert.equal(tooMuch.errors[0].code, "INSUFFICIENT_STOCK");
console.log("✓ rechaza pedidos sin stock");

// --- Pago idempotente ----------------------------------------------------------------
const pay = await one(`insert into payments (order_id, provider, amount) values ($1, 'mock', $2) returning id`, [created.order_id, created.total]);
const r1 = (await one(`select confirm_payment($1, 'evt-1', true, $2, 'PYG', 'AUTH1', 'Aprobado', '{}') as r`, [pay.id, created.total])).r;
const r2 = (await one(`select confirm_payment($1, 'evt-1', true, $2, 'PYG', 'AUTH1', 'Aprobado', '{}') as r`, [pay.id, created.total])).r;
const r3 = (await one(`select confirm_payment($1, 'evt-2', true, $2, 'PYG', 'AUTH1', 'Aprobado', '{}') as r`, [pay.id, created.total])).r;
assert.equal(r1.result, "approved");
assert.equal(r2.result, "duplicate");
assert.equal(r3.result, "already_approved");
stock = await one(`select on_hand, reserved from stock_levels where product_id = $1`, [p1.id]);
assert.equal(stock.on_hand, stockBefore.on_hand - 2, "descuenta stock una sola vez");
assert.equal(stock.reserved, stockBefore.reserved);
const paidOrder = await one(`select status, coupon_id from orders where id = $1`, [created.order_id]);
assert.equal(paidOrder.status, "paid");
assert.equal((await one(`select used_count from coupons where code = 'BIENVENIDO10'`)).used_count, 1);
console.log("✓ pago confirmado una sola vez (duplicado ignorado); stock y cupón actualizados");

// El cupón de primera compra no se puede reutilizar con el mismo email.
const again = (await one(`select price_cart($1::jsonb) as q`, [JSON.stringify(cart)])).q;
assert.equal(again.coupon.valid, false);
console.log("✓ límite de cupón por cliente");

// Monto distinto => no se aprueba.
const created2 = (await one(`select create_order($1::jsonb) as r`, [JSON.stringify({ ...cart, coupon_code: null, email: "otro@cliente.com" })])).r;
const pay2 = await one(`insert into payments (order_id, provider, amount) values ($1, 'mock', $2) returning id`, [created2.order_id, created2.total]);
const mismatch = (await one(`select confirm_payment($1, 'evt-3', true, 1000, 'PYG') as r`, [pay2.id])).r;
assert.equal(mismatch.result, "amount_mismatch");
assert.equal((await one(`select status from orders where id = $1`, [created2.order_id])).status, "pending_payment");
console.log("✓ monto inconsistente queda marcado para revisión");

// Vencimiento de reserva libera stock.
const reservedBefore = (await one(`select reserved from stock_levels where product_id = $1`, [p1.id])).reserved;
await db.query(`update orders set reservation_expires_at = now() - interval '1 minute' where id = $1`, [created2.order_id]);
const expired = (await one(`select expire_pending_orders() as n`)).n;
assert.equal(expired, 1);
assert.equal((await one(`select reserved from stock_levels where product_id = $1`, [p1.id])).reserved, reservedBefore - 2);
console.log("✓ reserva vencida libera stock");

// --- Permisos -----------------------------------------------------------------------
const customer = "11111111-1111-1111-1111-111111111111";
const operator = "22222222-2222-2222-2222-222222222222";
const catalog = "33333333-3333-3333-3333-333333333333";
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
  ($1, 'cliente@x.com', '{"full_name":"Cliente"}'), ($2, 'operador@x.com', '{}'), ($3, 'catalogo@x.com', '{}')`, [customer, operator, catalog]);
await db.query(`update profiles set role = 'order_operator' where id = $1`, [operator]);
await db.query(`update profiles set role = 'catalog_manager' where id = $1`, [catalog]);

// Un cliente no ve pedidos ajenos, no ve borradores y no puede auto-promoverse.
const visibleOrders = await as("authenticated", customer, () => all(`select id from orders`));
assert.equal(visibleOrders.length, 0);
await db.query(`update products set status = 'draft' where sku = 'SR-EMB-0002'`);
const drafts = await as("authenticated", customer, () => all(`select id from products where status = 'draft'`));
assert.equal(drafts.length, 0);
await assert.rejects(as("authenticated", customer, () => db.query(`update profiles set role = 'owner' where id = $1`, [customer])), /PERMISSION_DENIED/);
await assert.rejects(as("authenticated", customer, () => db.query(`select adjust_stock($1, 5, 'purchase_in', 'x')`, [p1.id])), /PERMISSION_DENIED/);
console.log("✓ cliente aislado: sin pedidos ajenos, sin borradores, sin escalar rol, sin tocar stock");

// El operador de pedidos gestiona pedidos pero no precios.
const opOrders = await as("authenticated", operator, () => all(`select id from orders`));
assert.ok(opOrders.length > 70);
await as("authenticated", operator, () => db.query(`select set_order_status($1, 'preparing', 'Armando pedido')`, [created.order_id]));
await assert.rejects(as("authenticated", operator, () => db.query(`select set_order_status($1, 'delivered')`, [created.order_id])), /INVALID_TRANSITION/);
const priceChange = await as("authenticated", operator, () => db.query(`update products set price = 1 where sku = 'SR-FIL-0001'`));
assert.equal(priceChange.affectedRows ?? 0, 0, "RLS impide editar productos sin permiso");
console.log("✓ operador: gestiona estados con transiciones válidas; no edita productos");

// El encargado de catálogo edita y ajusta stock (con motivo) y queda auditado.
await as("authenticated", catalog, () => db.query(`update products set price = 80000 where sku = 'SR-FIL-0001'`));
await assert.rejects(as("authenticated", catalog, () => db.query(`select adjust_stock($1, 5, 'purchase_in', '')`, [p1.id])), /REASON_REQUIRED/);
await as("authenticated", catalog, () => db.query(`select adjust_stock($1, 5, 'purchase_in', 'Compra a proveedor')`, [p1.id]));
const audit = await one(`select count(*)::int as n from audit_log where action = 'inventory.adjust'`);
assert.equal(audit.n, 1);
await assert.rejects(as("authenticated", catalog, () => db.query(`select dashboard_metrics(now() - interval '30 days', now())`)), /PERMISSION_DENIED/);
console.log("✓ catálogo: edita precios, ajustes con motivo auditados, sin acceso a métricas");

// Cancelación de un pedido pagado repone stock.
const onHandBeforeCancel = (await one(`select on_hand from stock_levels where product_id = $1`, [p1.id])).on_hand;
await as("authenticated", operator, () => db.query(`select cancel_order($1, 'Cliente desistió')`, [created.order_id]));
assert.equal((await one(`select on_hand from stock_levels where product_id = $1`, [p1.id])).on_hand, onHandBeforeCancel + 2);
console.log("✓ cancelación de pedido pagado repone stock y marca reintegro");

// --- Métricas ---------------------------------------------------------------------------
await db.query(`update profiles set role = 'analyst' where id = $1`, [catalog]);
const metrics = await as("authenticated", catalog, () => one(`select dashboard_metrics(now() - interval '30 days', now()) as m`));
assert.ok(metrics.m.orders > 0 && metrics.m.revenue > 0);
const insights = await as("authenticated", catalog, () => one(`select management_insights(60) as i`));
assert.ok(insights.i.searches_without_results.length > 0);
console.log("✓ métricas:", metrics.m.orders, "pedidos, ingresos", metrics.m.revenue, "· reposición sugerida:", insights.i.reorder_suggestions.length);

// Límite de uso.
const limits = [];
for (let i = 0; i < 4; i++) limits.push((await one(`select check_rate_limit('ip:1', 3, 60) as ok`)).ok);
assert.deepEqual(limits, [true, true, true, false]);
console.log("✓ límite de uso");

console.log("\nTodas las pruebas de base de datos pasaron.");
