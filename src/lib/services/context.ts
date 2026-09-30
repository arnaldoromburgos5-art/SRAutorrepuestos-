import "server-only";
import type { Profile } from "@/lib/auth";
import { PermissionError, getSession } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import type { AnyClient } from "@/lib/supabase/types";

/**
 * Contexto de ejecución de las operaciones administrativas. Siempre usa la sesión del
 * usuario (RLS activo): ni el panel ni el asistente de IA pueden superar sus permisos.
 */
export type ServiceCtx = {
  supabase: AnyClient;
  profile: Profile;
  source: "admin_ui" | "admin_ai" | "import";
};

export function ensure(ctx: ServiceCtx, permission: Permission) {
  if (!can(ctx.profile.role, permission)) throw new PermissionError(permission);
}

export async function staffContext(source: ServiceCtx["source"] = "admin_ui"): Promise<ServiceCtx> {
  const { supabase, profile } = await getSession();
  if (!profile || profile.role === "customer") throw new PermissionError("products.read");
  return { supabase, profile, source };
}

export async function audit(
  ctx: ServiceCtx,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
  meta?: unknown,
) {
  await ctx.supabase.rpc("write_audit", {
    p_source: ctx.source,
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId,
    p_before: before ?? null,
    p_after: after ?? null,
    p_meta: meta ?? null,
  });
}
