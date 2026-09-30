import { NextResponse } from "next/server";
import { z } from "zod";
import { PermissionError } from "@/lib/auth";
import { staffContext } from "@/lib/services/context";
import { executeAiAction, type AiAction } from "@/lib/ai/admin-actions";
import { friendlyDbError } from "@/lib/utils";

const MAX_AGE_MS = 24 * 3600 * 1000;

// Confirmación humana de una acción propuesta por el asistente.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = z.object({ decision: z.enum(["confirm", "reject"]) }).safeParse(await request.json().catch(() => null));
  if (!body.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  let ctx;
  try {
    ctx = await staffContext("admin_ai");
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // RLS: sólo se ven las acciones propias.
  const { data: action } = await ctx.supabase.from("ai_actions").select("*").eq("id", id).eq("requested_by", ctx.profile.id).maybeSingle();
  if (!action) return NextResponse.json({ error: "Acción no encontrada" }, { status: 404 });
  if (action.status !== "pending") return NextResponse.json({ error: "Esta acción ya fue resuelta.", status: action.status }, { status: 409 });

  // Se marca como tomada antes de ejecutar para evitar dobles confirmaciones.
  const claim = await ctx.supabase
    .from("ai_actions")
    .update({ status: body.data.decision === "reject" ? "rejected" : "executed", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (!claim.data?.length) return NextResponse.json({ error: "Esta acción ya fue resuelta." }, { status: 409 });

  if (body.data.decision === "reject") return NextResponse.json({ status: "rejected" });

  if (Date.now() - new Date(action.created_at).getTime() > MAX_AGE_MS) {
    await ctx.supabase.from("ai_actions").update({ status: "expired", error: "Propuesta vencida (más de 24 h)" }).eq("id", id);
    return NextResponse.json({ error: "La propuesta venció. Pedile al asistente que la prepare de nuevo." }, { status: 410 });
  }

  try {
    const result = await executeAiAction(ctx, action as AiAction);
    await ctx.supabase.from("ai_actions").update({ result: (result ?? null) as never }).eq("id", id);
    return NextResponse.json({ status: "executed", result });
  } catch (e) {
    const message = e instanceof PermissionError ? e.message : friendlyDbError((e as Error).message);
    await ctx.supabase.from("ai_actions").update({ status: "failed", error: message }).eq("id", id);
    return NextResponse.json({ status: "failed", error: message }, { status: 422 });
  }
}
