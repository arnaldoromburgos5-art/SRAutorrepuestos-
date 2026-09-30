import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/permissions";
import { signOut } from "../auth-actions";

const LINKS = [
  { href: "/cuenta", label: "Mis datos" },
  { href: "/cuenta/pedidos", label: "Pedidos" },
  { href: "/cuenta/direcciones", label: "Direcciones" },
  { href: "/cuenta/vehiculos", label: "Vehículos" },
  { href: "/cuenta/favoritos", label: "Favoritos" },
  { href: "/cuenta/listas", label: "Listas de compra" },
  { href: "/cuenta/nueva-clave", label: "Contraseña" },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">Hola{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</p>
          <h1 className="font-display text-4xl font-bold uppercase">Mi cuenta</h1>
        </div>
        <div className="flex items-center gap-3">
          {isStaffRole(profile.role) ? (
            <Link href="/admin" className="rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white">
              Ir al panel
            </Link>
          ) : null}
          <form action={signOut}>
            <button className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold hover:bg-white">Salir</button>
          </form>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-white hover:text-ink-900">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
