# SR Autorrepuestos

Tienda online de repuestos automotrices para Paraguay, con panel administrativo y dos asistentes de IA (NVIDIA, Google Gemini o Anthropic Claude): uno comercial para compradores y otro interno para administradores.

- **Stack:** Next.js 16 (App Router, TypeScript, Tailwind v4) · Supabase (PostgreSQL, Auth, Storage) · IA: NVIDIA, Gemini o Claude · Vercel.
- **Moneda:** guaraníes (PYG, IVA incluido). Reales y dólares se muestran como referencia.
- **Pagos:** tarjetas mediante Bancard vPOS, con un simulador para desarrollo.
- **Entregas:** retiro en el local, envío a domicilio (Asunción y Central) y envío por agencia al interior.

---

## 1. Qué incluye

### Tienda (`/`)
- Selector de vehículo (marca → modelo → año → motor) que acompaña toda la navegación.
- Búsqueda por nombre, marca, SKU, código OEM o referencia alternativa, con tolerancia a errores de tipeo.
- Filtros por categoría, precio, stock, ofertas, fabricante y compatibilidad; orden por relevancia, precio, novedad o ventas.
- Compatibilidad en tres estados: **confirmada**, **pendiente de verificar** y **no compatible**.
- Ficha con galería, especificaciones, referencias, vehículos compatibles, garantía, entrega, productos complementarios y alternativas.
- Carrito, cupones, cálculo de envío, IVA discriminado, factura con RUC y compra como invitado.
- Cuenta de cliente: pedidos, direcciones, vehículos, favoritos, listas de compra para talleres y avisos de reposición.

### Panel (`/admin`)
- Resumen con indicadores definidos: ingresos, pedidos, ticket, margen, clientes nuevos y recurrentes, conversión, abandono, cancelaciones y devoluciones.
- Productos: formulario completo (imágenes, códigos, especificaciones, compatibilidades, variantes, relacionados), acciones en lote, duplicación y vista previa.
- Importación y exportación CSV/Excel con validación previa.
- Inventario con movimientos, motivos obligatorios, mínimos y alertas. Proveedores con costos y plazos.
- Pedidos (estados, envío, cancelación, devoluciones), clientes (notas internas, precio mayorista), promociones, cupones, contenido, vehículos, reportes, configuración, usuarios y roles, y auditoría.

### Asistentes de IA
- **Comercial (burbuja de chat en la tienda):** busca en el catálogo real, verifica compatibilidad, compara, sugiere complementos y alternativas, explica políticas, consulta pedidos del cliente autenticado, agrega al carrito si se lo piden y deriva a una persona. No inventa precios, stock ni compatibilidades.
- **Administrativo (botón "Asistente" en el panel):** consulta ventas, stock, pedidos e indicadores, crea borradores y prepara cambios. Publicar, cambiar precios, ajustar stock, crear descuentos o cupones, editar descripciones y modificar pedidos **siempre se muestran para confirmar**. Actúa con los permisos de quien lo usa y cada acción queda en la auditoría. También revisa archivos CSV/Excel adjuntos.

---

## 2. Puesta en marcha local

