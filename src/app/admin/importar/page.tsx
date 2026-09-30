import { FileDown, FileSpreadsheet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { IMPORT_COLUMNS, IMPORT_HELP } from "@/lib/services/imports";
import { Card, PageHeader, btnGhost } from "@/components/admin/ui";
import { ImportWizard } from "@/components/admin/import-wizard";

export const metadata = { title: "Importar y exportar" };

export default async function ImportPage() {
  const { supabase } = await requirePermission("products.write");
  const { data: versions } = await supabase
    .from("vehicle_versions")
    .select("code, year_from, year_to, engine, vehicle_models(name, vehicle_makes(name))")
    .not("code", "is", null)
    .order("code");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar y exportar"
        description="Cargá o actualizá productos en masa desde CSV o Excel. Primero se valida todo; nada se guarda hasta que confirmes."
        actions={
          <>
            <a href="/api/admin/export?plantilla=1" className={btnGhost}><FileDown className="size-4" /> Plantilla CSV</a>
            <a href="/api/admin/export?format=csv" className={btnGhost}><FileDown className="size-4" /> Exportar CSV</a>
            <a href="/api/admin/export?format=xlsx" className={btnGhost}><FileSpreadsheet className="size-4" /> Exportar Excel</a>
          </>
        }
      />
      <ImportWizard />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Columnas">
          <dl className="space-y-2 text-sm">
            {IMPORT_COLUMNS.map((c) => (
              <div key={c}>
                <dt className="font-mono text-xs font-semibold">{c}</dt>
                <dd className="text-ink-600">{IMPORT_HELP[c]}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Códigos de versiones de vehículos">
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {(versions ?? []).map((v) => {
                  const m = v.vehicle_models as unknown as { name: string; vehicle_makes: { name: string } };
                  return (
                    <tr key={v.code} className="border-t border-ink-100">
                      <td className="py-1.5 pr-3 font-mono text-xs">{v.code}</td>
                      <td className="py-1.5 text-ink-600">{m.vehicle_makes.name} {m.name} {v.year_from}–{v.year_to ?? "act."} {v.engine}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
