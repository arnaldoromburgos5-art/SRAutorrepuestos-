export type Compat = "confirmed" | "unverified" | "incompatible";

export type CatalogItem = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  brand_name: string | null;
  brand_slug: string | null;
  category_name: string | null;
  category_slug: string | null;
  final_price: number;
  list_price: number;
  discount_percent: number;
  available: number;
  image_url: string | null;
  is_universal: boolean;
  variant_label: string | null;
  popularity: number;
  compatibility: Compat | null;
  total_count?: number;
};

export type VehicleSelection = {
  versionId: string;
  year: number;
  label: string;
  makeId?: string;
  modelId?: string;
};

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  is_featured: boolean;
  sort: number;
};

export type Brand = { id: string; name: string; slug: string; country: string | null; is_featured: boolean; logo_url: string | null };

export type CartLine = {
  productId: string;
  quantity: number;
  name: string;
  slug: string;
  sku: string;
  price: number;
  image: string | null;
};

export type QuoteLine = {
  product_id: string;
  sku: string;
  name: string;
  slug: string;
  brand_name: string | null;
  image_url: string | null;
  unit_price: number;
  original_unit_price: number;
  quantity: number;
  available: number;
  tax_rate: number;
  line_total: number;
  discount: number;
};

export type QuoteError = { code: string; product_id?: string; sku?: string; name?: string; available?: number; message?: string };

export type Quote = {
  lines: QuoteLine[];
  errors: QuoteError[];
  coupon: { code: string; valid: boolean; message: string; discount?: number } | null;
  wholesale?: boolean;
  subtotal: number;
  discount_total: number;
  shipping_cost: number;
  tax_total: number;
  total: number;
};

export type ShippingZone = {
  id: string;
  name: string;
  method: "home" | "agency";
  departments: string[];
  cost: number;
  free_over: number | null;
  eta: string | null;
};

export type OrderStatus = "pending_payment" | "paid" | "preparing" | "shipped" | "delivered" | "cancelled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Pendiente de pago",
  paid: "Pagado",
  preparing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export const DELIVERY_LABELS = {
  pickup: "Retiro en el local",
  home: "Envío a domicilio",
  agency: "Envío por agencia",
} as const;

export const PY_DEPARTMENTS = [
  "Asunción", "Central", "Alto Paraná", "Itapúa", "Cordillera", "Paraguarí", "Guairá", "Caaguazú", "Caazapá",
  "Misiones", "Ñeembucú", "Amambay", "Canindeyú", "Presidente Hayes", "Concepción", "San Pedro", "Alto Paraguay",
  "Boquerón",
] as const;
