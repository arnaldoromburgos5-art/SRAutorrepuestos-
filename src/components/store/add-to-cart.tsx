"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "./store-context";

type Props = {
  product: { id: string; name: string; slug: string; sku: string; price: number; image: string | null };
  available: number;
  withQuantity?: boolean;
  compact?: boolean;
  className?: string;
};

export function AddToCartButton({ product, available, withQuantity = false, compact = false, className }: Props) {
  const { addToCart, toast } = useStore();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const disabled = available <= 0;

  function add() {
    if (disabled) return;
    addToCart({ productId: product.id, name: product.name, slug: product.slug, sku: product.sku, price: product.price, image: product.image }, qty);
    setAdded(true);
    toast(`${qty > 1 ? `${qty} × ` : ""}${product.name} en el carrito`, { label: "Ver carrito", href: "/carrito" });
    setTimeout(() => setAdded(false), 1600);
  }

  return (
    <div className={cn("flex items-stretch gap-2", className)}>
      {withQuantity && !disabled ? (
        <div className="flex items-center rounded-xl border border-ink-200 bg-white">
          <button className="grid size-11 place-items-center text-ink-600 hover:text-ink-900" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Restar">
            <Minus className="size-4" />
          </button>
          <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{qty}</span>
          <button
            className="grid size-11 place-items-center text-ink-600 hover:text-ink-900"
            onClick={() => setQty((q) => Math.min(available, 99, q + 1))}
            aria-label="Sumar"
          >
            <Plus className="size-4" />
          </button>
        </div>
      ) : null}
      <motion.button
        whileTap={disabled ? undefined : { scale: 0.96 }}
        onClick={add}
        disabled={disabled}
        className={cn(
          "relative inline-flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl font-semibold transition-colors",
          compact ? "h-10 px-3 text-sm" : "h-11 px-5",
          disabled ? "cursor-not-allowed bg-ink-100 text-ink-400" : added ? "bg-ok-600 text-white" : "bg-accent-500 text-white hover:bg-accent-600",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {added ? (
            <motion.span key="ok" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} className="inline-flex items-center gap-2">
              <Check className="size-4" /> Agregado
            </motion.span>
          ) : (
            <motion.span key="add" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} className="inline-flex items-center gap-2">
              <ShoppingCart className="size-4" /> {disabled ? "Sin stock" : compact ? "Agregar" : "Agregar al carrito"}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
