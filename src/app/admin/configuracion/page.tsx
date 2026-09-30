import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { formatPyg } from "@/lib/money";
import { staffContext, ensure, audit } from "@/lib/services/context";
import { friendlyDbError, type ActionResult } from "@/lib/utils";
import { PY_DEPARTMENTS } from "@/lib/types";
import { deleteRecordAction, toggleRecordAction } from "../actions";
import { ActionButton, ActionForm } from "@/components/admin/action-form";
import { Badge, Card, Field, PageHeader, Table, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Configuración" };

async function saveSetting(key: string, value: Record<string, unknown>) {
  const ctx = await staffContext();
  ensure(ctx, "settings.manage");
  const { data: before } = await ctx.supabase.from("settings").select("value").eq("key", key).maybeSingle();
  const merged = { ...((before?.value as object) ?? {}), ...value };
  const { error } = await ctx.supabase.from("settings").upsert({ key, value: merged, is_public: key !== "assistant", updated_by: ctx.profile.id, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await audit(ctx, "settings.update", "settings", key, before?.value, merged);
  revalidatePath("/", "layout");
}

async function saveStore(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const d = z
      .object({ name: z.string().min(2), legal_name: z.string().optional(), ruc: z.string().optional(), phone: z.string().optional(), whatsapp: z.string().optional(), email: z.string().email().or(z.literal("")), address: z.string().optional(), hours: z.string().optional() })
      .parse(Object.fromEntries(form));
    await saveSetting("store", d);
    return { ok: true, message: "Datos del negocio guardados." };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

async function saveCurrency(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const d = z.object({ USD: z.coerce.number().positive(), BRL: z.coerce.number().positive(), note: z.string().max(300).optional() }).parse(Object.fromEntries(form));
    await saveSetting("currency", { base: "PYG", rates: { USD: d.USD, BRL: d.BRL }, note: d.note, updated_at: new Date().toISOString() });
    return { ok: true, message: "Cotizaciones actualizadas." };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

async function savePolicies(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const d = z.object({ shipping: z.string().max(2000), warranty: z.string().max(2000), returns: z.string().max(2000), payment: z.string().max(2000) }).parse(Object.fromEntries(form));
    await saveSetting("policies", d);
    const minutes = Number(form.get("reservation_minutes"));
    if (minutes) await saveSetting("checkout", { reservation_minutes: Math.min(240, Math.max(10, minutes)) });
    return { ok: true, message: "Políticas guardadas." };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

async function addZone(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "settings.manage");
    const d = z
      .object({ name: z.string().min(2), method: z.enum(["home", "agency"]), cost: z.coerce.number().int().min(0), free_over: z.coerce.number().int().min(0).optional().or(z.literal("").transform(() => undefined)), eta: z.string().max(80).optional() })
      .parse(Object.fromEntries(form));
    const departments = form.getAll("departments").map(String);
    if (!departments.length) throw new Error("Elegí al menos un departamento.");
    const row = { ...d, free_over: d.free_over ?? null, departments };
    const { error } = await ctx.supabase.from("shipping_zones").insert(row);
    if (error) throw new Error(error.message);
    await audit(ctx, "shipping_zone.create", "shipping_zone", null, null, row);
    revalidatePath("/admin/configuracion");
    return { ok: true, message: "Zona creada." };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

export default async function SettingsPage() {
  const { supabase } = await requirePermission("settings.manage");
  const [{ data: settings }, { data: zones }] = await Promise.all([
    supabase.from("settings").select("key, value"),
    supabase.from("shipping_zones").select("*").order("sort"),
  ]);
  const s = Object.fromEntries((settings ?? []).map((x) => [x.key, x.value])) as Record<string, Record<string, string & { USD: number; BRL: number }>>;
  const store = s.store ?? {};
  const cur = s.currency ?? {};
  const pol = s.policies ?? {};

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" description="Datos del negocio, monedas, envíos y políticas que usan la tienda y el chatbot." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Negocio">
          <ActionForm action={saveStore}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre comercial"><input name="name" defaultValue={store.name} className={inputCls} /></Field>
              <Field label="Razón social"><input name="legal_name" defaultValue={store.legal_name} className={inputCls} /></Field>
              <Field label="RUC"><input name="ruc" defaultValue={store.ruc} className={inputCls} /></Field>
              <Field label="Correo"><input name="email" defaultValue={store.email} className={inputCls} /></Field>
              <Field label="Teléfono"><input name="phone" defaultValue={store.phone} className={inputCls} /></Field>
              <Field label="WhatsApp"><input name="whatsapp" defaultValue={store.whatsapp} className={inputCls} /></Field>
              <Field label="Dirección del local" className="sm:col-span-2"><input name="address" defaultValue={store.address} className={inputCls} /></Field>
              <Field label="Horarios" className="sm:col-span-2"><input name="hours" defaultValue={store.hours} className={inputCls} /></Field>
            </div>
          </ActionForm>
        </Card>
        <Card title="Monedas de referencia">
          <p className="mb-3 text-sm text-ink-500">Los cobros se hacen en guaraníes. Reales y dólares se muestran como referencia con estas cotizaciones.</p>
          <ActionForm action={saveCurrency}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="1 USD = Gs."><input name="USD" type="number" defaultValue={cur.rates?.USD} className={inputCls} /></Field>
              <Field label="1 BRL = Gs."><input name="BRL" type="number" defaultValue={cur.rates?.BRL} className={inputCls} /></Field>
              <Field label="Nota visible en el pie" className="sm:col-span-2"><input name="note" defaultValue={cur.note} className={inputCls} /></Field>
            </div>
          </ActionForm>
          {cur.updated_at ? <p className="mt-2 text-xs text-ink-400">Última actualización: {new Date(cur.updated_at).toLocaleString("es-PY")}</p> : null}
        </Card>
      </div>

      <Card title="Zonas de envío">
        <Table>
          <thead><tr><th>Zona</th><th>Método</th><th>Departamentos</th><th className="text-right">Costo</th><th className="text-right">Gratis desde</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {(zones ?? []).map((z) => (
              <tr key={z.id}>
                <td className="font-medium">{z.name}<span className="block text-xs text-ink-400">{z.eta}</span></td>
                <td>{z.method === "home" ? "Domicilio" : "Agencia"}</td>
                <td className="max-w-xs text-xs">{z.departments.join(", ")}</td>
                <td className="text-right">{formatPyg(z.cost)}</td>
                <td className="text-right">{z.free_over ? formatPyg(z.free_over) : "—"}</td>
                <td><Badge tone={z.active ? "ok" : "neutral"}>{z.active ? "Activa" : "Inactiva"}</Badge></td>
                <td className="whitespace-nowrap text-right">
                  <ActionButton action={toggleRecordAction.bind(null, "shipping_zones", z.id, "active", !z.active)} className="text-xs font-semibold text-accent-600">{z.active ? "Desactivar" : "Activar"}</ActionButton>{" "}
                  <ActionButton action={deleteRecordAction.bind(null, "shipping_zones", z.id)} confirm="¿Eliminar la zona?" className="text-xs text-bad-600">Eliminar</ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="mt-5 border-t border-ink-100 pt-4">
          <ActionForm action={addZone} submitLabel="Agregar zona" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-5">
              <Field label="Nombre"><input name="name" required className={inputCls} /></Field>
              <Field label="Método"><select name="method" className={inputCls}><option value="home">Domicilio</option><option value="agency">Agencia</option></select></Field>
              <Field label="Costo (Gs.)"><input name="cost" type="number" min={0} required className={inputCls} /></Field>
              <Field label="Gratis desde (Gs.)"><input name="free_over" type="number" min={0} className={inputCls} /></Field>
              <Field label="Plazo"><input name="eta" placeholder="24 a 48 h" className={inputCls} /></Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {PY_DEPARTMENTS.map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="departments" value={d} className="accent-accent-500" /> {d}</label>
              ))}
            </div>
          </ActionForm>
        </div>
      </Card>

      <Card title="Políticas (tienda y chatbot)">
        <ActionForm action={savePolicies}>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Envíos"><textarea name="shipping" rows={4} defaultValue={pol.shipping} className="rounded-lg border border-ink-200 p-2 text-sm" /></Field>
            <Field label="Garantía"><textarea name="warranty" rows={4} defaultValue={pol.warranty} className="rounded-lg border border-ink-200 p-2 text-sm" /></Field>
            <Field label="Devoluciones"><textarea name="returns" rows={4} defaultValue={pol.returns} className="rounded-lg border border-ink-200 p-2 text-sm" /></Field>
            <Field label="Pagos"><textarea name="payment" rows={4} defaultValue={pol.payment} className="rounded-lg border border-ink-200 p-2 text-sm" /></Field>
            <Field label="Minutos de reserva de stock en el checkout"><input name="reservation_minutes" type="number" min={10} max={240} defaultValue={(s.checkout as unknown as { reservation_minutes?: number })?.reservation_minutes ?? 45} className={inputCls} /></Field>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
