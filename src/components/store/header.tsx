"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { Menu, MessageCircle, Phone, Search, ShoppingCart, User, X } from "lucide-react";
import { CURRENCY_LABELS, type Currency } from "@/lib/money";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStore } from "./store-context";
import { Logo } from "./ui";
import { VehicleBar } from "./vehicle-selector";

export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const next = new URLSearchParams();
        if (q.trim()) next.set("q", q.trim());
        router.push(`/catalogo${next.size ? `?${next}` : ""}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        type="search"
        placeholder="Buscá por nombre, marca, SKU o código OEM"
        aria-label="Buscar repuestos"
        className="h-11 w-full rounded-xl border border-ink-700 bg-ink-800 pl-10 pr-24 text-sm text-white placeholder:text-ink-400 focus:border-accent-500 focus:bg-ink-850"
      />
      <button type="submit" className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-accent-500 px-3 text-sm font-semibold text-white hover:bg-accent-600">
        Buscar
      </button>
    </form>
  );
}

function CartButton() {
  const { cartCount, cartBump } = useStore();
  return (
    <Link href="/carrito" className="relative grid size-11 place-items-center rounded-xl text-white hover:bg-ink-800" aria-label={`Carrito (${cartCount})`}>
      <motion.span key={cartBump} initial={{ scale: 1 }} animate={{ scale: cartBump ? [1, 1.25, 1] : 1 }} transition={{ duration: 0.35 }}>
        <ShoppingCart className="size-5" />
      </motion.span>
      {cartCount > 0 ? (
        <motion.span
          key={`c${cartCount}`}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white"
        >
          {cartCount}
        </motion.span>
      ) : null}
    </Link>
  );
}

function CurrencySwitch() {
  const { currency, setCurrency } = useStore();
  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">Moneda</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as Currency)}
        className="rounded-md border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-xs text-ink-200"
      >
        {(Object.keys(CURRENCY_LABELS) as Currency[]).map((c) => (
          <option key={c} value={c}>
            {c} · {CURRENCY_LABELS[c]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Header({
  categories,
  phone,
  whatsapp,
  isLoggedIn,
  isStaff,
}: {
  categories: Category[];
  phone: string;
  whatsapp: string;
  isLoggedIn: boolean;
  isStaff: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const top = categories.filter((c) => !c.parent_id);
  const wa = whatsapp.replace(/[^0-9]/g, "");
  return (
    <header className="sticky top-0 z-40">
      <div className="bg-ink-950 text-ink-300">
        <div className="mx-auto flex h-8 max-w-7xl items-center justify-between gap-4 px-4 text-xs">
          <div className="flex items-center gap-4">
            {phone ? (
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="hidden items-center gap-1 hover:text-white sm:flex">
                <Phone className="size-3" /> {phone}
              </a>
            ) : null}
            {wa ? (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">
                <MessageCircle className="size-3" /> WhatsApp
              </a>
            ) : null}
            <span className="hidden md:inline">Envíos a todo Paraguay · Retiro en el local</span>
          </div>
          <div className="flex items-center gap-3">
            {isStaff ? (
              <Link href="/admin" className="font-semibold text-accent-400 hover:text-accent-100">
                Panel
              </Link>
            ) : null}
            <CurrencySwitch />
          </div>
        </div>
      </div>
      <div className="bg-ink-900">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button className="grid size-11 place-items-center rounded-xl text-white hover:bg-ink-800 lg:hidden" onClick={() => setMenu(true)} aria-label="Menú">
            <Menu className="size-5" />
          </button>
          <Link href="/" className="shrink-0">
            <Logo light />
          </Link>
          <SearchBox className="mx-2 hidden flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Link
              href={isLoggedIn ? "/cuenta" : "/cuenta/ingresar"}
              className="grid size-11 place-items-center rounded-xl text-white hover:bg-ink-800"
              aria-label={isLoggedIn ? "Mi cuenta" : "Ingresar"}
            >
              <User className="size-5" />
            </Link>
            <CartButton />
          </div>
        </div>
        <div className="px-4 pb-3 md:hidden">
          <SearchBox />
        </div>
        <nav className="hidden border-t border-ink-800 lg:block" aria-label="Categorías">
          <ul className="mx-auto flex max-w-7xl items-center gap-1 px-4">
            <li>
              <Link href="/catalogo" className="block px-3 py-2.5 text-sm font-semibold text-white hover:text-accent-400">
                Todo el catálogo
              </Link>
            </li>
            {top.map((c) => (
              <li key={c.id}>
                <Link href={`/catalogo?categoria=${c.slug}`} className="block px-3 py-2.5 text-sm text-ink-300 transition-colors hover:text-white">
                  {c.name}
                </Link>
              </li>
            ))}
            <li className="ml-auto">
              <Link href="/catalogo?ofertas=1" className="block px-3 py-2.5 text-sm font-semibold text-accent-400 hover:text-accent-100">
                Ofertas
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <VehicleBar />

      {menu ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-ink-950/60" onClick={() => setMenu(false)} aria-label="Cerrar menú" />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col bg-ink-900 text-white"
          >
            <div className="flex items-center justify-between p-4">
              <Logo light />
              <button onClick={() => setMenu(false)} aria-label="Cerrar" className="grid size-10 place-items-center rounded-lg hover:bg-ink-800">
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-6">
              <Link href="/catalogo" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-3 font-semibold hover:bg-ink-800">
                Todo el catálogo
              </Link>
              {top.map((c) => (
                <Link key={c.id} href={`/catalogo?categoria=${c.slug}`} onClick={() => setMenu(false)} className="block rounded-lg px-3 py-3 text-ink-200 hover:bg-ink-800">
                  {c.name}
                </Link>
              ))}
              <div className="my-3 border-t border-ink-800" />
              <Link href={isLoggedIn ? "/cuenta" : "/cuenta/ingresar"} onClick={() => setMenu(false)} className="block rounded-lg px-3 py-3 hover:bg-ink-800">
                {isLoggedIn ? "Mi cuenta" : "Ingresar o crear cuenta"}
              </Link>
              <Link href="/p/envios" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-3 text-ink-200 hover:bg-ink-800">
                Envíos y retiro
              </Link>
            </nav>
          </motion.aside>
        </div>
      ) : null}
    </header>
  );
}
