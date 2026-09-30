export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid max-w-md px-4 py-12">
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card sm:p-8">{children}</div>
    </main>
  );
}
