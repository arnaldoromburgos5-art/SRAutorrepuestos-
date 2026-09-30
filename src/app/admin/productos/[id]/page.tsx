import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadCatalogOptions, loadProductForm } from "@/lib/admin-data";
import { formatDate } from "@/lib/utils";
import { Card, PageHeader } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "Editar producto" };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicado?: string }> }) {
  const { id } = await params;
  const { duplicado } = await searchParams;
  const { supabase, profile } = await requirePermission("products.read");
  const [loaded, options] = await Promise.all([loadProductForm(supabase, id), loadCatalogOptions(supabase)]);
  if (!loaded) notFound();
  const { data: history } = can(profile.role, "audit.read")
    ? await supabase.from("audit_log").select("action, source, created_at, actor_id, profiles(full_name, email)").eq("entity", "product").eq("entity_id", id).order("created_at", { ascending: false }).limit(10)
    : { data: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        title={loaded.form.name}
        description={`SKU ${loaded.form.sku}`}
        actions={<Link href="/admin/productos" className="text-sm font-semibold text-ink-600">← Volver</Link>}
      />
      {duplicado ? <p className="rounded-lg bg-ok-50 p-3 text-sm text-ok-600">Copia creada como borrador. Revisá el SKU y los datos antes de publicarla.</p> : null}
      {can(profile.role, "products.write") ? (
        <ProductForm
          initial={loaded.form}
          onHand={loaded.onHand}
          {...options}
          canPublish={can(profile.role, "products.publish")}
          canPrice={can(profile.role, "prices.write")}
        />
      ) : (
        <p className="rounded-lg bg-warn-50 p-3 text-sm text-warn-600">Tenés acceso de sólo lectura a los productos.</p>
      )}
      {history?.length ? (
        <Card title="Historial de cambios">
          <ul className="space-y-1.5 text-sm">
            {history.map((h, i) => {
              const who = h.profiles as unknown as { full_name: string | null; email: string | null } | null;
              return (
                <li key={i} className="flex flex-wrap gap-2">
                  <span className="text-ink-400">{formatDate(h.created_at, true)}</span>
                  <span className="font-medium">{h.action}</span>
                  <span className="text-ink-500">por {who?.full_name ?? who?.email ?? "sistema"}</span>
                  {h.source === "admin_ai" ? <span className="rounded bg-accent-50 px-1.5 text-xs font-semibold text-accent-700">vía asistente IA</span> : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
