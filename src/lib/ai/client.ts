import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError, GoogleGenAI, type Content, type FunctionCall, type Part } from "@google/genai";
import type { ZodType } from "zod";

// ---------------------------------------------------------------------------
// Proveedor de IA: Google Gemini (capa gratuita) o Anthropic Claude.
// AI_PROVIDER=gemini|anthropic. Si no se indica, se usa el que tenga clave cargada (Gemini primero).
// ---------------------------------------------------------------------------
export type AiProvider = "gemini" | "anthropic";

export function aiProvider(): AiProvider | null {
  const explicit = process.env.AI_PROVIDER;
  if (explicit === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (explicit === "anthropic" && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return null;
}

export const isAiConfigured = () => aiProvider() !== null;

const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-3.7-flash";
const ANTHROPIC_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenAI | null = null;
const anthropic = () => (anthropicClient ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }));
const gemini = () => (geminiClient ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export function effort(value: string | undefined, fallback: Effort): Effort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max" ? value : fallback;
}

// ---------------------------------------------------------------------------
// Herramientas (independientes del proveedor)
// ---------------------------------------------------------------------------
export type JsonSchema = { type: "object"; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown };

/** Definición de herramienta con validación de entrada y ejecutor del lado del servidor. */
export type ToolSpec<Ctx> = {
  name: string;
  description: string;
  input_schema: JsonSchema;
  parse: ZodType;
  run: (input: never, ctx: Ctx) => Promise<unknown>;
};

export function defineTool<Ctx, S extends ZodType>(spec: {
  name: string;
  description: string;
  input_schema: JsonSchema;
  parse: S;
  run: (input: S["_output"], ctx: Ctx) => Promise<unknown>;
}): ToolSpec<Ctx> {
  return spec as unknown as ToolSpec<Ctx>;
}

async function executeTool<Ctx>(tools: ToolSpec<Ctx>[], name: string | undefined, input: unknown, ctx: Ctx): Promise<{ ok: boolean; output: string }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, output: `Herramienta desconocida: ${name}` };
  const parsed = tool.parse.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, output: `Parámetros inválidos: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}` };
  }
  try {
    return { ok: true, output: JSON.stringify(await tool.run(parsed.data as never, ctx)) };
  } catch (e) {
    return { ok: false, output: (e as Error).message.slice(0, 500) };
  }
}

// ---------------------------------------------------------------------------
// Historial persistido (tabla ai_messages). Cada proveedor guarda su propio formato;
// una conversación iniciada con otro proveedor no se reutiliza.
// ---------------------------------------------------------------------------
export type StoredMessage = { role: "user" | "assistant" | "system"; content: unknown };

const isGeminiRow = (m: StoredMessage) => typeof m.content === "object" && m.content !== null && "gemini" in (m.content as object);

export function historyMatchesProvider(rows: StoredMessage[]) {
  const provider = aiProvider();
  return rows.every((r) => (provider === "gemini" ? isGeminiRow(r) : !isGeminiRow(r)));
}

type RunOptions<Ctx> = {
  system: string;
  /** Contexto del servidor para este turno (fecha, vehículo, novedades). Tiene autoridad de operador. */
  context: string;
  history: StoredMessage[];
  userText: string;
  tools: ToolSpec<Ctx>[];
  ctx: Ctx;
  effort: Effort;
  maxIterations?: number;
};

