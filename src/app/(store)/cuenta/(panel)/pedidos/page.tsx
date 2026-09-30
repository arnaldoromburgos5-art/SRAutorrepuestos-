import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatPyg } from "@/lib/money";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { formatDate, orderNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Mis pedidos" };

export default async function MyOrdersPage() {
  const { supabase, user } = await requireUser();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, number, status, total, created_at, access_token, order_items(count)")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
      <h2 className="mb-4 font-display text-2xl font-bold uppercase">Mis pedidos</h2>
      {orders?.length ? (
        <ul className="divide-y divide-ink-100">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <Link href={`/pedido/${o.id}?t=${o.access_token}`} className="font-semibold hover:text-accent-600">
                  {orderNumber(o.number)}
                </Link>
                <p className="text-xs text-ink-400">
                  {formatDate(o.created_at)} · {(o.order_items as unknown as { count: number }[])[0]?.count ?? 0} productos
                </p>
              </div>
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold">{ORDER_STATUS_LABELS[o.status as OrderStatus]}</span>
              <span className="font-display text-lg font-bold">{formatPyg(o.total)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-500">Todavía no hiciste pedidos con esta cuenta.</p>
      )}
    </section>
  );
}
