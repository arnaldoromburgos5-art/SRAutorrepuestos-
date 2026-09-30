import Link from "next/link";
import { ChevronDown, Download, FileSpreadsheet, PencilLine, Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { IMPORT_COLUMNS, IMPORT_HELP } from "@/lib/services/imports";
import { Card, PageHeader } from "@/components/admin/ui";
import { ImportWizard } from "@/components/admin/import-wizard";

export const metadata = { title: "Carga desde Excel" };

const REQUIRED = new Set(["sku", "nombre", "precio"]);
const EXAMPLES: Partial<Record<(typeof IMPORT_COLUMNS)[number], string>> = {
  sku: "SR-FRE-0001", nombre: "Pastillas de freno delanteras", marca: "Bosch", categoria: "Frenos", precio: "395000",
  precio_lista: "440000", costo: "240000", stock: "10", stock_minimo: "3", iva: "10", estado: "publicado",
  oem: "04465-0K290", compatibilidades: "TOY-HILUX-28D-16", universal: "no", garantia_meses: "12",
};

function Step({ n, icon: Icon, title, children }: { n: number; icon: typeof Download; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-500 font-display text-lg font-bold text-white">{n}</span>
      <div>
        <p className="flex items-center gap-2 font-semibold"><Icon className="size-4 text-ink-400" />{title}</p>
        <div className="text-sm text-ink-500">{children}</div>
      </div>
    </div>
  );
}

export default async function ImportPage() {
  const { supabase } = await requirePermission("products.write");
  const { data: versions } = await supabase
    .from("vehicle_versions")
    .select("code, year_from, year_to, engine, vehicle_models(name, vehicle_makes(name))")
    .not("code", "is", null)
    .order("code");

  return (
    <div className="space-y-6">
      <PageHeader title="Carga desde Excel" description="Cargá o actualizá muchos productos de una vez. Primero revisamos todo y nada se guarda hasta que confirmes." />

      <Card>
        <div className="grid gap-5 md:grid-cols-3">
          <Step n={1} icon={Download} title="Descargá la plantilla">
            <a href="/api/admin/export?plantilla=1" className="font-semibold text-accent-600 hover:text-accent-700">Plantilla (CSV)</a> con una fila de ejemplo.
          </Step>
          <Step n={2} icon={PencilLine} title="Completala en Excel">
            Una fila por producto. Sólo son obligatorios el código, el nombre y el precio.
          </Step>
          <Step n={3} icon={Upload} title="Subila acá abajo">
            Te mostramos qué filas están bien y cuáles tienen algo para corregir.
          </Step>
        </div>
      </Card>

      <ImportWizard />

      <Card title="¿Ya tenés productos cargados?">
        <p className="mb-4 text-sm text-ink-500">Descargalos, editalos en Excel y volvé a subirlos: los productos con el mismo código se actualizan.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/export?format=xlsx" className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800">
            <FileSpreadsheet className="size-4" /> Descargar en Excel
          </a>
          <a href="/api/admin/export?format=csv" className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold hover:border-ink-400">
            <Download className="size-4" /> Descargar en CSV
          </a>
        </div>
      </Card>

      <details className="group rounded-xl border border-ink-100 bg-white shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5">
          <span className="font-display text-lg font-bold uppercase tracking-wide">Qué va en cada columna</span>
          <ChevronDown className="size-5 text-ink-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="overflow-x-auto border-t border-ink-100">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr><th className="px-5 py-2.5">Columna</th><th className="px-3 py-2.5">Qué poner</th><th className="px-3 py-2.5">Ejemplo</th></tr>
            </thead>
            <tbody>
              {IMPORT_COLUMNS.map((c) => (
                <tr key={c} className="border-t border-ink-100 align-top">
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs font-semibold">{c}</code>
                    {REQUIRED.has(c) ? <span className="ml-2 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold uppercase text-accent-700">Obligatoria</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-ink-600">{IMPORT_HELP[c].replace(/^Obligatorio\.\s*/, "").replace(/^Opcional\.\s*/, "")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-ink-500">{EXAMPLES[c] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="group rounded-xl border border-ink-100 bg-white shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5">
          <span>
            <span className="block font-display text-lg font-bold uppercase tracking-wide">Códigos de vehículos</span>
            <span className="text-sm text-ink-500">Para la columna <code className="rounded bg-ink-100 px-1">compatibilidades</code>.</span>
          </span>
          <ChevronDown className="size-5 text-ink-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-ink-100 p-5">
          {versions?.length ? (
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {versions.map((v) => {
                const m = v.vehicle_models as unknown as { name: string; vehicle_makes: { name: string } };
                return (
                  <p key={v.code} className="flex items-center justify-between gap-3 border-b border-ink-50 py-1 text-sm">
                    <span className="text-ink-600">{m.vehicle_makes.name} {m.name} {v.year_from}–{v.year_to ?? "act."} · {v.engine}</span>
                    <code className="shrink-0 rounded bg-ink-100 px-1.5 text-xs font-semibold">{v.code}</code>
                  </p>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-ink-500">
              Todavía no hay versiones de vehículos cargadas.{" "}
              <Link href="/admin/vehiculos" className="font-semibold text-accent-600">Cargalas en Vehículos</Link> y sus códigos van a aparecer acá.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
