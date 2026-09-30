import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, Boxes, CheckCircle2, ClipboardList, PackagePlus, Settings, Tag } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatPyg } from "@/lib/money";
import { periodRange } from "@/lib/periods";
import { dashboardMetrics, lowStock } from "@/lib/services/operations";
import { orderNumber } from "@/lib/utils";
import type { ServiceCtx } from "@/lib/services/context";
import { SalesOverview } from "@/components/admin/sales-overview";

function Action({ href, icon: Icon, title, text, primary }: { href: string; icon: typeof Bot; title: string; text: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-4 rounded-2xl border p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift ${
        primary ? "border-accent-500 bg-accent-500 text-white" : "border-ink-100 bg-white"
      }`}
    >
      <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${primary ? "bg-white/20" : "bg-ink-900 text-white"}`}>
        <Icon className="size-6" />
      </span>
      <span>
        <span className="block font-display text-xl font-bold">{title}</span>
        <span className={`text-sm ${primary ? "text-white/85" : "text-ink-500"}`}>{text}</span>
      </span>
    </Link>
  );
}

function BigNumber({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
      <p className="text-sm text-ink-500">{label}</p>
      <p className={`mt-1 font-display text-4xl font-bold tabular-nums ${tone === "warn" ? "text-warn-600" : tone === "ok" ? "text-ok-600" : ""}`}>{value}</p>
    </div>
  );
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string; periodo?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const ctx: ServiceCtx = { supabase, profile, source: "admin_ui" };
  const month = periodRange("mes");

  const [m, low, toPrepare, { count: productCount }] = await Promise.all([
    can(profile.role, "analytics.read") ? dashboardMetrics(ctx, month.from, month.to) : null,
    can(profile.role, "inventory.read") ? lowStock(ctx, 6) : [],
    can(profile.role, "orders.read")
      ? supabase.from("orders").select("id, number, customer_name, total, status, needs_attention, attention_note").or("needs_attention.eq.true,status.in.(paid,preparing)").order("created_at").limit(8)
      : { data: [] },
    supabase.from("products").select("id", { count: "exact", head: true }).neq("status", "archived"),
  ]);
  const pending = toPrepare.data ?? [];
  const firstName = profile.full_name?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-4xl font-bold">Hola{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p className="text-ink-500">¿Qué querés hacer hoy?</p>
      </div>
      {sp.error === "permiso" ? <p className="rounded-lg bg-warn-50 p-3 text-sm text-warn-600">No tenés permiso para esa sección.</p> : null}

      {productCount === 0 && can(profile.role, "products.write") ? (
        <div className="rounded-2xl border-2 border-dashed border-accent-500/50 bg-accent-50 p-6">
          <p className="font-display text-2xl font-bold">Tu tienda todavía no tiene productos</p>
          <p className="mt-1 text-ink-600">Empezá cargando el primero: sólo necesitás una foto, el nombre, el precio y cuántos tenés.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/admin/productos/nuevo" className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-5 py-3 font-semibold text-white hover:bg-accent-600">
              <PackagePlus className="size-5" /> Cargar mi primer producto
            </Link>
            {can(profile.role, "settings.manage") ? (
              <Link href="/admin/configuracion" className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-3 font-semibold">
                <Settings className="size-5" /> Completar datos del negocio
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {can(profile.role, "products.write") ? <Action href="/admin/productos/nuevo" icon={PackagePlus} title="Cargar un producto" text="Foto, nombre, precio y stock" primary /> : null}
        {can(profile.role, "orders.read") ? <Action href="/admin/pedidos?estado=paid" icon={ClipboardList} title="Pedidos para preparar" text={pending.length ? `${pending.length} esperando` : "Ver todos los pedidos"} /> : null}
        {can(profile.role, "inventory.adjust") ? <Action href="/admin/inventario" icon={Boxes} title="Actualizar stock" text="Registrar mercadería que llegó" /> : null}
        {can(profile.role, "promotions.manage") ? <Action href="/admin/promociones" icon={Tag} title="Crear una oferta" text="Descuentos y cupones" /> : null}
        {can(profile.role, "ai.admin") ? <Action href="/admin/asistente" icon={Bot} title="Pedírselo al asistente" text="Escribí lo que necesitás en tus palabras" /> : null}
      </div>

      {m ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <BigNumber label="Vendido este mes" value={formatPyg(m.revenue)} />
          <BigNumber label="Pedidos este mes" value={m.orders} />
          <BigNumber label="Productos por reponer" value={low.length} tone={low.length ? "warn" : "ok"} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {can(profile.role, "orders.read") ? (
          <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
            <h2 className="mb-3 font-display text-xl font-bold">Para atender ahora</h2>
            {pending.length ? (
              <ul className="divide-y divide-ink-100">
                {pending.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/pedidos/${o.id}`} className="flex items-center gap-3 py-3 hover:text-accent-600">
                      {o.needs_attention ? <AlertTriangle className="size-5 shrink-0 text-bad-600" /> : <ClipboardList className="size-5 shrink-0 text-accent-500" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{orderNumber(o.number)} · {o.customer_name}</span>
                        <span className="block truncate text-sm text-ink-500">
                          {o.attention_note ?? (o.status === "paid" ? "Pagado: preparalo para enviar o retirar" : "En preparación")}
                        </span>
                      </span>
                      <ArrowRight className="size-4 text-ink-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-ink-500"><CheckCircle2 className="size-5 text-ok-600" /> Nada pendiente. ¡Todo al día!</p>
            )}
          </section>
        ) : null}
        {can(profile.role, "inventory.read") ? (
          <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
            <h2 className="mb-3 font-display text-xl font-bold">Se está por acabar</h2>
            {low.length ? (
              <ul className="divide-y divide-ink-100">
                {low.map((p) => (
                  <li key={p.product_id}>
                    <Link href={`/admin/inventario?producto=${p.product_id}`} className="flex items-center gap-3 py-3 hover:text-accent-600">
                      <Boxes className="size-5 shrink-0 text-warn-600" />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-sm text-ink-500">quedan {p.available}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-ink-500"><CheckCircle2 className="size-5 text-ok-600" /> Tenés stock suficiente de todo.</p>
            )}
          </section>
        ) : null}
      </div>

      {can(profile.role, "analytics.read") ? <SalesOverview ctx={ctx} periodo={sp.periodo} basePath="/admin" /> : null}
    </div>
  );
}
