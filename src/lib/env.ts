// Supabase ofrece claves "anon/service_role" (legacy) o "publishable/secret" (nuevas): se aceptan ambas.
const publicKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL. Copiá .env.example a .env.local y completalo.");
  return url;
}

export function supabaseAnonKey() {
  const key = publicKey();
  if (!key) throw new Error("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY) en .env.local.");
  return key;
}

export function supabaseSecretKey() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en .env.local.");
  return key;
}

export const isSupabaseConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && publicKey());

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
