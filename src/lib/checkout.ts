import { z } from "zod";

export const cartItemsSchema = z
  .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(99) }))
  .min(1)
  .max(60);

export const quoteSchema = z.object({
  items: cartItemsSchema,
  coupon_code: z.string().trim().max(40).optional().nullable(),
  delivery_method: z.enum(["pickup", "home", "agency"]).default("pickup"),
  shipping_zone_id: z.string().uuid().optional().nullable(),
  email: z.string().email().max(160).optional().nullable().or(z.literal("")),
});

export const orderSchema = quoteSchema.extend({
  customer_name: z.string().trim().min(3, "Ingresá tu nombre completo").max(120),
  email: z.string().trim().email("Correo inválido").max(160),
  phone: z.string().trim().min(6, "Teléfono inválido").max(30),
  document_type: z.enum(["CI", "RUC", "PASAPORTE"]).optional().nullable(),
  document_number: z.string().trim().max(30).optional().nullable(),
  invoice_requested: z.boolean().default(false),
  business_name: z.string().trim().max(160).optional().nullable(),
  shipping_address: z
    .object({
      recipient: z.string().trim().min(3).max(120),
      phone: z.string().trim().min(6).max(30),
      department: z.string().trim().min(2).max(60),
      city: z.string().trim().min(2).max(80),
      street: z.string().trim().min(4).max(200),
      reference: z.string().trim().max(200).optional().nullable(),
    })
    .optional()
    .nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  display_currency: z.enum(["PYG", "BRL", "USD"]).default("PYG"),
  ai_conversation_id: z.string().uuid().optional().nullable(),
  save_address: z.boolean().optional(),
});

export type OrderInput = z.infer<typeof orderSchema>;

export const QUOTE_ERROR_MESSAGES: Record<string, string> = {
  EMPTY_CART: "Tu carrito está vacío.",
  TOO_MANY_ITEMS: "El carrito tiene demasiados productos distintos.",
  NOT_AVAILABLE: "Un producto ya no está disponible.",
  INVALID_QUANTITY: "Revisá las cantidades.",
  INSUFFICIENT_STOCK: "No hay stock suficiente de un producto.",
  SHIPPING_ZONE_REQUIRED: "Elegí la zona de envío.",
  INVALID_COUPON: "El cupón no es válido.",
};
