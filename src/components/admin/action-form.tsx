"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { ActionResult } from "@/lib/utils";
import { cn } from "@/lib/utils";

type FormAction = (prev: ActionResult | undefined, form: FormData) => Promise<ActionResult>;

/** Formulario ligado a una server action con estado de envío y resultado visible. */
export function ActionForm({
  action,
  children,
  className,
  submitLabel = "Guardar",
  submitClassName,
  resetOnSuccess = false,
  confirm,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  submitLabel?: string;
  submitClassName?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60",
            submitClassName,
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </button>
        <ResultMessage state={state} />
      </div>
    </form>
  );
}

export function ResultMessage({ state }: { state: ActionResult<unknown> | undefined | null }) {
  if (!state) return null;
  return state.ok ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-ok-600">
      <CheckCircle2 className="size-4" /> {state.message ?? "Guardado."}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-bad-600">
      <XCircle className="size-4" /> {state.error}
    </span>
  );
}

/** Botón que ejecuta una server action sin formulario (con confirmación opcional). */
export function ActionButton({
  action,
  children,
  className,
  confirm,
}: {
  action: () => Promise<ActionResult<unknown> | void>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setState(r ?? null);
          });
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {children}
      </button>
      {state && !state.ok ? <ResultMessage state={state} /> : null}
    </span>
  );
}
