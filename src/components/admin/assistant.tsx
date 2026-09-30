"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Check, Loader2, Paperclip, RotateCcw, Send, ShieldAlert, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Proposal = { id: string; action_type: string; summary: string; state?: "pending" | "executed" | "rejected" | "failed"; error?: string };
type Msg = { role: "user" | "assistant"; text: string; proposals?: Proposal[]; links?: { label: string; href: string }[]; error?: boolean; file?: string };

const STORAGE = "sr_admin_ai_v1";
const EXAMPLES = [
  "Mostrame los productos con stock por debajo del mínimo",
  "Compará las ventas de este mes con las del anterior",
  "Prepará un descuento del 10 % para la categoría filtros",
  "Mejorá las descripciones de las baterías",
];

function Text({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[-*•] /.test(line);
        const content = line.replace(/^\s*[-*•] /, "").replace(/^#+\s*/, "");
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>));
        if (!line.trim()) return <div key={i} className="h-1" />;
        return bullet ? <p key={i} className="flex gap-2 pl-1"><span className="text-accent-500">•</span><span>{parts}</span></p> : <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

function ProposalCard({ p, onDecide }: { p: Proposal; onDecide: (id: string, d: "confirm" | "reject") => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const state = p.state ?? "pending";
  return (
    <div className={cn("rounded-xl border p-3 text-sm", state === "pending" ? "border-accent-500/40 bg-accent-50" : "border-ink-100 bg-white")}>
      <p className="mb-2 flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent-600" />
        <span><span className="block text-[11px] font-semibold uppercase tracking-wide text-accent-700">Requiere tu confirmación</span>{p.summary}</span>
      </p>
      {state === "pending" ? (
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); await onDecide(p.id, "confirm"); setBusy(false); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Confirmar y aplicar
          </button>
          <button disabled={busy} onClick={() => onDecide(p.id, "reject")} className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold">
            Descartar
          </button>
        </div>
      ) : (
        <p className={cn("text-xs font-semibold", state === "executed" ? "text-ok-600" : state === "failed" ? "text-bad-600" : "text-ink-500")}>
          {state === "executed" ? "✓ Aplicado y registrado en auditoría" : state === "rejected" ? "Descartado" : `No se pudo aplicar: ${p.error}`}
        </p>
      )}
    </div>
  );
}

export function AdminAssistantChat({ className }: { className?: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE) ?? "null");
       
      if (saved) { setMessages(saved.messages ?? []); setConversationId(saved.conversationId ?? null); }
    } catch {}
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE, JSON.stringify({ messages: messages.slice(-50), conversationId })); } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, conversationId]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    const attached = file;
    setInput("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setMessages((m) => [...m, { role: "user", text: content, file: attached?.name }]);
    setSending(true);
    try {
      const form = new FormData();
      form.set("message", content);
      if (conversationId) form.set("conversationId", conversationId);
      if (attached) form.set("file", attached);
      const res = await fetch("/api/admin/assistant", { method: "POST", body: form });
      const data = await res.json();
      if (data.reset) setConversationId(null);
      if (data.conversationId) setConversationId(data.conversationId);
      if (!res.ok) throw Object.assign(new Error(data.error ?? "Error del asistente"), { proposals: data.proposals });
      setMessages((m) => [...m, { role: "assistant", text: data.reply, proposals: data.proposals, links: data.links }]);
      if (data.links?.length) router.refresh();
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: (e as Error).message, error: true, proposals: (e as { proposals?: Proposal[] }).proposals }]);
    } finally {
      setSending(false);
    }
  }

  async function decide(id: string, decision: "confirm" | "reject") {
    const res = await fetch(`/api/admin/assistant/actions/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    const data = await res.json();
    const state: Proposal["state"] = decision === "reject" ? "rejected" : res.ok ? "executed" : "failed";
    setMessages((ms) => ms.map((m) => ({ ...m, proposals: m.proposals?.map((p) => (p.id === id ? { ...p, state, error: data.error } : p)) })));
    if (state === "executed") router.refresh();
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {!messages.length ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl bg-white p-3 shadow-card">
              Puedo consultar ventas, stock, pedidos y productos, crear borradores y preparar cambios. Todo lo que modifique la tienda
              (publicar, precios, inventario, descuentos, pedidos) te lo muestro primero y sólo se aplica si lo confirmás. También podés
              adjuntar un CSV o Excel para revisar qué se puede importar.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(e)} className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs hover:border-accent-500">{e}</button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
            {m.role === "assistant" ? <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-ink-900 text-white"><Bot className="size-4" /></span> : null}
            <div className="max-w-[88%] space-y-2">
              <div className={cn("rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "rounded-tr-sm bg-ink-900 text-white" : "rounded-tl-sm bg-white shadow-card", m.error && "bg-bad-50 text-bad-600")}>
                {m.file ? <p className="mb-1 flex items-center gap-1 text-xs opacity-80"><Paperclip className="size-3" />{m.file}</p> : null}
                <Text text={m.text} />
              </div>
              {m.links?.map((l) => <Link key={l.href} href={l.href} className="block text-xs font-semibold text-accent-600">→ {l.label}</Link>)}
              {m.proposals?.map((p) => <ProposalCard key={p.id} p={p} onDecide={decide} />)}
            </div>
          </motion.div>
        ))}
        {sending ? <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="size-4 animate-spin" /> Consultando datos…</p> : null}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="border-t border-ink-200 bg-white p-3">
        {file ? (
          <p className="mb-2 flex items-center gap-2 text-xs text-ink-600">
            <Paperclip className="size-3.5" /> {file.name}
            <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} aria-label="Quitar archivo"><X className="size-3.5" /></button>
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="grid size-10 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Adjuntar CSV o Excel">
            <Paperclip className="size-4" />
          </button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            rows={1}
            placeholder="Pedile algo al asistente…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-accent-500"
          />
          <button disabled={sending || !input.trim()} className="grid size-10 place-items-center rounded-lg bg-accent-500 text-white disabled:bg-ink-200" aria-label="Enviar"><Send className="size-4" /></button>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-400">
          <span>Actúa con tus permisos. Todo queda en auditoría.</span>
          <button type="button" onClick={() => { setMessages([]); setConversationId(null); }} className="inline-flex items-center gap-1 hover:text-ink-700"><RotateCcw className="size-3" /> Nueva conversación</button>
        </div>
      </form>
    </div>
  );
}

export function AdminAssistantDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/admin/asistente")) return null;
  return (
    <>
      {!open ? (
        <motion.button
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink-900 py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lift ring-2 ring-accent-500/50"
        >
          <Sparkles className="size-4 text-accent-400" /> Asistente
        </motion.button>
      ) : null}
      <AnimatePresence>
        {open ? (
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 38 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-ink-50 shadow-lift"
          >
            <header className="flex items-center justify-between bg-ink-900 px-4 py-3 text-white">
              <p className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-accent-400" /> Asistente administrativo</p>
              <div className="flex items-center gap-2">
                <Link href="/admin/asistente" className="text-xs text-ink-300 hover:text-white">Pantalla completa</Link>
                <button onClick={() => setOpen(false)} aria-label="Cerrar" className="grid size-8 place-items-center rounded-lg hover:bg-ink-800"><X className="size-4" /></button>
              </div>
            </header>
            <AdminAssistantChat className="flex-1" />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
