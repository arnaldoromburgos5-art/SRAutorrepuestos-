"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, ensure, staffContext } from "@/lib/services/context";
import { AI_PROVIDERS, deleteAiConfig, getAiConfig, storeAiConfig, type AiConfig } from "@/lib/ai/config";
import { testAiConnection } from "@/lib/ai/client";
import type { ActionResult } from "@/lib/utils";

const schema = z.object({
  provider: z.enum(["gemini", "nvidia", "anthropic"]),
  apiKey: z.string().trim().max(400).optional(),
  model: z.string().trim().max(120).optional(),
});

function parse(form: FormData) {
  return schema.parse({ provider: form.get("provider"), apiKey: form.get("apiKey") || undefined, model: form.get("model") || undefined });
}

export async function saveAiSettingsAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await staffContext();
    ensure(ctx, "settings.manage");
    const input = parse(form);
    await storeAiConfig(input, ctx.profile.id);
    // Nunca se registra la clave en la auditoría.
    await audit(ctx, "settings.ai", "settings", "ai", null, { provider: input.provider, model: input.model || AI_PROVIDERS[input.provider].defaultModel, key_changed: Boolean(input.apiKey) });
    revalidatePath("/admin/configuracion");
    return { ok: true, message: `Guardado: el asistente usa ${AI_PROVIDERS[input.provider].company} ${AI_PROVIDERS[input.provider].product}.` };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? "Revisá los datos." : (e as Error).message };
  }
}

/** Prueba la clave del formulario (o la guardada, si el campo está vacío) sin guardarla. */
export async function testAiSettingsAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await staffContext();
    ensure(ctx, "settings.manage");
    const input = parse(form);
    let ai: AiConfig | null = null;
    if (input.apiKey) {
      ai = { provider: input.provider, apiKey: input.apiKey, model: input.model || AI_PROVIDERS[input.provider].defaultModel, source: "panel" };
    } else {
      const current = await getAiConfig();
      if (current && current.provider === input.provider) ai = { ...current, model: input.model || current.model };
    }
    if (!ai) return { ok: false, error: "Pegá una clave para probarla." };
    const r = await testAiConnection(ai);
    return r.ok ? { ok: true, message: `¡Funciona! Respondió “${r.reply}” (modelo ${r.model}).` } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeAiSettingsAction(): Promise<ActionResult> {
  try {
    const ctx = await staffContext();
    ensure(ctx, "settings.manage");
    await deleteAiConfig();
    await audit(ctx, "settings.ai_removed", "settings", "ai", null, null);
    revalidatePath("/admin/configuracion");
    return { ok: true, message: "Clave eliminada del panel." };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
