import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/admin/ui";
import { AdminAssistantChat } from "@/components/admin/assistant";

export const metadata = { title: "Asistente IA" };

export default async function AssistantPage() {
  await requirePermission("ai.admin");
  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      <PageHeader title="Asistente administrativo" description="Consultas, borradores y cambios con confirmación. Usa tus permisos y registra cada acción." />
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-ink-100 bg-ink-50 shadow-card">
        <AdminAssistantChat className="flex-1" />
      </div>
    </div>
  );
}
