"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Eye, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPyg } from "@/lib/money";
import { slugify } from "@/lib/utils";
import { deleteProductAction, duplicateProductAction, saveProductAction } from "@/app/admin/actions";
import { Card, Field, btnGhost, btnPrimary, inputCls } from "./ui";

type Ref = { kind: "oem" | "alternative" | "manufacturer"; code: string; brand?: string | null };
type Fit = { version_id: string; status: "confirmed" | "unverified" | "incompatible"; notes?: string | null; label: string };
type Rel = { related_id: string; kind: "related" | "complementary"; label: string };

export type ProductFormData = {
  id?: string;
  sku: string;
  name: string;
  slug?: string;
  short_description: string;
  description: string;
  brand_id: string;
  category_id: string;
  status: "draft" | "published" | "archived";
  price: string;
  compare_at_price: string;
  wholesale_price: string;
  cost: string;
  tax_rate: 0 | 5 | 10;
  is_universal: boolean;
  specs: { key: string; value: string }[];
  warranty_months: string;
  warranty_text: string;
  weight_grams: string;
  variant_group: string;
  variant_label: string;
  min_stock: string;
  references: Ref[];
  images: { url: string; alt?: string | null }[];
  fitments: Fit[];
  relations: Rel[];
  initial_stock: string;
};

const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[.\s]/g, "")));

