import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { emptyProduct, loadCatalogOptions } from "@/lib/admin-data";
import { PageHeader } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";

export const metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  const { supabase, profile } = await requirePermission("products.write");
  const options = await loadCatalogOptions(supabase);
  return (
    <div>
      <PageHeader title="Nuevo producto" description="Se crea como borrador hasta que lo publiques." />
      <ProductForm initial={emptyProduct} {...options} canPublish={can(profile.role, "products.publish")} canPrice={can(profile.role, "prices.write")} />
    </div>
  );
}
