"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Image as ImageIcon, Loader2, Plus, Star, Trash2, X } from "lucide-react";
import { CategoryIcon } from "@/components/store/category-icon";
import { cn, type ActionResult } from "@/lib/utils";
import { deleteRecordAction, toggleRecordAction } from "@/app/admin/actions";
import { DatePicker } from "./date-picker";
import { btnPrimary, inputCls } from "./ui";

type Category = { id: string; name: string; slug: string; icon: string | null; parent_id: string | null; is_featured: boolean; products: number };
type FormAction = (prev: ActionResult | undefined, form: FormData) => Promise<ActionResult>;

const ICONS = ["disc", "filter", "move-vertical", "zap", "battery-charging", "droplet", "cog", "circle-dot", "lightbulb", "package"];

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------
export function CategoriesManager({
  categories,
  createCategory,
  deleteCategory,
  toggleFeatured,
}: {
  categories: Category[];
  createCategory: FormAction;
  deleteCategory: (id: string) => Promise<ActionResult>;
  toggleFeatured: (id: string, value: boolean) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [icon, setIcon] = useState("package");
  const [state, action, saving] = useActionState(createCategory, undefined);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const top = categories.filter((c) => !c.parent_id);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar el formulario tras guardar
    if (state?.ok) setOpen(false);
  }, [state]);

  const remove = (c: Category) => {
    const children = categories.filter((x) => x.parent_id === c.id).length;
    const warn = [
      `¿Eliminar la categoría "${c.name}"?`,
      c.products ? `Sus ${c.products} productos quedan sin categoría (no se borran).` : "",
      children ? `Sus ${children} subcategorías pasan a ser categorías principales.` : "",
    ].filter(Boolean).join("\n");
    if (!window.confirm(warn)) return;
    start(async () => {
      const r = await deleteCategory(c.id);
      setError(r.ok ? null : r.error);
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <AnimatePresence initial={false}>
          {top.map((c) => {
            const subs = categories.filter((x) => x.parent_id === c.id);
            return (
              <motion.div key={c.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="rounded-xl border border-ink-100 bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-900 text-white"><CategoryIcon name={c.icon} className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-xs text-ink-400">{c.products} productos</p>
                  </div>
                  <button
                    onClick={() => start(async () => { await toggleFeatured(c.id, !c.is_featured); })}
                    disabled={pending}
                    className={cn("grid size-9 place-items-center rounded-lg transition-colors", c.is_featured ? "text-amber-500 hover:bg-amber-50" : "text-ink-300 hover:bg-ink-100")}
                    title={c.is_featured ? "Destacada en la portada (tocá para quitar)" : "Destacar en la portada"}
                    aria-pressed={c.is_featured}
                  >
                    <Star className={cn("size-5", c.is_featured && "fill-current")} />
                  </button>
                  <button onClick={() => remove(c)} disabled={pending} className="grid size-9 place-items-center rounded-lg text-ink-300 hover:bg-bad-50 hover:text-bad-600" aria-label={`Eliminar ${c.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {subs.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {subs.map((s) => (
                      <span key={s.id} className="group inline-flex items-center gap-1 rounded-full bg-ink-100 py-1 pl-2.5 pr-1 text-xs text-ink-700">
                        {s.name}
                        <button onClick={() => remove(s)} className="grid size-4 place-items-center rounded-full text-ink-400 hover:bg-bad-600 hover:text-white" aria-label={`Eliminar ${s.name}`}>
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {error ? <p className="text-sm text-bad-600">{error}</p> : null}

      {open ? (
        <form action={action} className="space-y-4 rounded-xl border border-accent-500/40 bg-accent-50/40 p-4">
          <input type="hidden" name="icon" value={icon} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">Nombre</span>
              <input name="name" required placeholder="Ej.: Escapes" className={inputCls} autoFocus />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">¿Dentro de otra categoría?</span>
              <select name="parent_id" className={inputCls} defaultValue="">
                <option value="">No, es una categoría principal</option>
                {top.map((c) => <option key={c.id} value={c.id}>Sí, dentro de {c.name}</option>)}
              </select>
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Ícono</p>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((i) => (
                <button type="button" key={i} onClick={() => setIcon(i)} aria-pressed={icon === i}
                  className={cn("grid size-10 place-items-center rounded-xl border-2 transition-colors", icon === i ? "border-accent-500 bg-accent-500 text-white" : "border-ink-100 bg-white text-ink-600 hover:border-ink-300")}
                >
                  <CategoryIcon name={i} className="size-5" />
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_featured" className="accent-accent-500" /> Mostrarla en la portada
          </label>
          <div className="flex items-center gap-3">
            <button disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Crear categoría</button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-500">Cancelar</button>
            {state && !state.ok ? <p className="text-sm text-bad-600">{state.error}</p> : null}
          </div>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-3 font-semibold text-ink-500 transition-colors hover:border-accent-500 hover:text-accent-600">
          <Plus className="size-5" /> Agregar categoría
        </button>
      )}
      {state?.ok ? <p className="text-sm text-ok-600">{state.message}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------
type Banner = { id: string; title: string; subtitle: string | null; cta_label: string | null; link_url: string | null; placement: "hero" | "strip"; active: boolean; ends_at: string | null };

export function BannersManager({ banners, saveBanner }: { banners: Banner[]; saveBanner: FormAction }) {
  const [open, setOpen] = useState(false);
  const [state, action, saving] = useActionState(saveBanner, undefined);
  const [pending, start] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar el formulario tras guardar
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <div className="space-y-4">
      {banners.length ? (
        <div className="space-y-3">
          {banners.map((b) => (
            <div key={b.id} className={cn("overflow-hidden rounded-xl border border-ink-100", !b.active && "opacity-60")}>
              <div className="bg-speed px-5 py-4 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-400">{b.placement === "hero" ? "Portada principal" : "Franja informativa"}</p>
                <p className="font-display text-xl font-bold uppercase leading-tight">{b.title}</p>
                {b.subtitle ? <p className="text-sm text-ink-300">{b.subtitle}</p> : null}
                {b.cta_label ? <span className="mt-2 inline-block rounded-lg bg-accent-500 px-3 py-1 text-xs font-semibold">{b.cta_label}</span> : null}
              </div>
              <div className="flex items-center justify-between gap-3 bg-white px-4 py-2 text-xs text-ink-500">
                <span className="truncate">{b.link_url ?? "Sin enlace"}{b.ends_at ? ` · hasta ${new Date(b.ends_at).toLocaleDateString("es-PY")}` : ""}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <button disabled={pending} onClick={() => start(async () => { await toggleRecordAction("banners", b.id, "active", !b.active); })} className="font-semibold text-accent-600">
                    {b.active ? "Ocultar" : "Mostrar"}
                  </button>
                  <button disabled={pending} onClick={() => window.confirm("¿Eliminar el banner?") && start(async () => { await deleteRecordAction("banners", b.id); })} className="text-ink-400 hover:text-bad-600" aria-label="Eliminar banner">
                    <Trash2 className="size-4" />
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-ink-50 py-8 text-center text-sm text-ink-500">
          <ImageIcon className="size-8 text-ink-300" />
          Todavía no hay banners. La portada muestra un mensaje de bienvenida por defecto.
        </div>
      )}

      {open ? (
        <form action={action} className="space-y-3 rounded-xl border border-accent-500/40 bg-accent-50/40 p-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">Título</span>
            <input name="title" required placeholder="Ej.: Semana de frenos: 10 % off" className={inputCls} autoFocus />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">Texto (opcional)</span>
            <input name="subtitle" placeholder="Ej.: Pastillas y discos con descuento por tiempo limitado" className={inputCls} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">Texto del botón (opcional)</span>
              <input name="cta_label" placeholder="Ver ofertas" className={inputCls} />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">¿A dónde lleva?</span>
              <input name="link_url" placeholder="/catalogo?ofertas=1" className={inputCls} />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">Dónde se muestra</span>
              <select name="placement" className={inputCls}>
                <option value="hero">Portada principal</option>
                <option value="strip">Franja informativa</option>
              </select>
            </label>
            <input type="hidden" name="sort" value="0" />
            <div />
            <DatePicker name="starts_at" label="Mostrar desde" placeholder="Desde hoy" presets="start" />
            <DatePicker name="ends_at" label="Mostrar hasta" placeholder="Sin fecha de fin" />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Crear banner</button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-500">Cancelar</button>
            {state && !state.ok ? <p className="text-sm text-bad-600">{state.error}</p> : null}
          </div>
        </form>
      ) : (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-3 font-semibold text-ink-500 transition-colors hover:border-accent-500 hover:text-accent-600">
          <Plus className="size-5" /> Agregar banner
        </button>
      )}
    </div>
  );
}
