"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Building2, Loader2, Lock, Store, Truck } from "lucide-react";
import { PY_DEPARTMENTS, type ShippingZone } from "@/lib/types";
import { QUOTE_ERROR_MESSAGES } from "@/lib/checkout";
import { cn } from "@/lib/utils";
import { trackEvent, useStore } from "./store-context";
import { useQuote } from "./use-quote";
import { Money } from "./ui";

type Address = { id: string; label: string; recipient: string; phone: string; department: string; city: string; street: string; reference: string | null };

const input = "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-accent-500";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-ink-700">{label}</span>
      {children}
    </label>
  );
}

export function CheckoutForm({
  zones,
  initialCoupon,
  reservationMinutes,
  storeAddress,
  storeHours,
  loggedIn,
  profile,
  addresses,
}: {
  zones: ShippingZone[];
  initialCoupon: string;
  reservationMinutes: number;
  storeAddress: string;
  storeHours: string;
  loggedIn: boolean;
  profile: { full_name: string; email: string; phone: string; document_type: string; document_number: string; business_name: string } | null;
  addresses: Address[];
}) {
  const router = useRouter();
  const { cart, clearCart, currency } = useStore();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [docType, setDocType] = useState(profile?.document_type ?? "CI");
  const [docNumber, setDocNumber] = useState(profile?.document_number ?? "");
  const [invoice, setInvoice] = useState(false);
  const [businessName, setBusinessName] = useState(profile?.business_name ?? "");
  const [method, setMethod] = useState<"pickup" | "home" | "agency">("pickup");
  const firstAddress = addresses[0];
  const [department, setDepartment] = useState(firstAddress?.department ?? "Asunción");
  const [city, setCity] = useState(firstAddress?.city ?? "");
  const [street, setStreet] = useState(firstAddress?.street ?? "");
  const [reference, setReference] = useState(firstAddress?.reference ?? "");
  const [recipient, setRecipient] = useState(firstAddress?.recipient ?? profile?.full_name ?? "");
  const [recipientPhone, setRecipientPhone] = useState(firstAddress?.phone ?? profile?.phone ?? "");
  const [saveAddress, setSaveAddress] = useState(false);
  const [coupon, setCoupon] = useState(initialCoupon);
  const [appliedCoupon, setAppliedCoupon] = useState(initialCoupon || null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const departmentOptions = useMemo(() => {
    if (method === "pickup") return [...PY_DEPARTMENTS] as string[];
    return zones.filter((z) => z.method === method).flatMap((z) => z.departments);
  }, [zones, method]);
  // Si el departamento elegido no se atiende con el método actual, se usa el primero disponible.
  const dept = departmentOptions.includes(department) ? department : departmentOptions[0] ?? department;

  const zone = useMemo(
    () => (method === "pickup" ? null : zones.find((z) => z.method === method && z.departments.includes(dept)) ?? null),
    [zones, method, dept],
  );
  const { quote, loading } = useQuote({ coupon: appliedCoupon, deliveryMethod: method, zoneId: zone?.id ?? null, email });

  useEffect(() => {
    if (cart.length) trackEvent("begin_checkout");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez al entrar al checkout
  }, []);

  if (!cart.length) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center">
        <p className="font-display text-2xl font-bold">No hay productos en el carrito</p>
        <Link href="/catalogo" className="mt-4 inline-block rounded-xl bg-accent-500 px-5 py-3 font-semibold text-white">
          Ir al catálogo
        </Link>
      </div>
    );
  }

  const errors = quote?.errors ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
          coupon_code: appliedCoupon,
          delivery_method: method,
          shipping_zone_id: zone?.id ?? null,
          customer_name: name,
          email,
          phone,
          document_type: docNumber ? docType : null,
          document_number: docNumber || null,
          invoice_requested: invoice,
          business_name: invoice ? businessName || name : null,
          shipping_address:
            method === "pickup" ? null : { recipient, phone: recipientPhone, department: dept, city, street, reference: reference || null },
          notes: notes || null,
          display_currency: currency,
          save_address: saveAddress,
          ai_conversation_id: sessionStorage.getItem("sr_chat_conversation") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No pudimos crear el pedido.");
      clearCart();
      router.push(`/pago/${data.orderId}?t=${data.token}`);
    } catch (err) {
      setSubmitError((err as Error).message);
      setSubmitting(false);
    }
  }

  const methods = [
    { id: "pickup", icon: Store, title: "Retiro en el local", text: "Sin costo" },
    { id: "home", icon: Truck, title: "Envío a domicilio", text: "Asunción y Central" },
    { id: "agency", icon: Building2, title: "Envío por agencia", text: "Interior del país" },
  ] as const;

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {!loggedIn ? (
          <p className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-600">
            Estás comprando como invitado.{" "}
            <Link href="/cuenta/ingresar?next=/checkout" className="font-semibold text-accent-600">
              Ingresá
            </Link>{" "}
            para guardar tus datos y seguir tus pedidos.
          </p>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
          <h2 className="font-display text-2xl font-bold uppercase">1. Tus datos</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre y apellido" className="sm:col-span-2">
              <input required value={name} onChange={(e) => setName(e.target.value)} className={input} autoComplete="name" />
            </Field>
            <Field label="Correo electrónico">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} autoComplete="email" />
            </Field>
            <Field label="Teléfono / WhatsApp">
              <input required value={phone} onChange={(e) => setPhone(e.target.value)} className={input} autoComplete="tel" placeholder="0981 123 456" />
            </Field>
            <Field label="Documento">
              <div className="flex gap-2">
                <select value={docType} onChange={(e) => setDocType(e.target.value)} className="h-11 rounded-xl border border-ink-200 bg-white px-2 text-sm">
                  <option value="CI">CI</option>
                  <option value="RUC">RUC</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
                <input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className={input} placeholder={docType === "RUC" ? "80012345-6" : "1234567"} />
              </div>
            </Field>
            <label className="flex items-center gap-2 self-end pb-3 text-sm">
              <input type="checkbox" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} className="accent-accent-500" />
              Necesito factura a nombre de una empresa o RUC
            </label>
            {invoice ? (
              <Field label="Razón social" className="sm:col-span-2">
                <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={input} />
              </Field>
            ) : null}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
          <h2 className="font-display text-2xl font-bold uppercase">2. Entrega</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {methods.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-colors",
                  method === m.id ? "border-accent-500 bg-accent-50" : "border-ink-100 hover:border-ink-300",
                )}
                aria-pressed={method === m.id}
              >
                <m.icon className={cn("size-5", method === m.id ? "text-accent-600" : "text-ink-500")} />
                <span className="font-semibold">{m.title}</span>
                <span className="text-xs text-ink-500">{m.text}</span>
              </button>
            ))}
          </div>

          {method === "pickup" ? (
            <p className="rounded-xl bg-ink-50 p-4 text-sm text-ink-600">
              Retirás en <strong>{storeAddress}</strong>. {storeHours} Te avisamos por correo cuando el pedido esté listo.
            </p>
          ) : (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 sm:grid-cols-2">
              {addresses.length ? (
                <Field label="Usar una dirección guardada" className="sm:col-span-2">
                  <select
                    className={input}
                    onChange={(e) => {
                      const a = addresses.find((x) => x.id === e.target.value);
                      if (!a) return;
                      setDepartment(a.department);
                      setCity(a.city);
                      setStreet(a.street);
                      setReference(a.reference ?? "");
                      setRecipient(a.recipient);
                      setRecipientPhone(a.phone);
                    }}
                  >
                    <option value="">Elegí una dirección</option>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.street}, {a.city}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Departamento">
                <select value={dept} onChange={(e) => setDepartment(e.target.value)} className={input}>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ciudad / barrio">
                <input required value={city} onChange={(e) => setCity(e.target.value)} className={input} />
              </Field>
              <Field label="Dirección" className="sm:col-span-2">
                <input required value={street} onChange={(e) => setStreet(e.target.value)} className={input} placeholder="Calle, número y esquina" />
              </Field>
              <Field label="Referencia (opcional)" className="sm:col-span-2">
                <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} placeholder="Portón negro, frente a la plaza…" />
              </Field>
              <Field label="Recibe">
                <input required value={recipient} onChange={(e) => setRecipient(e.target.value)} className={input} />
              </Field>
              <Field label="Teléfono de quien recibe">
                <input required value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} className={input} />
              </Field>
              {zone ? (
                <p className="text-sm text-ink-600 sm:col-span-2">
                  Zona <strong>{zone.name}</strong>: {zone.eta}.{" "}
                  {zone.free_over ? (
                    <>
                      Envío gratis desde <Money amount={zone.free_over} />.
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-bad-600 sm:col-span-2">No hay envíos configurados para ese departamento con este método.</p>
              )}
              {loggedIn ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="accent-accent-500" />
                  Guardar esta dirección en mi cuenta
                </label>
              ) : null}
            </motion.div>
          )}
          <Field label="Notas para el pedido (opcional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} className="w-full rounded-xl border border-ink-200 p-3 text-sm" />
          </Field>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-card lg:sticky lg:top-44">
        <h2 className="font-display text-2xl font-bold uppercase">Resumen</h2>
        <ul className="max-h-72 space-y-3 overflow-y-auto">
          {cart.map((l) => {
            const q = quote?.lines.find((x) => x.product_id === l.productId);
            return (
              <li key={l.productId} className="flex items-center gap-3 text-sm">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-ink-50">
                  {l.image ? <Image src={l.image} alt="" fill sizes="48px" className="object-cover" /> : null}
                  <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-ink-900 text-[10px] font-bold text-white">{l.quantity}</span>
                </span>
                <span className="line-clamp-2 flex-1">{l.name}</span>
                <span className="font-medium">
                  <Money amount={(q?.unit_price ?? l.price) * l.quantity} />
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Cupón" className="h-10 min-w-0 flex-1 rounded-lg border border-ink-200 px-3 text-sm uppercase" />
          <button type="button" onClick={() => setAppliedCoupon(coupon.trim() || null)} className="h-10 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">
            Aplicar
          </button>
        </div>
        {quote?.coupon ? <p className={`text-sm ${quote.coupon.valid ? "text-ok-600" : "text-bad-600"}`}>{quote.coupon.message}</p> : null}
        <dl className="space-y-2 border-t border-ink-100 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Subtotal</dt>
            <dd>{quote ? <Money amount={quote.subtotal} /> : "—"}</dd>
          </div>
          {quote?.discount_total ? (
            <div className="flex justify-between text-ok-600">
              <dt>Descuento</dt>
              <dd>− <Money amount={quote.discount_total} /></dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-ink-500">Envío</dt>
            <dd>{method === "pickup" ? "Sin costo" : quote && zone ? quote.shipping_cost ? <Money amount={quote.shipping_cost} /> : "Gratis" : "—"}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 pt-3">
            <dt className="font-semibold">Total</dt>
            <dd className="font-display text-3xl font-bold">
              {loading ? <Loader2 className="size-5 animate-spin text-ink-400" /> : quote ? <Money amount={quote.total} /> : "—"}
            </dd>
          </div>
          {quote ? (
            <p className="text-right text-xs text-ink-400">
              Incluye IVA por <Money amount={quote.tax_total} />
            </p>
          ) : null}
        </dl>
        {errors.length ? (
          <ul className="space-y-1 rounded-lg bg-bad-50 p-3 text-sm text-bad-600">
            {errors.map((e, i) => (
              <li key={i}>
                {e.code === "INSUFFICIENT_STOCK" ? `${e.name}: sólo quedan ${e.available} u.` : QUOTE_ERROR_MESSAGES[e.code] ?? e.code}
              </li>
            ))}
          </ul>
        ) : null}
        {submitError ? <p className="rounded-lg bg-bad-50 p-3 text-sm text-bad-600">{submitError}</p> : null}
        <button
          disabled={submitting || loading || !quote || errors.length > 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 py-3.5 font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-ink-300"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
          Confirmar y pagar con tarjeta
        </button>
        <p className="text-center text-xs text-ink-400">
          Reservamos el stock por {reservationMinutes} minutos mientras completás el pago. El cobro se realiza en guaraníes.
        </p>
      </aside>
    </form>
  );
}
