import Link from "next/link";
import { AlertTriangle, Boxes, ClipboardList } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatPyg } from "@/lib/money";
import { PERIODS, periodRange, previousRange } from "@/lib/periods";
import { dashboardMetrics, lowStock } from "@/lib/services/operations";
import { Card, PageHeader, Stat, Table } from "@/components/admin/ui";
import { RankingChart, RevenueChart } from "@/components/admin/charts";
import type { ServiceCtx } from "@/lib/services/context";

const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)} % vs. período anterior` : "sin datos previos");

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ periodo?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireStaff();
  const ctx: ServiceCtx = { supabase, profile, source: "admin_ui" };
  const range = periodRange(sp.periodo);
  const canAnalytics = can(profile.role, "analytics.read");

  const [m, prev, low, attention] = await Promise.all([
    canAnalytics ? dashboardMetrics(ctx, range.from, range.to) : null,
    canAnalytics ? dashboardMetrics(ctx, ...Object.values(previousRange(range.from, range.to)) as [Date, Date]) : null,
    can(profile.role, "inventory.read") ? lowStock(ctx, 8) : [],
    can(profile.role, "orders.read")
      ? supabase.from("orders").select("id, number, status, attention_note, total").or("needs_attention.eq.true,status.eq.paid").order("created_at").limit(8)
      : { data: [] },
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumen del negocio"
        description={`Hola, ${profile.full_name?.split(" ")[0] ?? ""}. Indicadores de ${PERIODS[range.key].toLowerCase()}.`}
        actions={
          <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1">
            {Object.entries(PERIODS).map(([k, label]) => (
              <Link
                key={k}
                href={`/admin?periodo=${k}`}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${range.key === k ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"}`}
              >
                {label}
              </Link>
            ))}
          </div>
        }
      />
      {sp.error === "permiso" ? <p className="rounded-lg bg-warn-50 p-3 text-sm text-warn-600">No tenés permiso para esa sección.</p> : null}

      {m && prev ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ingresos" value={formatPyg(m.revenue)} hint={pct(m.revenue, prev.revenue)}
              definition="Total cobrado (IVA incluido, con envío y descuentos) de pedidos pagados en el período según fecha de pago, sin contar los cancelados." />
            <Stat label="Pedidos" value={m.orders} hint={pct(m.orders, prev.orders)} definition="Pedidos con pago aprobado en el período, sin cancelados." />
            <Stat label="Ticket promedio" value={formatPyg(m.avg_ticket)} hint={pct(m.avg_ticket, prev.avg_ticket)} definition="Ingresos divididos por la cantidad de pedidos pagados." />
            <Stat
              label="Margen estimado"
              value={formatPyg(m.margin)}
              hint={`Cubre ${m.margin_coverage} % de las ventas`}
              definition="Ventas netas de IVA menos el costo registrado. Sólo incluye productos con costo cargado; el porcentaje indica qué parte de las ventas tiene costo."
            />
            <Stat label="Clientes nuevos" value={m.new_customers} hint={`${m.returning_customers} recurrentes`} definition="Nuevo: su primer pedido pagado ocurre en este período (identificado por correo). Recurrente: ya había comprado antes." />
            <Stat
              label="Conversión"
              value={m.sessions ? `${((m.sessions_with_purchase / m.sessions) * 100).toFixed(1)} %` : "—"}
              hint={`${m.sessions} sesiones`}
              definition="Sesiones de navegación que terminaron en compra sobre el total de sesiones registradas en el período."
            />
            <Stat
              label="Abandono de carrito"
              value={m.sessions_with_cart ? `${Math.round((1 - m.sessions_with_purchase / m.sessions_with_cart) * 100)} %` : "—"}
              hint={`${m.sessions_with_cart} sesiones con carrito`}
              definition="Sesiones que agregaron productos al carrito y no compraron, sobre las sesiones que agregaron al carrito."
            />
            <Stat
              label="Cancelaciones y devoluciones"
              value={m.cancelled_paid + m.returns}
              hint={`${m.cancelled_unpaid} reservas vencidas · reintegros ${formatPyg(m.refunds)}`}
              tone={m.cancelled_paid + m.returns > 0 ? "warn" : undefined}
              definition="Pedidos pagados cancelados más devoluciones registradas en el período. Las reservas vencidas (sin pago) se muestran aparte."
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title="Ingresos por día" className="xl:col-span-2">
              <RevenueChart data={m.by_day} />
            </Card>
            <Card title="Categorías más vendidas">
              <RankingChart data={m.top_categories.slice(0, 6)} />
            </Card>
          </div>

          <Card title="Productos más vendidos">
            <Table>
              <thead>
                <tr><th>Producto</th><th>SKU</th><th className="text-right">Unidades</th><th className="text-right">Ventas</th></tr>
              </thead>
              <tbody>
                {m.top_products.map((p) => (
                  <tr key={p.sku}>
                    <td>{p.product_id ? <Link className="hover:text-accent-600" href={`/admin/productos/${p.product_id}`}>{p.name}</Link> : p.name}</td>
                    <td className="text-ink-500">{p.sku}</td>
                    <td className="text-right tabular-nums">{p.units}</td>
                    <td className="text-right tabular-nums">{formatPyg(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {can(profile.role, "orders.read") ? (
          <Card title="Pedidos para atender" actions={<Link href="/admin/pedidos" className="text-sm font-semibold text-accent-600">Ver todos</Link>}>
            {attention.data?.length ? (
              <ul className="divide-y divide-ink-100 text-sm">
                {attention.data.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/admin/pedidos/${o.id}`} className="flex items-center gap-2 font-medium hover:text-accent-600">
                      {o.attention_note ? <AlertTriangle className="size-4 text-bad-600" /> : <ClipboardList className="size-4 text-ink-400" />}
                      SR-{String(o.number).padStart(6, "0")}
                    </Link>
                    <span className="truncate text-xs text-ink-500">{o.attention_note ?? "Pagado, listo para preparar"}</span>
                    <span className="tabular-nums">{formatPyg(o.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">No hay pedidos pendientes de atención.</p>
            )}
          </Card>
        ) : null}
        {can(profile.role, "inventory.read") ? (
          <Card title="Stock bajo el mínimo" actions={<Link href="/admin/inventario" className="text-sm font-semibold text-accent-600">Inventario</Link>}>
            {low.length ? (
              <ul className="divide-y divide-ink-100 text-sm">
                {low.map((p) => (
                  <li key={p.product_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2">
                      <Boxes className="size-4 text-warn-600" />
                      <span className="line-clamp-1">{p.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-500">
                      {p.available} disp. / mín. {p.min_stock}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">Todo el stock está por encima del mínimo.</p>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
