import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function formatDate(value: string | Date | null | undefined, withTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Asuncion",
  }).format(new Date(value));
}

export const orderNumber = (n: number | string) => `SR-${String(n).padStart(6, "0")}`;

/** Traduce errores de Postgres/Supabase a mensajes comprensibles. */
export function friendlyDbError(message: string | undefined | null): string {
  if (!message) return "Ocurrió un error inesperado.";
  if (message.includes("PERMISSION_DENIED") || message.includes("row-level security"))
    return "No tenés permiso para realizar esta acción.";
  if (message.startsWith("INSUFFICIENT_STOCK")) return `No hay stock suficiente (${message.split(":")[1] ?? ""}).`;
  if (message.startsWith("INVALID_TRANSITION")) return "Ese cambio de estado no es válido para el pedido.";
  if (message.startsWith("CANNOT_CANCEL")) return "El pedido ya fue despachado o cancelado; registrá una devolución.";
  if (message.startsWith("STOCK_BELOW_RESERVED"))
    return `El stock no puede quedar por debajo de lo reservado (${message.split(":")[1]} u.).`;
  if (message.includes("REASON_REQUIRED")) return "Indicá el motivo.";
  if (message.includes("INVALID_RETURN_QUANTITY")) return "La cantidad a devolver supera lo comprado.";
  if (message.includes("RETURN_REQUIRES_DELIVERED_ORDER")) return "Sólo se registran devoluciones de pedidos enviados o entregados.";
  if (message.includes("duplicate key") && message.includes("sku")) return "Ya existe un producto con ese SKU.";
  if (message.includes("duplicate key") && message.includes("slug")) return "Ya existe un producto con esa URL.";
  if (message.includes("duplicate key")) return "Ya existe un registro con esos datos.";
  return message;
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
