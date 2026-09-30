import { SkeletonTransition } from "@/components/page-transition";

export default function AdminLoading() {
  return (
    <SkeletonTransition>
      <div className="space-y-6" aria-busy="true" aria-label="Cargando">
        <div className="space-y-2">
          <div className="skeleton h-9 w-64 rounded-lg" />
          <div className="skeleton h-4 w-96 max-w-full rounded" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
        <div className="skeleton h-72 rounded-xl" />
      </div>
    </SkeletonTransition>
  );
}
