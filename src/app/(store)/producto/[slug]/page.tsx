import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleHelp, RotateCcw, ShieldCheck, Store, Truck, XCircle } from "lucide-react";
import { getProductBySlug, getProductRelations, getPublicSettings, getVehicleSelection } from "@/lib/catalog";
import { getSession } from "@/lib/auth";
import { formatPyg } from "@/lib/money";
import { AddToCartButton } from "@/components/store/add-to-cart";
import { ProductGrid } from "@/components/store/product-card";
import { CompatBadge, Price, StockLabel } from "@/components/store/ui";
import { AskAssistantButton, BackInStockForm, FavoriteButton, Gallery, ProductViewTracker } from "@/components/store/product-extras";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: "Producto no encontrado" };
  return {
    title: `${p.name}${p.brand ? ` ${p.brand.name}` : ""}`,
    description: p.short_description ?? undefined,
    openGraph: { images: p.images[0]?.url ? [p.images[0].url] : undefined },
  };
}

const REF_LABELS = { oem: "OEM (original)", manufacturer: "Código del fabricante", alternative: "Referencia alternativa" } as const;

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const vehicle = await getVehicleSelection();
  const [product, settings, session] = await Promise.all([getProductBySlug(slug, vehicle?.versionId), getPublicSettings(), getSession()]);
  if (!product) notFound();
  const isPreview = product.status !== "published";
  if (isPreview && preview !== "1") notFound();

  const { related, complementary, variants } = await getProductRelations(product.id, product.variant_group);
  let isFavorite = false;
  if (session.user) {
    const { data } = await session.supabase.from("favorites").select("product_id").eq("user_id", session.user.id).eq("product_id", product.id).maybeSingle();
    isFavorite = !!data;
  }

  const byMake = new Map<string, typeof product.fitments>();
  for (const f of product.fitments) {
    const key = `${f.version.make} ${f.version.model}`;
    byMake.set(key, [...(byMake.get(key) ?? []), f]);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    description: product.short_description,
    image: product.images.map((i) => i.url),
    offers: {
      "@type": "Offer",
      priceCurrency: "PYG",
      price: product.final_price,
      availability: product.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <ProductViewTracker productId={product.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {isPreview ? (
        <div className="mb-6 rounded-xl border border-warn-600/30 bg-warn-50 px-4 py-3 text-sm text-warn-600">
          Vista previa: este producto está en estado <strong>{product.status === "draft" ? "borrador" : "archivado"}</strong> y no es visible para los compradores.
        </div>
      ) : null}

      <nav className="mb-4 text-sm text-ink-400">
        <Link href="/" className="hover:text-ink-700">Inicio</Link> / <Link href="/catalogo" className="hover:text-ink-700">Catálogo</Link>
        {product.category ? (
          <> / <Link href={`/catalogo?categoria=${product.category.slug}`} className="hover:text-ink-700">{product.category.name}</Link></>
        ) : null}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Gallery images={product.images} name={product.name} />

        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {product.brand ? (
                <Link href={`/catalogo?marca=${product.brand.slug}`} className="font-semibold uppercase tracking-wide text-ink-500 hover:text-accent-600">
                  {product.brand.name}
                </Link>
              ) : null}
              <span className="text-ink-300">·</span>
              <span className="text-ink-500">SKU {product.sku}</span>
            </div>
            <h1 className="font-display text-4xl font-bold leading-tight">
              {product.name}
              {product.variant_label ? <span className="text-ink-500"> · {product.variant_label}</span> : null}
            </h1>
            {product.short_description ? <p className="text-lg text-ink-600">{product.short_description}</p> : null}
          </div>

          {vehicle ? (
            <div
              className={`flex items-start gap-3 rounded-xl p-4 ring-1 ring-inset ${
                product.compatibility === "confirmed"
                  ? "bg-ok-50 ring-ok-600/20"
                  : product.compatibility === "incompatible"
                    ? "bg-bad-50 ring-bad-600/20"
                    : "bg-warn-50 ring-warn-600/20"
              }`}
            >
              {product.compatibility === "confirmed" ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok-600" />
              ) : product.compatibility === "incompatible" ? (
                <XCircle className="mt-0.5 size-5 shrink-0 text-bad-600" />
              ) : (
                <CircleHelp className="mt-0.5 size-5 shrink-0 text-warn-600" />
              )}
              <div className="text-sm">
                <p className="font-semibold">
                  {product.compatibility === "confirmed"
                    ? `Compatible con tu ${vehicle.label}`
                    : product.compatibility === "incompatible"
                      ? `No es compatible con tu ${vehicle.label}`
                      : `Compatibilidad pendiente de verificar para tu ${vehicle.label}`}
                </p>
                <p className="text-ink-600">
                  {product.compatibility === "confirmed"
                    ? "Hay información técnica que vincula esta pieza con tu vehículo."
                    : product.compatibility === "incompatible"
                      ? "La información técnica descarta su uso en tu vehículo. Buscá alternativas compatibles."
                      : "No tenemos datos suficientes para confirmarlo. Consultanos con el código OEM o el número de chasis antes de comprar."}
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-600">
              Elegí tu vehículo en la barra superior para verificar la compatibilidad.
            </p>
          )}

          <div className="flex items-end justify-between gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="space-y-1">
              <Price amount={product.final_price} listPrice={product.list_price} size="lg" />
              <p className="text-xs text-ink-400">IVA {product.tax_rate}% incluido</p>
            </div>
            <StockLabel available={product.available} />
          </div>

          {variants.length > 1 ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Variantes</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <Link
                    key={v.id}
                    href={`/producto/${v.slug}`}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${v.id === product.id ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white hover:border-ink-900"} ${v.available <= 0 ? "opacity-60" : ""}`}
                  >
                    {v.variant_label ?? "Estándar"}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {product.available > 0 ? (
            <AddToCartButton
              withQuantity
              available={product.available}
              product={{ id: product.id, name: product.name, slug: product.slug, sku: product.sku, price: product.final_price, image: product.images[0]?.url ?? null }}
            />
          ) : (
            <BackInStockForm productId={product.id} defaultEmail={session.profile?.email ?? undefined} />
          )}

          <div className="flex flex-wrap items-center gap-5">
            <FavoriteButton productId={product.id} initial={isFavorite} loggedIn={!!session.user} />
            <AskAssistantButton productName={product.name} />
          </div>

          <ul className="grid gap-3 rounded-2xl bg-ink-100/60 p-4 text-sm sm:grid-cols-2">
            <li className="flex gap-2">
              <Store className="size-4 shrink-0 text-ink-500" /> Retiro sin costo en el local
            </li>
            <li className="flex gap-2">
              <Truck className="size-4 shrink-0 text-ink-500" /> Envío a domicilio o por agencia
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="size-4 shrink-0 text-ink-500" />
              {product.warranty_months ? `Garantía de ${product.warranty_months} meses` : "Garantía del fabricante"}
            </li>
            <li className="flex gap-2">
              <RotateCcw className="size-4 shrink-0 text-ink-500" /> Devolución dentro de 7 días sin uso
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <section className="space-y-8 lg:col-span-2">
          {product.description ? (
            <div>
              <h2 className="mb-3 font-display text-2xl font-bold uppercase">Descripción</h2>
              <p className="whitespace-pre-line leading-relaxed text-ink-700">{product.description}</p>
            </div>
          ) : null}

          {Object.keys(product.specs).length ? (
            <div>
              <h2 className="mb-3 font-display text-2xl font-bold uppercase">Características técnicas</h2>
              <dl className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
                {Object.entries(product.specs).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-2 gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="font-medium">{String(v)}</dd>
                  </div>
                ))}
                {product.weight_grams ? (
                  <div className="grid grid-cols-2 gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-ink-500">Peso aproximado</dt>
                    <dd className="font-medium">{(product.weight_grams / 1000).toLocaleString("es-PY")} kg</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          <div>
            <h2 className="mb-3 font-display text-2xl font-bold uppercase">Vehículos compatibles</h2>
            {product.is_universal ? (
              <p className="mb-3 text-sm text-ink-600">Producto de uso general. Verificá la especificación que pide el manual de tu vehículo.</p>
            ) : null}
            {byMake.size ? (
              <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
                {[...byMake.entries()].map(([model, list]) => (
                  <div key={model} className="border-b border-ink-100 px-4 py-3 last:border-0">
                    <p className="font-semibold">{model}</p>
                    <ul className="mt-1 space-y-1">
                      {list.map((f) => (
                        <li key={f.version.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-ink-600">
                            {f.version.year_from}–{f.version.year_to ?? "actual"} · {f.version.engine}
                            {f.notes ? <span className="text-ink-400"> · {f.notes}</span> : null}
                          </span>
                          <CompatBadge status={f.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">Todavía no cargamos compatibilidades para este producto. Consultanos antes de comprar.</p>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          {product.references.length ? (
            <div className="rounded-xl border border-ink-100 bg-white p-4">
              <h2 className="mb-2 font-display text-xl font-bold uppercase">Referencias</h2>
              <ul className="space-y-1.5 text-sm">
                {product.references.map((r) => (
                  <li key={r.kind + r.code} className="flex justify-between gap-3">
                    <span className="text-ink-500">{REF_LABELS[r.kind]}{r.brand ? ` · ${r.brand}` : ""}</span>
                    <span className="font-mono font-medium">{r.code}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="space-y-3 rounded-xl border border-ink-100 bg-white p-4 text-sm text-ink-600">
            <h2 className="font-display text-xl font-bold uppercase text-ink-900">Garantía y devoluciones</h2>
            <p>{product.warranty_text || settings.policies.warranty}</p>
            <p>{settings.policies.returns}</p>
            <h3 className="pt-2 font-semibold text-ink-900">Entrega</h3>
            <p>{settings.policies.shipping}</p>
            <p className="text-xs text-ink-400">Precio de contado: {formatPyg(product.final_price)}</p>
          </div>
        </aside>
      </div>

      {complementary.length ? (
        <section className="mt-12">
          <h2 className="mb-5 font-display text-3xl font-bold uppercase">Completá el trabajo</h2>
          <ProductGrid items={complementary} />
        </section>
      ) : null}
      {related.length ? (
        <section className="mt-12">
          <h2 className="mb-5 font-display text-3xl font-bold uppercase">Alternativas</h2>
          <ProductGrid items={related} />
        </section>
      ) : null}
    </main>
  );
}
