export type Currency = "PYG" | "BRL" | "USD";

export type Rates = { USD: number; BRL: number };

export const DEFAULT_RATES: Rates = { USD: 7800, BRL: 1420 };

export const CURRENCY_LABELS: Record<Currency, string> = {
  PYG: "Guaraníes",
  BRL: "Reales",
  USD: "Dólares",
};

const formatters: Record<Currency, Intl.NumberFormat> = {
  PYG: new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }),
  BRL: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
};

/** Formatea un importe en guaraníes, opcionalmente convertido a otra moneda de referencia. */
export function formatMoney(amountPyg: number, currency: Currency = "PYG", rates: Rates = DEFAULT_RATES) {
  if (currency === "PYG") return `Gs. ${formatters.PYG.format(Math.round(amountPyg))}`;
  const rate = rates[currency];
  if (!rate) return `Gs. ${formatters.PYG.format(Math.round(amountPyg))}`;
  return formatters[currency].format(amountPyg / rate);
}

export const formatPyg = (amount: number) => formatMoney(amount, "PYG");

export function parseCurrency(value: string | undefined | null): Currency {
  return value === "BRL" || value === "USD" ? value : "PYG";
}
