"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, CircleHelp, X, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Compat } from "@/lib/types";
import { useStore } from "./store-context";

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 select-none", className)} aria-label="SR Autorrepuestos">
      <svg viewBox="0 0 64 40" className="h-8 w-auto" aria-hidden>
        <path d="M6 36 L26 4 H60 L40 36 Z" fill="#ff6124" />
        <text x="33" y="29" textAnchor="middle" fontFamily="var(--font-barlow)" fontWeight="800" fontStyle="italic" fontSize="24" fill="#fff">
          SR
        </text>
      </svg>
      <span className={cn("font-display text-xl font-bold uppercase leading-none tracking-wide", light ? "text-white" : "text-ink-900")}>
        Auto<span className="text-accent-500">rrepuestos</span>
      </span>
    </span>
  );
}

export function Price({
  amount,
  listPrice,
  size = "md",
  className,
}: {
  amount: number;
  listPrice?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const { currency, rates } = useStore();
  const showList = listPrice && listPrice > amount;
  return (
    <span className={cn("inline-flex flex-col", className)}>
      {showList ? <span className="text-xs text-ink-400 line-through">{formatMoney(listPrice, currency, rates)}</span> : null}
      <span
        className={cn(
          "font-display font-bold tabular-nums text-ink-900",
          size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-base",
        )}
      >
        {formatMoney(amount, currency, rates)}
      </span>
      {currency !== "PYG" ? <span className="text-[11px] text-ink-400">Ref. · se cobra {formatMoney(amount)}</span> : null}
    </span>
  );
}

export function Money({ amount }: { amount: number }) {
  const { currency, rates } = useStore();
  return <span className="tabular-nums">{formatMoney(amount, currency, rates)}</span>;
}

const COMPAT = {
  confirmed: { label: "Compatible", icon: CheckCircle2, cls: "bg-ok-50 text-ok-600 ring-ok-600/20" },
  unverified: { label: "Pendiente de verificar", icon: CircleHelp, cls: "bg-warn-50 text-warn-600 ring-warn-600/20" },
  incompatible: { label: "No compatible", icon: XCircle, cls: "bg-bad-50 text-bad-600 ring-bad-600/20" },
} as const;

export function CompatBadge({ status, vehicleLabel, className }: { status: Compat | null; vehicleLabel?: string; className?: string }) {
  if (!status) return null;
  const c = COMPAT[status];
  const Icon = c.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", c.cls, className)}
      title={vehicleLabel ? `${c.label} con ${vehicleLabel}` : c.label}
    >
      <Icon className="size-3.5" aria-hidden />
      {c.label}
    </span>
  );
}

export function StockLabel({ available }: { available: number }) {
  if (available <= 0) return <span className="text-xs font-medium text-bad-600">Sin stock</span>;
  if (available <= 3) return <span className="text-xs font-medium text-warn-600">Últimas {available} unidades</span>;
  return <span className="text-xs font-medium text-ok-600">En stock</span>;
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl bg-ink-900 px-4 py-3 text-sm text-white shadow-lift"
          >
            <CheckCircle2 className="size-5 shrink-0 text-accent-400" aria-hidden />
            <span className="flex-1">{t.message}</span>
            {t.action ? (
              <Link href={t.action.href} className="font-semibold text-accent-400 hover:text-accent-100" onClick={() => dismissToast(t.id)}>
                {t.action.label}
              </Link>
            ) : null}
            <button onClick={() => dismissToast(t.id)} className="text-ink-400 hover:text-white" aria-label="Cerrar">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
