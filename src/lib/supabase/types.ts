import type { SupabaseClient } from "@supabase/supabase-js";

// Sin tipos generados del esquema: las filas se tipan manualmente en cada consulta.
// Para generarlos: npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, any, any>;
