import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { normalizeCode } from "@/lib/utils";
import { PageHeader, Pagination, btnGhost, btnPrimary, inputCls } from "@/components/admin/ui";
import { ProductsTable } from "@/components/admin/products-table";

const PAGE = 40;

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requirePermission("products.read");
  const page = Math.max(1, Number(sp.pagina) || 1);

  let query = supabase
    .from("catalog_products")
    .select("id, sku, name, status, brand_name, category_name, price, final_price, available, min_stock, image_url", { count: "exact" })
    .order("name")
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, " ").trim();
    query = query.or(`name.ilike.%${q}%,search_codes.ilike.%${normalizeCode(q)}%`);
  }
  if (sp.estado) query = query.eq("status", sp.estado);
  if (sp.stock === "sin") query = query.lte("available", 0);
  const { data, count } = await query;
  const pages = Math.ceil((count ?? 0) / PAGE);

  const href = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    next.set("pagina", String(p));
    return `/admin/productos?${next}`;
  };

  return (
    <div>
      <PageHeader
        title="Productos"
        description={`${count ?? 0} productos`}
        actions={
          <>
            <Link href="/admin/importar" className={btnGhost}>
              <Download className="size-4" /> Importar / exportar
            </Link>
            {can(profile.role, "products.write") ? (
              <Link href="/admin/productos/nuevo" className={btnPrimary}>
                <Plus className="size-4" /> Nuevo producto
              </Link>
            ) : null}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Buscar por nombre, SKU u OEM" className={`${inputCls} max-w-xs`} />
        <select name="estado" defaultValue={sp.estado ?? ""} className={`${inputCls} w-40`}>
          <option value="">Todos los estados</option>
          <option value="published">Publicados</option>
          <option value="draft">Borradores</option>
          <option value="archived">Archivados</option>
        </select>
        <select name="stock" defaultValue={sp.stock ?? ""} className={`${inputCls} w-44`}>
          <option value="">Todo el stock</option>
          <option value="sin">Sin stock</option>
        </select>
        <button className={btnGhost}>Filtrar</button>
      </form>
      <ProductsTable
        rows={(data ?? []) as never}
        canPublish={can(profile.role, "products.publish")}
        canWrite={can(profile.role, "products.write")}
        canPrice={can(profile.role, "prices.write")}
      />
      <Pagination page={page} pages={pages} href={href} />
    </div>
  );
}
