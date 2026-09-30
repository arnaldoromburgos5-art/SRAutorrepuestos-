import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { staffContext, ensure, audit } from "@/lib/services/context";
import { friendlyDbError, slugify, type ActionResult } from "@/lib/utils";
import { deleteRecordAction, toggleRecordAction } from "../actions";
import { ActionButton, ActionForm } from "@/components/admin/action-form";
import { Badge, Card, Field, PageHeader, Table, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Contenido" };

async function saveBanner(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "content.manage");
    const d = z
      .object({
        title: z.string().trim().min(3).max(120),
        subtitle: z.string().trim().max(240).optional(),
        cta_label: z.string().trim().max(40).optional(),
        link_url: z.string().trim().max(300).regex(/^\/|^https:\/\//, "Usá una ruta interna (/catalogo) o https://").optional().or(z.literal("")),
        placement: z.enum(["hero", "strip"]),
        sort: z.coerce.number().int().default(0),
        starts_at: z.string().optional(),
        ends_at: z.string().optional(),
      })
      .parse(Object.fromEntries(form));
    const row = { ...d, link_url: d.link_url || null, starts_at: d.starts_at || null, ends_at: d.ends_at || null };
    const { error } = await ctx.supabase.from("banners").insert(row);
    if (error) throw new Error(error.message);
    await audit(ctx, "banner.create", "banner", null, null, row);
    revalidatePath("/", "layout");
    return { ok: true, message: "Banner creado." };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

async function savePage(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "content.manage");
    const d = z.object({ slug: z.string().trim().min(2).max(60), title: z.string().trim().min(2).max(120), body: z.string().max(20000) }).parse(Object.fromEntries(form));
    const row = { slug: slugify(d.slug), title: d.title, body: d.body, published: form.get("published") === "on", updated_at: new Date().toISOString() };
    const { error } = await ctx.supabase.from("pages").upsert(row, { onConflict: "slug" });
    if (error) throw new Error(error.message);
    await audit(ctx, "page.save", "page", row.slug, null, { title: row.title });
    revalidatePath(`/p/${row.slug}`);
    return { ok: true, message: "Página guardada." };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

async function toggleFeatured(id: string, value: boolean) {
  "use server";
  const ctx = await staffContext();
  ensure(ctx, "content.manage");
  await ctx.supabase.from("categories").update({ is_featured: value }).eq("id", id);
  await audit(ctx, "category.featured", "category", id, null, { is_featured: value });
  revalidatePath("/", "layout");
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { pagina } = await searchParams;
  const { supabase } = await requirePermission("content.manage");
  const [{ data: banners }, { data: pages }, { data: categories }] = await Promise.all([
    supabase.from("banners").select("*").order("placement").order("sort"),
    supabase.from("pages").select("*").order("slug"),
    supabase.from("categories").select("id, name, is_featured").is("parent_id", null).order("sort"),
  ]);
  const editing = (pages ?? []).find((p) => p.slug === pagina);

  return (
    <div className="space-y-6">
      <PageHeader title="Contenido" description="Banners de la portada, categorías destacadas y páginas informativas." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Banners">
          <Table>
            <thead><tr><th>Título</th><th>Ubicación</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {(banners ?? []).map((b) => (
                <tr key={b.id}>
                  <td className="font-medium">{b.title}<span className="block text-xs text-ink-400">{b.link_url}</span></td>
                  <td className="text-xs">{b.placement === "hero" ? "Portada" : "Franja"} · {b.sort}</td>
                  <td><Badge tone={b.active ? "ok" : "neutral"}>{b.active ? "Activo" : "Oculto"}</Badge></td>
                  <td className="whitespace-nowrap text-right">
                    <ActionButton action={toggleRecordAction.bind(null, "banners", b.id, "active", !b.active)} className="text-xs font-semibold text-accent-600">{b.active ? "Ocultar" : "Mostrar"}</ActionButton>{" "}
                    <ActionButton action={deleteRecordAction.bind(null, "banners", b.id)} confirm="¿Eliminar el banner?" className="text-xs text-bad-600">Eliminar</ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-5 border-t border-ink-100 pt-4">
            <ActionForm action={saveBanner} submitLabel="Agregar banner" resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Título" className="sm:col-span-2"><input name="title" required className={inputCls} /></Field>
                <Field label="Subtítulo" className="sm:col-span-2"><input name="subtitle" className={inputCls} /></Field>
                <Field label="Texto del botón"><input name="cta_label" className={inputCls} /></Field>
                <Field label="Enlace"><input name="link_url" placeholder="/catalogo?categoria=frenos" className={inputCls} /></Field>
                <Field label="Ubicación">
                  <select name="placement" className={inputCls}><option value="hero">Portada (principal)</option><option value="strip">Franja informativa</option></select>
                </Field>
                <Field label="Orden"><input name="sort" type="number" defaultValue={0} className={inputCls} /></Field>
                <Field label="Desde"><input name="starts_at" type="datetime-local" className={inputCls} /></Field>
                <Field label="Hasta"><input name="ends_at" type="datetime-local" className={inputCls} /></Field>
              </div>
            </ActionForm>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Categorías destacadas en la portada">
            <ul className="divide-y divide-ink-100 text-sm">
              {(categories ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>{c.name}</span>
                  <ActionButton action={toggleFeatured.bind(null, c.id, !c.is_featured)} className={`rounded-full px-3 py-1 text-xs font-semibold ${c.is_featured ? "bg-ok-50 text-ok-600" : "bg-ink-100 text-ink-500"}`}>
                    {c.is_featured ? "Destacada" : "No destacada"}
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Páginas informativas">
            <ul className="mb-4 flex flex-wrap gap-2 text-sm">
              {(pages ?? []).map((p) => (
                <li key={p.id}><a href={`/admin/contenido?pagina=${p.slug}`} className={`rounded-full px-3 py-1 ${p.slug === pagina ? "bg-ink-900 text-white" : "bg-ink-100"}`}>{p.title}</a></li>
              ))}
              <li><a href="/admin/contenido?pagina=nueva" className="rounded-full px-3 py-1 font-semibold text-accent-600">+ Nueva</a></li>
            </ul>
            <ActionForm key={pagina ?? "none"} action={savePage} submitLabel="Guardar página">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Dirección (/p/…)"><input name="slug" required defaultValue={editing?.slug ?? ""} className={inputCls} /></Field>
                  <Field label="Título"><input name="title" required defaultValue={editing?.title ?? ""} className={inputCls} /></Field>
                </div>
                <Field label="Contenido" hint="Formato simple: ## Título, párrafos separados por una línea en blanco, listas con “- ” y **negrita**.">
                  <textarea name="body" rows={10} defaultValue={editing?.body ?? ""} className="w-full rounded-lg border border-ink-200 p-3 font-mono text-xs" />
                </Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={editing?.published ?? true} className="accent-accent-500" /> Publicada</label>
              </div>
            </ActionForm>
          </Card>
        </div>
      </div>
    </div>
  );
}
