import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Integración con Bancard vPOS 2.0 (pago con tarjetas en Paraguay).
// Verificá estos detalles con la documentación que Bancard entrega al habilitar el comercio
// (versión del script de checkout, URL de confirmación configurada en el portal y proceso de certificación).

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const amountStr = (pyg: number) => `${Math.round(pyg)}.00`;

function config() {
  const publicKey = process.env.BANCARD_PUBLIC_KEY;
  const privateKey = process.env.BANCARD_PRIVATE_KEY;
  const baseUrl = (process.env.BANCARD_BASE_URL ?? "https://vpos.infonet.com.py:8888").replace(/\/$/, "");
  if (!publicKey || !privateKey) throw new Error("Faltan BANCARD_PUBLIC_KEY / BANCARD_PRIVATE_KEY");
  return { publicKey, privateKey, baseUrl };
}

export function bancardCheckoutScriptUrl() {
  return `${config().baseUrl}/checkout/javascript/dist/bancard-checkout-4.0.0.js`;
}

export async function bancardSingleBuy(input: {
  shopProcessId: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const { publicKey, privateKey, baseUrl } = config();
  const amount = amountStr(input.amount);
  const body = {
    public_key: publicKey,
    operation: {
      token: md5(`${privateKey}${input.shopProcessId}${amount}PYG`),
      shop_process_id: input.shopProcessId,
      currency: "PYG",
      amount,
      additional_data: "",
      description: input.description.slice(0, 20), // Bancard admite descripciones cortas
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    },
  };
  const res = await fetch(`${baseUrl}/vpos/api/0.3/single_buy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { status?: string; process_id?: string; messages?: unknown } | null;
  if (!res.ok || json?.status !== "success" || !json.process_id) {
    throw new Error(`Bancard rechazó el inicio del pago: ${JSON.stringify(json?.messages ?? json)}`);
  }
  return json.process_id;
}

export type BancardConfirmation = {
  operation: {
    token: string;
    shop_process_id: number | string;
    response: "S" | "N";
    response_details?: string;
    amount: string;
    currency: string;
    authorization_number?: string;
    ticket_number?: string;
    response_code?: string;
    response_description?: string;
    extended_response_description?: string;
  };
};

/** Valida la firma de la notificación de confirmación enviada por Bancard. */
export function verifyBancardConfirmation(payload: BancardConfirmation) {
  const { privateKey } = config();
  const op = payload.operation;
  const expected = md5(`${privateKey}${op.shop_process_id}confirm${op.amount}${op.currency}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(op.token ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const bancardAmountToPyg = (amount: string) => Math.round(Number(amount));
