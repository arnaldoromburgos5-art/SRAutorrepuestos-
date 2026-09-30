import Link from "next/link";
import { ArrowRight, BadgeCheck, Sparkles } from "lucide-react";
import { getBanners, getBrands, getCategories, getVehicleSelection, searchCatalog } from "@/lib/catalog";
import { VehicleSelector } from "@/components/store/vehicle-selector";
import { ProductGrid } from "@/components/store/product-card";
import { CategoryIcon } from "@/components/store/category-icon";
import { FadeIn } from "@/components/store/fade-in";

export default async function HomePage() {
  const vehicle = await getVehicleSelection();
  const [categories, brands, heroBanners, stripBanners, offers, popular] = await Promise.all([
    getCategories(),
    getBrands(),
    getBanners("hero"),
    getBanners("strip"),
    searchCatalog({ onSale: true, limit: 4, versionId: vehicle?.versionId, inStock: true }),
    searchCatalog({ sort: "popular", limit: 8, versionId: vehicle?.versionId }),
  ]);
  const hero = heroBanners[0];
  const featured = categories.filter((c) => !c.parent_id && c.is_featured);

  return (
    <main>
      <section className="bg-speed relative overflow-hidden text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-14 pt-12 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pb-20 lg:pt-16">
          <FadeIn className="space-y-5">
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1 text-xs font-medium text-ink-200">
              <BadgeCheck className="size-3.5 text-accent-400" /> Compatibilidad verificada por vehículo
            </p>
            <h1 className="font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
              {hero?.title ?? "Repuestos que encajan con tu vehículo"}
            </h1>
            <p className="max-w-xl text-lg text-ink-300">
              {hero?.subtitle ?? "Elegí marca, modelo y año y te mostramos lo que es compatible."}
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-ink-300">
              <span>Frenos</span>·<span>Filtros</span>·<span>Suspensión</span>·<span>Baterías</span>·<span>Lubricantes</span>
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="space-y-3">
              <p className="font-display text-lg font-semibold uppercase tracking-wide text-ink-200">
                {vehicle ? "Tu vehículo" : "¿Qué auto tenés?"}
              </p>
              <VehicleSelector variant="hero" />
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl font-bold uppercase">Categorías</h2>
          <Link href="/catalogo" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700">
            Ver todo <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {featured.map((c, i) => (
            <FadeIn key={c.id} delay={i * 0.04}>
              <Link
                href={`/catalogo?categoria=${c.slug}`}
                className="group flex h-full flex-col items-start gap-3 rounded-[var(--radius-card)] border border-ink-100 bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent-500/40 hover:shadow-lift"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-ink-900 text-white transition-colors group-hover:bg-accent-500">
                  <CategoryIcon name={c.icon} className="size-5" />
                </span>
                <span className="font-display text-lg font-semibold leading-tight">{c.name}</span>
              </Link>
            </FadeIn>
          ))}
        </div>
      </section>

      {offers.items.length ? (
        <section className="mx-auto max-w-7xl px-4 pb-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold uppercase">
                Ofertas <span className="text-accent-500">de la semana</span>
              </h2>
              {heroBanners[1] ? <p className="text-ink-500">{heroBanners[1].subtitle}</p> : null}
            </div>
            <Link href="/catalogo?ofertas=1" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700">
              Todas las ofertas <ArrowRight className="size-4" />
            </Link>
          </div>
          <ProductGrid items={offers.items} />
        </section>
      ) : null}

      {stripBanners[0] ? (
        <section className="mx-auto max-w-7xl px-4 pb-12">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-ink-900 px-6 py-6 text-white sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-2xl font-bold uppercase">{stripBanners[0].title}</p>
              <p className="text-ink-300">{stripBanners[0].subtitle}</p>
            </div>
            {stripBanners[0].link_url ? (
              <Link href={stripBanners[0].link_url} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-accent-50">
                Más información
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {popular.items.length ? (
        <section className="mx-auto max-w-7xl px-4 pb-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-bold uppercase">{vehicle ? "Populares para tu vehículo" : "Los más vendidos"}</h2>
            <Link href="/catalogo" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-600 hover:text-accent-700">
              Ver catálogo <ArrowRight className="size-4" />
            </Link>
          </div>
          <ProductGrid items={popular.items} />
        </section>
      ) : null}

      <section className="mx-auto max-w-7xl px-4 pb-4">
        <h2 className="mb-6 font-display text-3xl font-bold uppercase">Marcas</h2>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <Link
              key={b.id}
              href={`/catalogo?marca=${b.slug}`}
              className="rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-ink-900 hover:bg-ink-900 hover:text-white"
            >
              {b.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-10">
        <div className="flex flex-col gap-3 rounded-2xl border border-accent-100 bg-accent-50 p-6 sm:flex-row sm:items-center">
          <Sparkles className="size-8 shrink-0 text-accent-500" aria-hidden />
          <div className="flex-1">
            <p className="font-display text-xl font-bold">¿No sabés qué repuesto necesitás?</p>
            <p className="text-ink-600">
              Nuestro asistente te ayuda a encontrar piezas compatibles, comparar opciones y resolver dudas de envío o garantía.
            </p>
          </div>
          <p className="text-sm font-semibold text-accent-700">Abrilo desde el botón de chat →</p>
        </div>
      </section>
    </main>
  );
}
