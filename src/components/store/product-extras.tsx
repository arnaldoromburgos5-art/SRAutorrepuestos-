"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Heart, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribeBackInStock, toggleFavorite } from "@/app/(store)/actions";
import { trackEvent, useStore } from "./store-context";

export function Gallery({ images, name }: { images: { url: string; alt: string | null }[]; name: string }) {
  const [active, setActive] = useState(0);
  const list = images.length ? images : [{ url: "/placeholders/motor.svg", alt: name }];
  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-ink-100 bg-white">
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0">
            <Image src={list[active].url} alt={list[active].alt ?? name} fill priority sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          </motion.div>
        </AnimatePresence>
      </div>
      {list.length > 1 ? (
        <div className="flex gap-2">
          {list.map((img, i) => (
            <button
              key={img.url + i}
              onClick={() => setActive(i)}
              className={cn("relative size-20 overflow-hidden rounded-xl border-2 bg-white", i === active ? "border-accent-500" : "border-transparent")}
              aria-label={`Imagen ${i + 1}`}
            >
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => trackEvent("product_view", { product_id: productId }), [productId]);
  return null;
}

export function openChat(message?: string) {
  window.dispatchEvent(new CustomEvent("sr:open-chat", { detail: { message } }));
}

export function AskAssistantButton({ productName }: { productName: string }) {
  const { vehicle } = useStore();
  return (
    <button
      onClick={() =>
        openChat(
          vehicle
            ? `¿El producto "${productName}" sirve para mi ${vehicle.label}?`
            : `Tengo una consulta sobre "${productName}".`,
        )
      }
      className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-accent-600"
    >
      <MessageSquareText className="size-4" /> Consultar con el asistente
    </button>
  );
}

export function FavoriteButton({ productId, initial, loggedIn }: { productId: string; initial: boolean; loggedIn: boolean }) {
  const [fav, setFav] = useState(initial);
  const [pending, start] = useTransition();
  const { toast } = useStore();
  return (
    <button
      onClick={() => {
        if (!loggedIn) {
          toast("Ingresá para guardar favoritos", { label: "Ingresar", href: "/cuenta/ingresar" });
          return;
        }
        start(async () => {
          const res = await toggleFavorite(productId);
          if (res.ok) setFav(res.data ?? false);
        });
      }}
      disabled={pending}
      className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700 hover:text-accent-600"
      aria-pressed={fav}
    >
      <Heart className={cn("size-4", fav && "fill-accent-500 text-accent-500")} /> {fav ? "En favoritos" : "Guardar"}
    </button>
  );
}

export function BackInStockForm({ productId, defaultEmail }: { productId: string; defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 rounded-xl border border-ink-200 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await subscribeBackInStock(productId, email);
          setMsg(res.ok ? "Listo: te avisamos por correo cuando vuelva a estar disponible." : res.error);
        });
      }}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Bell className="size-4 text-accent-500" /> Avisame cuando haya stock
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          className="h-10 min-w-0 flex-1 rounded-lg border border-ink-200 px-3 text-sm"
        />
        <button disabled={pending} className="h-10 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white disabled:opacity-60">
          Avisarme
        </button>
      </div>
      {msg ? <p className="text-xs text-ink-600">{msg}</p> : null}
    </form>
  );
}
