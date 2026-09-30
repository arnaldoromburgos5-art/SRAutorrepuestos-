import "server-only";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { can } from "@/lib/permissions";
import { normalizeCode } from "@/lib/utils";
import { ensure, audit, type ServiceCtx } from "./context";
import { saveProduct } from "./products";
import { adjustStock } from "./operations";

export const IMPORT_COLUMNS = [
  "sku", "nombre", "marca", "categoria", "precio", "precio_lista", "costo", "stock", "stock_minimo", "iva", "estado",
  "descripcion_corta", "descripcion", "oem", "alternativas", "compatibilidades", "universal", "garantia_meses", "imagen_url",
] as const;

export const IMPORT_HELP: Record<(typeof IMPORT_COLUMNS)[number], string> = {
  sku: "Obligatorio. Código interno único. Si ya existe, se actualiza el producto.",
  nombre: "Obligatorio.",
  marca: "Nombre o slug de una marca existente.",
  categoria: "Nombre o slug de una categoría existente.",
  precio: "Obligatorio. Precio final en guaraníes, con IVA, sin puntos.",
  precio_lista: "Opcional. Precio anterior tachado.",
  costo: "Opcional. Costo sin IVA, para calcular márgenes.",
  stock: "Opcional. Stock físico total; se registra como ajuste con motivo 'Importación'.",
  stock_minimo: "Opcional. Mínimo para alertas de reposición.",
  iva: "0, 5 o 10 (por defecto 10).",
  estado: "borrador, publicado o archivado (por defecto borrador).",
  descripcion_corta: "Opcional.",
  descripcion: "Opcional.",
  oem: "Códigos OEM separados por |",
  alternativas: "Referencias alternativas separadas por |",
  compatibilidades: "Códigos de versión de vehículo separados por |. Opcional ':pendiente' o ':no' al final, p. ej. TOY-HILUX-28D-16|TOY-FORT-28D-16:pendiente",
  universal: "si / no",
  garantia_meses: "Opcional. Número entero.",
  imagen_url: "Opcional. URLs de imagen separadas por |",
};

type RawRow = Record<string, string>;

export type ValidatedRow = {
  line: number;
  sku: string;
  name: string;
  action: "create" | "update";
  errors: string[];
  warnings: string[];
  payload?: Record<string, unknown>;
  stock?: number;
  existingId?: string;
};

export async function parseImportFile(file: File): Promise<RawRow[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    return parsed.data;
  }
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell, col) => (headers[col] = String(cell.text ?? "").trim().toLowerCase()));
    const rows: RawRow[] = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const r: RawRow = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (headers[col]) r[headers[col]] = String(cell.text ?? "").trim();
      });
      if (Object.values(r).some((v) => v)) rows.push(r);
    });
    return rows;
  }
  throw new Error("Formato no soportado. Subí un archivo .csv o .xlsx.");
}

