import Link from "next/link";
import { formatPyg } from "@/lib/money";
import { PERIODS, periodRange, previousRange } from "@/lib/periods";
import { dashboardMetrics } from "@/lib/services/operations";
import type { ServiceCtx } from "@/lib/services/context";
import { Card, Stat, Table } from "./ui";
import { RankingChart, RevenueChart } from "./charts";

const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)} % vs. período anterior` : "sin datos previos");

/** Indicadores de ventas con definiciones (se muestran en Reportes). */
export async function SalesOverview({ ctx, periodo, basePath }: { ctx: ServiceCtx; periodo?: string; basePath: string }) {
  const range = periodRange(periodo);
  const prevRange = previousRange(range.from, range.to);
  const [m, prev] = await Promise.all([dashboardMetrics(ctx, range.from, range.to), dashboardMetrics(ctx, prevRange.from, prevRange.to)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">Ventas</h2>
        <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1">
          {Object.entries(PERIODS).map(([k, label]) => (
            <Link key={k} href={`${basePath}?periodo=${k}`} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${range.key === k ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"}`}>
              {label}
            </Link>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ingresos" value={formatPyg(m.revenue)} hint={pct(m.revenue, prev.revenue)}
          definition="Total cobrado (IVA incluido, con envío y descuentos) de pedidos pagados en el período según fecha de pago, sin contar los cancelados." />
        <Stat label="Pedidos" value={m.orders} hint={pct(m.orders, prev.orders)} definition="Pedidos con pago aprobado en el período, sin cancelados." />
        <Stat label="Ticket promedio" value={formatPyg(m.avg_ticket)} hint={pct(m.avg_ticket, prev.avg_ticket)} definition="Ingresos divididos por la cantidad de pedidos pagados." />
        <Stat label="Margen estimado" value={formatPyg(m.margin)} hint={`Cubre ${m.margin_coverage} % de las ventas`}
          definition="Ventas netas de IVA menos el costo registrado. Sólo incluye productos con costo cargado; el porcentaje indica qué parte de las ventas tiene costo." />
        <Stat label="Clientes nuevos" value={m.new_customers} hint={`${m.returning_customers} recurrentes`} definition="Nuevo: su primer pedido pagado ocurre en este período (identificado por correo). Recurrente: ya había comprado antes." />
        <Stat label="Conversión" value={m.sessions ? `${((m.sessions_with_purchase / m.sessions) * 100).toFixed(1)} %` : "—"} hint={`${m.sessions} visitas`}
          definition="Visitas a la tienda que terminaron en compra sobre el total de visitas del período." />
        <Stat label="Abandono de carrito" value={m.sessions_with_cart ? `${Math.round((1 - m.sessions_with_purchase / m.sessions_with_cart) * 100)} %` : "—"} hint={`${m.sessions_with_cart} con carrito`}
          definition="Visitas que agregaron productos al carrito y no compraron, sobre las que agregaron al carrito." />
        <Stat label="Cancelaciones y devoluciones" value={m.cancelled_paid + m.returns} hint={`${m.cancelled_unpaid} reservas vencidas`} tone={m.cancelled_paid + m.returns > 0 ? "warn" : undefined}
          definition="Pedidos pagados cancelados más devoluciones registradas. Las reservas vencidas (sin pago) se muestran aparte." />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Ingresos por día" className="xl:col-span-2"><RevenueChart data={m.by_day} /></Card>
        <Card title="Categorías más vendidas"><RankingChart data={m.top_categories.slice(0, 6)} /></Card>
      </div>
      {m.top_products.length ? (
        <Card title="Productos más vendidos">
          <Table>
            <thead><tr><th>Producto</th><th className="text-right">Unidades</th><th className="text-right">Ventas</th></tr></thead>
            <tbody>
              {m.top_products.map((p) => (
                <tr key={p.sku}>
                  <td>{p.name}<span className="block text-xs text-ink-400">{p.sku}</span></td>
                  <td className="text-right tabular-nums">{p.units}</td>
                  <td className="text-right tabular-nums">{formatPyg(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
