import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { lowStock } from "@/lib/services/operations";
import { formatDate, normalizeCode } from "@/lib/utils";
import { adjustStockAction } from "../actions";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, Card, Field, PageHeader, Table, btnGhost, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Inventario" };

const TYPES: Record<string, string> = {
  initial: "Stock inicial", purchase_in: "Entrada", sale_out: "Venta", reservation: "Reserva", release: "Liberación",
  adjustment: "Ajuste", return_in: "Devolución",
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; producto?: string }> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requirePermission("inventory.read");
  const ctx = { supabase, profile, source: "admin_ui" as const };

  let stockQuery = supabase.from("catalog_products").select("id, sku, name, available, min_stock, status").neq("status", "archived").order("name").limit(60);
  if (sp.q) {
    const q = sp.q.replace(/[%,()]/g, " ").trim();
    stockQuery = stockQuery.or(`name.ilike.%${q}%,search_codes.ilike.%${normalizeCode(q)}%`);
  }
  let movQuery = supabase.from("stock_movements").select("id, type, quantity, on_hand_after, reserved_after, reason, created_at, source, products(sku, name), profiles(full_name)").order("id", { ascending: false }).limit(50);
  if (sp.producto) movQuery = movQuery.eq("product_id", sp.producto);

  const [low, { data: stock }, { data: movements }, { data: levels }, { data: selected }] = await Promise.all([
    lowStock(ctx, 30),
    stockQuery,
    movQuery,
    supabase.from("stock_levels").select("product_id, on_hand, reserved"),
    sp.producto ? supabase.from("products").select("id, sku, name").eq("id", sp.producto).maybeSingle() : { data: null },
  ]);
  const levelMap = new Map((levels ?? []).map((l) => [l.product_id as string, l as { on_hand: number; reserved: number }]));
  const canAdjust = can(profile.role, "inventory.adjust");

  return (
    <div className="space-y-6">
      <PageHeader title="Inventario" description="Existencias, reservas y movimientos. Cada ajuste requiere motivo y queda auditado." />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card title={`Bajo el mínimo (${low.length})`}>
          {low.length ? (
            <Table>
              <thead><tr><th>Producto</th><th className="text-right">Físico</th><th className="text-right">Reservado</th><th className="text-right">Disponible</th><th className="text-right">Mínimo</th><th /></tr></thead>
              <tbody>
                {low.map((p) => (
                  <tr key={p.product_id}>
                    <td><span className="font-medium">{p.name}</span><span className="block text-xs text-ink-400">{p.sku}</span></td>
                    <td className="text-right tabular-nums">{p.on_hand}</td>
                    <td className="text-right tabular-nums">{p.reserved}</td>
                    <td className="text-right font-semibold tabular-nums text-warn-600">{p.available}</td>
                    <td className="text-right tabular-nums">{p.min_stock}</td>
                    <td><Link href={`/admin/inventario?producto=${p.product_id}`} className="text-sm font-semibold text-accent-600">Reponer</Link></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-ink-500">Nada por reponer.</p>
          )}
        </Card>

        {canAdjust ? (
          <Card title="Registrar movimiento">
            <ActionForm action={adjustStockAction} submitLabel="Registrar" resetOnSuccess>
              <div className="space-y-3">
                <Field label="Producto">
                  <select name="product_id" defaultValue={selected?.id ?? ""} required className={inputCls}>
                    <option value="">Elegí un producto</option>
                    {selected ? <option value={selected.id}>{selected.sku} · {selected.name}</option> : null}
                    {(stock ?? []).filter((s) => s.id !== selected?.id).map((s) => <option key={s.id} value={s.id}>{s.sku} · {s.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tipo">
                    <select name="type" className={inputCls}>
                      <option value="purchase_in">Entrada (compra)</option>
                      <option value="adjustment">Ajuste</option>
                    </select>
                  </Field>
                  <Field label="Sentido">
                    <select name="direction" className={inputCls}>
                      <option value="in">Suma (+)</option>
                      <option value="out">Resta (−)</option>
                    </select>
                  </Field>
                </div>
                <Field label="Cantidad">
                  <input name="quantity" type="number" min={1} required className={inputCls} />
                </Field>
                <Field label="Motivo" hint="Obligatorio: p. ej. Factura 001-001-0001234, rotura, conteo físico.">
                  <input name="reason" required minLength={3} className={inputCls} />
                </Field>
              </div>
            </ActionForm>
          </Card>
        ) : null}
      </div>

      <Card title="Existencias">
        <form className="mb-3 flex gap-2">
          <input name="q" defaultValue={sp.q} placeholder="Buscar producto o código" className={`${inputCls} max-w-xs`} />
          <button className={btnGhost}>Buscar</button>
        </form>
        <Table>
          <thead><tr><th>Producto</th><th>Estado</th><th className="text-right">Físico</th><th className="text-right">Reservado</th><th className="text-right">Disponible</th><th className="text-right">Mínimo</th><th /></tr></thead>
          <tbody>
            {(stock ?? []).map((s) => {
              const l = levelMap.get(s.id);
              return (
                <tr key={s.id}>
                  <td><span className="font-medium">{s.name}</span><span className="block text-xs text-ink-400">{s.sku}</span></td>
                  <td><Badge tone={s.status === "published" ? "ok" : "neutral"}>{s.status === "published" ? "Publicado" : "Borrador"}</Badge></td>
                  <td className="text-right tabular-nums">{l?.on_hand ?? 0}</td>
                  <td className="text-right tabular-nums">{l?.reserved ?? 0}</td>
                  <td className={`text-right tabular-nums ${s.available <= s.min_stock ? "font-semibold text-warn-600" : ""}`}>{s.available}</td>
                  <td className="text-right tabular-nums">{s.min_stock}</td>
                  <td><Link href={`/admin/inventario?producto=${s.id}`} className="text-xs font-semibold text-accent-600">Movimientos</Link></td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card title={selected ? `Movimientos de ${selected.sku}` : "Últimos movimientos"}>
        <Table>
          <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th className="text-right">Cantidad</th><th className="text-right">Físico / Reserv.</th><th>Motivo</th><th>Usuario</th></tr></thead>
          <tbody>
            {(movements ?? []).map((m) => {
              const p = m.products as unknown as { sku: string; name: string } | null;
              const u = m.profiles as unknown as { full_name: string | null } | null;
              return (
                <tr key={m.id}>
                  <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(m.created_at, true)}</td>
                  <td className="text-xs">{p?.sku}</td>
                  <td><Badge tone={m.quantity < 0 ? "warn" : "neutral"}>{TYPES[m.type] ?? m.type}</Badge></td>
                  <td className="text-right tabular-nums">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                  <td className="text-right tabular-nums text-ink-500">{m.on_hand_after} / {m.reserved_after}</td>
                  <td className="text-xs">{m.reason}</td>
                  <td className="text-xs text-ink-500">{u?.full_name ?? (m.source === "webhook" ? "Pasarela" : "Sistema")}{m.source === "admin_ai" ? " (IA)" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