Requisitos: Node.js 20.9 o superior y una cuenta gratuita en [Supabase](https://supabase.com).

1. **Instalar dependencias**
   ```bash
   npm install
   ```
2. **Crear el proyecto en Supabase** (región sugerida: *South America – São Paulo*).
3. **Crear la base de datos.** En Supabase abrí *SQL Editor → New query*, pegá el contenido de `supabase/setup-completo.sql` y presioná *Run*. Ese archivo incluye las migraciones y los datos base (categorías, marcas, vehículos, zonas de envío y páginas), sin productos. Si querés una tienda de ejemplo, ejecutá además `supabase/demo.sql`.
   - Si usás la Supabase CLI, podés aplicar `supabase/migrations/*`, luego `supabase/seed.sql` y, opcionalmente, `supabase/demo.sql`.
4. **Variables de entorno.** Copiá `.env.example` como `.env.local` y completá:
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (en *Project Settings → API*).
   - `SUPABASE_SERVICE_ROLE_KEY` (sólo servidor; nunca la expongas).
   - `NVIDIA_API_KEY` para los asistentes: es gratis en [build.nvidia.com](https://build.nvidia.com) (usa `nvidia/nemotron-3-super-120b-a12b`). Alternativas: `GEMINI_API_KEY`, gratis en [aistudio.google.com/apikey](https://aistudio.google.com/apikey). También podés usar Claude con `AI_PROVIDER=anthropic` y `ANTHROPIC_API_KEY`.
   - `PAYMENT_PROVIDER=mock` para probar compras sin cobro real.
5. **Iniciar**
   ```bash
   npm run dev
   ```
   Abrí http://localhost:3000.
6. **Crear el primer propietario.** Registrate en `/cuenta/registro` y, en el SQL Editor de Supabase, ejecutá:
   ```sql
   update public.profiles set role = 'owner' where email = 'tu@correo.com';
   ```
   Desde ahí, el resto de los roles se asignan en **Panel → Usuarios y roles**.

### Autenticación (Supabase)
En *Authentication → URL Configuration* configurá:
- **Site URL:** `http://localhost:3000` (y luego tu dominio).
- **Redirect URLs:** `http://localhost:3000/auth/confirm` y `https://TU-DOMINIO/auth/confirm`.

---

## 3. Despliegue en Vercel

1. Importá el repositorio en Vercel.
2. Cargá las mismas variables de `.env.example`, con `NEXT_PUBLIC_SITE_URL=https://tu-dominio` y un `CRON_SECRET` aleatorio.
3. `vercel.json` programa `/api/cron/expire-orders`, que libera las reservas de stock de pedidos no pagados. Las reservas también se liberan al crear cada pedido nuevo, así que la frecuencia diaria del plan gratuito alcanza.
4. Configurá el dominio y actualizá la *Site URL* y las *Redirect URLs* en Supabase.

### Pagos con Bancard
1. Solicitá a Bancard el alta del comercio para vPOS 2.0: te entregan la clave pública, la clave privada y el entorno de pruebas.
2. Configurá `PAYMENT_PROVIDER=bancard`, `BANCARD_PUBLIC_KEY`, `BANCARD_PRIVATE_KEY` y `BANCARD_BASE_URL` (staging: `https://vpos.infonet.com.py:8888`).
3. En el portal de Bancard, registrá la URL de confirmación: `https://TU-DOMINIO/api/payments/bancard/confirm`.
4. Completá la certificación de Bancard. Antes de producción, revisá `src/lib/payments/bancard.ts` contra la documentación que te entreguen: versión del script de checkout, formato de la firma y límites de la descripción.

Cómo se procesa un pago:
- El monto sale siempre del pedido guardado, nunca del navegador.
- Cada confirmación se registra con una clave única, así que una notificación repetida no se procesa dos veces.
- Si el monto informado no coincide, el pedido queda marcado para revisión.

---

## 4. Seguridad y permisos

| Rol | Puede |
|---|---|
| Propietario | Todo, incluida la gestión de usuarios y roles |
| Administrador | Todo menos usuarios y roles |
| Encargado de catálogo | Productos, precios, publicación, inventario, proveedores, vehículos y contenido |
| Operador de pedidos | Pedidos, devoluciones, clientes y notas internas |
| Analista | Lectura de indicadores, reportes, productos, pedidos y clientes |

- Las políticas RLS de Supabase son la autoridad final. Cada comprador ve sólo sus datos; los borradores no son públicos.
- Las operaciones críticas se ejecutan en funciones de base de datos transaccionales: `create_order`, `confirm_payment`, `adjust_stock`, `cancel_order`, `register_return` y `set_order_status`.
- Los pedidos guardan una copia del nombre, precio y costo de cada producto al momento de la compra.
- Las claves privadas (service role, Claude, Bancard) sólo existen en el servidor.
- Los chatbots tienen límite de uso por IP, sesión y usuario. El contenido de productos, archivos y mensajes se trata como datos, nunca como instrucciones.
- El asistente administrativo usa la sesión del usuario, así que nunca supera sus permisos. Además, vuelve a verificarlos al confirmar cada acción.

---

## 5. Operación diaria

- **Cargar productos:** usá *Panel → Productos → Nuevo* o importá un CSV/Excel (*Panel → Importar*). Descargá la plantilla, completá una fila por producto y validala antes de importar.
- **Compatibilidades:** se cargan por versión de vehículo. Cada versión tiene un código (p. ej. `TOY-HILUX-28D-16`) que se usa en las importaciones. Sin compatibilidad cargada, el comprador ve "pendiente de verificar".
- **Stock:** cada entrada o ajuste requiere motivo y queda registrado. Configurá el *stock mínimo* para recibir alertas y sugerencias de reposición.
- **Cotizaciones de moneda:** se actualizan en *Configuración*. Los cobros siempre se hacen en guaraníes.
- **Indicadores:** pasá el mouse sobre el ícono ⓘ de cada tarjeta para ver cómo se calcula.

---

## 6. Desarrollo

```bash
npm run dev          # servidor de desarrollo
npm run build        # compilación de producción
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm run test:db      # prueba migraciones, pedidos, pagos y permisos en Postgres embebido (PGlite)
npm run db:bundle    # regenera supabase/setup-completo.sql después de cambiar migraciones o seed
```

Estructura principal:

```
supabase/migrations/   esquema, funciones y políticas RLS
supabase/seed.sql      datos base (configuración, categorías, marcas, vehículos, envíos)
supabase/demo.sql      productos y ventas de demostración (opcional, ilustrativos)
src/app/(store)/       tienda
src/app/admin/         panel administrativo
src/app/api/           checkout, pagos, chat, asistente, exportación, eventos, cron
src/lib/services/      operaciones compartidas entre el panel y el asistente
src/lib/ai/            asistentes (herramientas, bucle con Claude, ejecución de acciones)
src/lib/payments/      Bancard y simulador
```

Los asistentes eligen el proveedor con `AI_PROVIDER`: `nvidia` (API gratuita de NVIDIA, modelo `NVIDIA_MODEL`, por defecto `nvidia/nemotron-3-super-120b-a12b`), `gemini` (`gemini-3.7-flash`, capa gratuita) cuando hay `GEMINI_API_KEY`; el modelo se cambia con `GEMINI_MODEL`. Con `AI_PROVIDER=anthropic` usan Claude (`claude-opus-5-5` por defecto, `ANTHROPIC_MODEL`). Las herramientas, permisos y confirmaciones son las mismas con ambos proveedores. En la capa gratuita de Gemini, Google puede usar los mensajes para mejorar sus productos y hay límites bajos de consultas por minuto y por día: para producción conviene un plan pago.

---

## 7. Pendiente antes del lanzamiento

- [ ] Cargar el catálogo real con fotos (si se usó `demo.sql`, borrar antes sus productos de ejemplo).
- [ ] Definir el origen de los datos de compatibilidad: catálogo del proveedor o base técnica.
- [ ] Completar razón social, RUC, teléfono y dirección en *Configuración*.
- [ ] Certificar Bancard y probar pagos aprobados, rechazados y duplicados en staging.
- [ ] Facturación electrónica (SIFEN): los datos de RUC y razón social ya se guardan en cada pedido, pero falta la integración con un proveedor de facturación.
- [ ] Envío de correos transaccionales (confirmación de pedido, avisos de reposición y recuperación de carrito con consentimiento).
- [ ] Recorrer los criterios de aceptación en un celular: cargar y publicar un producto, comprarlo, verificar el pago y el stock, probar el chatbot y el asistente con distintos roles.

Funciones previstas para etapas posteriores: órdenes de compra a proveedores, múltiples depósitos, paquetes de mantenimiento y notificaciones automáticas.
