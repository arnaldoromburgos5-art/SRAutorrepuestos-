import type { Metadata } from "next";
import { Car } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DeleteButton, SaveCurrentVehicle, UseVehicleButton } from "@/components/store/account-forms";
import { deleteVehicle } from "../../account-actions";

export const metadata: Metadata = { title: "Mis vehículos" };

type Row = {
  id: string;
  year: number;
  nickname: string | null;
  vehicle_versions: { id: string; engine: string; vehicle_models: { name: string; vehicle_makes: { name: string } } };
};

export default async function VehiclesPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("customer_vehicles")
    .select("id, year, nickname, vehicle_versions(id, engine, vehicle_models(name, vehicle_makes(name)))")
    .eq("user_id", user!.id)
    .order("created_at");
  const vehicles = (data ?? []) as unknown as Row[];
  return (
    <section className="space-y-6 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
      <h2 className="font-display text-2xl font-bold uppercase">Mis vehículos</h2>
      <ul className="space-y-3">
        {vehicles.map((v) => {
          const label = `${v.vehicle_versions.vehicle_models.vehicle_makes.name} ${v.vehicle_versions.vehicle_models.name} ${v.year} · ${v.vehicle_versions.engine}`;
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-100 p-4">
              <Car className="size-5 text-accent-500" />
              <span className="flex-1 font-medium">{label}</span>
              <UseVehicleButton versionId={v.vehicle_versions.id} year={v.year} label={label} />
              <DeleteButton action={deleteVehicle.bind(null, v.id)} />
            </li>
          );
        })}
      </ul>
      <SaveCurrentVehicle />
    </section>
  );
}
