import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { Badge, Card, PageHeader, Pagination, Table } from "@/components/admin/ui";

export const metadata = { title: "Auditoría" };
const PAGE = 50;

const SOURCE: Record<string, [string, "neutral" | "accent" | "dark" | "ok"]> = {
  admin_ui: ["Panel", "neutral"], admin_ai: ["Asistente IA", "accent"], system: ["Sistema", "dark"], webhook: ["Pasarela", "ok"], import: ["Importación", "neutral"],
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ pagina?: string; origen?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePermission("audit.read");
  const page = Math.max(1, Number(sp.pagina) || 1);
  let q = supabase.from("audit_log").select("*, profiles(full_name, email)", { count: "exact" }).order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.origen) q = q.eq("source", sp.origen);
  const [{ data, count }, { data: aiActions }] = await Promise.all([
    q,
    supabase.from("ai_actions").select("id, action_type, summary, status, created_at, error, profiles(full_name)").order("created_at", { ascending: false }).limit(15),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Auditoría" description="Quién hizo qué y cuándo, incluidas las acciones ejecutadas mediante el asistente." />
      <div className="flex flex-wrap gap-1.5">
        {[["", "Todo"], ...Object.entries(SOURCE).map(([k, v]) => [k, v[0]])].map(([k, l]) => (
          <Link key={k} href={k ? `/admin/auditoria?origen=${k}` : "/admin/auditoria"} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${(sp.origen ?? "") === k ? "bg-ink-900 text-white" : "bg-white ring-1 ring-ink-200"}`}>{l}</Link>
        ))}
      </div>
      <Card title="Acciones propuestas por el asistente">
        <Table>
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Resumen</th><th>Estado</th></tr></thead>
          <tbody>
            {(aiActions ?? []).map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(a.created_at, true)}</td>
                <td className="text-sm">{(a.profiles as unknown as { full_name: string | null } | null)?.full_name}</td>
                <td className="font-mono text-xs">{a.action_type}</td>
                <td className="max-w-md text-xs">{a.summary}{a.error ? <span className="block text-bad-600">{a.error}</span> : null}</td>
                <td><Badge tone={a.status === "executed" ? "ok" : a.status === "pending" ? "accent" : a.status === "failed" ? "bad" as never : "neutral"}>{a.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Origen</th><th>Acción</th><th>Entidad</th><th>Cambios</th></tr></thead>
        <tbody>
          {(data ?? []).map((r) => {
            const who = r.profiles as unknown as { full_name: string | null; email: string | null } | null;
            const src = SOURCE[r.source] ?? [r.source, "neutral"];
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(r.created_at, true)}</td>
                <td className="text-sm">{who?.full_name ?? who?.email ?? "Sistema"}{r.actor_role ? <span className="block text-xs text-ink-400">{ROLE_LABELS[r.actor_role as Role]}</span> : null}</td>
                <td><Badge tone={src[1]}>{src[0]}</Badge></td>
                <td className="font-mono text-xs">{r.action}</td>
                <td className="text-xs">{r.entity}{r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ""}</td>
                <td className="max-w-md">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-accent-600">Ver</summary>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-ink-50 p-2 text-[11px]">{JSON.stringify({ antes: r.before, despues: r.after }, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Pagination page={page} pages={Math.ceil((count ?? 0) / PAGE)} href={(p) => `/admin/auditoria?${new URLSearchParams({ ...(sp as Record<string, string>), pagina: String(p) })}`} />
    </div>
  );
}
