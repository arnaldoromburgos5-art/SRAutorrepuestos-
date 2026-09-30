"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { applyImportAction, validateImportAction } from "@/app/admin/actions";
import type { ValidatedRow } from "@/lib/services/imports";
import { Badge, Card, Table, btnDark, btnPrimary } from "./ui";

export function ImportWizard() {
  const [rows, setRows] = useState<ValidatedRow[] | null>(null);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; stockAdjusted: number; errors: string[] } | null>(null);
  const [pending, start] = useTransition();

  const valid = rows?.filter((r) => !r.errors.length) ?? [];
  const invalid = rows?.filter((r) => r.errors.length) ?? [];

  return (
    <Card title="1. Subí el archivo">
      <form
        action={(form) =>
          start(async () => {
            setError(null);
            setResult(null);
            const res = await validateImportAction(form);
            if (!res.ok) return setError(res.error);
            setRows(res.data!.rows);
            setRaw(res.data!.raw);
          })
        }
        className="flex flex-wrap items-center gap-3"
      >
        <input name="file" type="file" accept=".csv,.xlsx" required className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:font-semibold" />
        <button disabled={pending} className={btnDark}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Validar archivo
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-bad-600">{error}</p> : null}

      {rows ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone="ok">{valid.filter((r) => r.action === "create").length} nuevos</Badge>
            <Badge tone="accent">{valid.filter((r) => r.action === "update").length} actualizaciones</Badge>
            <Badge tone={invalid.length ? "bad" : "neutral"}>{invalid.length} con errores (no se importan)</Badge>
            <Badge tone="warn">{rows.filter((r) => r.warnings.length).length} con advertencias</Badge>
          </div>
          <Table>
            <thead>
              <tr><th>Fila</th><th>SKU</th><th>Nombre</th><th>Acción</th><th>Observaciones</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line}>
                  <td className="text-ink-400">{r.line}</td>
                  <td className="font-mono text-xs">{r.sku || "—"}</td>
                  <td>{r.name || "—"}</td>
                  <td>{r.errors.length ? <XCircle className="size-4 text-bad-600" /> : r.action === "create" ? "Crear" : "Actualizar"}</td>
                  <td className="text-xs">
                    {r.errors.map((e) => <p key={e} className="text-bad-600">{e}</p>)}
                    {r.warnings.map((w) => <p key={w} className="flex items-center gap-1 text-warn-600"><AlertTriangle className="size-3" />{w}</p>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={pending || !valid.length}
              onClick={() => {
                if (!window.confirm(`Se van a importar ${valid.length} productos (${invalid.length} filas con errores se omiten). ¿Confirmás?`)) return;
                start(async () => {
                  const res = await applyImportAction(raw);
                  if (!res.ok) return setError(res.error);
                  setResult(res.data!);
                  setRows(null);
                });
              }}
              className={btnPrimary}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} 2. Importar {valid.length} filas válidas
            </button>
            <p className="text-xs text-ink-500">Los productos existentes (mismo SKU) se actualizan; las columnas vacías conservan el valor actual.</p>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-6 space-y-2 rounded-xl bg-ok-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-ok-600"><CheckCircle2 className="size-4" /> Importación finalizada</p>
          <p>{result.created} creados · {result.updated} actualizados · {result.stockAdjusted} ajustes de stock · {result.skipped} omitidos</p>
          {result.errors.map((e) => <p key={e} className="text-bad-600">{e}</p>)}
        </div>
      ) : null}
    </Card>
  );
}
