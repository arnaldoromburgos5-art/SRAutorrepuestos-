"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPyg } from "@/lib/money";

const SERIES = "#e5500f"; // acento de marca, contraste ≥ 3:1 sobre la superficie
const GRID = "#eceff3";
const AXIS = "#5b6573";

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("es-PY", { maximumFractionDigits: 1 })} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n);

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: Record<string, number | string> }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-3 py-2 text-xs shadow-lift">
      <p className="font-semibold text-ink-900">{label}</p>
      <p className="text-ink-700">Ingresos: {formatPyg(Number(p.value))}</p>
      {p.payload.orders !== undefined ? <p className="text-ink-500">{p.payload.orders} pedidos</p> : null}
      {p.payload.units !== undefined ? <p className="text-ink-500">{p.payload.units} unidades</p> : null}
    </div>
  );
}

/** Ingresos por día (una serie: el título de la tarjeta la nombra, sin leyenda). */
export function RevenueChart({ data }: { data: { day: string; revenue: number; orders: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: new Date(`${d.day}T12:00:00`).toLocaleDateString("es-PY", { day: "2-digit", month: "short" }) }));
  if (!rows.length) return <p className="py-16 text-center text-sm text-ink-400">Sin ventas en el período.</p>;
  return (
    <div className="h-64" role="img" aria-label="Gráfico de ingresos por día">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={compact} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="revenue" stroke={SERIES} strokeWidth={2} fill="url(#rev)" activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ranking horizontal (una serie). */
export function RankingChart({ data }: { data: { name: string; revenue: number; units: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-ink-400">Sin datos.</p>;
  return (
    <div style={{ height: Math.max(160, data.length * 36) }} role="img" aria-label="Ranking por ingresos">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={compact} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(10,12,15,0.04)" }} />
          <Bar dataKey="revenue" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
