import { requirePermission } from "@/lib/auth";
import { formatPyg } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { createCouponAction, createPromotionAction, deleteRecordAction, toggleRecordAction } from "../actions";
import { ActionButton, ActionForm } from "@/components/admin/action-form";
import { Badge, Card, Field, PageHeader, Table, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Promociones" };

const now = () => new Date().toISOString();

export default async function PromotionsPage() {
  const { supabase } = await requirePermission("promotions.manage");
  const [{ data: promos }, { data: coupons }, { data: categories }, { data: brands }] = await Promise.all([
    supabase.from("promotions").select("*, categories(name), brands(name)").order("created_at", { ascending: false }),
    supabase.from("coupons").select("*, categories(name)").order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name, parent_id").order("sort"),
    supabase.from("brands").select("id, name").order("name"),
  ]);
  const t = now();
  const live = (p: { active: boolean; starts_at: string | null; ends_at: string | null }) =>
    p.active && (!p.starts_at || p.starts_at <= t) && (!p.ends_at || p.ends_at > t);

  return (
    <div className="space-y-6">
      <PageHeader title="Promociones" description="Descuentos programados sobre el catálogo y cupones para el checkout. Los precios se calculan siempre en el servidor." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Nuevo descuento programado">
          <ActionForm action={createPromotionAction} submitLabel="Crear descuento" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre"><input name="name" required placeholder="Semana de frenos" className={inputCls} /></Field>
              <Field label="Descuento (%)"><input name="percent" type="number" min={1} max={90} required className={inputCls} /></Field>
              <Field label="Aplica a">
                <select name="scope" className={inputCls}>
                  <option value="category">Una categoría</option>
                  <option value="brand">Una marca</option>
                  <option value="all">Todo el catálogo</option>
                </select>
              </Field>
              <Field label="Categoría">
                <select name="category_id" className={inputCls}>
                  <option value="">—</option>
                  {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}</option>)}
                </select>
              </Field>
              <Field label="Marca">
                <select name="brand_id" className={inputCls}>
                  <option value="">—</option>
                  {(brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <div />
              <Field label="Desde"><input name="starts_at" type="datetime-local" className={inputCls} /></Field>
              <Field label="Hasta"><input name="ends_at" type="datetime-local" className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>

        <Card title="Nuevo cupón">
          <ActionForm action={createCouponAction} submitLabel="Crear cupón" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Código"><input name="code" required placeholder="INVIERNO10" className={`${inputCls} uppercase`} /></Field>
              <Field label="Tipo">
                <select name="type" className={inputCls}>
                  <option value="percent">Porcentaje</option>
                  <option value="fixed">Monto fijo (Gs.)</option>
                </select>
              </Field>
              <Field label="Valor"><input name="value" type="number" min={1} required className={inputCls} /></Field>
              <Field label="Compra mínima (Gs.)"><input name="min_subtotal" type="number" min={0} className={inputCls} /></Field>
              <Field label="Tope de descuento (Gs.)"><input name="max_discount" type="number" min={0} className={inputCls} /></Field>
              <Field label="Sólo categoría">
                <select name="category_id" className={inputCls}>
                  <option value="">Todas</option>
                  {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}</option>)}
                </select>
              </Field>
              <Field label="Usos totales"><input name="usage_limit" type="number" min={1} className={inputCls} /></Field>
              <Field label="Usos por cliente"><input name="per_customer_limit" type="number" min={1} className={inputCls} /></Field>
              <Field label="Desde"><input name="starts_at" type="datetime-local" className={inputCls} /></Field>
              <Field label="Hasta"><input name="ends_at" type="datetime-local" className={inputCls} /></Field>
              <Field label="Descripción (se muestra al aplicarlo)" className="sm:col-span-2"><input name="description" className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
      </div>

      <Card title="Descuentos programados">
        <Table>
          <thead><tr><th>Nombre</th><th>Aplica a</th><th className="text-right">%</th><th>Vigencia</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {(promos ?? []).map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}</td>
                <td className="text-sm">{p.scope === "all" ? "Todo" : p.scope === "category" ? p.categories?.name : p.scope === "brand" ? p.brands?.name : `${p.product_ids.length} productos`}</td>
                <td className="text-right">{p.percent}</td>
                <td className="text-xs text-ink-500">{formatDate(p.starts_at)} → {p.ends_at ? formatDate(p.ends_at) : "sin fin"}</td>
                <td><Badge tone={live(p) ? "ok" : "neutral"}>{live(p) ? "Vigente" : p.active ? "Programado / vencido" : "Pausado"}</Badge></td>
                <td className="whitespace-nowrap text-right">
                  <ActionButton action={toggleRecordAction.bind(null, "promotions", p.id, "active", !p.active)} className="text-xs font-semibold text-accent-600">{p.active ? "Pausar" : "Activar"}</ActionButton>{" "}
                  <ActionButton action={deleteRecordAction.bind(null, "promotions", p.id)} confirm="¿Eliminar el descuento?" className="text-xs text-bad-600">Eliminar</ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Cupones">
        <Table>
          <thead><tr><th>Código</th><th>Descuento</th><th>Condiciones</th><th className="text-right">Usos</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {(coupons ?? []).map((c) => (
              <tr key={c.id}>
                <td className="font-mono font-semibold">{c.code}</td>
                <td>{c.type === "percent" ? `${Number(c.value)} %` : formatPyg(Number(c.value))}</td>
                <td className="text-xs text-ink-500">
                  {c.min_subtotal ? `Mín. ${formatPyg(c.min_subtotal)} · ` : ""}
                  {c.categories?.name ? `Sólo ${c.categories.name} · ` : ""}
                  {c.per_customer_limit ? `${c.per_customer_limit} por cliente · ` : ""}
                  {c.ends_at ? `Vence ${formatDate(c.ends_at)}` : "Sin vencimiento"}
                </td>
                <td className="text-right">{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                <td><Badge tone={live(c) ? "ok" : "neutral"}>{live(c) ? "Activo" : "Inactivo"}</Badge></td>
                <td className="whitespace-nowrap text-right">
                  <ActionButton action={toggleRecordAction.bind(null, "coupons", c.id, "active", !c.active)} className="text-xs font-semibold text-accent-600">{c.active ? "Pausar" : "Activar"}</ActionButton>{" "}
                  <ActionButton action={deleteRecordAction.bind(null, "coupons", c.id)} confirm="¿Eliminar el cupón?" className="text-xs text-bad-600">Eliminar</ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
