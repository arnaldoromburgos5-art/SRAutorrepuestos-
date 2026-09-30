import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { AnyClient } from "./types";

/** Cliente con la sesión del usuario: todas las consultas respetan RLS. */
export async function createClient(): Promise<AnyClient> {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy renueva la sesión.
        }
      },
    },
  }) as AnyClient;
}
