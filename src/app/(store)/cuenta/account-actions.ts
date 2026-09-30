"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { friendlyDbError, normalizeCode, type ActionResult } from "@/lib/utils";

export async function updateProfile(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const parsed = z
    .object({
      full_name: z.string().trim().min(3).max(120),
      phone: z.string().trim().max(30).optional(),
      document_type: z.enum(["CI", "RUC", "PASAPORTE"]).optional(),
      document_number: z.string().trim().max(30).optional(),
      business_name: z.string().trim().max(160).optional(),
      marketing_consent: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Revisá los datos ingresados." };
  const { marketing_consent, ...rest } = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({ ...rest, marketing_consent: marketing_consent === "on" })
    .eq("id", user!.id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/cuenta");
  return { ok: true, message: "Datos guardados." };
}

const addressSchema = z.object({
  label: z.string().trim().min(2).max(40),
  recipient: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(6).max(30),
  department: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(80),
  street: z.string().trim().min(4).max(200),
  reference: z.string().trim().max(200).optional(),
});

export async function addAddress(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const parsed = addressSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Completá todos los campos de la dirección." };
  const { error } = await supabase.from("addresses").insert({ ...parsed.data, user_id: user!.id });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/cuenta/direcciones");
  return { ok: true, message: "Dirección guardada." };
}

export async function deleteAddress(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("addresses").delete().eq("id", id);
  revalidatePath("/cuenta/direcciones");
}

export async function saveVehicle(input: { versionId: string; year: number; nickname?: string }): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const parsed = z.object({ versionId: z.string().uuid(), year: z.number().int().min(1950).max(2100), nickname: z.string().max(40).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vehículo inválido." };
  const { error } = await supabase
    .from("customer_vehicles")
    .insert({ user_id: user!.id, version_id: parsed.data.versionId, year: parsed.data.year, nickname: parsed.data.nickname || null });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/cuenta/vehiculos");
  return { ok: true };
}

export async function deleteVehicle(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("customer_vehicles").delete().eq("id", id);
  revalidatePath("/cuenta/vehiculos");
}

export async function createList(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const name = z.string().trim().min(2).max(60).safeParse(form.get("name"));
  if (!name.success) return { ok: false, error: "Poné un nombre a la lista." };
  const { error } = await supabase.from("shopping_lists").insert({ user_id: user!.id, name: name.data });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/cuenta/listas");
  return { ok: true };
}

export async function deleteList(id: string) {
  const { supabase } = await requireUser();
  await supabase.from("shopping_lists").delete().eq("id", id);
  revalidatePath("/cuenta/listas");
}

export async function addToList(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = z
    .object({ list_id: z.string().uuid(), code: z.string().trim().min(2).max(60), quantity: z.coerce.number().int().min(1).max(99) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Ingresá un SKU o código y la cantidad." };
  const { data: found } = await supabase
    .from("catalog_products")
    .select("id")
    .eq("status", "published")
    .ilike("search_codes", `%${normalizeCode(parsed.data.code)}%`)
    .limit(1)
    .maybeSingle();
  if (!found) return { ok: false, error: "No encontramos un producto con ese código." };
  const { error } = await supabase
    .from("shopping_list_items")
    .upsert({ list_id: parsed.data.list_id, product_id: found.id, quantity: parsed.data.quantity }, { onConflict: "list_id,product_id" });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/cuenta/listas");
  return { ok: true };
}

export async function removeFromList(listId: string, productId: string) {
  const { supabase } = await requireUser();
  await supabase.from("shopping_list_items").delete().eq("list_id", listId).eq("product_id", productId);
  revalidatePath("/cuenta/listas");
}
