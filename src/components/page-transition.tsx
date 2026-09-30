import { ViewTransition } from "react";

/**
 * Envuelve el contenido de cada página: al navegar, la página anterior se desvanece
 * y la nueva entra con un leve deslizamiento. Se usa desde template.tsx, que se vuelve
 * a montar en cada navegación (los layouts persisten y no animarían).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

/** Silueta de carga que se desvanece cuando llega el contenido real. */
export function SkeletonTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition exit="skeleton-exit" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
