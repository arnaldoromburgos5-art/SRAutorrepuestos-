"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Loader2, Minus, Plus, ShoppingBag, Tag, Trash2 } from "lucide-react";
import { QUOTE_ERROR_MESSAGES } from "@/lib/checkout";
import { useStore } from "./store-context";
import { useQuote } from "./use-quote";
import { Money } from "./ui";

export function CartView() {
  const { cart, setQuantity, removeFromCart } = useStore();
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const { quote, loading, error } = useQuote({ coupon });

  if (!cart.length) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
        <ShoppingBag className="mx-auto size-12 text-ink-300" aria-hidden />
        <p className="mt-3 font-display text-2xl font-bold">Tu carrito está vacío</p>
        <p className="text-ink-500">Buscá repuestos por vehículo, categoría o código.</p>
        <Link href="/catalogo" className="mt-5 inline-block rounded-xl bg-accent-500 px-5 py-3 font-semibold text-white hover:bg-accent-600">
          Ir al catálogo
        </Link>
      </div>
    );
  }

  const lineFor = (id: string) => quote?.lines.find((l) => l.product_id === id);
  const errorFor = (id: string) => quote?.errors.find((e) => e.product_id === id);
  const blocking = (quote?.errors ?? []).filter((e) => e.code !== "SHIPPING_ZONE_REQUIRED");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {cart.map((item) => {
            const line = lineFor(item.productId);
            const err = errorFor(item.productId);
            const price = line?.unit_price ?? item.price;
            return (
              <motion.li
                key={item.productId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -24, height: 0, marginTop: 0 }}
                className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-4 shadow-card"
              >
                <Link href={`/producto/${item.slug}`} className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-ink-50">
                  {item.image ? <Image src={item.image} alt={item.name} fill sizes="96px" className="object-cover" /> : null}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/producto/${item.slug}`} className="line-clamp-2 font-medium hover:text-accent-600">
                        {item.name}
                      </Link>
                      <p className="text-xs text-ink-400">SKU {item.sku}</p>
                    </div>
                    <button onClick={() => removeFromCart(item.productId)} className="text-ink-400 hover:text-bad-600" aria-label="Quitar">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {err ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-bad-600">
                      <AlertTriangle className="size-3.5" />
                      {err.code === "INSUFFICIENT_STOCK" ? `Sólo quedan ${err.available ?? 0} unidades.` : QUOTE_ERROR_MESSAGES[err.code] ?? "Revisá este producto."}
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <div className="flex items-center rounded-lg border border-ink-200">
                      <button className="grid size-9 place-items-center" onClick={() => setQuantity(item.productId, item.quantity - 1)} aria-label="Restar">
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                      <button className="grid size-9 place-items-center" onClick={() => setQuantity(item.productId, item.quantity + 1)} aria-label="Sumar">
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold">
                        <Money amount={price * item.quantity} />
                      </p>
                      {item.quantity > 1 ? (
                        <p className="text-xs text-ink-400">
                          <Money amount={price} /> c/u
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <aside className="h-fit space-y-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-card lg:sticky lg:top-44">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setCoupon(couponInput.trim() || null);
          }}
        >
          <div className="relative flex-1">
            <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              placeholder="Cupón de descuento"
              className="h-10 w-full rounded-lg border border-ink-200 pl-9 pr-3 text-sm uppercase"
            />
          </div>
          <button className="h-10 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">Aplicar</button>
        </form>
        {quote?.coupon ? (
          <p className={`text-sm ${quote.coupon.valid ? "text-ok-600" : "text-bad-600"}`}>{quote.coupon.message}</p>
        ) : null}

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Subtotal</dt>
            <dd>{quote ? <Money amount={quote.subtotal} /> : "—"}</dd>
          </div>
          {quote?.discount_total ? (
            <div className="flex justify-between text-ok-600">
              <dt>Descuento</dt>
              <dd>
                − <Money amount={quote.discount_total} />
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-ink-500">Envío</dt>
            <dd className="text-ink-500">Se calcula en el checkout</dd>
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="font-display text-2xl">
              {loading ? <Loader2 className="size-5 animate-spin text-ink-400" /> : quote ? <Money amount={quote.subtotal - quote.discount_total} /> : "—"}
            </dd>
          </div>
          {quote?.wholesale ? <p className="text-xs text-ok-600">Aplicamos tus precios mayoristas.</p> : null}
        </dl>
        {error ? <p className="text-sm text-bad-600">{error}</p> : null}
        <Link
          href={`/checkout${coupon && quote?.coupon?.valid ? `?cupon=${encodeURIComponent(coupon)}` : ""}`}
          aria-disabled={blocking.length > 0}
          className={`block rounded-xl py-3 text-center font-semibold text-white transition-colors ${blocking.length ? "pointer-events-none bg-ink-300" : "bg-accent-500 hover:bg-accent-600"}`}
        >
          Continuar con la compra
        </Link>
        <p className="text-center text-xs text-ink-400">Precios con IVA incluido. El stock se reserva al confirmar el pedido.</p>
      </aside>
    </div>
  );
}
