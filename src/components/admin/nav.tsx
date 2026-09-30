"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Bot, Boxes, Car, ClipboardList, FileSpreadsheet, Home, Megaphone, Menu, Package, Settings,
  ShieldCheck, Store, Tag, Truck, UserCog, Users, X, type LucideIcon,
} from "lucide-react";
import { can, ROLE_LABELS, type Permission, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/store/ui";

type Item = { href: string; label: string; icon: LucideIcon; perm?: Permission };

// Todas las secciones, siempre visibles, agrupadas por tarea y con nombres simples.
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Día a día",
    items: [
      { href: "/admin", label: "Inicio", icon: Home },
      { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList, perm: "orders.read" },
      { href: "/admin/asistente", label: "Asistente IA", icon: Bot, perm: "ai.admin" },
    ],
  },
  {
    title: "Mis productos",
    items: [
      { href: "/admin/productos", label: "Productos", icon: Package, perm: "products.read" },
      { href: "/admin/inventario", label: "Stock", icon: Boxes, perm: "inventory.read" },
      { href: "/admin/importar", label: "Carga desde Excel", icon: FileSpreadsheet, perm: "products.write" },
      { href: "/admin/proveedores", label: "Proveedores", icon: Truck, perm: "suppliers.manage" },
      { href: "/admin/vehiculos", label: "Vehículos", icon: Car, perm: "vehicles.manage" },
    ],
  },
  {
    title: "Ventas",
    items: [
      { href: "/admin/clientes", label: "Clientes", icon: Users, perm: "customers.read" },
      { href: "/admin/promociones", label: "Ofertas y cupones", icon: Tag, perm: "promotions.manage" },
      { href: "/admin/reportes", label: "Reportes", icon: BarChart3, perm: "analytics.read" },
    ],
  },
  {
    title: "Mi tienda",
    items: [
      { href: "/admin/contenido", label: "Portada y páginas", icon: Megaphone, perm: "content.manage" },
      { href: "/admin/configuracion", label: "Datos del negocio", icon: Settings, perm: "settings.manage" },
      { href: "/admin/usuarios", label: "Usuarios", icon: UserCog, perm: "users.manage" },
      { href: "/admin/auditoria", label: "Historial de cambios", icon: ShieldCheck, perm: "audit.read" },
    ],
  },
];

function NavLink({ item, active, onNavigate, big }: { item: Item; active: boolean; onNavigate?: () => void; big?: boolean }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 transition-colors",
        big ? "py-2.5 text-[15px]" : "py-2 text-sm",
        active ? "bg-accent-500 font-semibold text-white" : "text-ink-300 hover:bg-ink-800 hover:text-white",
      )}
    >
      <item.icon className={big ? "size-5" : "size-4"} />
      {item.label}
    </Link>
  );
}

function Links({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  return (
    <nav className="space-y-4">
      {GROUPS.map((g) => {
        const items = g.items.filter((n) => !n.perm || can(role, n.perm));
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{g.title}</p>
            <div className="space-y-0.5">
              {items.map((i) => <NavLink key={i.href} item={i} active={isActive(i.href)} onNavigate={onNavigate} big />)}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AdminSidebar({ role, name }: { role: Role; name: string }) {
  const [open, setOpen] = useState(false);
  const footer = (
    <div className="border-t border-ink-800 p-4 text-xs text-ink-400">
      <p className="truncate font-semibold text-ink-200">{name}</p>
      <p>{ROLE_LABELS[role]}</p>
      <Link href="/" className="mt-3 flex items-center gap-2 rounded-lg bg-ink-800 px-3 py-2 font-semibold text-white hover:bg-ink-700">
        <Store className="size-4" /> Ver mi tienda
      </Link>
    </div>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-ink-900 lg:flex">
        <Link href="/admin" className="px-4 py-5">
          <Logo light />
        </Link>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
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
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              <Links role={role} onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </aside>
        </div>
      ) : null}
    </>
  );
}
