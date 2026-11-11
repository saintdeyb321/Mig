# MIGAPOS — PLAN DE CIERRE: EXCEL LEGIBLE, SIN REDUNDANCIAS Y SIN DOBLE CONTEO

**Fecha de revisión:** 10/11/2026  
**Ámbito:** frontend / generación de XLSX y QA del exportador.  
**Carpeta de trabajo local del propietario:** `C:\Proyectos\MigaPOS`  
**Rama de destino (seleccionada EXCLUSIVAMENTE por el propietario):** `fix/migapos-production-readiness`  
**Rama de marketing que debe permanecer intacta:** `marketing/video-promo-migapos`.

## 0. Regla de trabajo y control de ramas

1. El propietario guarda sus cambios del video y **selecciona manualmente** `fix/migapos-production-readiness` antes de que Codex edite archivos. Codex **no ejecuta** ningún comando `git`, `gh`, consulta a GitHub ni cambia ramas; tampoco publica, fusiona ni despliega.
2. Codex usa **exclusivamente** `C:\Proyectos\MigaPOS` y las rutas relativas descritas. No trabaja en una copia de marketing ni modifica `marketing/`, Remotion, el storyboard, medios promocionales o su configuración.
3. Si Codex no puede comprobar por los archivos de trabajo que el código objetivo existe, se detiene e informa; jamás reconstruye archivos desde otra rama de forma especulativa.
4. A la fecha de la auditoría el commit visible de `fix/migapos-production-readiness` es `5dfe31102ac77b0a235e175145d6f439595f2d23`. Incluye documentación de video y falló CI por dos documentos no registrados en la lista cerrada de Markdown: `docs/GO-NO-GO-P15-PRODUCCION.md` y `docs/PLAN-VIDEO-PROMOCIONAL-MIGAPOS-CODEX.md`. Codex debe añadir **solo las rutas legítimas exactas**, junto con los Markdown de este trabajo, a `tests/ui-security.test.mjs`; nunca quitar la prueba, permitir comodines ni tocar los documentos de marketing.
5. El propietario se encargará personalmente de `git status`, selección de rama, commit, push y despliegue. Codex entregará un listado verificable de archivos y pruebas; **no hará Git**.

## 1. Auditoría confirmada en el código

Archivos principales:

- `frontend/src/utils/salesDataProcessor.js`: `DETAIL_HEADERS` fijo de 13 columnas; `processSales()` produce tickets, compensaciones POS y pagos de pedidos juntos; utiliza `Cantidad=1`, `Precio unitario=importe`, `Subtotal=importe` y pone `clientName` en `Producto` para un pago de pedido.
- `frontend/src/features/reports/application/salesWorkbook.js`: materializa `Detalle_<sede>` y hojas globales; aplica formatos monetarios por letras (`H`, `I`, `K`) y anchuras a partir de la posición. La cabecera repite `Sede Principal` y `(Lima)`; cada línea también exporta `Sucursal`.
- `frontend/src/utils/excelHelpers.js`: `styleTotalRows()` colorea y reconoce las columnas por letras (`D`, `F`, `H`, `I`, `K` etc.), lo que se romperá al suprimir o reordenar columnas sin refactorizar el estilo.
- `frontend/src/features/reports/application/contractLedgerReport.js`: la auditoría de contratos distingue adelanto/abono/reembolso contable, pero incluye tres referencias de sede (`Sede Origen`, `Sede Recojo`, `Sede Movimiento`) cuya utilidad depende del alcance. No deben quitarse cuando son significativas.
- `frontend/src/features/reports/application/cashAuditRows.js`: incluye columna `Sede` y `(Lima)`; solo son redundantes cuando el alcance ya fija una sede. No alterar `No declarado`, `No calculable` o `Conciliación pendiente`.
- `frontend/src/features/reports/application/reportNames.js`: sanitiza nombres y referencias. Si no existe un número comercial no debe inventarse uno, ni mostrarse UID/ID interno en su lugar.
- `tests/reports.test.mjs`, `tests/plan13.test.mjs`, `tests/plan14.test.mjs`, `tests/excel-export.browser.test.mjs`: ya verifican importes y contratos. Algunas aserciones esperan explícitamente el encabezado `(Lima)`, posiciones de columnas y la fila `TOTAL TICKET`. Actualizarlas para **el nuevo contrato correcto** sin debilitar montos ni suprimir casos.

### Problema principal: pagos representados como ventas de productos

