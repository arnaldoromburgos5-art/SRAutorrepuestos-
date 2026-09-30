// Espejo de public.role_permissions() en la base de datos. La base es la autoridad final (RLS);
// esto se usa para ocultar opciones del panel y validar antes de llamar.

export type Role = "customer" | "owner" | "admin" | "catalog_manager" | "order_operator" | "analyst";

export type Permission =
  | "products.read"
  | "products.write"
  | "products.publish"
  | "prices.write"
  | "inventory.read"
  | "inventory.adjust"
  | "suppliers.manage"
  | "vehicles.manage"
  | "orders.read"
  | "orders.manage"
  | "customers.read"
  | "customers.write"
  | "customers.notes"
  | "promotions.manage"
  | "content.manage"
  | "analytics.read"
  | "settings.manage"
  | "users.manage"
  | "audit.read"
  | "ai.admin";

const ALL: Permission[] = [
  "products.read", "products.write", "products.publish", "prices.write", "inventory.read", "inventory.adjust",
  "suppliers.manage", "vehicles.manage", "orders.read", "orders.manage", "customers.read", "customers.write",
  "customers.notes", "promotions.manage", "content.manage", "analytics.read", "settings.manage", "users.manage",
  "audit.read", "ai.admin",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== "users.manage"),
  catalog_manager: [
    "products.read", "products.write", "products.publish", "prices.write", "inventory.read", "inventory.adjust",
    "suppliers.manage", "vehicles.manage", "content.manage", "ai.admin",
  ],
  order_operator: ["products.read", "inventory.read", "orders.read", "orders.manage", "customers.read", "customers.notes", "ai.admin"],
  analyst: ["products.read", "inventory.read", "orders.read", "customers.read", "analytics.read", "ai.admin"],
  customer: [],
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Propietario",
  admin: "Administrador",
  catalog_manager: "Encargado de catálogo",
  order_operator: "Operador de pedidos",
  analyst: "Analista",
  customer: "Cliente",
};

export function can(role: Role | null | undefined, permission: Permission) {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

export const isStaffRole = (role: Role | null | undefined) => !!role && role !== "customer";
