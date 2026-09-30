"use client";

import { useActionState, useTransition } from "react";
import { Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { PY_DEPARTMENTS, type CatalogItem } from "@/lib/types";
import type { ActionResult } from "@/lib/utils";
import { addAddress, addToList, createList, saveVehicle, updateProfile } from "@/app/(store)/cuenta/account-actions";
import { useStore } from "./store-context";

const input = "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-accent-500";

function Result({ state }: { state: ActionResult | undefined }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-ok-600" : "text-bad-600"}`}>{state.ok ? state.message ?? "Listo." : state.error}</p>;
}

type ProfileData = { full_name: string | null; phone: string | null; document_type: string | null; document_number: string | null; business_name: string | null; email: string | null; marketing_consent?: boolean };

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Nombre y apellido</span>
        <input name="full_name" defaultValue={profile.full_name ?? ""} required className={input} />
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">Correo</span>
        <input value={profile.email ?? ""} disabled className={`${input} bg-ink-50`} />
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">Teléfono</span>
        <input name="phone" defaultValue={profile.phone ?? ""} className={input} />
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">Tipo de documento</span>
        <select name="document_type" defaultValue={profile.document_type ?? "CI"} className={input}>
          <option value="CI">CI</option>
          <option value="RUC">RUC</option>
          <option value="PASAPORTE">Pasaporte</option>
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-medium">Número</span>
        <input name="document_number" defaultValue={profile.document_number ?? ""} className={input} />
      </label>
      <label className="space-y-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Razón social (para facturas)</span>
        <input name="business_name" defaultValue={profile.business_name ?? ""} className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="marketing_consent" defaultChecked={profile.marketing_consent} className="accent-accent-500" />
        Quiero recibir ofertas y recordatorios de mi carrito por correo
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          Guardar
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function AddressForm() {
  const [state, action, pending] = useActionState(addAddress, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input name="label" placeholder="Nombre (Casa, Taller…)" required className={input} />
      <input name="recipient" placeholder="Quién recibe" required className={input} />
      <input name="phone" placeholder="Teléfono" required className={input} />
      <select name="department" className={input} defaultValue="Asunción">
        {PY_DEPARTMENTS.map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
      <input name="city" placeholder="Ciudad / barrio" required className={input} />
      <input name="street" placeholder="Calle y número" required className={input} />
      <input name="reference" placeholder="Referencia (opcional)" className={`${input} sm:col-span-2`} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white">
          <Plus className="size-4" /> Agregar dirección
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function SaveCurrentVehicle() {
  const { vehicle, toast } = useStore();
  const [pending, start] = useTransition();
  if (!vehicle) return <p className="text-sm text-ink-500">Elegí un vehículo en la barra superior para guardarlo en tu cuenta.</p>;
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await saveVehicle({ versionId: vehicle.versionId, year: vehicle.year, nickname: vehicle.label });
          toast(res.ok ? "Vehículo guardado" : res.error);
        })
      }
      className="inline-flex items-center gap-2 rounded-xl bg-accent-500 px-4 py-2.5 text-sm font-semibold text-white"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Guardar {vehicle.label}
    </button>
  );
}

export function UseVehicleButton({ versionId, year, label }: { versionId: string; year: number; label: string }) {
  const { setVehicle, vehicle } = useStore();
  const active = vehicle?.versionId === versionId && vehicle.year === year;
  return (
    <button
      disabled={active}
      onClick={() => setVehicle({ versionId, year, label })}
      className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold hover:border-ink-900 disabled:border-ok-600 disabled:text-ok-600"
    >
      {active ? "En uso" : "Usar para comprar"}
    </button>
  );
}

export function CreateListForm() {
  const [state, action, pending] = useActionState(createList, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="name" placeholder="Ej.: Service Hilux clientes" required className={`${input} max-w-xs`} />
      <button disabled={pending} className="h-11 rounded-xl bg-ink-900 px-4 text-sm font-semibold text-white">
        Crear lista
      </button>
      <Result state={state} />
    </form>
  );
}

export function AddToListForm({ listId }: { listId: string }) {
  const [state, action, pending] = useActionState(addToList, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="list_id" value={listId} />
      <input name="code" placeholder="SKU o código OEM" required className="h-10 w-44 rounded-lg border border-ink-200 px-3 text-sm" />
      <input name="quantity" type="number" min={1} max={99} defaultValue={1} className="h-10 w-20 rounded-lg border border-ink-200 px-3 text-sm" />
      <button disabled={pending} className="h-10 rounded-lg bg-ink-900 px-3 text-sm font-semibold text-white">
        Agregar
      </button>
      <Result state={state} />
    </form>
  );
}

export function AddListToCart({ items }: { items: { item: CatalogItem; quantity: number }[] }) {
  const { addToCart, toast } = useStore();
  const available = items.filter((i) => i.item.available > 0);
  return (
    <button
      disabled={!available.length}
      onClick={() => {
        for (const { item, quantity } of available) {
          addToCart(
            { productId: item.id, name: item.name, slug: item.slug, sku: item.sku, price: Number(item.final_price), image: item.image_url },
            Math.min(quantity, item.available),
          );
        }
        toast(`${available.length} productos agregados`, { label: "Ver carrito", href: "/carrito" });
      }}
      className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-3 py-2 text-sm font-semibold text-white disabled:bg-ink-300"
    >
      <ShoppingCart className="size-4" /> Agregar todo al carrito
    </button>
  );
}

export function DeleteButton({ action, label = "Eliminar" }: { action: () => Promise<void>; label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(action)} disabled={pending} className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-bad-600" aria-label={label}>
      <Trash2 className="size-4" />
    </button>
  );
}
