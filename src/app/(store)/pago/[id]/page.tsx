import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getOrderForCustomer } from "@/lib/orders";
import { paymentProvider } from "@/lib/payments";
import { bancardCheckoutScriptUrl } from "@/lib/payments/bancard";
import { formatPyg } from "@/lib/money";
import { formatDate, orderNumber } from "@/lib/utils";
import { PaymentPanel } from "@/components/store/payment-panel";

export const metadata: Metadata = { title: "Pago", robots: { index: false } };

export default async function PaymentPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; cancelado?: string }>;
}) {
  const { id } = await params;
  const { t, cancelado } = await searchParams;
  const order = await getOrderForCustomer(id, t);
  if (!order) notFound();
  if (order.status !== "pending_payment") redirect(`/pedido/${order.id}?t=${order.access_token}`);

  const provider = paymentProvider();
  const pending = order.payments.find((p) => p.status === "pending" && p.provider === provider);
  const lastRejected = order.payments[0]?.status === "rejected" ? order.payments[0] : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 space-y-1">
        <p className="text-sm text-ink-500">Pedido {orderNumber(order.number)}</p>
        <h1 className="font-display text-4xl font-bold uppercase">Pago con tarjeta</h1>
        <p className="text-ink-600">
          Total a pagar: <strong className="font-display text-2xl text-ink-900">{formatPyg(order.total)}</strong>
        </p>
        {order.reservation_expires_at ? (
          <p className="flex items-center gap-1.5 text-sm text-warn-600">
            <Clock className="size-4" /> Reservamos tu stock hasta el {formatDate(order.reservation_expires_at, true)}.
          </p>
        ) : null}
      </div>
      {cancelado ? <p className="mb-4 rounded-xl bg-warn-50 p-3 text-sm text-warn-600">Cancelaste el pago. Podés intentarlo de nuevo.</p> : null}
      {lastRejected ? (
        <p className="mb-4 rounded-xl bg-bad-50 p-3 text-sm text-bad-600">
          El último intento fue rechazado{lastRejected.response_description ? `: ${lastRejected.response_description}` : ""}. Probá con otra tarjeta.
        </p>
      ) : null}
      <PaymentPanel
        orderId={order.id}
        token={order.access_token}
        provider={provider}
        paymentId={pending?.id ?? null}
        processId={pending?.provider_ref ?? null}
        scriptUrl={provider === "bancard" ? bancardCheckoutScriptUrl() : null}
      />
    </main>
  );
}
