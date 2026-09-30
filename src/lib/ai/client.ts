import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

let client: Anthropic | null = null;

export function anthropic() {
  client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return client;
}

export const isAiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export function effort(value: string | undefined, fallback: Effort): Effort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max" ? value : fallback;
}

export type MessageParam = Anthropic.Beta.BetaMessageParam;
export type ContentBlock = Anthropic.Beta.BetaContentBlock;
export type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

/** Definición de herramienta con validación de entrada y ejecutor del lado del servidor. */
export type ToolSpec<Ctx> = {
  name: string;
  description: string;
  input_schema: Anthropic.Beta.BetaTool.InputSchema;
  parse: ZodType;
  run: (input: never, ctx: Ctx) => Promise<unknown>;
};

export function defineTool<Ctx, S extends ZodType>(spec: {
  name: string;
  description: string;
  input_schema: Anthropic.Beta.BetaTool.InputSchema;
  parse: S;
  run: (input: S["_output"], ctx: Ctx) => Promise<unknown>;
}): ToolSpec<Ctx> {
  return spec as unknown as ToolSpec<Ctx>;
}

/**
 * Bucle de uso de herramientas. El historial es de sólo agregado: todo lo que se envía
 * (incluidos los bloques de razonamiento devueltos) se conserva tal cual para el siguiente turno.
 */
export async function runToolLoop<Ctx>(opts: {
  system: string;
  history: MessageParam[];
  tools: ToolSpec<Ctx>[];
  ctx: Ctx;
  effort: Effort;
  maxIterations?: number;
}): Promise<{ appended: MessageParam[]; text: string; stopReason: string | null }> {
  const appended: MessageParam[] = [];
  const toolDefs = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  let text = "";
  let stopReason: string | null = null;

  for (let i = 0; i < (opts.maxIterations ?? 8); i++) {
    const response = await anthropic().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [...opts.history, ...appended],
      tools: toolDefs,
      output_config: { effort: opts.effort },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    stopReason = response.stop_reason;
    appended.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
    text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use") {
      // Una llamada cortada (refusal / max_tokens) nunca se ejecuta, pero el historial debe quedar válido.
      if (uses.length) {
        appended.push({
          role: "user",
          content: uses.map((u) => ({ type: "tool_result" as const, tool_use_id: u.id, is_error: true, content: "No ejecutado." })),
        });
      }
      if (response.stop_reason === "refusal") {
        text = "Disculpá, no puedo ayudarte con eso. Si tenés una consulta sobre repuestos o tu pedido, contame.";
      }
      if (response.stop_reason === "pause_turn") continue;
      break;
    }

    const results: ToolResult[] = await Promise.all(
      uses.map(async (use): Promise<ToolResult> => {
        const tool = opts.tools.find((t) => t.name === use.name);
        if (!tool) return { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Herramienta desconocida: ${use.name}` };
        const parsed = tool.parse.safeParse(use.input);
        if (!parsed.success) {
          return { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Parámetros inválidos: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}` };
        }
        try {
          const out = await tool.run(parsed.data as never, opts.ctx);
          return { type: "tool_result", tool_use_id: use.id, content: JSON.stringify(out) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: use.id, is_error: true, content: (e as Error).message.slice(0, 500) };
        }
      }),
    );
    appended.push({ role: "user", content: results });
  }
  return { appended, text, stopReason };
}

export function describeAiError(e: unknown) {
  if (e instanceof Anthropic.RateLimitError) return "El asistente está muy solicitado. Probá de nuevo en un minuto.";
  if (e instanceof Anthropic.AuthenticationError) return "El asistente no está configurado correctamente (clave de API).";
  if (e instanceof Anthropic.APIError) return "El asistente no está disponible en este momento.";
  return "Ocurrió un error inesperado con el asistente.";
}
