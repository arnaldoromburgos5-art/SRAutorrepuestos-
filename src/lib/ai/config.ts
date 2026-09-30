import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { supabaseSecretKey } from "@/lib/env";

export type AiProvider = "nvidia" | "gemini" | "anthropic";
export type AiConfig = { provider: AiProvider; apiKey: string; model: string; source: "panel" | "env" };

export const AI_PROVIDERS: Record<AiProvider, { company: string; product: string; url: string; prefix: string; defaultModel: string; free: boolean }> = {
  gemini: { company: "Google", product: "Gemini", url: "https://aistudio.google.com/apikey", prefix: "AIza… o AQ.…", defaultModel: "gemini-3.6-flash", free: true },
  nvidia: { company: "NVIDIA", product: "NIM (build.nvidia.com)", url: "https://build.nvidia.com", prefix: "nvapi-…", defaultModel: "nvidia/nemotron-3-super-120b-a12b", free: true },
  anthropic: { company: "Anthropic", product: "Claude", url: "https://console.anthropic.com", prefix: "sk-ant-…", defaultModel: "claude-opus-5-5", free: false },
};

const SECRET_KEY = "ai";

// Cifrado AES-256-GCM con una clave derivada de la clave secreta del servidor.
function cipherKey() {
  return createHash("sha256").update(`sr-autorrepuestos:ai:${process.env.APP_ENCRYPTION_KEY || supabaseSecretKey()}`).digest();
}
function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}
function decrypt(value: string) {
  const [v, iv, tag, data] = value.split(":");
  if (v !== "v1") throw new Error("Formato desconocido");
  const d = createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

function fromEnv(): AiConfig | null {
  const explicit = process.env.AI_PROVIDER as AiProvider | undefined;
  const keys: Record<AiProvider, string | undefined> = {
    nvidia: process.env.NVIDIA_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  };
  const models: Record<AiProvider, string | undefined> = {
    nvidia: process.env.NVIDIA_MODEL,
    gemini: process.env.GEMINI_MODEL,
    anthropic: process.env.ANTHROPIC_MODEL,
  };
  const provider = explicit && keys[explicit] ? explicit : (["gemini", "nvidia", "anthropic"] as const).find((p) => keys[p]);
  if (!provider) return null;
  return { provider, apiKey: keys[provider]!, model: models[provider] || AI_PROVIDERS[provider].defaultModel, source: "env" };
}

let cache: { at: number; value: AiConfig | null } | null = null;

/** Configuración de IA: primero la cargada en el panel; si no hay, las variables de entorno. */
export async function getAiConfig(): Promise<AiConfig | null> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  let value: AiConfig | null = null;
  try {
    const { data } = await createServiceClient().from("app_secrets").select("value").eq("key", SECRET_KEY).maybeSingle();
    if (data?.value) {
      const parsed = JSON.parse(decrypt(data.value)) as { provider: AiProvider; apiKey: string; model?: string };
      if (parsed.apiKey && parsed.provider in AI_PROVIDERS) {
        value = { provider: parsed.provider, apiKey: parsed.apiKey, model: parsed.model || AI_PROVIDERS[parsed.provider].defaultModel, source: "panel" };
      }
    }
  } catch (e) {
    console.error("No se pudo leer la configuración de IA del panel:", (e as Error).message);
  }
  value ??= fromEnv();
  cache = { at: Date.now(), value };
  return value;
}

export function clearAiConfigCache() {
  cache = null;
}

/** Estado para mostrar en el panel, sin exponer la clave. */
export async function aiStatus() {
  const c = await getAiConfig();
  if (!c) return null;
  return { provider: c.provider, model: c.model, source: c.source, keyHint: `…${c.apiKey.slice(-4)}` };
}

export async function storeAiConfig(input: { provider: AiProvider; apiKey?: string; model?: string }, userId: string) {
  const db = createServiceClient();
  let apiKey = input.apiKey?.trim();
  if (!apiKey) {
    // Sin clave nueva: se conserva la guardada si es del mismo proveedor.
    const current = await getAiConfig();
    if (current?.source === "panel" && current.provider === input.provider) apiKey = current.apiKey;
  }
  if (!apiKey) throw new Error("Pegá la clave de API.");
  const value = encrypt(JSON.stringify({ provider: input.provider, apiKey, model: input.model?.trim() || undefined }));
  const { error } = await db.from("app_secrets").upsert({ key: SECRET_KEY, value, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) {
    if (error.message.includes("app_secrets")) {
      throw new Error("Falta actualizar la base de datos: ejecutá supabase/migrations/20261001000004_app_secrets.sql en el SQL Editor de Supabase.");
    }
    throw new Error(error.message);
  }
  clearAiConfigCache();
}

export async function deleteAiConfig() {
  await createServiceClient().from("app_secrets").delete().eq("key", SECRET_KEY);
  clearAiConfigCache();
}
