"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig } from "motion/react";
import type { CartLine, VehicleSelection } from "@/lib/types";
import type { Currency, Rates } from "@/lib/money";

type Toast = { id: number; message: string; action?: { label: string; href: string } };

type StoreContextValue = {
  cart: CartLine[];
  cartCount: number;
  cartBump: number;
  addToCart: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  vehicle: VehicleSelection | null;
  setVehicle: (v: VehicleSelection | null) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rates: Rates;
  toasts: Toast[];
  toast: (message: string, action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);
const CART_KEY = "sr_cart_v1";

function writeCookie(name: string, value: string | null) {
  const base = `path=/; max-age=${value === null ? 0 : 60 * 60 * 24 * 180}; samesite=lax`;
  document.cookie = `${name}=${value === null ? "" : encodeURIComponent(value)}; ${base}`;
}

export function StoreProvider({
  children,
  initialVehicle,
  initialCurrency,
  rates,
}: {
  children: React.ReactNode;
  initialVehicle: VehicleSelection | null;
  initialCurrency: Currency;
  rates: Rates;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cartBump, setCartBump] = useState(0);
  const [vehicle, setVehicleState] = useState(initialVehicle);
  const [currency, setCurrencyState] = useState(initialCurrency);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage
      if (raw) setCart(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart, loaded]);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, action?: Toast["action"]) => {
      const id = ++toastId.current;
      setToasts((t) => [...t.slice(-2), { id, message, action }]);
      setTimeout(() => dismissToast(id), 4000);
    },
    [dismissToast],
  );

  const addToCart = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setCart((current) => {
      const existing = current.find((l) => l.productId === line.productId);
      if (existing) {
        return current.map((l) => (l.productId === line.productId ? { ...l, ...line, quantity: Math.min(l.quantity + quantity, 99) } : l));
      }
      return [...current, { ...line, quantity: Math.min(quantity, 99) }];
    });
    setCartBump((b) => b + 1);
    trackEvent("add_to_cart", { product_id: line.productId, value: line.price * quantity });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((l) => l.productId !== productId)
        : current.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(quantity, 99) } : l)),
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => setCart((c) => c.filter((l) => l.productId !== productId)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const setVehicle = useCallback(
    (v: VehicleSelection | null) => {
      setVehicleState(v);
      writeCookie("sr_vehicle", v ? JSON.stringify(v) : null);
      router.refresh();
    },
    [router],
  );

  const setCurrency = useCallback(
    (c: Currency) => {
      setCurrencyState(c);
      writeCookie("sr_currency", c);
      router.refresh();
    },
    [router],
  );

  const value = useMemo<StoreContextValue>(
    () => ({
      cart,
      cartCount: cart.reduce((n, l) => n + l.quantity, 0),
      cartBump,
      addToCart,
      setQuantity,
      removeFromCart,
      clearCart,
      vehicle,
      setVehicle,
      currency,
      setCurrency,
      rates,
      toasts,
      toast,
      dismissToast,
    }),
    [cart, cartBump, addToCart, setQuantity, removeFromCart, clearCart, vehicle, setVehicle, currency, setCurrency, rates, toasts, toast, dismissToast],
  );

  return (
    <StoreContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore debe usarse dentro de StoreProvider");
  return ctx;
}

// --- Analítica liviana (conversión, abandono de carrito, búsquedas sin resultados) ---
export function sessionId() {
  try {
    let sid = localStorage.getItem("sr_sid");
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem("sr_sid", sid);
    }
    return sid;
  } catch {
    return "anon";
  }
}

export function trackEvent(
  type: "page_view" | "product_view" | "search" | "add_to_cart" | "begin_checkout" | "purchase" | "chat_open",
  data: { product_id?: string; query?: string; results_count?: number; value?: number } = {},
) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ type, session_id: sessionId(), ...data });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else void fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {}
}
