"use client";

import Image from "next/image";
import Link from "next/link";
import type { CatalogItem } from "@/lib/types";
import { AddToCartButton } from "./add-to-cart";
import { CompatBadge, Price, StockLabel } from "./ui";

export function ProductCard({ item, index = 0 }: { item: CatalogItem; index?: number }) {
  return (
    // Animación de entrada en CSS: el contenido es visible aunque el JavaScript todavía no haya cargado.
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className="group relative flex animate-fade-up flex-col overflow-hidden rounded-[var(--radius-card)] border border-ink-100 bg-white shadow-card transition-[box-shadow,translate] duration-300 hover:-translate-y-1 hover:shadow-lift"
    >
      <Link href={`/producto/${item.slug}`} className="relative block aspect-square overflow-hidden bg-ink-50">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : null}
        {item.discount_percent > 0 ? (
          <span className="absolute left-3 top-3 rounded-md bg-accent-500 px-2 py-0.5 font-display text-sm font-bold text-white">
            −{item.discount_percent}%
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-ink-500">{item.brand_name}</span>
          <span className="text-ink-400">{item.sku}</span>
        </div>
        <Link href={`/producto/${item.slug}`} className="line-clamp-2 font-medium leading-snug text-ink-900 hover:text-accent-600">
          {item.name}
          {item.variant_label ? <span className="text-ink-500"> · {item.variant_label}</span> : null}
        </Link>
        <CompatBadge status={item.compatibility} className="self-start" />
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <Price amount={Number(item.final_price)} listPrice={Number(item.list_price)} />
          <StockLabel available={item.available} />
        </div>
        <AddToCartButton
          compact
          available={item.available}
          product={{ id: item.id, name: item.name, slug: item.slug, sku: item.sku, price: Number(item.final_price), image: item.image_url }}
        />
      </div>
    </article>
  );
}

export function ProductGrid({ items }: { items: CatalogItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
      {items.map((item, i) => (
        <ProductCard key={item.id} item={item} index={i} />
      ))}
    </div>
  );
}
