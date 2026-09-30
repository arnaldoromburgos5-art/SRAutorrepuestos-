import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { formatPyg } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Badge, PageHeader, Pagination, Table, btnGhost, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Clientes" };
const PAGE = 40;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePermission("customers.read");
  const page = Math.max(1, Number(sp.pagina) || 1);
  let q = supabase
    .from("profiles")
    .select("id, full_name, email, phone, is_wholesale, created_at", { count: "exact" })
    .eq("role", "customer")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.q) {
    const t = sp.q.replace(/[%,()]/g, " ").trim();
    q = q.or(`full_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%,document_number.ilike.%${t}%`);
  }
  const { data: customers, count } = await q;
  const ids = (customers ?? []).map((c) => c.id);
  const { data: orders } = ids.length
    ? await supabase.from("orders").select("user_id, total, status").in("user_id", ids).neq("status", "cancelled").neq("status", "pending_payment")
    : { data: [] };
  const stats = new Map<string, { count: number; total: number }>();
  for (const o of orders ?? []) {
    const s = stats.get(o.user_id) ?? { count: 0, total: 0 };
    stats.set(o.user_id, { count: s.count + 1, total: s.total + o.total });
  }

  return (
    <div>
      <PageHeader title="Clientes" description={`${count ?? 0} clientes registrados. Las compras como invitado se ven en Pedidos.`} />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Nombre, correo, teléfono o documento" className={`${inputCls} max-w-sm`} />
        <button className={btnGhost}>Buscar</button>
      </form>
      <Table>
        <thead><tr><th>Cliente</th><th>Teléfono</th><th>Alta</th><th className="text-right">Pedidos</th><th className="text-right">Total comprado</th></tr></thead>
        <tbody>
          {(customers ?? []).map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/admin/clientes/${c.id}`} className="font-medium hover:text-accent-600">{c.full_name ?? "Sin nombre"}</Link>
                {c.is_wholesale ? <> <Badge tone="accent">Mayorista</Badge></> : null}
                <span className="block text-xs text-ink-400">{c.email}</span>
              </td>
              <td className="text-sm">{c.phone ?? "—"}</td>
              <td className="text-xs text-ink-500">{formatDate(c.created_at)}</td>
              <td className="text-right">{stats.get(c.id)?.count ?? 0}</td>
              <td className="text-right tabular-nums">{formatPyg(stats.get(c.id)?.total ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pages={Math.ceil((count ?? 0) / PAGE)} href={(p) => `/admin/clientes?${new URLSearchParams({ ...(sp as Record<string, string>), pagina: String(p) })}`} />
    </div>
  );
}