/** Ejecuta un turno del asistente con el proveedor configurado. */
export async function runAssistant<Ctx>(opts: RunOptions<Ctx>): Promise<{ toStore: StoredMessage[]; text: string }> {
  const provider = aiProvider();
  if (provider === "gemini") return runGemini(opts);
  if (provider === "anthropic") return runAnthropic(opts);
  throw new Error("No hay proveedor de IA configurado (GEMINI_API_KEY o ANTHROPIC_API_KEY).");
}

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------
async function runGemini<Ctx>(opts: RunOptions<Ctx>) {
  const history: Content[] = opts.history.filter(isGeminiRow).map((r) => (r.content as { gemini: Content }).gemini);
  const appended: Content[] = [{ role: "user", parts: [{ text: opts.userText }] }];
  const functionDeclarations = opts.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema }));
  let text = "";

  for (let i = 0; i < (opts.maxIterations ?? 8); i++) {
    const response = await gemini().models.generateContent({
      model: GEMINI_MODEL(),
      contents: [...history, ...appended],
      config: {
        systemInstruction: `${opts.system}\n\n# Contexto actual (del sistema)\n${opts.context}`,
        tools: [{ functionDeclarations }],
      },
    });
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      text = "Disculpá, no pude responder eso. Si tenés una consulta sobre repuestos o pedidos, contame.";
      break;
    }
    // Se conserva el contenido completo (incluye firmas de razonamiento que Gemini exige de vuelta).
    appended.push({ role: "model", parts: candidate.content.parts });
    text = candidate.content.parts.filter((p: Part) => p.text && !p.thought).map((p: Part) => p.text).join("\n").trim();

    const calls: FunctionCall[] = response.functionCalls ?? [];
    if (!calls.length) break;
    const results = await Promise.all(
      calls.map(async (call) => {
        const r = await executeTool(opts.tools, call.name, call.args, opts.ctx);
        return {
          functionResponse: {
            ...(call.id ? { id: call.id } : {}),
            name: call.name,
            response: r.ok ? { output: safeJson(r.output) } : { error: r.output },
          },
        } satisfies Part;
      }),
    );
    appended.push({ role: "user", parts: results });
  }

  return {
    text,
    toStore: appended.map((c): StoredMessage => ({ role: c.role === "model" ? "assistant" : "user", content: { gemini: c } })),
  };
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

// ---------------------------------------------------------------------------
// Anthropic Claude
// ---------------------------------------------------------------------------
type MessageParam = Anthropic.Beta.BetaMessageParam;
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

async function runAnthropic<Ctx>(opts: RunOptions<Ctx>) {
  // Historial de sólo agregado: el contexto va como mensaje de sistema a mitad de conversación.
  const turn: MessageParam[] = [
    { role: "user", content: opts.userText },
    { role: "system", content: opts.context },
  ];
  const history = opts.history.filter((r) => !isGeminiRow(r)) as MessageParam[];
  const appended: MessageParam[] = [];
  const toolDefs = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema }));
  let text = "";

  for (let i = 0; i < (opts.maxIterations ?? 8); i++) {
    const response = await anthropic().beta.messages.create({
      model: ANTHROPIC_MODEL(),
      max_tokens: 16000,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [...history, ...turn, ...appended],
      tools: toolDefs,
      output_config: { effort: opts.effort },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
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
        appended.push({ role: "user", content: uses.map((u) => ({ type: "tool_result" as const, tool_use_id: u.id, is_error: true, content: "No ejecutado." })) });
      }
      if (response.stop_reason === "refusal") text = "Disculpá, no puedo ayudarte con eso. Si tenés una consulta sobre repuestos o tu pedido, contame.";
      if (response.stop_reason === "pause_turn") continue;
      break;
    }
    const results: ToolResult[] = await Promise.all(
      uses.map(async (use): Promise<ToolResult> => {
        const r = await executeTool(opts.tools, use.name, use.input, opts.ctx);
        return { type: "tool_result", tool_use_id: use.id, content: r.output, ...(r.ok ? {} : { is_error: true }) };
      }),
    );
    appended.push({ role: "user", content: results });
  }
  return { text, toStore: [...turn, ...appended].map((m): StoredMessage => ({ role: m.role, content: m.content })) };
}

export function describeAiError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 429) return "El asistente alcanzó el límite gratuito de consultas por ahora. Probá de nuevo en un minuto.";
    if (e.status === 400 || e.status === 403) return "El asistente no está configurado correctamente (revisá GEMINI_API_KEY y GEMINI_MODEL).";
    return "El asistente no está disponible en este momento.";
  }
  if (e instanceof Anthropic.RateLimitError) return "El asistente está muy solicitado. Probá de nuevo en un minuto.";
  if (e instanceof Anthropic.AuthenticationError) return "El asistente no está configurado correctamente (clave de API).";
  if (e instanceof Anthropic.APIError) return "El asistente no está disponible en este momento.";
  return "Ocurrió un error inesperado con el asistente.";
}