Ejemplo actual: `PED-2A010C09`, abono Yape S/20, cliente edith, se exporta con `Producto=edith`, `Cantidad=1`, `Precio unitario=S/20`, `Subtotal=S/20`. Esto confunde **cobro de pedido** con **producto vendido**. Además, mezclar subtotales de productos, total de ticket y pago de pedido sin una guía permite al lector sumar dinero dos veces.

### Información redundante

- En `Detalle_Sede Principal`, no repetir `Sucursal` en todas las filas.
- El encabezado no necesita `(Lima)` ni una frase larga; conservar internamente `America/Lima` para atribuir fechas y horas, sin convertir días de manera errónea.
- No duplicar referencia comercial innecesariamente en múltiples columnas. No mostrar IDs técnicos ni UIDs.
- Si el Excel es global, **mantener la sede en hojas que realmente comparan sedes**; no eliminar la dimensión necesaria para interpretar cobros por lugar.

## 2. Objetivo UX y contrato de detalle por sede

**Una fila debe tener un propósito explícito**: producto de un ticket, cobro de ticket, compensación POS, abono/adelanto de pedido o reembolso contable. El concepto y el tipo de movimiento nunca deben confundirse con una venta de artículo.

Se recomienda una **única tabla de detalle por sede**, con encabezados orientativos (Codex puede afinar nomenclatura y orden, no semántica):

1. `Fecha`
2. `Hora`
3. `Movimiento` (`VENTA POS`, `COMPENSACIÓN POS`, `ADELANTO PEDIDO`, `ABONO PEDIDO`, `REEMBOLSO CONTABLE PEDIDO`)
4. `Referencia` (número comercial auténtico, o `Venta de mostrador` / `Sin número comercial` sin inventar ID)
5. `Producto / concepto` (producto real, o `Abono de pedido · edith` cuando sea un pago)
6. `Cantidad` (solo para líneas de producto/compensación con detalle real; vacía para pagos de pedidos)
7. `Precio unitario` (solo líneas de producto; vacío en pagos)
8. `Subtotal producto` (solo líneas de producto; informativo, **no acumulable al total financiero**)
9. `Medio de pago` (efectivo, Yape/Plin, mixto con importes de cada canal)
10. `Importe movimiento (S/)` (importe financiero **una sola vez por ticket/recibo o pago**; en la primera línea del ticket o en una única fila de resumen claramente tipada)
11. `Responsable` (nombre verificado, o `Empleado no identificado`)
12. `Observaciones` (solo incidencias/motivos útiles, sanitizados)

Sin `Sucursal` en una hoja cuya pestaña identifica una sede. En la cabecera basta `Detalle · Sede Principal · 10/11/2026` o rango entre fechas; **no mostrar `(Lima)`**, pero sí conservar sus cálculos de fechas.

### Ejemplo de visualización deseada

| Fecha | Hora | Movimiento | Referencia | Producto / concepto | Cant. | Precio | Subtotal producto | Medio de pago | Importe movimiento | Responsable |
|---|---|---|---|---|---:|---:|---:|---|---:|---|
| 10/11/2026 | 17:06 | VENTA POS | Venta de mostrador | Producto 10 | 2 | S/10.00 | S/20.00 | Yape | **S/20.00** | Alex Ramos |
| 10/11/2026 | 17:07 | VENTA POS | Venta de mostrador | Producto 1 | 1 | S/33.30 | S/33.30 | Mixto: Ef S/10 + Yape S/27.30 | **S/37.30** | Alex Ramos |
| | | DETALLE TICKET | | Producto 4 | 1 | S/4.00 | S/4.00 | | *(vacío)* | |
| 10/11/2026 | 17:07 | VENTA POS | Venta de mostrador | Producto 3 | 2 | S/3.00 | S/6.00 | Efectivo | **S/6.00** | Alex Ramos |
| 10/11/2026 | 17:08 | ADELANTO/ABONO PEDIDO | PED-2A010C09 | Pago de pedido · edith | *(vacío)* | *(vacío)* | *(vacío)* | Yape | **S/20.00** | Alex Ramos |
| 10/11/2026 | 17:13 | ABONO PEDIDO | PED-2A010C09 | Pago de pedido · edith | *(vacío)* | *(vacío)* | *(vacío)* | Efectivo | **S/80.00** | Alex Ramos |

