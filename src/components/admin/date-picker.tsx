"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAYS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];

const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const pretty = (s: string) => {
  const d = fromIso(s);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
};

/**
 * Selector de fecha en español. Envía el valor en el formulario como `name`
 * (AAAA-MM-DD) para que el servidor lo guarde como inicio de ese día.
 */
export function DatePicker({
  name,
  label,
  placeholder = "Sin fecha",
  defaultValue,
  presets = "future",
}: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string | null;
  presets?: "future" | "start";
}) {
  const [value, setValue] = useState(defaultValue ? defaultValue.slice(0, 10) : "");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value ? fromIso(value) : new Date()));
  const ref = useRef<HTMLDivElement>(null);
  const today = new Date();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // semana empieza el lunes
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: offset + daysInMonth }, (_, i) => (i < offset ? null : new Date(view.getFullYear(), view.getMonth(), i - offset + 1)));

  const quick =
    presets === "start"
      ? [{ label: "Hoy", d: today }, { label: "Mañana", d: addDays(today, 1) }, { label: "En 1 semana", d: addDays(today, 7) }]
      : [{ label: "En 1 semana", d: addDays(today, 7) }, { label: "En 15 días", d: addDays(today, 15) }, { label: "En 1 mes", d: addDays(today, 30) }];

  const pick = (d: Date) => {
    setValue(toIso(d));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-600">{label}</span>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-left text-sm transition-colors",
          open ? "border-accent-500" : "border-ink-200 hover:border-ink-400",
        )}
      >
        <CalendarDays className="size-4 text-ink-400" />
        <span className={cn("flex-1", !value && "text-ink-400")}>{value ? pretty(value) : placeholder}</span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setValue(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setValue(""); } }}
            className="grid size-5 place-items-center rounded text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Quitar fecha"
          >
            <X className="size-3.5" />
          </span>
        ) : null}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-ink-100 bg-white p-3 shadow-lift"
          >
            <div className="mb-3 flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button key={q.label} type="button" onClick={() => pick(q.d)} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-accent-50 hover:text-accent-700">
                  {q.label}
                </button>
              ))}
            </div>
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="grid size-8 place-items-center rounded-lg hover:bg-ink-100" aria-label="Mes anterior">
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-sm font-semibold capitalize">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
              <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="grid size-8 place-items-center rounded-lg hover:bg-ink-100" aria-label="Mes siguiente">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
              {DAYS.map((d) => <span key={d} className="py-1 font-semibold uppercase text-ink-400">{d}</span>)}
              {cells.map((d, i) =>
                d ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(d)}
                    className={cn(
                      "grid size-9 place-items-center rounded-lg text-sm transition-colors",
                      toIso(d) === value ? "bg-accent-500 font-semibold text-white" : "hover:bg-ink-100",
                      toIso(d) === toIso(today) && toIso(d) !== value && "font-bold text-accent-600",
                    )}
                  >
                    {d.getDate()}
                  </button>
                ) : (
                  <span key={i} />
                ),
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
