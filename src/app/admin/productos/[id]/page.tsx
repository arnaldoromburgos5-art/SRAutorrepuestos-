import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadCatalogOptions, loadProductForm } from "@/lib/admin-data";
import { PageHeader } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "Editar producto" };

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicado?: string }> }) {
  const { id } = await params;
  const { duplicado } = await searchParams;
  const { supabase, profile } = await requirePermission("products.read");
  const [loaded, options] = await Promise.all([loadProductForm(supabase, id), loadCatalogOptions(supabase)]);
  if (!loaded) notFound();

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
    </div>
  );
}
