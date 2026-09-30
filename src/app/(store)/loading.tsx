import { SkeletonTransition } from "@/components/page-transition";

// Silueta de la página mientras el servidor prepara el contenido (aparece al instante al navegar).
export default function StoreLoading() {
  return (
    <SkeletonTransition>
      <main className="mx-auto max-w-7xl px-4 py-8" aria-busy="true" aria-label="Cargando">
        <div className="skeleton mb-2 h-4 w-40 rounded" />
        <div className="skeleton mb-8 h-10 w-72 rounded-lg" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-ink-100 bg-white">
              <div className="skeleton aspect-square" />
              <div className="space-y-2 p-4">
                <div className="skeleton h-3 w-1/3 rounded" />
                <div className="skeleton h-4 w-5/6 rounded" />
                <div className="skeleton h-6 w-1/2 rounded" />
                <div className="skeleton h-10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </SkeletonTransition>
  );
}
