"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { requestPasswordReset, signIn, signUp, updatePassword, type AuthState } from "@/app/(store)/cuenta/auth-actions";

const input = "h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm focus:border-accent-500";

function Feedback({ state }: { state: AuthState }) {
  if (!state) return null;
  return state.error ? (
    <p className="rounded-lg bg-bad-50 p-3 text-sm text-bad-600">{state.error}</p>
  ) : state.message ? (
    <p className="rounded-lg bg-ok-50 p-3 text-sm text-ok-600">{state.message}</p>
  ) : null;
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button disabled={pending} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent-500 font-semibold text-white hover:bg-accent-600 disabled:opacity-60">
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function LoginForm({ next, error }: { next?: string; error?: string }) {
  const [state, action, pending] = useActionState(signIn, error === "enlace" ? { error: "El enlace venció o no es válido." } : undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/cuenta"} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Correo electrónico</span>
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Contraseña</span>
        <input name="password" type="password" required autoComplete="current-password" className={input} />
      </label>
      <Feedback state={state} />
      <Submit pending={pending}>Ingresar</Submit>
      <div className="flex justify-between text-sm">
        <Link href="/cuenta/recuperar" className="text-ink-500 hover:text-ink-900">¿Olvidaste tu contraseña?</Link>
        <Link href={`/cuenta/registro${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-accent-600">Crear cuenta</Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Nombre y apellido</span>
        <input name="full_name" required autoComplete="name" className={input} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Correo electrónico</span>
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Teléfono (opcional)</span>
        <input name="phone" autoComplete="tel" className={input} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Contraseña</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      <Feedback state={state} />
      <Submit pending={pending}>Crear cuenta</Submit>
      <p className="text-center text-sm text-ink-500">
        ¿Ya tenés cuenta? <Link href="/cuenta/ingresar" className="font-semibold text-accent-600">Ingresá</Link>
      </p>
    </form>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Correo electrónico</span>
        <input name="email" type="email" required className={input} />
      </label>
      <Feedback state={state} />
      <Submit pending={pending}>Enviar enlace</Submit>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Nueva contraseña</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      <Feedback state={state} />
      <Submit pending={pending}>Guardar contraseña</Submit>
    </form>
  );
}
