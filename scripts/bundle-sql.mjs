// Une migraciones + datos de demostración en supabase/setup-completo.sql (para pegar en el SQL Editor de Supabase).
// Uso: npm run db:bundle
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
let sql = "-- SR Autorrepuestos: instalación completa (migraciones + datos de demostración).\n" +
  "-- Pegá TODO este archivo en Supabase > SQL Editor > New query y presioná Run. Usar sólo en una base vacía.\n";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  sql += `\n-- ===== ${file} =====\n` + readFileSync(new URL(file, dir), "utf8");
}
sql += "\n-- ===== seed.sql =====\n" + readFileSync(new URL("../supabase/seed.sql", import.meta.url), "utf8");
writeFileSync(new URL("../supabase/setup-completo.sql", import.meta.url), sql);
console.log("supabase/setup-completo.sql generado");
