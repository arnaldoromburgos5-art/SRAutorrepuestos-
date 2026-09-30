import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { formatPyg } from "@/lib/money";
import { friendlyDbError, type ActionResult } from "@/lib/utils";
import { staffContext, ensure, audit } from "@/lib/services/context";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, Card, Field, PageHeader, Table, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Proveedores" };

async function saveSupplier(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "suppliers.manage");
    const data = z
      .object({
        name: z.string().trim().min(2).max(120),
        contact_name: z.string().trim().max(120).optional(),
        email: z.string().trim().email().optional().or(z.literal("")),
        phone: z.string().trim().max(40).optional(),
        ruc: z.string().trim().max(30).optional(),
        lead_time_days: z.coerce.number().int().min(0).max(365).optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(Object.fromEntries(form));
    const { data: row, error } = await ctx.supabase.from("suppliers").insert({ ...data, email: data.email || null }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(ctx, "supplier.create", "supplier", row.id, null, data);
    revalidatePath("/admin/proveedores");
    return { ok: true, message: "Proveedor creado." };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

async function linkProduct(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "suppliers.manage");
    const data = z
      .object({
        supplier_id: z.string().uuid(),
        sku: z.string().trim().min(2),
        supplier_sku: z.string().trim().max(60).optional(),
        cost: z.coerce.number().int().min(0).optional(),
        lead_time_days: z.coerce.number().int().min(0).max(365).optional(),
      })
      .parse(Object.fromEntries(form));
    const { data: product } = await ctx.supabase.from("products").select("id").ilike("sku", data.sku).maybeSingle();
    if (!product) throw new Error("No existe un producto con ese SKU.");
    const { error } = await ctx.supabase.from("supplier_products").upsert(
      { supplier_id: data.supplier_id, product_id: product.id, supplier_sku: data.supplier_sku || null, cost: data.cost ?? null, lead_time_days: data.lead_time_days ?? null, is_preferred: true },
      { onConflict: "supplier_id,product_id" },
    );
    if (error) throw new Error(error.message);
    await audit(ctx, "supplier.link_product", "supplier", data.supplier_id, null, data);
    revalidatePath("/admin/proveedores");
    return { ok: true, message: "Producto asociado." };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

export default async function SuppliersPage() {
  const { supabase } = await requirePermission("suppliers.manage");
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*, supplier_products(supplier_sku, cost, lead_time_days, products(sku, name))")
    .order("name");

  return (
    <div className="space-y-6">
      <PageHeader title="Proveedores" description="Productos, costos y plazos de entrega por proveedor. Los plazos alimentan las sugerencias de reposición." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Nuevo proveedor">
          <ActionForm action={saveSupplier} submitLabel="Crear proveedor" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre *"><input name="name" required className={inputCls} /></Field>
              <Field label="Contacto"><input name="contact_name" className={inputCls} /></Field>
              <Field label="Correo"><input name="email" type="email" className={inputCls} /></Field>
              <Field label="Teléfono"><input name="phone" className={inputCls} /></Field>
              <Field label="RUC"><input name="ruc" className={inputCls} /></Field>
              <Field label="Plazo de entrega (días)"><input name="lead_time_days" type="number" min={0} className={inputCls} /></Field>
              <Field label="Notas" className="sm:col-span-2"><input name="notes" className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
        <Card title="Asociar producto a proveedor">
          <ActionForm action={linkProduct} submitLabel="Asociar" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Proveedor" className="sm:col-span-2">
                <select name="supplier_id" required className={inputCls}>
                  {(suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="SKU del producto *"><input name="sku" required className={inputCls} /></Field>
              <Field label="Código del proveedor"><input name="supplier_sku" className={inputCls} /></Field>
              <Field label="Costo (Gs.)"><input name="cost" type="number" min={0} className={inputCls} /></Field>
              <Field label="Plazo específico (días)"><input name="lead_time_days" type="number" min={0} className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
      </div>
      {(suppliers ?? []).map((s) => (
        <Card key={s.id} title={s.name} actions={<Badge tone={s.active ? "ok" : "neutral"}>{s.active ? "Activo" : "Inactivo"}</Badge>}>
          <p className="mb-3 text-sm text-ink-600">
            {[s.contact_name, s.email, s.phone, s.ruc && `RUC ${s.ruc}`, s.lead_time_days != null && `Entrega en ${s.lead_time_days} días`].filter(Boolean).join(" · ")}
          </p>
          {s.notes ? <p className="mb-3 text-sm text-ink-500">{s.notes}</p> : null}
          <Table>
            <thead><tr><th>Producto</th><th>Código proveedor</th><th className="text-right">Costo</th><th className="text-right">Plazo</th></tr></thead>
            <tbody>
              {(s.supplier_products as { supplier_sku: string | null; cost: number | null; lead_time_days: number | null; products: { sku: string; name: string } }[]).map((sp) => (
                <tr key={sp.products.sku}>
                  <td>{sp.products.name} <span className="text-xs text-ink-400">{sp.products.sku}</span></td>
                  <td className="text-xs">{sp.supplier_sku ?? "—"}</td>
                  <td className="text-right tabular-nums">{sp.cost != null ? formatPyg(sp.cost) : "—"}</td>
                  <td className="text-right">{sp.lead_time_days ?? s.lead_time_days ?? "—"} días</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
