"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, FlaskConical, Loader2, ShieldCheck } from "lucide-react";

declare global {
  interface Window {
    Bancard?: { Checkout: { createForm: (containerId: string, processId: string, options?: object) => void } };
  }
}

type Props = {
  orderId: string;
  token: string;
  provider: "mock" | "bancard";
  paymentId: string | null;
  processId: string | null;
  scriptUrl: string | null;
};

export function PaymentPanel({ orderId, token, provider, paymentId: initialPayment, processId: initialProcess, scriptUrl }: Props) {
  const router = useRouter();
  const [paymentId, setPaymentId] = useState(initialPayment);
  const [processId, setProcessId] = useState(initialProcess);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/payments/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, token }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "No se pudo iniciar el pago.");
    setPaymentId(data.paymentId);
    setProcessId(data.processId ?? null);
  }

  // Bancard: carga el formulario seguro dentro de un iframe provisto por la pasarela.
  useEffect(() => {
    if (provider !== "bancard" || !processId || !scriptUrl) return;
    const render = () => window.Bancard?.Checkout.createForm("bancard-checkout", processId, {
      styles: { "form-background-color": "#ffffff", "button-background-color": "#ff6124", "button-text-color": "#ffffff" },
    });
    if (window.Bancard) return render();
    const s = document.createElement("script");
    s.src = scriptUrl;
    s.onload = render;
    s.onerror = () => setError("No se pudo cargar el formulario de pago. Revisá tu conexión.");
    document.body.appendChild(s);
  }, [provider, processId, scriptUrl]);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (!initialPayment) void Promise.resolve().then(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- iniciar una sola vez si no hay intento pendiente
  }, []);

  async function simulate(approve: boolean) {
    if (!paymentId) return;
    setBusy(true);
    const res = await fetch("/api/payments/mock/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId, token, approve }),
    });
    const data = await res.json();
    if (data.result === "approved" || data.result === "already_approved") {
      router.push(`/pedido/${orderId}?t=${token}&pagado=1`);
      return;
    }
    setBusy(false);
    setPaymentId(null);
    setError("El pago fue rechazado. Podés intentarlo nuevamente.");
  }

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-xl bg-bad-50 p-3 text-sm text-bad-600">{error}</p> : null}

      {provider === "bancard" ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card">
          {processId ? (
            <div id="bancard-checkout" className="min-h-[420px]" />
          ) : (
            <div className="grid min-h-[200px] place-items-center text-ink-500">
              {busy ? <Loader2 className="size-6 animate-spin" /> : <button onClick={start} className="rounded-xl bg-accent-500 px-5 py-3 font-semibold text-white">Pagar con tarjeta</button>}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
          <div className="flex items-start gap-3 rounded-xl bg-warn-50 p-3 text-sm text-warn-600">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong>Modo de prueba.</strong> Este simulador reemplaza a la pasarela mientras no se configure Bancard
              (<code>PAYMENT_PROVIDER=bancard</code>). No se procesa ningún cobro real.
            </p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-ink-800 to-ink-950 p-5 text-white">
            <CreditCard className="size-7 text-accent-400" />
            <p className="mt-6 font-mono text-lg tracking-widest">•••• •••• •••• 4242</p>
            <p className="mt-2 text-xs text-ink-300">TARJETA DE PRUEBA</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              disabled={busy || !paymentId}
              onClick={() => simulate(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-500 py-3 font-semibold text-white hover:bg-accent-600 disabled:bg-ink-300"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Simular pago aprobado
            </button>
            <button
              disabled={busy || !paymentId}
              onClick={() => simulate(false)}
              className="flex-1 rounded-xl border border-ink-200 py-3 font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"
            >
              Simular rechazo
            </button>
          </div>
          {!paymentId && !busy ? (
            <button onClick={start} className="w-full rounded-xl bg-ink-900 py-3 font-semibold text-white">
              Reintentar pago
            </button>
          ) : null}
        </div>
      )}
      <p className="flex items-center justify-center gap-2 text-xs text-ink-400">
        <ShieldCheck className="size-4" /> Los datos de tu tarjeta los procesa la pasarela; nunca pasan por nuestros servidores.
      </p>
    </div>
  );
}
