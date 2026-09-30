import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { getBrands, getCategories, getVehicleSelection, searchCatalog, type SearchParams } from "@/lib/catalog";
import { CatalogFilters, SearchTracker, SortSelect } from "@/components/store/catalog-filters";
import { ProductGrid } from "@/components/store/product-card";

export const metadata: Metadata = { title: "Catálogo de repuestos" };

const PAGE_SIZE = 24;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const vehicle = await getVehicleSelection();
  const page = Math.max(1, num(one(sp.pagina)) ?? 1);
  const q = one(sp.q)?.slice(0, 120) ?? "";
  const compat = one(sp.compat);
  const sort = one(sp.orden);

  const params: SearchParams = {
    q,
    category: one(sp.categoria),
    brands: many(sp.marca),
    minPrice: num(one(sp.min)),
    maxPrice: num(one(sp.max)),
    inStock: one(sp.stock) === "1",
    onSale: one(sp.ofertas) === "1",
    versionId: vehicle?.versionId,
    compat: compat === "confirmed" || compat === "all" ? compat : undefined,
    sort: sort === "price_asc" || sort === "price_desc" || sort === "newest" ? sort : undefined,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const [{ items, total }, categories, brands] = await Promise.all([searchCatalog(params), getCategories(), getBrands()]);
  const category = categories.find((c) => c.slug === params.category);
  const pages = Math.ceil(total / PAGE_SIZE);
  const title = q ? `Resultados para “${q}”` : params.onSale ? "Ofertas" : category?.name ?? "Todo el catálogo";

  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) for (const x of many(v)) if (k !== "pagina") next.append(k, x);
    if (p > 1) next.set("pagina", String(p));
    return `/catalogo?${next}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <SearchTracker query={page === 1 ? q : ""} results={total} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav className="mb-1 text-sm text-ink-400">
            <Link href="/" className="hover:text-ink-700">Inicio</Link> / <Link href="/catalogo" className="hover:text-ink-700">Catálogo</Link>
            {category ? <> / {category.name}</> : null}
          </nav>
          <h1 className="font-display text-4xl font-bold uppercase">{title}</h1>
          <p className="text-sm text-ink-500">
            {total} {total === 1 ? "producto" : "productos"}
            {vehicle ? <> · filtrado para <strong className="text-ink-700">{vehicle.label}</strong></> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="lg:hidden">
            <CatalogFilters categories={categories} brands={brands} />
          </div>
          <SortSelect />
        </div>
      </div>

      <div className="flex gap-8">
        <div className="hidden lg:block">
          <CatalogFilters categories={categories} brands={brands} />
        </div>
        <div className="min-w-0 flex-1">
          {items.length ? (
            <>
              <ProductGrid items={items} />
              {pages > 1 ? (
                <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Páginas">
                  {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                    <Link
                      key={p}
                      href={pageHref(p)}
                      aria-current={p === page ? "page" : undefined}
                      className={`grid size-10 place-items-center rounded-xl text-sm font-semibold ${p === page ? "bg-ink-900 text-white" : "border border-ink-200 bg-white hover:border-ink-900"}`}
                    >
                      {p}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-white p-10 text-center">
              <SearchX className="mx-auto size-10 text-ink-300" aria-hidden />
              <p className="mt-3 font-display text-2xl font-bold">No encontramos resultados</p>
              <p className="mx-auto mt-1 max-w-md text-ink-500">
                Probá con otro término, el código OEM de la pieza o quitá algunos filtros. También podés consultarle al asistente del chat.
              </p>
              <Link href="/catalogo" className="mt-5 inline-block rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white">
                Ver todo el catálogo
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
