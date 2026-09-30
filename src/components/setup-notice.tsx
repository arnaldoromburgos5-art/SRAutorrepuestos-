export function SetupNotice() {
  return (
    <main className="bg-speed grid min-h-dvh place-items-center px-4 text-white">
      <div className="max-w-lg space-y-4 rounded-2xl border border-ink-700 bg-ink-900/80 p-8 backdrop-blur">
        <h1 className="font-display text-3xl font-bold">SR Autorrepuestos: falta la configuración</h1>
        <p className="text-ink-300">
          La tienda necesita una base de datos Supabase. Copiá <code className="rounded bg-ink-800 px-1.5">.env.example</code> como{" "}
          <code className="rounded bg-ink-800 px-1.5">.env.local</code>, completá las claves y aplicá las migraciones.
        </p>
        <p className="text-sm text-ink-400">Los pasos completos están en el archivo README.md del proyecto.</p>
      </div>
    </main>
  );
}
