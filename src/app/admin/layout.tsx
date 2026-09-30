import type { Metadata } from "next";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { can } from "@/lib/permissions";
import { AdminSidebar } from "@/components/admin/nav";
import { AdminAssistantDock } from "@/components/admin/assistant";
import { SetupNotice } from "@/components/setup-notice";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel SR Autorrepuestos" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const { profile } = await requireStaff();
  return (
    <div className="min-h-dvh bg-ink-50 lg:flex">
      <AdminSidebar role={profile.role} name={profile.full_name ?? profile.email ?? "Usuario"} />
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
      {can(profile.role, "ai.admin") ? <AdminAssistantDock /> : null}
    </div>
  );
}
