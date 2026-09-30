"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, PlugZap, Trash2, XCircle } from "lucide-react";
import { removeAiSettingsAction, saveAiSettingsAction, testAiSettingsAction } from "@/app/admin/ai-actions";
import type { ActionResult } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { btnGhost, btnPrimary, inputCls } from "./ui";

type Provider = "gemini" | "nvidia";
type Info = { company: string; product: string; url: string; prefix: string; defaultModel: string; free: boolean };

function Msg({ state }: { state: ActionResult | null | undefined }) {
  if (!state) return null;
  return state.ok ? (
    <p className="flex items-start gap-2 text-sm text-ok-600"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{state.message}</p>
  ) : (
    <p className="flex items-start gap-2 text-sm text-bad-600"><XCircle className="mt-0.5 size-4 shrink-0" />{state.error}</p>
  );
}

export function AiSettingsForm({
  providers,
  status,
}: {
  providers: Record<Provider, Info>;
  status: { provider: Provider; model: string; source: "panel" | "env"; keyHint: string } | null;
}) {
  const [provider, setProvider] = useState<Provider>(status?.provider ?? "gemini");
  const [saved, saveAction, saving] = useActionState(saveAiSettingsAction, undefined);
  const [test, setTest] = useState<ActionResult | null>(null);
  const [testing, startTest] = useTransition();
  const [removing, startRemove] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const info = providers[provider];
  const sameAsSaved = status?.provider === provider;

  return (
    <div className="space-y-5">
      {status ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ok-50 px-4 py-3 text-sm text-ok-600">
          <CheckCircle2 className="size-4" />
          Activo: <strong>{providers[status.provider].company} {providers[status.provider].product}</strong> · modelo {status.model} · clave {status.keyHint}
          <span className="text-ink-500">({status.source === "panel" ? "cargada en el panel" : "cargada en el servidor"})</span>
        </div>
      ) : (
        <div className="rounded-xl bg-warn-50 px-4 py-3 text-sm text-warn-600">
          Todavía no hay clave: el chat de la tienda y el asistente del panel no van a responder hasta que cargues una.
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">1. Elegí la empresa de tu clave (sólo estas son válidas)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(providers) as Provider[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setProvider(p); setTest(null); }}
              className={cn("rounded-xl border-2 p-4 text-left transition-colors", provider === p ? "border-accent-500 bg-accent-50" : "border-ink-100 hover:border-ink-300")}
              aria-pressed={provider === p}
            >
              <span className="block font-display text-lg font-bold">{providers[p].company}</span>
              <span className="block text-sm text-ink-600">{providers[p].product}</span>
              <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold", providers[p].free ? "bg-ok-50 text-ok-600" : "bg-ink-100 text-ink-600")}>
                {providers[p].free ? "Tiene opción gratis" : "Pago"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <form ref={formRef} action={saveAction} className="space-y-4">
        <input type="hidden" name="provider" value={provider} />
        <div className="rounded-xl bg-ink-50 p-4 text-sm">
          <p className="font-semibold">2. Conseguí tu clave de {info.company}</p>
          <p className="text-ink-600">
            Entrá a{" "}
            <a href={info.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent-600">
              {info.url.replace("https://", "")} <ExternalLink className="size-3" />
            </a>
            , creá una clave y copiala. Suele empezar con <code className="rounded bg-white px-1">{info.prefix}</code>
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" /> 3. Pegá la clave</span>
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={sameAsSaved ? `Ya hay una clave guardada (${status?.keyHint}). Dejalo vacío para conservarla.` : "Pegá acá tu clave"}
            className={inputCls}
          />
          <span className="text-xs text-ink-400">Se guarda cifrada y nunca se vuelve a mostrar completa.</span>
        </label>
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-500">Opciones avanzadas (modelo)</summary>
          <label className="mt-2 block space-y-1.5">
            <span className="text-xs font-semibold text-ink-600">Modelo</span>
            <input name="model" defaultValue={sameAsSaved ? status?.model : ""} placeholder={info.defaultModel} className={inputCls} />
            <span className="text-xs text-ink-400">Dejalo vacío para usar el recomendado: {info.defaultModel}</span>
          </label>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={() => startTest(async () => setTest(await testAiSettingsAction(new FormData(formRef.current!))))}
            className={btnGhost}
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />} Probar conexión
          </button>
          <button disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Guardar
          </button>
          {status?.source === "panel" ? (
            <button
              type="button"
              disabled={removing}
              onClick={() => window.confirm("¿Quitar la clave? El asistente dejará de responder.") && startRemove(async () => { setTest(await removeAiSettingsAction()); })}
              className="inline-flex items-center gap-1 text-sm text-bad-600"
            >
              <Trash2 className="size-4" /> Quitar clave
            </button>
          ) : null}
        </div>
        <Msg state={test} />
        <Msg state={saved} />
      </form>
    </div>
  );
}
