import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { staffContext, ensure, audit } from "@/lib/services/context";
import { friendlyDbError, slugify, type ActionResult } from "@/lib/utils";
import { deleteRecordAction } from "../actions";
import { ActionButton, ActionForm } from "@/components/admin/action-form";
import { Card, Field, PageHeader, Table, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Vehículos" };

async function addVehicle(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "vehicles.manage");
    const d = z
      .object({
        make: z.string().trim().min(2).max(40),
        model: z.string().trim().min(1).max(60),
        year_from: z.coerce.number().int().min(1950).max(2100),
        year_to: z.coerce.number().int().min(1950).max(2100).optional().or(z.literal("").transform(() => undefined)),
        engine: z.string().trim().min(2).max(80),
        fuel: z.enum(["nafta", "diesel", "flex", "hibrido", "electrico", "gnc"]).optional(),
        transmission: z.string().trim().max(60).optional(),
        code: z.string().trim().max(40).optional(),
      })
      .parse(Object.fromEntries(form));
    const db = ctx.supabase;
    let { data: make } = await db.from("vehicle_makes").select("id").ilike("name", d.make).maybeSingle();
    if (!make) ({ data: make } = await db.from("vehicle_makes").insert({ name: d.make, slug: slugify(d.make) }).select("id").single());
    let { data: model } = await db.from("vehicle_models").select("id").eq("make_id", make!.id).ilike("name", d.model).maybeSingle();
    if (!model) ({ data: model } = await db.from("vehicle_models").insert({ make_id: make!.id, name: d.model, slug: slugify(d.model) }).select("id").single());
    const code = d.code?.toUpperCase() || `${slugify(d.make).slice(0, 3)}-${slugify(d.model).slice(0, 5)}-${d.engine.replace(/[^0-9A-Za-z]/g, "").slice(0, 4)}-${String(d.year_from).slice(2)}`.toUpperCase();
    const row = { model_id: model!.id, code, year_from: d.year_from, year_to: d.year_to ?? null, engine: d.engine, fuel: d.fuel ?? null, transmission: d.transmission || null };
    const { error } = await db.from("vehicle_versions").insert(row);
    if (error) throw new Error(error.message);
    await audit(ctx, "vehicle.create", "vehicle_version", code, null, { ...row, make: d.make, model: d.model });
    revalidatePath("/admin/vehiculos");
    return { ok: true, message: `Versión creada (${code}).` };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

type Row = { id: string; code: string | null; year_from: number; year_to: number | null; engine: string; fuel: string | null; vehicle_models: { name: string; vehicle_makes: { name: string } }; product_fitments: { count: number }[] };

export default async function VehiclesPage() {
  const { supabase } = await requirePermission("vehicles.manage");
  const { data } = await supabase.from("vehicle_versions").select("id, code, year_from, year_to, engine, fuel, vehicle_models(name, vehicle_makes(name)), product_fitments(count)");
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) =>
    `${a.vehicle_models.vehicle_makes.name} ${a.vehicle_models.name} ${a.year_from}`.localeCompare(`${b.vehicle_models.vehicle_makes.name} ${b.vehicle_models.name} ${b.year_from}`),
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Vehículos" description="Marcas, modelos, años y motorizaciones que usa el selector de la tienda y las compatibilidades." />
      <Card title="Agregar versión">
        <ActionForm action={addVehicle} submitLabel="Agregar" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Marca"><input name="make" required placeholder="Toyota" className={inputCls} /></Field>
            <Field label="Modelo"><input name="model" required placeholder="Hilux" className={inputCls} /></Field>
            <Field label="Año desde"><input name="year_from" type="number" required className={inputCls} /></Field>
            <Field label="Año hasta" hint="Vacío = actual"><input name="year_to" type="number" className={inputCls} /></Field>
            <Field label="Motor"><input name="engine" required placeholder="2.8 D-4D (1GD-FTV)" className={inputCls} /></Field>
            <Field label="Combustible">
              <select name="fuel" className={inputCls}>
                <option value="nafta">Nafta</option><option value="diesel">Diésel</option><option value="flex">Flex</option>
                <option value="hibrido">Híbrido</option><option value="electrico">Eléctrico</option><option value="gnc">GNC</option>
              </select>
            </Field>
            <Field label="Transmisión"><input name="transmission" className={inputCls} /></Field>
            <Field label="Código (opcional)" hint="Para importaciones"><input name="code" className={inputCls} /></Field>
          </div>
        </ActionForm>
      </Card>
      <Table>
        <thead><tr><th>Vehículo</th><th>Años</th><th>Motor</th><th>Código</th><th className="text-right">Repuestos</th><th /></tr></thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id}>
              <td className="font-medium">{v.vehicle_models.vehicle_makes.name} {v.vehicle_models.name}</td>
              <td>{v.year_from}–{v.year_to ?? "actual"}</td>
              <td className="text-sm">{v.engine}{v.fuel ? ` · ${v.fuel}` : ""}</td>
              <td className="font-mono text-xs">{v.code}</td>
              <td className="text-right">{v.product_fitments[0]?.count ?? 0}</td>
              <td className="text-right">
                <ActionButton action={deleteRecordAction.bind(null, "vehicle_versions", v.id)} confirm="¿Eliminar la versión? Se borran sus compatibilidades." className="text-xs text-bad-600">Eliminar</ActionButton>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
