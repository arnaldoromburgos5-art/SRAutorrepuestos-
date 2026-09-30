import Link from "next/link";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputCls = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm focus:border-accent-500";
export const btnPrimary = "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent-500 px-4 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60";
export const btnDark = "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60";
export const btnGhost = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-700 hover:border-ink-400 disabled:opacity-60";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">{title}</h1>
        {description ? <p className="text-sm text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-ink-100 bg-white p-5 shadow-card", className)}>
      {title || actions ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="font-display text-lg font-bold uppercase tracking-wide">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, definition, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; definition?: string; tone?: "warn" | "bad" | "ok" }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-card">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
        {label}
        {definition ? (
          <span className="group relative">
            <Info className="size-3.5 text-ink-300" aria-label={definition} />
            <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-64 -translate-x-1/2 rounded-lg bg-ink-900 p-2.5 text-[11px] font-normal normal-case tracking-normal text-white shadow-lift group-hover:block">
              {definition}
            </span>
          </span>
        ) : null}
      </p>
      <p className={cn("mt-1 font-display text-3xl font-bold tabular-nums", tone === "warn" && "text-warn-600", tone === "bad" && "text-bad-600", tone === "ok" && "text-ok-600")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" | "accent" | "dark" }) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700",
    ok: "bg-ok-50 text-ok-600",
    warn: "bg-warn-50 text-warn-600",
    bad: "bg-bad-50 text-bad-600",
    accent: "bg-accent-50 text-accent-700",
    dark: "bg-ink-900 text-white",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white shadow-card">
      <table className="w-full text-left text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:whitespace-nowrap [&_th]:bg-ink-50 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-ink-500 [&_tbody_tr]:border-t [&_tbody_tr]:border-ink-100 [&_tbody_tr:hover]:bg-ink-50/60">
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-500">{children}</p>;
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-semibold text-ink-600">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-ink-500">Página {page} de {pages}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className={btnGhost} href={href(page - 1)}>Anterior</Link> : null}
        {page < pages ? <Link className={btnGhost} href={href(page + 1)}>Siguiente</Link> : null}
      </div>
    </div>
  );
}

export function NoPermission() {
  return <Empty>No tenés permiso para ver esta sección. Pedile acceso al propietario.</Empty>;
}
