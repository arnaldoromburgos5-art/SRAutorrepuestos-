"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Bot, Boxes, Car, ClipboardList, FileSpreadsheet, Gauge, Megaphone, Menu, Package, Settings, ShieldCheck,
  Tag, Truck, Users, UserCog, X, type LucideIcon,
} from "lucide-react";
import { can, ROLE_LABELS, type Permission, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/store/ui";

const NAV: { href: string; label: string; icon: LucideIcon; perm?: Permission; group: string }[] = [
  { href: "/admin", label: "Resumen", icon: Gauge, group: "General" },
  { href: "/admin/asistente", label: "Asistente IA", icon: Bot, perm: "ai.admin", group: "General" },
  { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, perm: "orders.read", group: "Ventas" },
  { href: "/admin/clientes", label: "Clientes", icon: Users, perm: "customers.read", group: "Ventas" },
  { href: "/admin/promociones", label: "Promociones", icon: Tag, perm: "promotions.manage", group: "Ventas" },
  { href: "/admin/productos", label: "Productos", icon: Package, perm: "products.read", group: "Catálogo" },
  { href: "/admin/importar", label: "Importar / exportar", icon: FileSpreadsheet, perm: "products.write", group: "Catálogo" },
  { href: "/admin/inventario", label: "Inventario", icon: Boxes, perm: "inventory.read", group: "Catálogo" },
  { href: "/admin/proveedores", label: "Proveedores", icon: Truck, perm: "suppliers.manage", group: "Catálogo" },
  { href: "/admin/vehiculos", label: "Vehículos", icon: Car, perm: "vehicles.manage", group: "Catálogo" },
  { href: "/admin/contenido", label: "Contenido", icon: Megaphone, perm: "content.manage", group: "Tienda" },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3, perm: "analytics.read", group: "Tienda" },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings, perm: "settings.manage", group: "Sistema" },
  { href: "/admin/usuarios", label: "Usuarios y roles", icon: UserCog, perm: "users.manage", group: "Sistema" },
  { href: "/admin/auditoria", label: "Auditoría", icon: ShieldCheck, perm: "audit.read", group: "Sistema" },
];

function Links({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => !n.perm || can(role, n.perm));
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <nav className="space-y-5">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{g}</p>
          <ul className="space-y-0.5">
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active ? "bg-accent-500 font-semibold text-white" : "text-ink-300 hover:bg-ink-800 hover:text-white",
                      )}
                    >
                      <i.icon className="size-4" />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebar({ role, name }: { role: Role; name: string }) {
  const [open, setOpen] = useState(false);
  const footer = (
    <div className="border-t border-ink-800 p-4 text-xs text-ink-400">
      <p className="truncate font-semibold text-ink-200">{name}</p>
      <p>{ROLE_LABELS[role]}</p>
      <Link href="/" className="mt-2 inline-block text-accent-400 hover:text-accent-100">
        Ver tienda →
      </Link>
    </div>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-ink-900 lg:flex">
        <Link href="/admin" className="px-4 py-5">
          <Logo light />
        </Link>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <Links role={role} />
        </div>
        {footer}
      </aside>
      <div className="sticky top-0 z-40 flex items-center justify-between bg-ink-900 px-4 py-3 lg:hidden">
        <Logo light />
        <button onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg text-white hover:bg-ink-800" aria-label="Menú">
          <Menu className="size-5" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-ink-950/60" onClick={() => setOpen(false)} aria-label="Cerrar menú" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink-900">
            <div className="flex items-center justify-between p-4">
              <Logo light />
              <button onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-lg text-white hover:bg-ink-800" aria-label="Cerrar">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <Links role={role} onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </aside>
        </div>
      ) : null}
    </>
  );
}
