"use client";

import { useEffect, useState } from "react";
import type { Quote } from "@/lib/types";
import { useStore } from "./store-context";

type Options = {
  coupon?: string | null;
  deliveryMethod?: "pickup" | "home" | "agency";
  zoneId?: string | null;
  email?: string | null;
};

/** Cotiza el carrito en el servidor (precios y stock reales) cada vez que cambia. */
export function useQuote(options: Options = {}) {
  const { cart } = useStore();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify({ c: cart.map((l) => [l.productId, l.quantity]), ...options });

  useEffect(() => {
    if (!cart.length) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            items: cart.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
            coupon_code: options.coupon || null,
            delivery_method: options.deliveryMethod ?? "pickup",
            shipping_zone_id: options.zoneId || null,
            email: options.email || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo calcular el total");
        setQuote(await res.json());
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` resume cart + options
  }, [key]);

  return { quote: cart.length ? quote : null, loading, error };
}