const int = (v: string | undefined) => {
  if (v === undefined || v === "") return undefined;
  const clean = v.replace(/[.\s]/g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
const list = (v: string | undefined) => (v ? v.split("|").map((x) => x.trim()).filter(Boolean) : []);
const STATUS: Record<string, "draft" | "published" | "archived"> = {
  borrador: "draft", draft: "draft", publicado: "published", published: "published", archivado: "archived", archived: "archived",
};

/** Valida todas las filas sin escribir nada. */
export async function validateImport(ctx: ServiceCtx, rows: RawRow[]): Promise<ValidatedRow[]> {
  ensure(ctx, "products.write");
  if (rows.length > 2000) throw new Error("Máximo 2000 filas por importación.");
  const db = ctx.supabase;
  const [{ data: brands }, { data: categories }, { data: versions }, { data: existing }] = await Promise.all([
    db.from("brands").select("id, name, slug"),
    db.from("categories").select("id, name, slug"),
    db.from("vehicle_versions").select("id, code"),
    db.from("products").select("id, sku, status"),
  ]);
  const byKey = <T extends { name: string; slug: string }>(arr: T[] | null) => {
    const m = new Map<string, T>();
    for (const x of arr ?? []) {
      m.set(x.slug.toLowerCase(), x);
      m.set(x.name.toLowerCase(), x);
    }
    return m;
  };
  const brandMap = byKey(brands as { id: string; name: string; slug: string }[]);
  const catMap = byKey(categories as { id: string; name: string; slug: string }[]);
  const versionMap = new Map((versions ?? []).filter((v) => v.code).map((v) => [String(v.code).toUpperCase(), v.id as string]));
  const skuMap = new Map((existing ?? []).map((p) => [normalizeCode(p.sku), p as { id: string; sku: string; status: string }]));
  const seen = new Map<string, number>();
  const canPublish = can(ctx.profile.role, "products.publish");

  return rows.map((r, i) => {
    const line = i + 2;
    const errors: string[] = [];
    const warnings: string[] = [];
    const sku = (r.sku ?? "").trim().toUpperCase();
    const name = (r.nombre ?? "").trim();
    if (!sku) errors.push("Falta el SKU.");
    if (!name) errors.push("Falta el nombre.");
    const norm = normalizeCode(sku);
    if (sku && seen.has(norm)) errors.push(`SKU duplicado en el archivo (fila ${seen.get(norm)}).`);
    if (sku) seen.set(norm, line);

    const price = int(r.precio);
    if (price === undefined) errors.push("Falta el precio.");
    else if (Number.isNaN(price) || price <= 0) errors.push("Precio inválido.");
    const listPrice = int(r.precio_lista);
    if (Number.isNaN(listPrice)) errors.push("precio_lista inválido.");
    const cost = int(r.costo);
    if (Number.isNaN(cost)) errors.push("Costo inválido.");
    const stock = int(r.stock);
    if (Number.isNaN(stock) || (stock !== undefined && stock < 0)) errors.push("Stock inválido.");
    const minStock = int(r.stock_minimo);
    if (Number.isNaN(minStock)) errors.push("stock_minimo inválido.");
    const iva = r.iva ? Number(r.iva) : 10;
    if (![0, 5, 10].includes(iva)) errors.push("IVA debe ser 0, 5 o 10.");
    const warranty = int(r.garantia_meses);
    if (Number.isNaN(warranty)) errors.push("garantia_meses inválido.");

    let status = STATUS[(r.estado ?? "").trim().toLowerCase()] ?? "draft";
    if (r.estado && !STATUS[r.estado.trim().toLowerCase()]) warnings.push(`Estado "${r.estado}" desconocido: se usa borrador.`);
    if (status === "published" && !canPublish) {
      status = "draft";
      warnings.push("No tenés permiso para publicar: queda como borrador.");
    }

    const brand = r.marca ? brandMap.get(r.marca.trim().toLowerCase()) : undefined;
    if (r.marca && !brand) errors.push(`Marca "${r.marca}" no existe.`);
    const category = r.categoria ? catMap.get(r.categoria.trim().toLowerCase()) : undefined;
    if (r.categoria && !category) errors.push(`Categoría "${r.categoria}" no existe.`);
    if (!r.categoria) warnings.push("Sin categoría.");

    const fitments: { version_id: string; status: "confirmed" | "unverified" | "incompatible" }[] = [];
    for (const token of list(r.compatibilidades)) {
      const [code, st] = token.split(":").map((x) => x.trim());
      const id = versionMap.get(code.toUpperCase());
      if (!id) errors.push(`Versión de vehículo "${code}" no existe.`);
      else fitments.push({ version_id: id, status: st === "pendiente" ? "unverified" : st === "no" ? "incompatible" : "confirmed" });
    }

    const existingRow = skuMap.get(norm);
    const references = [
      ...list(r.oem).map((code) => ({ kind: "oem" as const, code })),
      ...list(r.alternativas).map((code) => ({ kind: "alternative" as const, code })),
    ];

    return {
      line,
      sku,
      name,
      action: existingRow ? "update" : "create",
      errors,
      warnings,
      existingId: existingRow?.id,
      stock: stock === undefined || Number.isNaN(stock) ? undefined : stock,
      // En actualizaciones sólo se envían las columnas con valor: lo demás se conserva.
      payload: errors.length
        ? undefined
        : {
            id: existingRow?.id,
            sku,
            name,
            price,
            ...(r.estado || !existingRow ? { status } : {}),
            ...(listPrice !== undefined ? { compare_at_price: listPrice } : {}),
            ...(cost !== undefined ? { cost } : {}),
            ...(r.iva || !existingRow ? { tax_rate: iva } : {}),
            ...(minStock !== undefined ? { min_stock: minStock } : {}),
            ...(brand ? { brand_id: brand.id } : {}),
            ...(category ? { category_id: category.id } : {}),
            ...(r.descripcion_corta ? { short_description: r.descripcion_corta } : {}),
            ...(r.descripcion ? { description: r.descripcion } : {}),
            ...(r.universal ? { is_universal: ["si", "sí", "yes", "1", "true"].includes(r.universal.trim().toLowerCase()) } : {}),
            ...(warranty !== undefined ? { warranty_months: warranty } : {}),
            ...(references.length ? { references } : {}),
            ...(fitments.length ? { fitments } : {}),
            ...(r.imagen_url ? { images: list(r.imagen_url).map((url) => ({ url })) } : {}),
          },
    } satisfies ValidatedRow;
  });
}

/** Aplica las filas válidas (vuelve a validar en el servidor). */
export async function applyImport(ctx: ServiceCtx, rows: RawRow[]) {
  const validated = await validateImport(ctx, rows);
  const results = { created: 0, updated: 0, skipped: 0, stockAdjusted: 0, errors: [] as string[] };
  for (const row of validated) {
    if (!row.payload) {
      results.skipped++;
      continue;
    }
    try {
      let payload = row.payload;
      if (row.existingId) {
        const { data: current } = await ctx.supabase.from("products").select("*").eq("id", row.existingId).single();
        payload = { ...current, ...row.payload };
      }
      const { id } = await saveProduct(ctx, payload);
      if (row.action === "create") results.created++;
      else results.updated++;
      if (row.stock !== undefined && can(ctx.profile.role, "inventory.adjust")) {
        const { data: current } = await ctx.supabase.from("stock_levels").select("on_hand").eq("product_id", id).maybeSingle();
        const delta = row.stock - (current?.on_hand ?? 0);
        if (delta !== 0) {
          await adjustStock(ctx, { product_id: id, delta, type: row.action === "create" ? "initial" : "adjustment", reason: "Importación de catálogo" });
          results.stockAdjusted++;
        }
      }
    } catch (e) {
      results.errors.push(`Fila ${row.line} (${row.sku}): ${(e as Error).message}`);
    }
  }
  await audit(ctx, "product.import", "product", null, null, results);
  return results;
}

export async function exportProducts(ctx: ServiceCtx, format: "csv" | "xlsx") {
  ensure(ctx, "products.read");
  const { data } = await ctx.supabase
    .from("products")
    .select(`sku, name, price, compare_at_price, cost, tax_rate, status, short_description, description, is_universal, warranty_months, min_stock,
      brands(slug), categories(slug), stock_levels(on_hand), product_references(kind, code),
      product_fitments(status, vehicle_versions(code)), product_images(url, sort)`)
    .order("sku");
  const statusEs = { draft: "borrador", published: "publicado", archived: "archivado" } as Record<string, string>;
  type Row = {
    sku: string; name: string; price: number; compare_at_price: number | null; cost: number | null; tax_rate: number; status: string;
    short_description: string | null; description: string | null; is_universal: boolean; warranty_months: number | null; min_stock: number;
    brands: { slug: string } | null; categories: { slug: string } | null; stock_levels: { on_hand: number } | { on_hand: number }[] | null;
    product_references: { kind: string; code: string }[]; product_fitments: { status: string; vehicle_versions: { code: string | null } }[];
    product_images: { url: string; sort: number }[];
  };
  const rows = ((data ?? []) as unknown as Row[]).map((p) => {
    const stock = Array.isArray(p.stock_levels) ? p.stock_levels[0]?.on_hand : p.stock_levels?.on_hand;
    return {
      sku: p.sku,
      nombre: p.name,
      marca: p.brands?.slug ?? "",
      categoria: p.categories?.slug ?? "",
      precio: p.price,
      precio_lista: p.compare_at_price ?? "",
      costo: p.cost ?? "",
      stock: stock ?? 0,
      stock_minimo: p.min_stock,
      iva: p.tax_rate,
      estado: statusEs[p.status],
      descripcion_corta: p.short_description ?? "",
      descripcion: p.description ?? "",
      oem: p.product_references.filter((r) => r.kind === "oem").map((r) => r.code).join("|"),
      alternativas: p.product_references.filter((r) => r.kind !== "oem").map((r) => r.code).join("|"),
      compatibilidades: p.product_fitments
        .filter((f) => f.vehicle_versions.code)
        .map((f) => `${f.vehicle_versions.code}${f.status === "unverified" ? ":pendiente" : f.status === "incompatible" ? ":no" : ""}`)
        .join("|"),
      universal: p.is_universal ? "si" : "no",
      garantia_meses: p.warranty_months ?? "",
      imagen_url: p.product_images.sort((a, b) => a.sort - b.sort).map((i) => i.url).join("|"),
    };
  });
  if (format === "csv") return { body: "﻿" + Papa.unparse(rows, { columns: [...IMPORT_COLUMNS] }), type: "text/csv; charset=utf-8", ext: "csv" };
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Productos");
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c, key: c, width: c.startsWith("descripcion") ? 40 : 16 }));
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true };
  const help = wb.addWorksheet("Ayuda");
  help.columns = [{ header: "columna", key: "c", width: 22 }, { header: "descripción", key: "d", width: 100 }];
  help.addRows(IMPORT_COLUMNS.map((c) => ({ c, d: IMPORT_HELP[c] })));
  const buffer = await wb.xlsx.writeBuffer();
  return { body: buffer as ArrayBuffer, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
}