**Validación con el ejemplo:** tres tickets POS = S/63.30; pagos de pedido S/100.00; cobros registrados S/163.30. La columna `Importe movimiento` debe sumar S/163.30, si estas son todas las operaciones y no hay anulaciones/reembolsos en el filtro. El `Subtotal producto` nunca debe agregarse otra vez al total financiero. No afirmar que S/100 es una nueva venta comercial de pedido: es dinero recibido.

**Si el producto en el catálogo realmente se llama `10`, mostrar `10`; no inventar `Producto 10` como dato**. En el ejemplo `Producto 10` es una etiqueta ilustrativa. Si no existe nombre registrado, usar `Producto sin nombre` sin añadir lecturas Firestore ni mostrar el ID.

### Opción técnica de implementación

Definir una representación intermedia tipada para el XLSX, p. ej. `{ kind: 'pos-sale'|'pos-item'|'pos-void'|'order-payment'|'order-accounting-refund', ... }`, manteniendo `kind` únicamente para el formato y las pruebas, no como campo técnico visible. A partir de ella derivar columnas, totales y estilos. El modelo financiero `aggregateReport()` y sus fuentes siguen siendo **la única autoridad monetaria**.

No conservar a la vez una fila `TOTAL TICKET` y el mismo importe en la columna `Importe movimiento`: evitar doble conteo. Si por compatibilidad se mantiene una fila de total, el importe debe ubicarse exclusivamente en ella y las líneas de producto tener el importe financiero vacío. Escoger **una** política estable y probarla. Preferencia de UX: importe financiero en la **primera línea**, sin fila extra de total para cada ticket.

## 3. Auditoría dirigida al resto de las hojas

No rediseñar las hojas competitivas y útiles; aplicar limpieza contextual:

- **`Resumen_Financiero`**: preservar todos los importes, señales de neto contable vs devolución real y aviso histórico provisional. No eliminar explicaciones contables indispensables.
- **`Comparativa_Sedes`**: conservar nombres de sucursales; aquí son imprescindibles. Evitar una falsa «comparación» cuando solo exista una sede seleccionada, siempre que no rompa el flujo de lectura del usuario.
- **`Productos_Global` / `Productos_Sedes`**: no repetir innecesariamente una hoja por sede si solo hay una sede en el alcance y sus datos son idénticos; no eliminar la comparación si hay varias sedes.
- **`Detalle_<sede>`**: sin columna de sucursal, pagos tipados, sin IDs, totales no duplicados.
- **`Resum_<sede>`**: no añadir otra columna de sede; conservar fecha, POS, anulaciones, pedidos y netos. No confundir cantidad de pedidos con pagos de pedidos.
- **`Auditoría_Pedidos`**: conservar origen, recojo y sede del movimiento cuando realmente son dimensiones diferentes (especialmente vista global). En vista de una sola sede, retirar únicamente las columnas que se vuelvan inequívocamente redundantes. Mantener firma de reembolsos negativos y aclarar que son **contables**, no dinero devuelto probado. No duplicar el total comercial y el cobro como si fueran dos ingresos.
- **`Estado_Pedidos`**: en filtro de una sola sede, evaluar quitar la columna `Sede`; en vista global mantenerla.
- **`Auditoría_Cajas`**: si una única sede ya está indicada por el alcance, evitar repetir la sede; mantener registro por evento, `No declarado`, `No aplica`, `No calculable`, `Conciliación pendiente` y sin fingir saldo físico.

Aplicar una política uniforme de título corto, descripción útil, filtros, columnas en orden lógico, ancho máximo razonable, ajuste de texto, inmovilización de encabezados y semántica de formatos. Evitar nuevas pestañas salvo que exista un caso de negocio concreto y medible: **preferir mantener o reducir hojas**.

## 4. Calidad técnica y seguridad

