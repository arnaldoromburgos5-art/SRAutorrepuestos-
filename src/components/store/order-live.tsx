"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "./store-context";

/** Mientras el pago está pendiente, refresca para reflejar la confirmación del webhook. */
export function OrderAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [active, router]);
  return null;
}

/** Registra la compra una sola vez por pedido (conversión). */
export function PurchaseTracker({ orderId, total }: { orderId: string; total: number }) {
  useEffect(() => {
    const key = `sr_purchase_${orderId}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    trackEvent("purchase", { value: total });
  }, [orderId, total]);
  return null;
}
