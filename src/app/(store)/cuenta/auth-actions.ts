"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export type AuthState = { error?: string; message?: string } | undefined;

const safeNext = (next: FormDataEntryValue | null) => {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/cuenta";
};

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: "Revisá el correo y la contraseña." };
  if (!(await rateLimit(`login:${await clientIp()}`, 10, 300))) return { error: "Demasiados intentos. Esperá unos minutos." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message.includes("confirm") ? "Confirmá tu correo antes de ingresar." : "Correo o contraseña incorrectos." };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      full_name: z.string().trim().min(3, "Ingresá tu nombre."),
      email: z.string().email("Correo inválido."),
      phone: z.string().trim().max(30).optional(),
      password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await rateLimit(`signup:${await clientIp()}`, 5, 3600))) return { error: "Demasiados intentos. Probá más tarde." };
  // La cuenta se crea ya confirmada: la persona entra directo, sin verificar el correo.
  const { error } = await createServiceClient().auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name, phone: parsed.data.phone },
  });
  if (error) {
    const exists = /registered|already|exists/i.test(error.message);
    return { error: exists ? "Ya existe una cuenta con ese correo. Ingresá o recuperá tu contraseña." : "No pudimos crear la cuenta. Probá de nuevo." };
  }
  const supabase = await createClient();
  const { error: loginError } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (loginError) return { message: "Cuenta creada. Ya podés ingresar con tu correo y contraseña." };
  redirect(safeNext(form.get("next")));
}

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = z.string().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Correo inválido." };
  if (!(await rateLimit(`reset:${await clientIp()}`, 5, 3600))) return { error: "Demasiados intentos. Probá más tarde." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${siteUrl()}/auth/confirm?next=/cuenta/nueva-clave` });
  return { message: "Si el correo está registrado, vas a recibir un enlace para crear una nueva contraseña." };
}

export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = z.string().min(8).safeParse(form.get("password"));
  if (!password.success) return { error: "La contraseña debe tener al menos 8 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "No se pudo actualizar la contraseña." };
  return { message: "Contraseña actualizada." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
