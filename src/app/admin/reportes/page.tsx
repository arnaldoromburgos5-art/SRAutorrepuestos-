import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { formatPyg } from "@/lib/money";
import { managementInsights } from "@/lib/services/operations";
import { formatDate } from "@/lib/utils";
import { Card, PageHeader, Stat, Table } from "@/components/admin/ui";

export const metadata = { title: "Reportes" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const days = [30, 60, 90, 180].includes(Number(dias)) ? Number(dias) : 60;
  const { supabase, profile } = await requirePermission("analytics.read");
  const [insights, { data: handoffs }, { data: notify }] = await Promise.all([
    managementInsights({ supabase, profile, source: "admin_ui" }, days),
    supabase.from("handoff_requests").select("id, name, contact, message, status, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(20),
    supabase.from("stock_notifications").select("product_id, products(sku, name)").is("notified_at", null),
  ]);
  const waiting = new Map<string, { sku: string; name: string; count: number }>();
  for (const n of notify ?? []) {
    const p = n.products as unknown as { sku: string; name: string };
    const cur = waiting.get(n.product_id) ?? { ...p, count: 0 };
    waiting.set(n.product_id, { ...cur, count: cur.count + 1 });
  }
  const bot = insights.chatbot;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        description="Oportunidades del catálogo y rendimiento del chatbot."
        actions={
          <div className="flex gap-1 rounded-lg border border-ink-200 bg-white p-1">
            {[30, 60, 90, 180].map((d) => (
              <Link key={d} href={`/admin/reportes?dias=${d}`} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${d === days ? "bg-ink-900 text-white" : "text-ink-600"}`}>{d} días</Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Conversaciones del chatbot" value={bot.conversations} />
        <Stat label="Derivaciones a vendedor" value={bot.handoffs} hint={bot.conversations ? `${Math.round((bot.handoffs / bot.conversations) * 100)} % de las conversaciones` : undefined} />
        <Stat label="Resueltas sin derivar" value={bot.conversations - bot.handoffs} definition="Conversaciones en las que no se pidió hablar con una persona. Es una aproximación: no mide satisfacción." />
        <Stat label="Compras asistidas" value={bot.assisted_paid_orders} hint={`${bot.assisted_orders} pedidos iniciados`} definition="Pedidos creados desde un navegador que tuvo una conversación con el chatbot en la misma sesión." />
        <Stat label="Ventas asistidas" value={formatPyg(bot.assisted_revenue)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Búsquedas sin resultados">
          <p className="mb-3 text-xs text-ink-500">Lo que la gente busca y no encuentra: candidatos a sumar al catálogo o a cargar como referencia alternativa.</p>
          <Table>
            <thead><tr><th>Búsqueda</th><th className="text-right">Veces</th><th>Última</th></tr></thead>
            <tbody>
              {insights.searches_without_results.map((s) => (
                <tr key={s.query}><td>{s.query}</td><td className="text-right">{s.times}</td><td className="text-xs text-ink-500">{formatDate(s.last_seen)}</td></tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Sugerencias de reposición">
          <p className="mb-3 text-xs text-ink-500">Venta diaria promedio de los últimos 30 días × plazo del proveedor + stock mínimo − disponible.</p>
          <Table>
            <thead><tr><th>Producto</th><th className="text-right">Disp.</th><th className="text-right">Venta/día</th><th className="text-right">Plazo</th><th className="text-right">Pedir</th></tr></thead>
            <tbody>
              {insights.reorder_suggestions.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/inventario?producto=${r.id}`} className="hover:text-accent-600">{r.name}</Link><span className="block text-xs text-ink-400">{r.sku}</span></td>
                  <td className="text-right">{r.available}</td>
                  <td className="text-right">{r.daily_sales}</td>
                  <td className="text-right">{r.lead_days} d</td>
                  <td className="text-right font-semibold text-accent-700">{r.suggested_qty}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title={`Baja rotación (sin ventas en ${days} días)`}>
          <Table>
            <thead><tr><th>Producto</th><th className="text-right">Stock</th><th className="text-right">Valor inmovilizado</th></tr></thead>
            <tbody>
              {insights.low_rotation.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/productos/${r.id}`} className="hover:text-accent-600">{r.name}</Link><span className="block text-xs text-ink-400">{r.sku}</span></td>
                  <td className="text-right">{r.on_hand}</td>
                  <td className="text-right tabular-nums">{formatPyg(r.stock_value)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-ink-400">Valor a costo cuando está cargado; si no, a precio de venta.</p>
        </Card>

        <div className="space-y-6">
          <Card title="Derivaciones abiertas del chatbot">
            <ul className="divide-y divide-ink-100 text-sm">
              {(handoffs ?? []).map((h) => (
                <li key={h.id} className="py-2">
                  <p>{h.message}</p>
                  <p className="text-xs text-ink-500">{formatDate(h.created_at, true)} · {h.name ?? "Sin nombre"} · {h.contact ?? "Sin contacto"}</p>
                </li>
              ))}
              {!handoffs?.length ? <li className="py-2 text-ink-400">No hay derivaciones pendientes.</li> : null}
            </ul>
          </Card>
          <Card title="Avisos de reposición pedidos por clientes">
            <ul className="divide-y divide-ink-100 text-sm">
              {[...waiting.entries()].map(([id, w]) => (
                <li key={id} className="flex justify-between py-2"><span>{w.name} <span className="text-xs text-ink-400">{w.sku}</span></span><span className="font-semibold">{w.count}</span></li>
              ))}
              {!waiting.size ? <li className="py-2 text-ink-400">Sin avisos pendientes.</li> : null}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
