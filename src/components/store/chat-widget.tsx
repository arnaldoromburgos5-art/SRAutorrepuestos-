"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Loader2, MessageCircle, RotateCcw, Send, ShoppingCart, UserRound, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { sessionId, trackEvent, useStore } from "./store-context";
import { CompatBadge } from "./ui";
import type { Compat } from "@/lib/types";

type Card = {
  id: string; name: string; slug: string; sku: string; brand: string | null; price: number; list_price: number;
  available: number; image: string | null; compatibility: string | null; reason: string;
};
type Msg = { role: "user" | "assistant"; text: string; products?: Card[]; handoff?: boolean; error?: boolean };

const STORAGE = "sr_chat_v1";
const SUGGESTIONS = ["Necesito pastillas de freno", "¿Cuánto sale el envío al interior?", "¿Qué aceite lleva mi motor?", "¿Dónde está mi pedido?"];

/** Texto con **negritas** y saltos de línea, sin HTML. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <p key={i} className={cn(line.trim() === "" ? "h-2" : "")}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
          )}
        </p>
      ))}
    </>
  );
}

function ProductMini({ card }: { card: Card }) {
  const { addToCart, toast, currency, rates } = useStore();
  return (
    <div className="flex gap-3 rounded-xl border border-ink-100 bg-white p-2.5">
      <Link href={`/producto/${card.slug}`} className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-ink-50">
        {card.image ? <Image src={card.image} alt="" fill sizes="64px" className="object-cover" /> : null}
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <Link href={`/producto/${card.slug}`} className="line-clamp-2 text-sm font-medium leading-snug hover:text-accent-600">
          {card.name}
        </Link>
        <p className="text-xs text-ink-500">{card.reason}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-bold">{formatMoney(card.price, currency, rates)}</span>
          {card.compatibility ? <CompatBadge status={card.compatibility as Compat} /> : null}
          {card.available <= 0 ? <span className="text-xs text-bad-600">Sin stock</span> : null}
        </div>
      </div>
      {card.available > 0 ? (
        <button
          onClick={() => {
            addToCart({ productId: card.id, name: card.name, slug: card.slug, sku: card.sku, price: card.price, image: card.image });
            toast(`${card.name} en el carrito`, { label: "Ver carrito", href: "/carrito" });
          }}
          className="grid size-9 shrink-0 place-items-center self-center rounded-lg bg-accent-500 text-white hover:bg-accent-600"
          aria-label={`Agregar ${card.name} al carrito`}
        >
          <ShoppingCart className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function ChatWidget({ storeName }: { storeName: string }) {
  const { addToCart, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null");
       
      if (saved) {
        setMessages(saved.messages ?? []);
        setConversationId(saved.conversationId ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify({ messages: messages.slice(-40), conversationId }));
      if (conversationId) sessionStorage.setItem("sr_chat_conversation", conversationId);
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, conversationId]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const msg = (e as CustomEvent<{ message?: string }>).detail?.message;
      if (msg) setInput(msg);
      setTimeout(() => inputRef.current?.focus(), 250);
    };
    window.addEventListener("sr:open-chat", onOpen);
    return () => window.removeEventListener("sr:open-chat", onOpen);
  }, []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: content }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, sessionId: sessionId(), message: content }),
      });
      const data = await res.json();
      if (data.reset) setConversationId(null);
      if (!res.ok) throw new Error(data.error ?? "No pude responder.");
      setConversationId(data.conversationId);
      for (const a of data.cartActions ?? []) {
        addToCart({ productId: a.product_id, name: a.name, slug: a.slug, sku: a.sku, price: a.price, image: a.image }, a.quantity);
        toast(`${a.quantity} × ${a.name} en el carrito`, { label: "Ver carrito", href: "/carrito" });
      }
      setMessages((m) => [...m, { role: "assistant", text: data.reply, products: data.products, handoff: data.handoff }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: (e as Error).message, error: true }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {!open ? (
          <motion.button
            key="fab"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setOpen(true);
              trackEvent("chat_open");
            }}
            className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-ink-900 py-3 pl-4 pr-5 font-semibold text-white shadow-lift ring-2 ring-accent-500/60"
            aria-label="Abrir asistente"
          >
            <MessageCircle className="size-5 text-accent-400" /> ¿Te ayudo?
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.section
            key="panel"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-ink-50 shadow-lift sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[640px] sm:w-[400px] sm:rounded-2xl"
            aria-label="Asistente de compras"
          >
            <header className="flex items-center gap-3 bg-ink-900 px-4 py-3 text-white">
              <span className="grid size-9 place-items-center rounded-full bg-accent-500">
                <Bot className="size-5" />
              </span>
              <div className="flex-1">
                <p className="font-semibold leading-tight">Asistente {storeName}</p>
                <p className="text-xs text-ink-300">Respuestas con datos reales del catálogo</p>
              </div>
              <button
                onClick={() => {
                  setMessages([]);
                  setConversationId(null);
                  sessionStorage.removeItem("sr_chat_conversation");
                }}
                className="grid size-9 place-items-center rounded-lg text-ink-300 hover:bg-ink-800 hover:text-white"
                aria-label="Nueva conversación"
                title="Nueva conversación"
              >
                <RotateCcw className="size-4" />
              </button>
              <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-ink-300 hover:bg-ink-800 hover:text-white" aria-label="Cerrar">
                <X className="size-5" />
              </button>
            </header>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
              {!messages.length ? (
                <div className="space-y-3">
                  <div className="rounded-2xl rounded-tl-sm bg-white p-3 text-sm shadow-card">
                    ¡Hola! Te ayudo a encontrar repuestos compatibles con tu vehículo, comparar opciones y resolver dudas de envío,
                    garantía o tu pedido. ¿Qué estás buscando?
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium hover:border-accent-500 hover:text-accent-600">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
                  {m.role === "assistant" ? (
                    <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-ink-900 text-white">
                      <Bot className="size-4" />
                    </span>
                  ) : null}
                  <div className={cn("max-w-[85%] space-y-2", m.role === "user" && "items-end")}>
                    <div
                      className={cn(
                        "space-y-1 rounded-2xl px-3 py-2 text-sm",
                        m.role === "user" ? "rounded-tr-sm bg-accent-500 text-white" : "rounded-tl-sm bg-white shadow-card",
                        m.error && "bg-bad-50 text-bad-600",
                      )}
                    >
                      <RichText text={m.text} />
                    </div>
                    {m.products?.map((p) => <ProductMini key={p.id} card={p} />)}
                    {m.handoff ? (
                      <p className="flex items-center gap-2 rounded-xl bg-ink-900 px-3 py-2 text-xs text-white">
                        <UserRound className="size-4 text-accent-400" /> Un vendedor va a continuar la conversación.
                      </p>
                    ) : null}
                  </div>
                </motion.div>
              ))}
              {sending ? (
                <div className="flex items-center gap-2 text-sm text-ink-500">
                  <Loader2 className="size-4 animate-spin" /> Buscando en el catálogo…
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-end gap-2 border-t border-ink-200 bg-white p-3"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="Escribí tu consulta…"
                className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2.5 text-sm focus:border-accent-500"
              />
              <button disabled={sending || !input.trim()} className="grid size-11 place-items-center rounded-xl bg-accent-500 text-white disabled:bg-ink-200" aria-label="Enviar">
                <Send className="size-4" />
              </button>
            </form>
            <p className="bg-white px-3 pb-2 text-center text-[10px] text-ink-400">
              El asistente puede equivocarse. Verificá la compatibilidad en la ficha antes de comprar.
            </p>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </>
  );
}
