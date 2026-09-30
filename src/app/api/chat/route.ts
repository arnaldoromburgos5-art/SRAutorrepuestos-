import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getVehicleSelection } from "@/lib/catalog";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/admin";
import { describeAiError, effort, isAiConfigured, runToolLoop, type MessageParam } from "@/lib/ai/client";
import { SHOPPER_SYSTEM, shopperTools, type ShopperCtx } from "@/lib/ai/shopper";

export const maxDuration = 60;

const MAX_MESSAGES = 80;

const bodySchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  sessionId: z.string().min(8).max(64),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "El asistente todavía no está configurado." }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mensaje inválido" }, { status: 400 });
  const { message, sessionId } = parsed.data;

  const ip = await clientIp();
  if (!(await rateLimit(`chat:ip:${ip}`, 30, 600)) || !(await rateLimit(`chat:s:${sessionId}`, 20, 600))) {
    return NextResponse.json({ error: "Enviaste muchos mensajes seguidos. Esperá unos minutos o escribinos por WhatsApp." }, { status: 429 });
  }

  const [{ supabase, user }, vehicle] = await Promise.all([getSession(), getVehicleSelection()]);
  const db = createServiceClient();

  // Conversación: se reutiliza sólo si pertenece a esta sesión/usuario.
  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const { data: conv } = await db.from("ai_conversations").select("id, session_id, user_id, kind, message_count").eq("id", conversationId).maybeSingle();
    const owns = conv && conv.kind === "shopper" && (conv.session_id === sessionId || (user && conv.user_id === user.id));
    if (!owns) conversationId = null;
    else if (conv.message_count >= MAX_MESSAGES) {
      return NextResponse.json({ error: "La conversación es muy larga. Empezá una nueva desde el menú del chat.", reset: true }, { status: 409 });
    }
  }
  if (!conversationId) {
    const { data: created, error } = await db
      .from("ai_conversations")
      .insert({ kind: "shopper", session_id: sessionId, user_id: user?.id ?? null, title: message.slice(0, 80) })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: "No se pudo iniciar la conversación." }, { status: 500 });
    conversationId = created.id as string;
  }

  const { data: rows } = await db.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("id");
  const history: MessageParam[] = (rows ?? []).map((r) => ({ role: r.role as MessageParam["role"], content: r.content }));

  // Contexto del servidor como mensaje de sistema (autoridad del operador, no del usuario).
  const context = [
    `Fecha: ${new Date().toLocaleDateString("es-PY", { timeZone: "America/Asuncion" })}.`,
    vehicle ? `Vehículo seleccionado en la tienda: ${vehicle.label} (version_id ${vehicle.versionId}).` : "La persona no seleccionó vehículo.",
    user ? "La persona inició sesión: podés consultar sus pedidos." : "La persona no inició sesión.",
  ].join(" ");
  const turn: MessageParam[] = [
    { role: "user", content: message },
    { role: "system", content: context },
  ];

  const ctx: ShopperCtx = { db: supabase, userId: user?.id ?? null, vehicle, conversationId, cards: [], cartActions: [], handoff: false };

  try {
    const result = await runToolLoop({
      system: SHOPPER_SYSTEM,
      history: [...history, ...turn],
      tools: shopperTools,
      ctx,
      effort: effort(process.env.SHOPPER_AI_EFFORT, "low"),
      maxIterations: 8,
    });
    const toStore = [...turn, ...result.appended];
    await db.from("ai_messages").insert(toStore.map((m) => ({ conversation_id: conversationId, role: m.role, content: m.content })));
    await db
      .from("ai_conversations")
      .update({ message_count: history.length + toStore.length, updated_at: new Date().toISOString(), user_id: user?.id ?? null })
      .eq("id", conversationId);

    return NextResponse.json({
      conversationId,
      reply: result.text || (ctx.cards.length ? "Te dejo estas opciones:" : "¿Me contás un poco más para ayudarte?"),
      products: ctx.cards,
      cartActions: ctx.cartActions,
      handoff: ctx.handoff,
    });
  } catch (e) {
    console.error("chat", e);
    return NextResponse.json({ error: describeAiError(e), conversationId }, { status: 502 });
  }
}
