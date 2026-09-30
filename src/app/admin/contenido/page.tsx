import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { staffContext, ensure, audit } from "@/lib/services/context";
import { paraguayDay } from "@/lib/periods";
import { friendlyDbError, slugify, type ActionResult } from "@/lib/utils";
import { ActionForm } from "@/components/admin/action-form";
import { BannersManager, CategoriesManager } from "@/components/admin/content-managers";
import { Card, Field, PageHeader, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Categorías y portada" };

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Revisá los datos." : friendlyDbError((e as Error).message) });

async function saveBanner(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "content.manage");
    const d = z
      .object({
        title: z.string().trim().min(3, "El título es muy corto.").max(120),
        subtitle: z.string().trim().max(240).optional(),
        cta_label: z.string().trim().max(40).optional(),
        link_url: z.string().trim().max(300).regex(/^\/|^https:\/\//, "El enlace debe empezar con / (p. ej. /catalogo) o https://").optional().or(z.literal("")),
        placement: z.enum(["hero", "strip"]),
        sort: z.coerce.number().int().default(0),
        starts_at: z.string().optional(),
        ends_at: z.string().optional(),
      })
      .parse(Object.fromEntries(form));
    const row = {
      ...d,
      subtitle: d.subtitle || null,
      cta_label: d.cta_label || null,
      link_url: d.link_url || null,
      starts_at: paraguayDay(d.starts_at, "start"),
      ends_at: paraguayDay(d.ends_at, "end"),
    };
    const { error } = await ctx.supabase.from("banners").insert(row);
    if (error) throw new Error(error.message);
    await audit(ctx, "banner.create", "banner", null, null, row);
    revalidatePath("/", "layout");
    return { ok: true, message: "Banner creado." };
  } catch (e) {
    return fail(e);
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
    return fail(e);
  }
}

async function createCategory(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "products.write");
    const d = z
      .object({ name: z.string().trim().min(2, "Escribí el nombre.").max(60), parent_id: z.string().uuid().optional().or(z.literal("")), icon: z.string().max(30).optional() })
      .parse(Object.fromEntries(form));
    const { data: last } = await ctx.supabase.from("categories").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
    let slug = slugify(d.name);
    const { data: taken } = await ctx.supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
    if (taken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const row = { name: d.name, slug, parent_id: d.parent_id || null, icon: d.icon || null, is_featured: form.get("is_featured") === "on", sort: (last?.sort ?? 0) + 1 };
    const { error } = await ctx.supabase.from("categories").insert(row);
    if (error) throw new Error(error.message);
    await audit(ctx, "category.create", "category", null, null, row);
    revalidatePath("/", "layout");
    return { ok: true, message: `Categoría "${d.name}" creada.` };
  } catch (e) {
    return fail(e);
  }
}

async function deleteCategory(id: string): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "products.write");
    const { data: before } = await ctx.supabase.from("categories").select("name, slug").eq("id", id).single();
    // Los productos quedan sin categoría y las subcategorías pasan a principales (claves foráneas "set null").
    const { error } = await ctx.supabase.from("categories").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await audit(ctx, "category.delete", "category", id, before, null);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function toggleFeatured(id: string, value: boolean): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "content.manage");
    const { error } = await ctx.supabase.from("categories").update({ is_featured: value }).eq("id", id);
    if (error) throw new Error(error.message);
    await audit(ctx, "category.featured", "category", id, null, { is_featured: value });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const { pagina } = await searchParams;
  const { supabase } = await requirePermission("content.manage");
  const [{ data: banners }, { data: pages }, { data: categories }, { data: productCats }] = await Promise.all([
    supabase.from("banners").select("*").order("placement").order("sort"),
    supabase.from("pages").select("*").order("title"),
    supabase.from("categories").select("id, name, slug, icon, parent_id, is_featured").order("sort").order("name"),
    supabase.from("products").select("category_id").neq("status", "archived"),
  ]);
  const counts = new Map<string, number>();
  for (const p of productCats ?? []) if (p.category_id) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  const cats = (categories ?? []).map((c) => ({ ...c, products: counts.get(c.id) ?? 0 }));
  // Una categoría principal cuenta también los productos de sus subcategorías.
  for (const c of cats) if (!c.parent_id) c.products += cats.filter((s) => s.parent_id === c.id).reduce((n, s) => n + s.products, 0);
  const editing = (pages ?? []).find((p) => p.slug === pagina);

  return (
    <div className="space-y-6">
      <PageHeader title="Categorías y portada" description="Categorías de la tienda, banners de la portada y páginas informativas." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Categorías">
          <p className="-mt-2 mb-4 text-sm text-ink-500">Tocá la ⭐ para mostrar una categoría en la portada.</p>
          <CategoriesManager categories={cats as never} createCategory={createCategory} deleteCategory={deleteCategory} toggleFeatured={toggleFeatured} />
        </Card>

        <Card title="Banners de la portada">
          <BannersManager banners={(banners ?? []) as never} saveBanner={saveBanner} />
        </Card>
      </div>

      <Card title="Páginas informativas">
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {(pages ?? []).map((p) => (
            <a key={p.id} href={`/admin/contenido?pagina=${p.slug}`} className={`rounded-full px-3.5 py-1.5 font-medium transition-colors ${p.slug === pagina ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}>
              {p.title}
            </a>
          ))}
          <a href="/admin/contenido?pagina=nueva" className="rounded-full px-3.5 py-1.5 font-semibold text-accent-600 hover:bg-accent-50">+ Nueva página</a>
        </div>
        {pagina ? (
          <ActionForm key={pagina} action={savePage} submitLabel="Guardar página">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Título"><input name="title" required defaultValue={editing?.title ?? ""} className={inputCls} /></Field>
                <Field label="Dirección" hint="Se verá en tutienda.com/p/…"><input name="slug" required defaultValue={editing?.slug ?? ""} placeholder="envios" className={inputCls} /></Field>
              </div>
              <Field label="Contenido" hint="Separá los párrafos con una línea en blanco. Para un subtítulo empezá la línea con ## y para una lista con - ">
                <textarea name="body" rows={10} defaultValue={editing?.body ?? ""} className="w-full rounded-lg border border-ink-200 p-3 text-sm leading-relaxed" />
              </Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={editing?.published ?? true} className="accent-accent-500" /> Visible en la tienda</label>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-ink-500">Elegí una página para editarla o creá una nueva.</p>
        )}
      </Card>
    </div>
  );
}
