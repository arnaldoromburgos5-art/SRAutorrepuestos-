import Link from "next/link";
import { AlertTriangle, Bot } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { formatPyg } from "@/lib/money";
import { DELIVERY_LABELS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { formatDate, orderNumber } from "@/lib/utils";
import { Badge, PageHeader, Pagination, Table, btnGhost, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Pedidos" };
const PAGE = 30;

export const STATUS_TONE: Record<OrderStatus, "neutral" | "ok" | "warn" | "bad" | "accent" | "dark"> = {
  pending_payment: "neutral", paid: "accent", preparing: "warn", shipped: "dark", delivered: "ok", cancelled: "bad",
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requirePermission("orders.read");
  const page = Math.max(1, Number(sp.pagina) || 1);
  let q = supabase
    .from("orders")
    .select("id, number, status, customer_name, email, total, delivery_method, created_at, needs_attention, source", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.estado === "atencion") q = q.eq("needs_attention", true);
  else if (sp.estado) q = q.eq("status", sp.estado);
  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, " ").trim();
    const asNumber = Number(term.replace(/\D/g, ""));
    q = asNumber ? q.or(`number.eq.${asNumber},email.ilike.%${term}%,customer_name.ilike.%${term}%`) : q.or(`email.ilike.%${term}%,customer_name.ilike.%${term}%`);
  }
  const { data, count } = await q;
  const pages = Math.ceil((count ?? 0) / PAGE);
  const href = (p: number) => `/admin/pedidos?${new URLSearchParams({ ...(sp as Record<string, string>), pagina: String(p) })}`;

  return (
    <div>
      <PageHeader title="Pedidos" description={`${count ?? 0} pedidos`} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[["", "Todos"], ["atencion", "Requieren atención"], ...Object.entries(ORDER_STATUS_LABELS)].map(([k, l]) => (
          <Link key={k} href={k ? `/admin/pedidos?estado=${k}` : "/admin/pedidos"} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${(sp.estado ?? "") === k ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:ring-ink-400"}`}>
            {l}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex gap-2">
        {sp.estado ? <input type="hidden" name="estado" value={sp.estado} /> : null}
        <input name="q" defaultValue={sp.q} placeholder="N.º de pedido, nombre o correo" className={`${inputCls} max-w-xs`} />
        <button className={btnGhost}>Buscar</button>
      </form>
      <Table>
        <thead>
          <tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th className="text-right">Total</th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((o) => (
            <tr key={o.id}>
              <td>
                <Link href={`/admin/pedidos/${o.id}`} className="flex items-center gap-1.5 font-semibold hover:text-accent-600">
                  {o.needs_attention ? <AlertTriangle className="size-4 text-bad-600" aria-label="Requiere atención" /> : null}
                  {orderNumber(o.number)}
                  {o.source === "chatbot" ? <Bot className="size-3.5 text-accent-500" aria-label="Compra asistida por el chatbot" /> : null}
                </Link>
              </td>
              <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(o.created_at, true)}</td>
              <td>{o.customer_name}<span className="block text-xs text-ink-400">{o.email}</span></td>
              <td className="text-xs">{DELIVERY_LABELS[o.delivery_method as keyof typeof DELIVERY_LABELS]}</td>
              <td><Badge tone={STATUS_TONE[o.status as OrderStatus]}>{ORDER_STATUS_LABELS[o.status as OrderStatus]}</Badge></td>
              <td className="text-right tabular-nums">{formatPyg(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pages={pages} href={href} />
    </div>
  );
}