export function ProductForm({
  initial,
  brands,
  categories,
  makes,
  canPublish,
  canPrice,
  onHand,
}: {
  initial: ProductFormData;
  brands: { id: string; name: string }[];
  categories: { id: string; name: string; parent_id: string | null }[];
  makes: { id: string; name: string }[];
  canPublish: boolean;
  canPrice: boolean;
  onHand?: number;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => setF((x) => ({ ...x, [k]: v }));

  const price = n(f.price) ?? 0;
  const cost = n(f.cost);
  const margin = cost && price ? Math.round(((price * 100) / (100 + f.tax_rate) - cost) / ((price * 100) / (100 + f.tax_rate)) * 100) : null;

  function submit(status: ProductFormData["status"]) {
    setResult(null);
    start(async () => {
      // Si no se cargó un código interno, se genera uno único (p. ej. SR-K3F9QZ).
      const sku = f.sku.trim() || `SR-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      const payload = {
        id: f.id,
        sku,
        name: f.name,
        slug: f.slug || undefined,
        short_description: f.short_description || null,
        description: f.description || null,
        brand_id: f.brand_id || null,
        category_id: f.category_id || null,
        status,
        price: n(f.price) ?? 0,
        compare_at_price: n(f.compare_at_price),
        wholesale_price: n(f.wholesale_price),
        cost: n(f.cost),
        tax_rate: f.tax_rate,
        is_universal: f.is_universal,
        specs: Object.fromEntries(f.specs.filter((s) => s.key.trim() && s.value.trim()).map((s) => [s.key.trim(), s.value.trim()])),
        warranty_months: n(f.warranty_months),
        warranty_text: f.warranty_text || null,
        weight_grams: n(f.weight_grams),
        variant_group: f.variant_group || null,
        variant_label: f.variant_label || null,
        min_stock: n(f.min_stock) ?? 0,
        references: f.references.filter((r) => r.code.trim()),
        images: f.images,
        fitments: f.fitments.map(({ version_id, status: s, notes }) => ({ version_id, status: s, notes: notes || null })),
        relations: f.relations.map(({ related_id, kind }) => ({ related_id, kind })),
        initial_stock: f.id ? undefined : n(f.initial_stock) ?? undefined,
      };
      const res = await saveProductAction(payload);
      if (!res.ok) return setResult({ ok: false, text: res.error });
      setResult({ ok: true, text: status === "published" ? "Producto guardado y publicado." : "Producto guardado." });
      setF((x) => ({ ...x, status, sku, slug: res.data?.slug }));
      if (!f.id && res.data) router.replace(`/admin/productos/${res.data.id}`);
      else router.refresh();
    });
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
          setResult({ ok: false, text: `${file.name}: sólo imágenes de hasta 5 MB.` });
          continue;
        }
        const path = `${slugify(f.sku || "producto")}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() ?? "jpg"}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file, { cacheControl: "31536000", contentType: file.type });
        if (error) {
          setResult({ ok: false, text: `No se pudo subir ${file.name}: ${error.message}` });
          continue;
        }
        const { data } = supabase.storage.from("product-images").getPublicUrl(path);
        setF((x) => ({ ...x, images: [...x.images, { url: data.publicUrl, alt: x.name }] }));
      }
    } finally {
      setUploading(false);
    }
  }

  const move = (i: number, d: -1 | 1) =>
    setF((x) => {
      const images = [...x.images];
      const j = i + d;
      if (j < 0 || j >= images.length) return x;
      [images[i], images[j]] = [images[j], images[i]];
      return { ...x, images };
    });

  const statusLabel = f.status === "published" ? "Visible en la tienda" : f.status === "archived" ? "Archivado (oculto)" : "Borrador (no visible)";

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card title="1. Fotos">
          <div className="flex flex-wrap gap-3">
            {f.images.map((img, i) => (
              <div key={img.url + i} className="group relative size-28 overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
                <Image src={img.url} alt="" fill sizes="112px" className="object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink-950/70 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => move(i, -1)} className="text-white" aria-label="Mover antes"><ArrowUp className="size-4 -rotate-90" /></button>
                  <button onClick={() => set("images", f.images.filter((_, j) => j !== i))} className="text-white" aria-label="Quitar"><Trash2 className="size-4" /></button>
                  <button onClick={() => move(i, 1)} className="text-white" aria-label="Mover después"><ArrowDown className="size-4 -rotate-90" /></button>
                </div>
                {i === 0 ? <span className="absolute left-1 top-1 rounded bg-accent-500 px-1.5 text-[10px] font-bold text-white">PRINCIPAL</span> : null}
              </div>
            ))}
            <label className="grid size-28 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-accent-500/50 bg-accent-50 text-center text-xs font-semibold text-accent-700 hover:border-accent-500">
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <span><ImagePlus className="mx-auto mb-1 size-6" />Agregar foto</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
            </label>
          </div>
          <p className="mt-2 text-xs text-ink-400">Podés subir varias. La primera es la principal; pasá el mouse sobre una foto para moverla o quitarla.</p>
        </Card>

        <Card title="2. ¿Qué producto es?">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del producto *" className="sm:col-span-2" hint="Ej.: Pastillas de freno delanteras cerámicas">
              <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Marca">
              <select value={f.brand_id} onChange={(e) => set("brand_id", e.target.value)} className={inputCls}>
                <option value="">Sin marca</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Categoría">
              <select value={f.category_id} onChange={(e) => set("category_id", e.target.value)} className={inputCls}>
                <option value="">Sin categoría</option>
                {categories.filter((c) => !c.parent_id).map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name} (general)</option>
                    {categories.filter((s) => s.parent_id === c.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Descripción breve" className="sm:col-span-2" hint="Una línea que se ve debajo del nombre.">
              <input value={f.short_description} onChange={(e) => set("short_description", e.target.value)} maxLength={300} className={inputCls} />
            </Field>
          </div>
        </Card>

        <Card title="3. Precio y stock">
          {!canPrice ? <p className="mb-3 text-sm text-warn-600">No tenés permiso para modificar precios.</p> : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Precio de venta (Gs.) *" hint={price ? `Se verá como ${formatPyg(price)} (IVA incluido)` : "Con IVA incluido, sin puntos"}>
              <input disabled={!canPrice} value={f.price} onChange={(e) => set("price", e.target.value)} inputMode="numeric" placeholder="395000" className={inputCls} />
            </Field>
            {f.id ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-600">Stock actual</span>
                <p className="flex h-10 items-center gap-2 text-sm">
                  <strong className="text-lg">{onHand ?? 0}</strong> unidades ·{" "}
                  <Link href={`/admin/inventario?producto=${f.id}`} className="font-semibold text-accent-600">Cambiar stock</Link>
                </p>
              </div>
            ) : (
              <Field label="¿Cuántos tenés?" hint="Unidades en tu depósito">
                <input value={f.initial_stock} onChange={(e) => set("initial_stock", e.target.value)} inputMode="numeric" placeholder="10" className={inputCls} />
              </Field>
            )}
            <Field label="Avisarme cuando queden" hint="Alerta de reposición">
              <input value={f.min_stock} onChange={(e) => set("min_stock", e.target.value)} inputMode="numeric" className={inputCls} />
            </Field>
          </div>
        </Card>

        <FitmentEditor
          makes={makes}
          fitments={f.fitments}
          onChange={(v) => set("fitments", v)}
          universal={f.is_universal}
          onUniversal={(v) => set("is_universal", v)}
        />

        <details className="group rounded-xl border border-ink-100 bg-white shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
            <span>
              <span className="block font-display text-lg font-bold uppercase tracking-wide">Más detalles (opcional)</span>
              <span className="text-sm text-ink-500">Código SKU, descripción completa, garantía, costo, precio mayorista, oferta, códigos OEM, características, variantes y productos relacionados.</span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-6 border-t border-ink-100 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Código interno (SKU)" hint={f.sku ? "Código único del producto" : "Si lo dejás vacío se genera solo"}>
                <input value={f.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} placeholder="Automático" className={inputCls} />
              </Field>
              <Field label="Garantía (meses)">
                <input value={f.warranty_months} onChange={(e) => set("warranty_months", e.target.value)} inputMode="numeric" className={inputCls} />
              </Field>
              <Field label="Descripción completa" className="sm:col-span-2">
                <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={5} className="w-full rounded-lg border border-ink-200 p-3 text-sm" />
              </Field>
              <Field label="Texto de garantía" className="sm:col-span-2">
                <input value={f.warranty_text} onChange={(e) => set("warranty_text", e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div>
              <p className="mb-3 font-semibold">Precios y costos</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Precio anterior (se muestra tachado)" hint="Para mostrarlo como oferta">
                  <input disabled={!canPrice} value={f.compare_at_price} onChange={(e) => set("compare_at_price", e.target.value)} inputMode="numeric" className={inputCls} />
                </Field>
                <Field label="Precio mayorista" hint="Para clientes mayoristas">
                  <input disabled={!canPrice} value={f.wholesale_price} onChange={(e) => set("wholesale_price", e.target.value)} inputMode="numeric" className={inputCls} />
                </Field>
                <Field label="Costo (sin IVA)" hint={margin !== null ? `Ganancia estimada: ${margin} %` : "Para calcular tu ganancia"}>
                  <input disabled={!canPrice} value={f.cost} onChange={(e) => set("cost", e.target.value)} inputMode="numeric" className={inputCls} />
                </Field>
                <Field label="IVA">
                  <select value={f.tax_rate} onChange={(e) => set("tax_rate", Number(e.target.value) as 0 | 5 | 10)} className={inputCls}>
                    <option value={10}>10 %</option>
                    <option value={5}>5 %</option>
                    <option value={0}>Exento</option>
                  </select>
                </Field>
                <Field label="Peso (gramos)">
                  <input value={f.weight_grams} onChange={(e) => set("weight_grams", e.target.value)} inputMode="numeric" className={inputCls} />
                </Field>
              </div>
            </div>

            <div>
              <p className="mb-1 font-semibold">Códigos OEM y referencias</p>
              <p className="mb-3 text-xs text-ink-500">Sirven para que te encuentren buscando el código original o el de otra marca.</p>
              <div className="space-y-2">
                {f.references.map((r, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <select
                      value={r.kind}
                      onChange={(e) => set("references", f.references.map((x, j) => (j === i ? { ...x, kind: e.target.value as Ref["kind"] } : x)))}
                      className={`${inputCls} w-44`}
                    >
                      <option value="oem">OEM (original)</option>
                      <option value="manufacturer">Código fabricante</option>
                      <option value="alternative">Alternativa</option>
                    </select>
                    <input value={r.code} placeholder="Código" onChange={(e) => set("references", f.references.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} className={`${inputCls} w-48`} />
                    <input value={r.brand ?? ""} placeholder="Marca (opcional)" onChange={(e) => set("references", f.references.map((x, j) => (j === i ? { ...x, brand: e.target.value } : x)))} className={`${inputCls} w-40`} />
                    <button onClick={() => set("references", f.references.filter((_, j) => j !== i))} className="text-ink-400 hover:text-bad-600" aria-label="Quitar"><X className="size-4" /></button>
                  </div>
                ))}
                <button onClick={() => set("references", [...f.references, { kind: "oem", code: "" }])} className={btnGhost}>
                  <Plus className="size-4" /> Agregar código
                </button>
              </div>
            </div>

            <div>
              <p className="mb-3 font-semibold">Características técnicas</p>
              <div className="space-y-2">
                {f.specs.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={s.key} placeholder="Característica (p. ej. Posición)" onChange={(e) => set("specs", f.specs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} className={inputCls} />
                    <input value={s.value} placeholder="Valor (p. ej. Delantera)" onChange={(e) => set("specs", f.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={inputCls} />
                    <button onClick={() => set("specs", f.specs.filter((_, j) => j !== i))} className="text-ink-400 hover:text-bad-600" aria-label="Quitar"><X className="size-4" /></button>
                  </div>
                ))}
                <button onClick={() => set("specs", [...f.specs, { key: "", value: "" }])} className={btnGhost}>
                  <Plus className="size-4" /> Agregar característica
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1 font-semibold">Variantes</p>
              <p className="mb-3 text-xs text-ink-500">Para productos que vienen en versiones (p. ej. lado izquierdo / derecho). Cada versión se carga como producto propio y se agrupan con el mismo grupo.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Grupo de variantes">
                  <div className="flex gap-2">
                    <input value={f.variant_group} onChange={(e) => set("variant_group", e.target.value)} placeholder="ID del grupo" className={`${inputCls} font-mono text-xs`} />
                    <button onClick={() => set("variant_group", crypto.randomUUID())} className={btnGhost} title="Crear un grupo nuevo">Nuevo</button>
                  </div>
                </Field>
                <Field label="Nombre de esta variante">
                  <input value={f.variant_label} onChange={(e) => set("variant_label", e.target.value)} placeholder="p. ej. Lado izquierdo" className={inputCls} />
                </Field>
              </div>
            </div>

            <RelationsEditor relations={f.relations} onChange={(v) => set("relations", v)} selfId={f.id} />
          </div>
        </details>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
        <Card title="Guardar">
          <p className="mb-4 flex items-center gap-2 text-sm">
            <span className={`size-2.5 rounded-full ${f.status === "published" ? "bg-ok-600" : f.status === "archived" ? "bg-ink-400" : "bg-warn-600"}`} />
            {statusLabel}
          </p>
          <div className="flex flex-col gap-2">
            {canPublish && f.status !== "published" ? (
              <button disabled={pending} onClick={() => submit("published")} className={`${btnPrimary} h-12 text-base`}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null} Publicar en la tienda
              </button>
            ) : null}
            {f.status === "published" ? (
              <button disabled={pending} onClick={() => submit("published")} className={`${btnPrimary} h-12 text-base`}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null} Guardar cambios
              </button>
            ) : (
              <button disabled={pending} onClick={() => submit(f.status === "archived" ? "archived" : "draft")} className={btnGhost}>
                Guardar sin publicar
              </button>
            )}
            {f.status === "published" ? (
              <button disabled={pending} onClick={() => submit("draft")} className={btnGhost}>Ocultar de la tienda</button>
            ) : null}
            {f.status !== "archived" && f.id ? (
              <button disabled={pending} onClick={() => window.confirm("¿Archivar el producto? Deja de verse en la tienda.") && submit("archived")} className="text-sm text-ink-500 hover:text-ink-900">Archivar</button>
            ) : null}
          </div>
          {result ? <p className={`mt-3 text-sm ${result.ok ? "text-ok-600" : "text-bad-600"}`}>{result.text}</p> : null}
          {f.id && f.slug ? (
            <div className="mt-4 flex flex-wrap gap-3 border-t border-ink-100 pt-3 text-sm">
              <Link href={`/producto/${f.slug}?preview=1`} target="_blank" className="inline-flex items-center gap-1 font-semibold text-accent-600">
                <Eye className="size-4" /> Ver cómo queda
              </Link>
              <button onClick={() => start(async () => { await duplicateProductAction(f.id!); })} className="inline-flex items-center gap-1 font-semibold text-ink-600">
                <Copy className="size-4" /> Duplicar
              </button>
              {canPublish ? (
                <button
                  onClick={() =>
                    window.confirm("¿Eliminar definitivamente? Si tiene ventas, archivalo.") &&
                    start(async () => {
                      const r = await deleteProductAction(f.id!);
                      if (r && !r.ok) setResult({ ok: false, text: r.error });
                    })
                  }
                  className="inline-flex items-center gap-1 font-semibold text-bad-600"
                >
                  <Trash2 className="size-4" /> Eliminar
                </button>
              ) : null}
            </div>
          ) : null}
        </Card>
        <p className="px-1 text-xs text-ink-500">
          Sólo lo marcado con * es obligatorio. Todo lo demás podés completarlo después.
        </p>
      </aside>
    </div>
  );
}

function FitmentEditor({
  makes, fitments, onChange, universal, onUniversal,
}: {
  makes: { id: string; name: string }[];
  fitments: Fit[];
  onChange: (v: Fit[]) => void;
  universal: boolean;
  onUniversal: (v: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [makeId, setMakeId] = useState("");
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [modelId, setModelId] = useState("");
  const [versions, setVersions] = useState<{ id: string; year_from: number; year_to: number | null; engine: string }[]>([]);
  const [status, setStatus] = useState<Fit["status"]>("confirmed");

  useEffect(() => {
    if (!makeId) return;
    supabase.from("vehicle_models").select("id, name").eq("make_id", makeId).order("name").then(({ data }) => setModels(data ?? []));
  }, [makeId, supabase]);
  useEffect(() => {
    if (!modelId) return;
    supabase.from("vehicle_versions").select("id, year_from, year_to, engine").eq("model_id", modelId).order("year_from").then(({ data }) => setVersions(data ?? []));
  }, [modelId, supabase]);

  const make = makes.find((m) => m.id === makeId)?.name ?? "";
  const model = models.find((m) => m.id === modelId)?.name ?? "";
  const add = (v: { id: string; year_from: number; year_to: number | null; engine: string }) => {
    if (fitments.some((x) => x.version_id === v.id)) return;
    onChange([...fitments, { version_id: v.id, status, label: `${make} ${model} ${v.year_from}–${v.year_to ?? "act."} ${v.engine}` }]);
  };
  const LABELS = { confirmed: "Confirmada", unverified: "Pendiente", incompatible: "No compatible" };

  return (
    <Card title="4. ¿Para qué vehículos sirve?">
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={universal} onChange={(e) => onUniversal(e.target.checked)} className="accent-accent-500" />
        Producto universal (sirve a cualquier vehículo; p. ej. lubricantes o líquidos)
      </label>
      <div className="grid gap-2 sm:grid-cols-4">
        <select value={makeId} onChange={(e) => { setMakeId(e.target.value); setModelId(""); setVersions([]); }} className={inputCls}>
          <option value="">Marca</option>
          {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={modelId} disabled={!makeId} onChange={(e) => setModelId(e.target.value)} className={inputCls}>
          <option value="">Modelo</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as Fit["status"])} className={inputCls}>
          <option value="confirmed">Confirmada</option>
          <option value="unverified">Pendiente de verificar</option>
          <option value="incompatible">No compatible</option>
        </select>
        <button disabled={!versions.length} onClick={() => versions.forEach(add)} className={btnGhost}>Agregar todas</button>
      </div>
      {versions.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {versions.map((v) => (
            <button key={v.id} onClick={() => add(v)} className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs hover:border-accent-500">
              + {v.year_from}–{v.year_to ?? "act."} {v.engine}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="mt-4 divide-y divide-ink-100 text-sm">
        {fitments.map((x, i) => (
          <li key={x.version_id} className="flex items-center gap-3 py-2">
            <span className="flex-1">{x.label}</span>
            <select
              value={x.status}
              onChange={(e) => onChange(fitments.map((y, j) => (j === i ? { ...y, status: e.target.value as Fit["status"] } : y)))}
              className="h-8 rounded-lg border border-ink-200 px-2 text-xs"
            >
              {Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button onClick={() => onChange(fitments.filter((_, j) => j !== i))} className="text-ink-400 hover:text-bad-600" aria-label="Quitar"><X className="size-4" /></button>
          </li>
        ))}
        {!fitments.length ? <li className="py-2 text-ink-400">Sin compatibilidades cargadas: los compradores lo verán como “pendiente de verificar”.</li> : null}
      </ul>
    </Card>
  );
}

function RelationsEditor({ relations, onChange, selfId }: { relations: Rel[]; onChange: (v: Rel[]) => void; selfId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Rel["kind"]>("complementary");
  const [found, setFound] = useState<{ id: string; sku: string; name: string }[]>([]);
  async function search() {
    if (q.trim().length < 2) return;
    const clean = q.replace(/[%,()]/g, " ").trim();
    const { data } = await supabase.from("products").select("id, sku, name").or(`sku.ilike.%${clean}%,name.ilike.%${clean}%`).limit(8);
    setFound((data ?? []).filter((p) => p.id !== selfId));
  }
  return (
    <Card title="Productos relacionados (se sugieren en la ficha)">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} placeholder="Buscar por SKU o nombre" className={`${inputCls} max-w-xs`} />
        <select value={kind} onChange={(e) => setKind(e.target.value as Rel["kind"])} className={`${inputCls} w-44`}>
          <option value="complementary">Complementario</option>
          <option value="related">Alternativa / relacionado</option>
        </select>
        <button onClick={search} className={btnGhost}>Buscar</button>
      </div>
      {found.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {found.map((p) => (
            <button
              key={p.id}
              onClick={() => !relations.some((r) => r.related_id === p.id && r.kind === kind) && onChange([...relations, { related_id: p.id, kind, label: `${p.sku} · ${p.name}` }])}
              className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs hover:border-accent-500"
            >
              + {p.sku} · {p.name}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="mt-3 divide-y divide-ink-100 text-sm">
        {relations.map((r, i) => (
          <li key={r.related_id + r.kind} className="flex items-center gap-3 py-2">
            <span className="w-32 text-xs font-semibold uppercase text-ink-500">{r.kind === "complementary" ? "Complementario" : "Alternativa"}</span>
            <span className="flex-1">{r.label}</span>
            <button onClick={() => onChange(relations.filter((_, j) => j !== i))} className="text-ink-400 hover:text-bad-600" aria-label="Quitar"><X className="size-4" /></button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
