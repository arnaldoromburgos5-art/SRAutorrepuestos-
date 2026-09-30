import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, isStaffRole, type Permission, type Role } from "@/lib/permissions";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  business_name: string | null;
  role: Role;
  is_wholesale: boolean;
};

/** Usuario autenticado y su perfil (una vez por request). */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  return { supabase, user: data.user, profile: (profile as Profile | null) ?? null };
});

export async function requireUser(next = "/cuenta") {
  const session = await getSession();
  if (!session.user || !session.profile) redirect(`/cuenta/ingresar?next=${encodeURIComponent(next)}`);
  return session as typeof session & { profile: Profile };
}

export async function requireStaff() {
  const session = await requireUser("/admin");
  if (!isStaffRole(session.profile.role)) redirect("/cuenta?error=sin-acceso");
  return session;
}

export async function requirePermission(permission: Permission) {
  const session = await requireStaff();
  if (!can(session.profile.role, permission)) redirect("/admin?error=permiso");
  return session;
}

export class PermissionError extends Error {
  constructor(public permission: Permission) {
    super(`No tenés permiso para esta acción (${permission}).`);
  }
}

/** Para server actions y rutas API: lanza en lugar de redirigir. */
export async function assertPermission(permission: Permission) {
  const session = await getSession();
  if (!session.user || !session.profile || !can(session.profile.role, permission)) {
    throw new PermissionError(permission);
  }
  return session as typeof session & { profile: Profile };
}
