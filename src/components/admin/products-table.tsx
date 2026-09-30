"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatPyg } from "@/lib/money";
import { bulkPriceAction, setStatusAction } from "@/app/admin/actions";
import { Badge, Table, btnGhost } from "./ui";

type Row = {
  id: string; sku: string; name: string; status: "draft" | "published" | "archived"; brand_name: string | null; category_name: string | null;
  price: number; final_price: number; available: number; min_stock: number; image_url: string | null;
};

const STATUS = { draft: ["Borrador", "neutral"], published: ["Publicado", "ok"], archived: ["Archivado", "warn"] } as const;

export function ProductsTable({ rows, canPublish, canWrite, canPrice }: { rows: Row[]; canPublish: boolean; canWrite: boolean; canPrice: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [percent, setPercent] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const all = rows.length > 0 && selected.length === rows.length;

  function act(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.ok ? r.message ?? "Listo." : r.error ?? "Error" });
      if (r.ok) {
        setSelected([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {selected.length && canWrite ? (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-ink-900 p-3 text-sm text-white shadow-lift lg:top-2">
          <span className="font-semibold">{selected.length} seleccionados</span>
          {canPublish ? (
            <button className="rounded-lg bg-ok-600 px-3 py-1.5 font-semibold" onClick={() => act(() => setStatusAction(selected, "published"), `¿Publicar ${selected.length} productos?`)}>
              Publicar
            </button>
          ) : null}
          <button className="rounded-lg bg-ink-700 px-3 py-1.5" onClick={() => act(() => setStatusAction(selected, "draft"))}>Pasar a borrador</button>
          <button className="rounded-lg bg-ink-700 px-3 py-1.5" onClick={() => act(() => setStatusAction(selected, "archived"), "¿Archivar los productos seleccionados?")}>
            Archivar
          </button>
          {canPrice ? (
            <span className="flex items-center gap-1.5">
              <input
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="% ej. 5 o -10"
                className="h-8 w-28 rounded-lg border-0 px-2 text-ink-900"
                inputMode="decimal"
              />
              <button
                className="rounded-lg bg-accent-500 px-3 py-1.5 font-semibold"
                onClick={() => {
                  const p = Number(percent.replace(",", "."));
                  if (!p) return setMessage({ ok: false, text: "Ingresá un porcentaje." });
                  act(() => bulkPriceAction(selected, p), `Vas a cambiar el precio de ${selected.length} productos un ${p} % (redondeo a 500 Gs.). ¿Confirmás?`);
                }}
              >
                Ajustar precio
              </button>
            </span>
          ) : null}
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          <button className="ml-auto text-ink-300 hover:text-white" onClick={() => setSelected([])}>Limpiar</button>
        </div>
      ) : null}
      {message ? <p className={`text-sm ${message.ok ? "text-ok-600" : "text-bad-600"}`}>{message.text}</p> : null}
      <Table>
        <thead>
          <tr>
            <th className="w-8">
              <input type="checkbox" checked={all} onChange={() => setSelected(all ? [] : rows.map((r) => r.id))} aria-label="Seleccionar todos" className="accent-accent-500" />
            </th>
            <th>Producto</th>
            <th>Estado</th>
            <th>Categoría</th>
            <th className="text-right">Precio</th>
            <th className="text-right">Disponible</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                  aria-label={`Seleccionar ${r.sku}`}
                  className="accent-accent-500"
                />
              </td>
              <td>
                <Link href={`/admin/productos/${r.id}`} className="flex items-center gap-3">
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                    {r.image_url ? <Image src={r.image_url} alt="" fill sizes="40px" className="object-cover" /> : null}
                  </span>
                  <span>
                    <span className="block font-medium hover:text-accent-600">{r.name}</span>
                    <span className="text-xs text-ink-400">{r.sku} · {r.brand_name ?? "Sin marca"}</span>
                  </span>
                </Link>
              </td>
              <td><Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge></td>
              <td className="text-ink-500">{r.category_name ?? "—"}</td>
              <td className="text-right tabular-nums">
                {formatPyg(r.final_price)}
                {r.final_price < r.price ? <span className="block text-xs text-ink-400 line-through">{formatPyg(r.price)}</span> : null}
              </td>
              <td className={`text-right tabular-nums ${r.available <= r.min_stock ? "font-semibold text-warn-600" : ""}`}>{r.available}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!rows.length ? <p className="text-center text-sm text-ink-500">No hay productos con esos filtros.</p> : null}
      <p className="text-xs text-ink-400">
        Los cambios de estado y precio quedan registrados en la auditoría. <Link href="/admin/auditoria" className={btnGhost + " h-auto border-0 p-0 text-xs"}>Ver auditoría</Link>
      </p>
    </div>
  );
}
