"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { AnyClient } from "./types";

let client: AnyClient | null = null;

export function createClient(): AnyClient {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!) as AnyClient;
  return client;
}
