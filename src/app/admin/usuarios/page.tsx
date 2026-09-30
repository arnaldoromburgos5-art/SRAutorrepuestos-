import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { ROLE_LABELS, ROLE_PERMISSIONS, type Role } from "@/lib/permissions";
import { staffContext, ensure, audit } from "@/lib/services/context";
import { friendlyDbError, type ActionResult } from "@/lib/utils";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, Card, Field, PageHeader, Table, inputCls } from "@/components/admin/ui";

export const metadata = { title: "Usuarios y roles" };

const ROLES: Role[] = ["owner", "admin", "catalog_manager", "order_operator", "analyst", "customer"];

async function setRole(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  "use server";
  try {
    const ctx = await staffContext();
    ensure(ctx, "users.manage");
    const d = z.object({ email: z.string().trim().email(), role: z.enum(["owner", "admin", "catalog_manager", "order_operator", "analyst", "customer"]) }).parse(Object.fromEntries(form));
    const { data: target } = await ctx.supabase.from("profiles").select("id, role").ilike("email", d.email).maybeSingle();
    if (!target) throw new Error("No hay un usuario registrado con ese correo. Pedile que cree su cuenta primero.");
    if (target.id === ctx.profile.id && d.role !== "owner") throw new Error("No podés quitarte tu propio rol de propietario.");
    const { error } = await ctx.supabase.from("profiles").update({ role: d.role }).eq("id", target.id);
    if (error) throw new Error(error.message);
    await audit(ctx, "user.role", "profile", target.id, { role: target.role }, { role: d.role });
    revalidatePath("/admin/usuarios");
    return { ok: true, message: `Rol actualizado a ${ROLE_LABELS[d.role]}.` };
  } catch (e) {
    return { ok: false, error: friendlyDbError((e as Error).message) };
  }
}

export default async function UsersPage() {
  const { supabase } = await requirePermission("users.manage");
  const { data: staff } = await supabase.from("profiles").select("id, full_name, email, role, updated_at").neq("role", "customer").order("role");
  return (
    <div className="space-y-6">
      <PageHeader title="Usuarios y roles" description="Quién accede al panel y qué puede hacer. El asistente de IA hereda exactamente los permisos de quien lo usa." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card title="Equipo">
          <Table>
            <thead><tr><th>Usuario</th><th>Rol</th></tr></thead>
            <tbody>
              {(staff ?? []).map((u) => (
                <tr key={u.id}><td>{u.full_name ?? "—"}<span className="block text-xs text-ink-400">{u.email}</span></td><td><Badge tone={u.role === "owner" ? "dark" : "neutral"}>{ROLE_LABELS[u.role as Role]}</Badge></td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="Asignar rol">
          <ActionForm action={setRole} submitLabel="Asignar" confirm="¿Confirmás el cambio de rol?">
            <div className="space-y-3">
              <Field label="Correo del usuario" hint="La persona debe haber creado su cuenta en la tienda."><input name="email" type="email" required className={inputCls} /></Field>
              <Field label="Rol">
                <select name="role" className={inputCls}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
      <Card title="Permisos por rol">
        <Table>
          <thead><tr><th>Rol</th><th>Permisos</th></tr></thead>
          <tbody>
            {ROLES.filter((r) => r !== "customer").map((r) => (
              <tr key={r}><td className="font-medium">{ROLE_LABELS[r]}</td><td className="text-xs text-ink-600">{ROLE_PERMISSIONS[r].join(" · ")}</td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
