export const PERIODS = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  mes: "Este mes",
  "mes-anterior": "Mes anterior",
} as const;

export type PeriodKey = keyof typeof PERIODS;

/** Rango [from, to) en hora de Paraguay (UTC-3). */
export function periodRange(key: string | undefined): { key: PeriodKey; from: Date; to: Date } {
  const k = (key && key in PERIODS ? key : "30d") as PeriodKey;
  const now = new Date();
  const to = new Date(now.getTime() + 60_000);
  const day = 86_400_000;
  if (k === "7d") return { key: k, from: new Date(now.getTime() - 7 * day), to };
  if (k === "90d") return { key: k, from: new Date(now.getTime() - 90 * day), to };
  const py = new Date(now.getTime() - 3 * 3_600_000); // fecha local de Asunción
  const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1, 3));
  if (k === "mes") return { key: k, from: monthStart(py.getUTCFullYear(), py.getUTCMonth()), to };
  if (k === "mes-anterior") {
    return { key: k, from: monthStart(py.getUTCFullYear(), py.getUTCMonth() - 1), to: monthStart(py.getUTCFullYear(), py.getUTCMonth()) };
  }
  return { key: k, from: new Date(now.getTime() - 30 * day), to };
}

/** Período inmediatamente anterior de igual duración (para comparar). */
export function previousRange(from: Date, to: Date) {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: from };
}
