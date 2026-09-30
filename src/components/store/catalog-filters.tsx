"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import type { Brand, Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { trackEvent, useStore } from "./store-context";

function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const update = (changes: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      next.delete(k);
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
      else if (v) next.set(k, v);
    }
    next.delete("pagina");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { params, update, pending };
}

export function SortSelect() {
  const { params, update, pending } = useUpdateParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      {pending ? <Loader2 className="size-4 animate-spin text-ink-400" /> : null}
      <span className="text-ink-500">Ordenar</span>
      <select
        value={params.get("orden") ?? ""}
        onChange={(e) => update({ orden: e.target.value || null })}
        className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm"
      >
        <option value="">{params.get("q") ? "Relevancia" : "Recomendados"}</option>
        <option value="price_asc">Menor precio</option>
        <option value="price_desc">Mayor precio</option>
        <option value="newest">Novedades</option>
      </select>
    </label>
  );
}

function FilterBody({ categories, brands }: { categories: Category[]; brands: Brand[] }) {
  const { params, update } = useUpdateParams();
  const { vehicle } = useStore();
  const selectedBrands = params.getAll("marca");
  const category = params.get("categoria");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const top = categories.filter((c) => !c.parent_id);

  return (
    <div className="space-y-6 text-sm">
      <div>
        <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide">Categoría</p>
        <ul className="space-y-0.5">
          <li>
            <button onClick={() => update({ categoria: null })} className={cn("w-full rounded-lg px-2 py-1.5 text-left hover:bg-ink-100", !category && "bg-ink-900 text-white hover:bg-ink-900")}>
              Todas
            </button>
          </li>
          {top.map((c) => {
            const children = categories.filter((x) => x.parent_id === c.id);
            const activeTree = category === c.slug || children.some((x) => x.slug === category);
            return (
              <li key={c.id}>
                <button
                  onClick={() => update({ categoria: c.slug })}
                  className={cn("w-full rounded-lg px-2 py-1.5 text-left hover:bg-ink-100", category === c.slug && "bg-ink-900 text-white hover:bg-ink-900")}
                >
                  {c.name}
                </button>
                {activeTree && children.length ? (
                  <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-ink-200 pl-2">
                    {children.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={() => update({ categoria: s.slug })}
                          className={cn("w-full rounded-lg px-2 py-1 text-left text-ink-600 hover:bg-ink-100", category === s.slug && "font-semibold text-accent-600")}
                        >
                          {s.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {vehicle ? (
        <div>
          <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide">Compatibilidad</p>
          {[
            { v: "", label: "Ocultar no compatibles" },
            { v: "confirmed", label: "Sólo compatibles confirmados" },
            { v: "all", label: "Mostrar todo" },
          ].map((o) => (
            <label key={o.v} className="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="radio"
                name="compat"
                checked={(params.get("compat") ?? "") === o.v}
                onChange={() => update({ compat: o.v || null })}
                className="accent-accent-500"
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : null}

      <div>
        <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide">Disponibilidad</p>
        <label className="flex cursor-pointer items-center gap-2 py-1">
          <input type="checkbox" checked={params.get("stock") === "1"} onChange={(e) => update({ stock: e.target.checked ? "1" : null })} className="accent-accent-500" />
          Sólo con stock
        </label>
        <label className="flex cursor-pointer items-center gap-2 py-1">
          <input type="checkbox" checked={params.get("ofertas") === "1"} onChange={(e) => update({ ofertas: e.target.checked ? "1" : null })} className="accent-accent-500" />
          Sólo ofertas
        </label>
      </div>

      <div>
        <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide">Precio (Gs.)</p>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ min: min.replace(/\D/g, "") || null, max: max.replace(/\D/g, "") || null });
          }}
        >
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" placeholder="Mín." className="h-9 w-full rounded-lg border border-ink-200 px-2" />
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" placeholder="Máx." className="h-9 w-full rounded-lg border border-ink-200 px-2" />
          <button className="h-9 rounded-lg bg-ink-900 px-3 font-semibold text-white">OK</button>
        </form>
      </div>

      <div>
        <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide">Fabricante</p>
        <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
          {brands.map((b) => (
            <label key={b.id} className="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={selectedBrands.includes(b.slug)}
                onChange={(e) =>
                  update({ marca: e.target.checked ? [...selectedBrands, b.slug] : selectedBrands.filter((x) => x !== b.slug) })
                }
                className="accent-accent-500"
              />
              {b.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CatalogFilters({ categories, brands }: { categories: Category[]; brands: Brand[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden w-60 shrink-0 lg:block">
        <FilterBody categories={categories} brands={brands} />
      </aside>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold lg:hidden"
      >
        <SlidersHorizontal className="size-4" /> Filtros
      </button>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-ink-950/50" onClick={() => setOpen(false)} aria-label="Cerrar filtros" />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="font-display text-xl font-bold uppercase">Filtros</p>
                <button onClick={() => setOpen(false)} aria-label="Cerrar" className="grid size-10 place-items-center rounded-lg hover:bg-ink-100">
                  <X className="size-5" />
                </button>
              </div>
              <FilterBody categories={categories} brands={brands} />
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export function SearchTracker({ query, results }: { query: string; results: number }) {
  useEffect(() => {
    if (query) trackEvent("search", { query, results_count: results });
  }, [query, results]);
  return null;
}
