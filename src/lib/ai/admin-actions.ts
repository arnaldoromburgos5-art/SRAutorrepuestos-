import "server-only";
import type { Permission } from "@/lib/permissions";
import { ensure, type ServiceCtx } from "@/lib/services/context";
import { bulkPriceChange, setProductsStatus, updateDescriptions } from "@/lib/services/products";
import { adjustStock, cancelOrder, createCoupon, createPromotion, setOrderStatus } from "@/lib/services/operations";
import { applyImport } from "@/lib/services/imports";

export type AiAction = {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  summary: string;
  required_permission: Permission;
  status: string;
  created_at: string;
};

/**
 * Ejecuta una acción que la persona confirmó. Se vuelven a verificar los permisos con su sesión
 * actual (pudieron cambiar desde la propuesta) y cada servicio valida sus datos y audita.
 */
export async function executeAiAction(ctx: ServiceCtx, action: AiAction): Promise<unknown> {
  ensure(ctx, action.required_permission);
  // El payload se generó en el servidor al proponer; cada servicio lo vuelve a validar.
  const p = action.payload as unknown;
  switch (action.action_type) {
    case "update_descriptions": {
      const { items } = p as { items: { product_id: string; short_description?: string; description?: string }[] };
      return updateDescriptions(ctx, items.map((i) => ({ ...i, id: i.product_id })));
    }
    case "set_status": {
      const s = p as { ids: string[]; status: "draft" | "published" | "archived" };
      return setProductsStatus(ctx, s.ids, s.status);
    }
    case "bulk_price": {
      const b = p as { ids: string[]; percent: number };
      return bulkPriceChange(ctx, b.ids, b.percent);
    }
    case "create_promotion":
      return createPromotion(ctx, p);
    case "create_coupon":
      return createCoupon(ctx, p);
    case "adjust_stock":
      return adjustStock(ctx, p as { product_id: string; delta: number; type: "purchase_in" | "adjustment"; reason: string });
    case "order_update": {
      const o = p as { order_id: string; action: "preparing" | "shipped" | "delivered" | "cancel"; tracking?: string; carrier?: string; reason?: string };
      if (o.action === "cancel") return cancelOrder(ctx, o.order_id, o.reason ?? "Cancelado desde el asistente");
      return setOrderStatus(ctx, { order_id: o.order_id, status: o.action, tracking: o.tracking, carrier: o.carrier, note: "Confirmado desde el asistente" });
    }
    case "import_file":
      return applyImport({ ...ctx, source: "import" }, (p as { rows: Record<string, string>[] }).rows);
    default:
      throw new Error(`Acción desconocida: ${action.action_type}`);
  }
}
