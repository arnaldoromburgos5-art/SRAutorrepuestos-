import Link from "next/link";
import { CreditCard, MapPin, ShieldCheck, Truck } from "lucide-react";
import type { PublicSettings } from "@/lib/catalog";
import type { Category } from "@/lib/types";
import { Logo } from "./ui";

export function Footer({ settings, categories }: { settings: PublicSettings; categories: Category[] }) {
  const s = settings.store;
  return (
    <footer className="mt-16 bg-ink-900 text-ink-300">
      <div className="border-b border-ink-800">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShieldCheck, title: "Compatibilidad verificada", text: "Te decimos si el repuesto es confirmado, pendiente o no compatible." },
            { icon: Truck, title: "Envíos a todo el país", text: "Domicilio en Asunción y Central, agencia al interior." },
            { icon: MapPin, title: "Retiro en el local", text: "Sin costo, te avisamos cuando esté listo." },
            { icon: CreditCard, title: "Pago con tarjeta", text: "Crédito y débito. Precios con IVA incluido." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-6 shrink-0 text-accent-500" aria-hidden />
              <div>
                <p className="font-semibold text-white">{title}</p>
                <p className="text-sm">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
        <div className="space-y-3">
          <Logo light />
          <p className="text-sm">{s.address}</p>
          {s.hours ? <p className="text-sm">{s.hours}</p> : null}
          {s.email ? (
            <a href={`mailto:${s.email}`} className="block text-sm hover:text-white">
              {s.email}
            </a>
          ) : null}
        </div>
        <div>
          <p className="mb-3 font-display text-lg font-semibold text-white">Categorías</p>
          <ul className="space-y-1.5 text-sm">
            {categories
              .filter((c) => !c.parent_id)
              .slice(0, 8)
              .map((c) => (
                <li key={c.id}>
                  <Link href={`/catalogo?categoria=${c.slug}`} className="hover:text-white">
                    {c.name}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 font-display text-lg font-semibold text-white">Ayuda</p>
          <ul className="space-y-1.5 text-sm">
            <li><Link href="/p/envios" className="hover:text-white">Envíos y retiro</Link></li>
            <li><Link href="/p/garantia" className="hover:text-white">Garantía</Link></li>
            <li><Link href="/p/devoluciones" className="hover:text-white">Cambios y devoluciones</Link></li>
            <li><Link href="/p/terminos" className="hover:text-white">Términos y condiciones</Link></li>
            <li><Link href="/p/privacidad" className="hover:text-white">Privacidad</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-display text-lg font-semibold text-white">Tu cuenta</p>
          <ul className="space-y-1.5 text-sm">
            <li><Link href="/cuenta/pedidos" className="hover:text-white">Mis pedidos</Link></li>
            <li><Link href="/cuenta/vehiculos" className="hover:text-white">Mis vehículos</Link></li>
            <li><Link href="/cuenta/favoritos" className="hover:text-white">Favoritos</Link></li>
            <li><Link href="/cuenta/listas" className="hover:text-white">Listas para talleres</Link></li>
          </ul>
          {settings.currency.note ? <p className="mt-4 text-xs text-ink-400">{settings.currency.note}</p> : null}
        </div>
      </div>
      <div className="border-t border-ink-800 py-4 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} {s.name}. Precios en guaraníes con IVA incluido.
      </div>
    </footer>
  );
}
