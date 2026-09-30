/** Aparición progresiva en CSS (visible sin JavaScript; respeta prefers-reduced-motion en globals.css). */
export function FadeIn({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`animate-fade-up ${className ?? ""}`} style={{ animationDelay: `${Math.round(delay * 1000)}ms` }}>
      {children}
    </div>
  );
}
