import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatPyg } from "@/lib/money";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { formatDate, orderNumber } from "@/lib/utils";
import { addCustomerNoteAction, setWholesaleAction } from "../../actions";
import { ActionButton, ActionForm } from "@/components/admin/action-form";
import { Badge, Card, PageHeader, Table, btnGhost, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requirePermission("customers.read");
  const { data: c } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const canNotes = can(profile.role, "customers.notes");
  const [{ data: orders }, { data: vehicles }, { data: addresses }, { data: notes }] = await Promise.all([
    supabase.from("orders").select("id, number, status, total, created_at").or(`user_id.eq.${id},email.eq.${(c.email ?? "").toLowerCase()}`).order("created_at", { ascending: false }).limit(50),
    supabase.from("customer_vehicles").select("id, year, vehicle_versions(engine, vehicle_models(name, vehicle_makes(name)))").eq("user_id", id),
    supabase.from("addresses").select("*").eq("user_id", id),
    canNotes ? supabase.from("customer_notes").select("id, note, created_at, profiles!customer_notes_author_id_fkey(full_name)").eq("customer_id", id).order("created_at", { ascending: false }) : { data: [] },
  ]);
  const paid = (orders ?? []).filter((o) => !["cancelled", "pending_payment"].includes(o.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.full_name ?? c.email ?? "Cliente"}
        description={`Cliente desde ${formatDate(c.created_at)}`}
        actions={<Link href="/admin/clientes" className="text-sm font-semibold text-ink-600">← Clientes</Link>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Contacto">
          <p className="text-sm">{c.email}</p>
          <p className="text-sm">{c.phone ?? "Sin teléfono"}</p>
          {c.document_number ? <p className="text-sm">{c.document_type} {c.document_number}</p> : null}
          {c.business_name ? <p className="text-sm">Razón social: {c.business_name}</p> : null}
          <p className="mt-2 text-xs text-ink-500">{c.marketing_consent ? "Acepta comunicaciones comerciales." : "No aceptó comunicaciones comerciales."}</p>
          <div className="mt-3 flex items-center gap-2">
            {c.is_wholesale ? <Badge tone="accent">Mayorista</Badge> : <Badge>Minorista</Badge>}
            {can(profile.role, "customers.write") ? (
              <ActionButton action={setWholesaleAction.bind(null, c.id, !c.is_wholesale)} className={btnGhost} confirm={c.is_wholesale ? "¿Quitar precios mayoristas?" : "¿Habilitar precios mayoristas para este cliente?"}>
                {c.is_wholesale ? "Quitar mayorista" : "Habilitar mayorista"}
              </ActionButton>
            ) : null}
          </div>
        </Card>
        <Card title="Resumen">
          <p className="font-display text-3xl font-bold">{formatPyg(paid.reduce((s, o) => s + o.total, 0))}</p>
          <p className="text-sm text-ink-500">{paid.length} pedidos pagados</p>
        </Card>
        <Card title="Vehículos guardados">
          <ul className="space-y-1 text-sm">
            {(vehicles ?? []).map((v) => {
              const vv = v.vehicle_versions as unknown as { engine: string; vehicle_models: { name: string; vehicle_makes: { name: string } } };
              return <li key={v.id}>{vv.vehicle_models.vehicle_makes.name} {vv.vehicle_models.name} {v.year} · {vv.engine}</li>;
            })}
            {!vehicles?.length ? <li className="text-ink-400">Sin vehículos.</li> : null}
          </ul>
        </Card>
      </div>

      <Card title="Historial de compras">
        <Table>
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:text-accent-600">{orderNumber(o.number)}</Link></td>
                <td className="text-xs text-ink-500">{formatDate(o.created_at)}</td>
                <td>{ORDER_STATUS_LABELS[o.status as OrderStatus]}</td>
                <td className="text-right tabular-nums">{formatPyg(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Direcciones">
          <ul className="space-y-2 text-sm">
            {(addresses ?? []).map((a) => <li key={a.id}><strong>{a.label}:</strong> {a.street}, {a.city}, {a.department}</li>)}
            {!addresses?.length ? <li className="text-ink-400">Sin direcciones guardadas.</li> : null}
          </ul>
        </Card>
        {canNotes ? (
          <Card title="Notas internas" actions={<span className="flex items-center gap-1 text-xs text-ink-400"><Lock className="size-3" /> Acceso restringido</span>}>
            <ActionForm action={addCustomerNoteAction} submitLabel="Agregar nota" resetOnSuccess>
              <input type="hidden" name="customer_id" value={c.id} />
              <textarea name="note" required rows={2} className={`${inputCls} h-auto py-2`} placeholder="Sólo visible para el equipo" />
            </ActionForm>
            <ul className="mt-4 space-y-2 text-sm">
              {(notes ?? []).map((n) => (
                <li key={n.id} className="rounded-lg bg-ink-50 p-3">
                  <p>{n.note}</p>
                  <p className="mt-1 text-xs text-ink-400">{formatDate(n.created_at, true)} · {(n.profiles as unknown as { full_name: string | null } | null)?.full_name ?? ""}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
