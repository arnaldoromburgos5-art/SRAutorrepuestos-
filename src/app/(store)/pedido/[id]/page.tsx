import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Package, Truck } from "lucide-react";
import { getOrderForCustomer } from "@/lib/orders";
import { getPublicSettings } from "@/lib/catalog";
import { formatPyg } from "@/lib/money";
import { DELIVERY_LABELS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { formatDate, orderNumber } from "@/lib/utils";
import { OrderAutoRefresh, PurchaseTracker } from "@/components/store/order-live";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

const STEPS: OrderStatus[] = ["pending_payment", "paid", "preparing", "shipped", "delivered"];

export default async function OrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; pagado?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  const [order, settings] = await Promise.all([getOrderForCustomer(id, t), getPublicSettings()]);
  if (!order) notFound();

  const steps = order.delivery_method === "pickup" ? STEPS.filter((s) => s !== "shipped") : STEPS;
  const current = steps.indexOf(order.status);
  const paid = !["pending_payment", "cancelled"].includes(order.status);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <OrderAutoRefresh active={order.status === "pending_payment"} />
      {paid ? <PurchaseTracker orderId={order.id} total={order.total} /> : null}

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Pedido {orderNumber(order.number)} · {formatDate(order.created_at, true)}</p>
          <h1 className="font-display text-4xl font-bold uppercase">
            {order.status === "cancelled" ? "Pedido cancelado" : paid ? "¡Gracias por tu compra!" : "Pedido pendiente de pago"}
          </h1>
          <p className="text-ink-600">
            {paid
              ? `Te enviamos la confirmación a ${order.email}.`
              : order.status === "cancelled"
                ? order.cancel_reason
                : "Tu stock está reservado. Completá el pago para confirmar el pedido."}
          </p>
        </div>
        {order.status === "pending_payment" ? (
          <Link href={`/pago/${order.id}?t=${order.access_token}`} className="rounded-xl bg-accent-500 px-5 py-3 font-semibold text-white hover:bg-accent-600">
            Pagar ahora
          </Link>
        ) : null}
      </div>

      {order.status !== "cancelled" ? (
        <ol className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${i <= current ? "bg-ink-900 text-white" : "bg-white text-ink-400 ring-1 ring-ink-100"}`}
            >
              {i < current ? <CheckCircle2 className="size-4 text-accent-400" /> : i === current ? <Clock className="size-4 text-accent-400" /> : <span className="size-4" />}
              {s === "delivered" && order.delivery_method === "pickup" ? "Retirado" : ORDER_STATUS_LABELS[s]}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-8 flex items-center gap-2 rounded-xl bg-bad-50 p-4 text-sm text-bad-600">
          <AlertCircle className="size-4" /> Este pedido fue cancelado. Si ya pagaste, te contactaremos para el reintegro.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold uppercase">
            <Package className="size-5 text-accent-500" /> Productos
          </h2>
          <ul className="divide-y divide-ink-100">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-ink-50">
                  {i.image_url ? <Image src={i.image_url} alt="" fill sizes="56px" className="object-cover" /> : null}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{i.name}</span>
                  <span className="text-xs text-ink-400">SKU {i.sku} · {i.quantity} × {formatPyg(i.unit_price)}</span>
                </span>
                <span className="font-medium">{formatPyg(i.line_total)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd>{formatPyg(order.subtotal)}</dd></div>
            {order.discount_total ? (
              <div className="flex justify-between text-ok-600"><dt>Descuento {order.coupon_code ? `(${order.coupon_code})` : ""}</dt><dd>− {formatPyg(order.discount_total)}</dd></div>
            ) : null}
            <div className="flex justify-between"><dt className="text-ink-500">Envío</dt><dd>{order.shipping_cost ? formatPyg(order.shipping_cost) : "Sin costo"}</dd></div>
            <div className="flex justify-between pt-2 text-base font-semibold"><dt>Total</dt><dd className="font-display text-2xl">{formatPyg(order.total)}</dd></div>
            <p className="text-right text-xs text-ink-400">IVA incluido: {formatPyg(order.tax_total)}</p>
          </dl>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-ink-100 bg-white p-5 text-sm shadow-card">
            <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold uppercase">
              <Truck className="size-5 text-accent-500" /> Entrega
            </h2>
            <p className="font-medium">{DELIVERY_LABELS[order.delivery_method]}</p>
            {order.shipping_address ? (
              <p className="text-ink-600">
                {order.shipping_address.street}, {order.shipping_address.city}, {order.shipping_address.department}
                <br />
                Recibe: {order.shipping_address.recipient} · {order.shipping_address.phone}
              </p>
            ) : (
              <p className="text-ink-600">{settings.store.address} · {settings.store.hours}</p>
            )}
            {order.tracking_code ? (
              <p className="mt-2">
                Guía: <strong className="font-mono">{order.tracking_code}</strong> {order.carrier ? `(${order.carrier})` : ""}
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 text-sm shadow-card">
            <h2 className="mb-2 font-display text-lg font-bold uppercase">Historial</h2>
            <ul className="space-y-2">
              {order.history.map((h, i) => (
                <li key={i}>
                  <span className="font-medium">{ORDER_STATUS_LABELS[h.to_status as OrderStatus]}</span>
                  <span className="block text-xs text-ink-400">{formatDate(h.created_at, true)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-ink-400">
            ¿Dudas? Escribinos a {settings.store.email || settings.store.whatsapp} con tu número de pedido.
          </p>
        </aside>
      </div>
    </main>
  );
}
