"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Building2, Check, Clock, Gift, Loader2, Plus, Trash2, Truck, X } from "lucide-react";
import { formatPyg } from "@/lib/money";
import { cn, type ActionResult } from "@/lib/utils";
import { deleteRecordAction, toggleRecordAction } from "@/app/admin/actions";
import { btnPrimary, inputCls } from "./ui";

type Zone = { id: string; name: string; method: "home" | "agency"; departments: string[]; cost: number; free_over: number | null; eta: string | null; active: boolean };

const METHODS = {
  home: { label: "A domicilio", hint: "Entrega en la dirección del cliente", icon: Truck },
  agency: { label: "Por agencia", hint: "Envío al interior por transporte", icon: Building2 },
} as const;

function Switch({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-ok-600" : "bg-ink-200", disabled && "opacity-60")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

function ZoneCard({ zone }: { zone: Zone }) {
  const [active, setActive] = useState(zone.active);
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();
  const M = METHODS[zone.method];
  const visible = showAll ? zone.departments : zone.departments.slice(0, 4);

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      className={cn("flex flex-col rounded-2xl border bg-white p-5 shadow-card transition-opacity", active ? "border-ink-100" : "border-dashed border-ink-200 opacity-70")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-ink-900 text-white"><M.icon className="size-5" /></span>
          <div>
            <p className="font-display text-xl font-bold leading-tight">{zone.name}</p>
            <p className="text-xs text-ink-500">{M.label}</p>
          </div>
        </div>
        <Switch
          on={active}
          disabled={pending}
          onChange={() => start(async () => {
            const next = !active;
            setActive(next);
            const r = await toggleRecordAction("shipping_zones", zone.id, "active", next);
            if (!r.ok) setActive(!next);
          })}
        />
      </div>

      <p className="mt-4 font-display text-3xl font-bold">{zone.cost ? formatPyg(zone.cost) : "Gratis"}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {zone.eta ? <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-ink-600"><Clock className="size-3" />{zone.eta}</span> : null}
        {zone.free_over ? <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2.5 py-1 font-semibold text-ok-600"><Gift className="size-3" />Gratis desde {formatPyg(zone.free_over)}</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {visible.map((d) => <span key={d} className="rounded-md bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">{d}</span>)}
        {zone.departments.length > 4 ? (
          <button onClick={() => setShowAll((s) => !s)} className="rounded-md px-2 py-0.5 text-xs font-semibold text-ink-500 hover:text-ink-900">
            {showAll ? "ver menos" : `+${zone.departments.length - 4} más`}
          </button>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between pt-4 text-xs text-ink-400">
        <span>{active ? "Visible en el checkout" : "Desactivada"}</span>
        <button
          onClick={() => window.confirm(`¿Eliminar la zona "${zone.name}"?`) && start(async () => { await deleteRecordAction("shipping_zones", zone.id); })}
          className="inline-flex items-center gap-1 text-ink-400 hover:text-bad-600"
          aria-label={`Eliminar ${zone.name}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}

export function ShippingZones({
  zones,
  departments,
  addZone,
}: {
  zones: Zone[];
  departments: readonly string[];
  addZone: (prev: ActionResult | undefined, form: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"home" | "agency">("home");
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(addZone, undefined);
  const used = new Set(zones.filter((z) => z.method === method).flatMap((z) => z.departments));

  useEffect(() => {
    if (state?.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar el formulario tras guardar
      setOpen(false);
      setSelected([]);
    }
  }, [state]);

  const toggle = (d: string) => setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>{zones.map((z) => <ZoneCard key={z.id} zone={z} />)}</AnimatePresence>
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 text-ink-500 transition-colors hover:border-accent-500 hover:text-accent-600"
          >
            <Plus className="size-7" />
            <span className="font-semibold">Agregar zona de envío</span>
          </button>
        ) : null}
      </div>

      <AnimatePresence>
        {open ? (
          <motion.form
            action={action}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="space-y-5 rounded-2xl border border-accent-500/40 bg-accent-50/40 p-5"
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-xl font-bold">Nueva zona de envío</p>
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-ink-500 hover:bg-white" aria-label="Cerrar"><X className="size-4" /></button>
            </div>

            <input type="hidden" name="method" value={method} />
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(METHODS) as ("home" | "agency")[]).map((m) => {
                const M = METHODS[m];
                return (
                  <button type="button" key={m} onClick={() => setMethod(m)} aria-pressed={method === m}
                    className={cn("flex items-center gap-3 rounded-xl border-2 bg-white p-4 text-left transition-colors", method === m ? "border-accent-500" : "border-ink-100 hover:border-ink-300")}
                  >
                    <M.icon className={cn("size-6", method === m ? "text-accent-600" : "text-ink-400")} />
                    <span><span className="block font-semibold">{M.label}</span><span className="text-xs text-ink-500">{M.hint}</span></span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1.5 lg:col-span-1">
                <span className="text-sm font-semibold">Nombre</span>
                <input name="name" required placeholder="Ej.: Asunción" className={inputCls} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-semibold">Costo del envío (Gs.)</span>
                <input name="cost" type="number" min={0} required placeholder="25000" className={inputCls} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-semibold">Gratis desde (opcional)</span>
                <input name="free_over" type="number" min={0} placeholder="1500000" className={inputCls} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-semibold">Tiempo de entrega</span>
                <input name="eta" placeholder="24 a 48 h hábiles" className={inputCls} />
              </label>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">¿A qué departamentos llega? <span className="font-normal text-ink-500">({selected.length} elegidos)</span></span>
                <span className="flex gap-3 text-xs font-semibold">
                  <button type="button" onClick={() => setSelected(departments.filter((d) => !used.has(d)))} className="text-accent-600">Elegir los que faltan</button>
                  <button type="button" onClick={() => setSelected([])} className="text-ink-500">Ninguno</button>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => {
                  const on = selected.includes(d);
                  return (
                    <button type="button" key={d} onClick={() => toggle(d)} aria-pressed={on}
                      className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors",
                        on ? "border-accent-500 bg-accent-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400",
                        !on && used.has(d) && "text-ink-400")}
                      title={used.has(d) ? "Ya tiene una zona con este método" : undefined}
                    >
                      {on ? <Check className="size-3.5" /> : null}{d}
                    </button>
                  );
                })}
              </div>
              {selected.map((d) => <input key={d} type="hidden" name="departments" value={d} />)}
            </div>

            <div className="flex items-center gap-3">
              <button disabled={pending || !selected.length} className={btnPrimary}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Guardar zona
              </button>
              {state && !state.ok ? <p className="text-sm text-bad-600">{state.error}</p> : null}
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>
      {state?.ok ? <p className="text-sm text-ok-600">{state.message}</p> : null}
    </div>
  );
}
