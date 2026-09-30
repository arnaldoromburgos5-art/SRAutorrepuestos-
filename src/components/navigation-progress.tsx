"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Barra fina en la parte superior mientras se carga la página siguiente.
 * Se activa al tocar un enlace interno y se completa cuando cambia la URL.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    // La URL cambió: se completa la barra y se oculta.
    setState((s) => (s === "loading" ? "done" : s)); // eslint-disable-line react-hooks/set-state-in-effect
    const t = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 350);
    return () => clearTimeout(t);
  }, [pathname, search]);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]" aria-hidden>
      <div
        className="h-full origin-left bg-accent-500 shadow-[0_0_8px_var(--color-accent-500)]"
        style={
          state === "loading"
            ? { animation: "nav-progress 2.5s cubic-bezier(0.22, 1, 0.36, 1) forwards" }
            : { transform: "scaleX(1)", opacity: 0, transition: "transform 200ms ease-out, opacity 300ms ease-out 150ms" }
        }
      />
    </div>
  );
}
