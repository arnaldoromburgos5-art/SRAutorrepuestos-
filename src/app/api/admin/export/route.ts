import { NextResponse } from "next/server";
import Papa from "papaparse";
import { PermissionError } from "@/lib/auth";
import { staffContext } from "@/lib/services/context";
import { exportProducts, IMPORT_COLUMNS } from "@/lib/services/imports";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  try {
    const ctx = await staffContext();
    if (url.searchParams.get("plantilla") === "1") {
      const example = {
        sku: "SR-EJ-0001", nombre: "Pastillas de freno delanteras", marca: "bosch", categoria: "pastillas-de-freno", precio: "395000",
        precio_lista: "", costo: "240000", stock: "10", stock_minimo: "3", iva: "10", estado: "borrador",
        descripcion_corta: "Juego de 4 pastillas cerámicas", descripcion: "", oem: "04465-0K290", alternativas: "PD/1502",
        compatibilidades: "TOY-HILUX-28D-16|TOY-FORT-28D-16:pendiente", universal: "no", garantia_meses: "12", imagen_url: "",
      };
      const body = "﻿" + Papa.unparse([example], { columns: [...IMPORT_COLUMNS] });
      return new NextResponse(body, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="plantilla-productos.csv"' },
      });
    }
    const file = await exportProducts(ctx, format);
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(file.body, {
      headers: { "content-type": file.type, "content-disposition": `attachment; filename="productos-${date}.${file.ext}"` },
    });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "No se pudo exportar." }, { status: 500 });
  }
}
