"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Car, ChevronDown, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useStore } from "./store-context";

type Make = { id: string; name: string };
type Model = { id: string; name: string };
type Version = { id: string; year_from: number; year_to: number | null; engine: string; fuel: string | null };

const CURRENT_YEAR = new Date().getFullYear();

function Select({
  label,
  value,
  onChange,
  disabled,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="h-11 w-full appearance-none rounded-xl border border-ink-200 bg-white pl-3 pr-9 text-sm text-ink-900 transition-colors focus:border-accent-500 disabled:bg-ink-50 disabled:text-ink-400"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
      </span>
    </label>
  );
}

/** Selector de marca, modelo, año y motorización. */
export function VehicleSelector({ onDone, variant = "light" }: { onDone?: () => void; variant?: "light" | "hero" }) {
  const { vehicle, setVehicle, toast } = useStore();
  const supabase = useMemo(() => createClient(), []);
  const [makes, setMakes] = useState<Make[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [makeId, setMakeId] = useState(vehicle?.makeId ?? "");
  const [modelId, setModelId] = useState(vehicle?.modelId ?? "");
  const [year, setYear] = useState(vehicle ? String(vehicle.year) : "");
  const [versionId, setVersionId] = useState(vehicle?.versionId ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("vehicle_makes").select("id, name").order("name").then(({ data }) => setMakes((data ?? []) as Make[]));
  }, [supabase]);

  useEffect(() => {
    if (!makeId) return;
    supabase
      .from("vehicle_models")
      .select("id, name")
      .eq("make_id", makeId)
      .order("name")
      .then(({ data }) => setModels((data ?? []) as Model[]));
  }, [makeId, supabase]);

  useEffect(() => {
    if (!modelId) return;
    supabase
      .from("vehicle_versions")
      .select("id, year_from, year_to, engine, fuel")
      .eq("model_id", modelId)
      .then(({ data }) => setVersions((data ?? []) as Version[]));
  }, [modelId, supabase]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const v of versions) for (let y = v.year_from; y <= (v.year_to ?? CURRENT_YEAR); y++) set.add(y);
    return [...set].sort((a, b) => b - a);
  }, [versions]);

  const engines = useMemo(
    () => versions.filter((v) => year && Number(year) >= v.year_from && Number(year) <= (v.year_to ?? CURRENT_YEAR)),
    [versions, year],
  );

  const chosenVersion = engines.length === 1 ? engines[0].id : versionId;

  function apply() {
    const v = versions.find((x) => x.id === chosenVersion);
    if (!v || !year) return;
    setLoading(true);
    const make = makes.find((m) => m.id === makeId)?.name ?? "";
    const model = models.find((m) => m.id === modelId)?.name ?? "";
    const label = `${make} ${model} ${year} · ${v.engine}`;
    setVehicle({ versionId: v.id, year: Number(year), label, makeId, modelId });
    toast(`Mostrando repuestos para ${make} ${model} ${year}`);
    setTimeout(() => setLoading(false), 600);
    onDone?.();
  }

  const fuel = (f: string | null) => (f ? ` (${f})` : "");

  return (
    <div className={cn("flex flex-col gap-3", variant === "hero" && "rounded-2xl bg-white p-4 shadow-lift sm:p-5")}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Select
          label="Marca"
          value={makeId}
          placeholder="Elegí la marca"
          options={makes.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(v) => {
            setMakeId(v);
            setModelId("");
            setModels([]);
            setVersions([]);
            setYear("");
            setVersionId("");
          }}
        />
        <Select
          label="Modelo"
          value={modelId}
          disabled={!makeId}
          placeholder="Modelo"
          options={models.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(v) => {
            setModelId(v);
            setVersions([]);
            setYear("");
            setVersionId("");
          }}
        />
        <Select
          label="Año"
          value={year}
          disabled={!modelId || !years.length}
          placeholder="Año"
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          onChange={(v) => {
            setYear(v);
            setVersionId("");
          }}
        />
        <Select
          label="Motor"
          value={chosenVersion}
          disabled={!year}
          placeholder={engines.length ? "Motorización" : "—"}
          options={engines.map((v) => ({ value: v.id, label: `${v.engine}${fuel(v.fuel)}` }))}
          onChange={setVersionId}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={apply}
          disabled={!chosenVersion || !year || loading}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent-500 px-5 font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Car className="size-4" />}
          Ver repuestos compatibles
        </button>
        {vehicle ? (
          <button
            onClick={() => {
              setVehicle(null);
              onDone?.();
            }}
            className="text-sm font-medium text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline"
          >
            Quitar vehículo
          </button>
        ) : null}
        <p className="text-xs text-ink-400">¿No encontrás tu versión? Consultanos por el chat.</p>
      </div>
    </div>
  );
}

/** Barra del vehículo activo con un panel desplegable para cambiarlo. */
export function VehicleBar() {
  const { vehicle, setVehicle } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink-100 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm">
        <Car className="size-4 shrink-0 text-accent-500" aria-hidden />
        {vehicle ? (
          <>
            <span className="truncate">
              <span className="text-ink-500">Tu vehículo: </span>
              <strong className="font-semibold">{vehicle.label}</strong>
            </span>
            <button onClick={() => setOpen((o) => !o)} className="shrink-0 font-semibold text-accent-600 hover:text-accent-700">
              Cambiar
            </button>
            <button onClick={() => setVehicle(null)} className="ml-auto shrink-0 text-ink-400 hover:text-ink-700" aria-label="Quitar vehículo">
              <X className="size-4" />
            </button>
          </>
        ) : (
          <>
            <span className="truncate text-ink-600">Elegí tu vehículo para ver sólo repuestos compatibles.</span>
            <button onClick={() => setOpen((o) => !o)} className="shrink-0 font-semibold text-accent-600 hover:text-accent-700">
              Elegir vehículo
            </button>
          </>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-ink-100 bg-ink-50"
          >
            <div className="mx-auto max-w-7xl px-4 py-4">
              <VehicleSelector onDone={() => setOpen(false)} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
