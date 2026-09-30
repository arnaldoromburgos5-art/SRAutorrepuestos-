import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatPyg } from "@/lib/money";
import { DELIVERY_LABELS, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { formatDate, orderNumber } from "@/lib/utils";
import { cancelOrderAction, orderStatusAction, resolveAttentionAction, returnAction } from "../../actions";
import { ActionButton, ActionForm } from "@/components/admin/action-form";
import { Badge, Card, Field, PageHeader, Table, btnGhost, inputCls } from "@/components/admin/ui";
import { STATUS_TONE } from "../page";

export const metadata = { title: "Pedido" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requirePermission("orders.read");
  const { data: o } = await supabase
    .from("orders")
    .select("*, order_items(*), order_status_history(from_status, to_status, note, created_at, profiles(full_name)), payments(*), returns(*), shipping_zones(name)")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  const manage = can(profile.role, "orders.manage");
  const status = o.status as OrderStatus;
  const items = o.order_items as { id: string; sku: string; name: string; quantity: number; unit_price: number; discount: number; line_total: number; unit_cost: number | null; product_id: string | null }[];
  const history = (o.order_status_history as { from_status: string | null; to_status: OrderStatus; note: string | null; created_at: string; profiles: { full_name: string | null } | null }[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const payments = (o.payments as { id: string; provider: string; status: string; amount: number; authorization_code: string | null; response_description: string | null; created_at: string; shop_process_id: number }[]).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const returns = o.returns as { id: string; reason: string; refund_amount: number; restock: boolean; created_at: string; items: { order_item_id: string; quantity: number }[] }[];

  const next: { status: string; label: string }[] =
    status === "paid" ? [{ status: "preparing", label: "Pasar a preparación" }]
      : status === "preparing" ? o.delivery_method === "pickup" ? [{ status: "delivered", label: "Marcar como retirado" }] : [{ status: "shipped", label: "Marcar como enviado" }]
        : status === "shipped" ? [{ status: "delivered", label: "Marcar como entregado" }] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Pedido ${orderNumber(o.number)}`}
        description={`${formatDate(o.created_at, true)} · ${o.source === "chatbot" ? "compra asistida por el chatbot" : "tienda web"}`}
        actions={<><Badge tone={STATUS_TONE[status]}>{ORDER_STATUS_LABELS[status]}</Badge><Link href="/admin/pedidos" className="text-sm font-semibold text-ink-600">← Pedidos</Link></>}
      />
      {o.needs_attention ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-bad-50 p-4 text-sm text-bad-600">
          <AlertTriangle className="size-5" />
          <span className="flex-1">{o.attention_note ?? "Este pedido requiere revisión."}</span>
          {manage ? <ActionButton action={resolveAttentionAction.bind(null, o.id)} className={btnGhost}>Marcar como resuelto</ActionButton> : null}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card title="Productos">
            <Table>
              <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Desc.</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.product_id ? <Link href={`/admin/productos/${i.product_id}`} className="hover:text-accent-600">{i.name}</Link> : i.name}<span className="block text-xs text-ink-400">{i.sku}</span></td>
                    <td className="text-right">{i.quantity}</td>
                    <td className="text-right tabular-nums">{formatPyg(i.unit_price)}</td>
                    <td className="text-right tabular-nums">{i.discount ? `−${formatPyg(i.discount)}` : "—"}</td>
                    <td className="text-right tabular-nums">{formatPyg(i.line_total - i.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd>{formatPyg(o.subtotal)}</dd></div>
              {o.discount_total ? <div className="flex justify-between"><dt className="text-ink-500">Descuento {o.coupon_code ? `(${o.coupon_code})` : ""}</dt><dd>−{formatPyg(o.discount_total)}</dd></div> : null}
              <div className="flex justify-between"><dt className="text-ink-500">Envío</dt><dd>{formatPyg(o.shipping_cost)}</dd></div>
              <div className="flex justify-between border-t border-ink-100 pt-1 font-semibold"><dt>Total</dt><dd>{formatPyg(o.total)}</dd></div>
              <div className="flex justify-between text-xs text-ink-400"><dt>IVA incluido</dt><dd>{formatPyg(o.tax_total)}</dd></div>
            </dl>
          </Card>

          <Card title="Pagos">
            {payments.length ? (
              <ul className="divide-y divide-ink-100 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{p.provider} · proceso {p.shop_process_id}</span>
                    <Badge tone={p.status === "approved" ? "ok" : p.status === "rejected" ? "bad" : "neutral"}>{p.status}</Badge>
                    <span className="text-xs text-ink-500">{p.authorization_code ? `Aut. ${p.authorization_code} · ` : ""}{p.response_description ?? ""}</span>
                    <span className="tabular-nums">{formatPyg(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-500">Sin intentos de pago.</p>}
          </Card>

          {manage && (status === "shipped" || status === "delivered") ? (
            <Card title="Registrar devolución">
              <ActionForm action={returnAction} submitLabel="Registrar devolución" confirm="¿Registrar la devolución? Si elegís reponer, el stock vuelve al inventario.">
                <input type="hidden" name="order_id" value={o.id} />
                <div className="space-y-2">
                  {items.map((i) => (
                    <label key={i.id} className="flex items-center gap-3 text-sm">
                      <input name={`qty_${i.id}`} type="number" min={0} max={i.quantity} defaultValue={0} className={`${inputCls} w-20`} />
                      <span>{i.name} <span className="text-ink-400">(compró {i.quantity})</span></span>
                    </label>
                  ))}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Motivo"><input name="reason" required className={inputCls} /></Field>
                    <Field label="Reintegro (Gs.)"><input name="refund" type="number" min={0} max={o.total} defaultValue={0} className={inputCls} /></Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="restock" defaultChecked className="accent-accent-500" /> Reponer al stock (producto en buen estado)</label>
                </div>
              </ActionForm>
              {returns.length ? (
                <ul className="mt-4 space-y-1 border-t border-ink-100 pt-3 text-sm">
                  {returns.map((r) => (
                    <li key={r.id}>{formatDate(r.created_at)} · {r.reason} · reintegro {formatPyg(r.refund_amount)} {r.restock ? "· repuesto al stock" : ""}</li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Cliente">
            <p className="font-semibold">{o.customer_name}</p>
            <p className="text-sm text-ink-600">{o.email} · {o.phone}</p>
            {o.document_number ? <p className="text-sm text-ink-600">{o.document_type} {o.document_number}</p> : null}
            {o.invoice_requested ? <p className="mt-2 text-sm"><Badge tone="accent">Factura</Badge> {o.business_name}</p> : null}
            {o.user_id && can(profile.role, "customers.read") ? <Link href={`/admin/clientes/${o.user_id}`} className="mt-2 inline-block text-sm font-semibold text-accent-600">Ver ficha del cliente</Link> : null}
            {o.notes ? <p className="mt-3 rounded-lg bg-ink-50 p-3 text-sm">Nota: {o.notes}</p> : null}
          </Card>

          <Card title="Entrega">
            <p className="font-medium">{DELIVERY_LABELS[o.delivery_method as keyof typeof DELIVERY_LABELS]}</p>
            {o.shipping_address ? (
              <p className="text-sm text-ink-600">
                {o.shipping_address.street}, {o.shipping_address.city}, {o.shipping_address.department}
                {o.shipping_address.reference ? ` (${o.shipping_address.reference})` : ""}
                <br />Recibe {o.shipping_address.recipient} · {o.shipping_address.phone}
                <br />Zona: {(o.shipping_zones as { name: string } | null)?.name}
              </p>
            ) : null}
            {o.tracking_code ? <p className="mt-2 text-sm">Guía <strong>{o.tracking_code}</strong> {o.carrier ? `(${o.carrier})` : ""}</p> : null}
          </Card>

          {manage && next.length ? (
            <Card title="Avanzar pedido">
              <ActionForm action={orderStatusAction} submitLabel={next[0].label}>
                <input type="hidden" name="order_id" value={o.id} />
                <input type="hidden" name="status" value={next[0].status} />
                <div className="space-y-2">
                  {next[0].status === "shipped" ? (
                    <>
                      <Field label="Transportista / agencia"><input name="carrier" className={inputCls} /></Field>
                      <Field label="N.º de guía"><input name="tracking" className={inputCls} /></Field>
                    </>
                  ) : null}
                  <Field label="Nota interna (opcional)"><input name="note" className={inputCls} /></Field>
                </div>
              </ActionForm>
            </Card>
          ) : null}

          {manage && ["pending_payment", "paid", "preparing"].includes(status) ? (
            <Card title="Cancelar pedido">
              <ActionForm action={cancelOrderAction} submitLabel="Cancelar pedido" submitClassName="bg-bad-600 hover:bg-bad-600/90" confirm="¿Cancelar el pedido? Se libera o repone el stock.">
                <input type="hidden" name="order_id" value={o.id} />
                <Field label="Motivo"><input name="reason" required className={inputCls} /></Field>
                {status !== "pending_payment" ? <p className="mt-2 text-xs text-warn-600">El pedido está pagado: después de cancelar, gestioná el reintegro en la pasarela.</p> : null}
              </ActionForm>
            </Card>
          ) : null}

          <Card title="Historial">
            <ol className="space-y-2 text-sm">
              {history.map((h, i) => (
                <li key={i}>
                  <span className="font-medium">{ORDER_STATUS_LABELS[h.to_status]}</span>
                  <span className="block text-xs text-ink-400">{formatDate(h.created_at, true)}{h.profiles?.full_name ? ` · ${h.profiles.full_name}` : ""}</span>
                  {h.note ? <span className="block text-xs text-ink-600">{h.note}</span> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