1. **Columnas por nombre y mapeo de esquema**, no por letras rígidas: la moneda, fechas, anchuras, estilos por tipo, autofiltro e inmovilización deben adaptarse a cada combinación de columnas. Si `!freeze` no serializa en `xlsx-js-style`, conservar la corrección localizada en `writeSalesWorkbook()` y adaptar su fila/posición si cambian encabezados.
2. **Números numéricos reales**: sumas, `Cantidad`, fechas Excel, cobros y negativos deben conservar tipo y formato. Nunca formatear una cantidad como S/.
3. **Sin doble conteo**: reimportar XLSX y verificar que la suma de la columna financiera por sede y global corresponde a `model.summary.netRevenue` (según alcance y período), sin sumar subtotales de líneas ni duplicar compensaciones. Conservar el caso histórico reconocido como **provisional** cuando corresponda; no fabricar conciliación ni corregir dominio mediante presentación.
4. **Seguridad de contenido**: textos de nombre de producto, cliente, responsable, observación y referencia deben seguir siendo texto literal al exportar; impedir inyección de fórmulas (`=`, `+`, `-`, `@` peligrosos) sin romper valores monetarios negativos legítimos. No exportar UID, IDs internos o correos cuando no haya finalidad operativa y autorización.
5. **Sin lecturas nuevas**: reutilizar `sales`, `voids`, `payments`, `contracts`, `sessions`, `people` y `branchesMap` ya disponibles. No llamadas adicionales a Firestore por etiquetas o nombres. El cambio de Excel no debe alterar PDF ni Dashboard ni políticas de caché y suscripción.
6. **Límites**: no retirar `MAX_EXPORT_ROWS` ni publicar hojas parciales como definitivas. Mantener `America/Lima` como zona de procesamiento aunque no se muestre el literal «(Lima)».
7. **Rendimiento**: transformación lineal O(n) sobre los registros ya obtenidos, sin consultas por fila ni generar cientos de estilos únicos. Mantener hojas y tamaños acotados.
8. **Integridad**: no modificar Firestore Rules, índices, scripts de release, Auth, ventas, caja, contratos, anulaciones, stock, persistencia, importes o agregación financiera.

## 5. Pruebas y criterios de aceptación

### QA obligatorio

- Reimportar archivo `.xlsx` con la librería instalada. Comprobar tipos numéricos y sumas en cada hoja por sede y global.
- Caso de usuario: POS Yape 20; POS mixto 37.30 (Ef 10, digital 27.30); POS efectivo 6; dos abonos de pedido de 20 y 80: columna `Importe movimiento` = **163.30**. El mismo ticket de dos artículos aporta **37.30 una sola vez**.
- Abono de pedido no lleva `Cantidad=1`, `Precio unitario=importe` ni `Producto=nombre del cliente`.
- Para `Detalle_Sede Principal`, no existe columna `Sucursal` y el título no contiene `(Lima)`; no se cambia la fecha/hora realmente calculada.
- Para dos sedes, `Comparativa_Sedes` y movimientos de cada `Detalle_<sede>` mantienen distribución correcta; no mezclar sedes.
- Venta anulada, compensación POS, reembolso contable negativo, pagos mixtos, POS multítem, días diferentes, sedes diferentes, mismo negocio / negocio ajeno.
- Cajas vencidas sin arqueo: ningún cero inventado; cada evento independiente.
- Ausencia de referencia, responsable o nombre: fallback visible, nunca UID/ID técnico.
- Evitar fórmulas ejecutables por nombres suministrados por usuarios.
- Congelar encabezados y filtros en columnas correctas, formatos de moneda en las columnas correctas tras suprimir `Sucursal`.
- Workbook máximo, pocas/sin ventas, mes/anual: no romper rechazo por exceso ni el esquema resumido.
- Dashboard, Excel y PDF siguen conciliando; nueva descarga desde dev y preview/PWA; repetir descarga conserva caché y no añade lecturas.

### Comandos locales autorizados a Codex

```powershell
node --test tests/reports.test.mjs tests/plan13.test.mjs tests/plan14.test.mjs
npm run test:spark
npm run lint --prefix frontend
npm run build --prefix frontend
```

Ejecutar además `tests/excel-export.browser.test.mjs` y otras suites Chromium relevantes si están disponibles, **sin instalar dependencias**. Firestore Rules no son parte del cambio; documentar si el emulador no está disponible. Las pruebas que esperan viejas posiciones o títulos deben cambiar a comprobaciones por semántica, preservando sus importes y tolerancia estricta.

**Cierre exigido:** README de resultado `docs/RESULTADOS-EXCEL-DETALLE-CLARO.md` con archivos, ejemplo reimportado, conciliación monetaria, hojas alteradas/no alteradas, métricas de consultas y pruebas PASS/FAIL/BLOCKED. Codex no debe declarar «producción lista» antes de CI del SHA que publicará el propietario.

## 6. Criterio final

La mejora es aceptable cuando el dueño puede identificar una venta POS, sus artículos, el cobro total, un adelanto de pedido, una compensación o un reembolso contable **sin inferir qué significa una columna**, sin sumar dos veces el mismo importe, sin ver IDs ni repetir la sucursal dentro de su propia hoja. El resultado debe ser más simple, no más grande.
