# MigaPOS · P28 v2 — Correcciones finales sobre HEAD 350ba123

**Base exacta auditada:** `saintdeyb321/Mig`, rama `fix/migapos-production-readiness`, commit `350ba1231093648c8cf01eeedb87905e6655f3cf` («Mejora de reportes», 16/11/2026). Es 1 commit posterior a `07e56cc`. **Este archivo sustituye por completo el P28 anterior**; no combinarlos.

**Codex solo ejecuta:** no auditar, abrir planes antiguos, usar git/gh/GitHub, instalar paquetes ni cambiar Rules, índices, permisos, datos persistidos, commit/push/merge/deploy. Respetar cambios locales y limitar ediciones a rutas citadas.

## 0. Qué YA implementó el último commit (NO repetir)

| Área | Confirmado en código `350ba123` | Preservar |
|---|---|---|
| Excel | `excelHelpers.createSheet`: encabezado fila 1, celdas dispersas, bordes finos negros `000000` solo con valor, colores compactos y `!freeze`; sin banners «Generado» | Cuadrícula de Excel, medidas, tonos y celdas vacías sin bordes/rellenos artificiales |
| Excel/P27 | `salesWorkbook`: `Productos_Sedes` con `_groupStart`, hojas y totales por canal; tests P27 actualizados | Marcador, ranking, cifras, `TOTAL TICKET`, separación por ticket de 9 pt, integridad del footer |
| Exportación | `useExportSales`: `branchId='global'`, timeout `data-read` 90 s; `sessionReportReads`: lecturas semanales paralelas, reutilización de consultas concurrentes | Una descarga global, aislamiento tenant/identidad/revisión, bloqueos de duplicados, no consultas adicionales innecesarias |
| POS/caja | `POS.jsx` sin `CashRecoveryStatus`; `CashRegisterModals` usa sobrante ámbar/faltante rojo; `.cash-confirm-dialog` con altura automática y máximo | Sin tarjeta, notificaciones de dueño, bloqueo real por vencimiento, validaciones de cierre y modal adaptable |

**Pendiente confirmado:** `cashReviewPresentation` cuenta cierres provisionales con diferencia 0; `cashAuditRows` usa estado técnico y añade textos automáticos; `Productos_Sedes` tiene Sucursal en B; `processSales` mezcla pagos de pedidos en tickets; `Auditoría_Pedidos` no agrupa por pedido; modal de entrega vacío y rojo.

## 1. Clasificación única de incidencias (PDF + KPI Excel + Estado visible)

**Editar:** `frontend/src/features/reports/application/cashAuditRows.js` y `frontend/src/features/reports/application/managementReportHtml.js`; consumo del KPI en `frontend/src/features/reports/application/salesWorkbook.js` (ya llama `cashReviewPresentation`).

Crear **un clasificador puro compartido**. `estimated` ya proviene de las banderas de revisión; **no es incidente por sí solo**:

- `opening` → no incidencia.
- `expiry` → incidencia: «Turno vencido sin conteo», sin dinero inventado.
- `closing` con `counted`, `reference` o `difference` ausentes/no calculables → incidencia «Faltan datos para revisar el cierre».
- `closing` con diferencia **exacta numérica 0** y datos disponibles → **no incidencia**, aunque sea provisional. Estado visible: `Cuadrado` solo si `!estimated`; si `estimated`, **«Sin diferencia registrada · por verificar»**. Si hubiera otro motivo independiente acreditado, no ocultarlo.
- `difference < 0` → incidencia roja «Faltaron S/ X»; `difference > 0` → incidencia ámbar «Sobraron S/ X». Cuando `estimated`, añadir `«importe por verificar»`, **sin suprimir el valor numérico**.

**Invariantes:** no modificar `reconciliationPending`, `requiresFinancialReview`, `closeEstimate.authority`, `verifiedCashDifference`, Firestore ni sumas. Cero provisional no certifica arqueo. KPI `review.totalCount` y PDF usan el mismo clasificador; `visible` máximo 6. Fixture: 7 cierres (+3, +32, −43.30, −25.30 y tres 0) + 1 vencimiento → **5 incidencias** dinámicas.

**PDF:** «Cajas que necesitan revisión». Por tarjeta: **Faltaron/Sobraron S/**, sede, fecha, hora Lima 24 h, cajero, esperado/contado si constan y `Mensaje adjunto: …` solo con nota real. Vencimiento: hora de vencimiento y confirmación si existe. Una nota global «Los importes provisionales necesitan comprobación»; no repetir jerga. Para cierres en el mismo minuto usar segundos reales y, solo si sigue ambiguo, referencia corta basada en sesión real. Conservar `escapeHtml`, A4 y saltos de página.

## 2. `Auditoría_Cajas`: apertura/cierre pertenecen al mismo turno

**Editar:** `cashAuditRows.js`, `salesWorkbook.js`; `frontend/src/utils/excelHelpers.js` **solo** para soporte mínimo de espaciado/horas.

- `cashAuditEvents`: metadato interno de sesión (negocio+sede+ID; identidad de iteración si falta ID). Bloques por sesión ordenados por sede+apertura real y desempate estable; dentro, `APERTURA → CIERRE/VENCIMIENTO`. No fabricar aperturas fuera del período.
- Entre sesiones **1 fila vacía de 13 pt** (`_kind:'group-spacer'`); ninguna dentro de un turno. Sin autofiltro, sin celdas/bordes/rellenos materializados en espacios.
- `Estado`: `Fondo registrado`, `Cuadrado` si 0 verificado, `Sin diferencia registrada · por verificar` si 0 provisional, `Faltante/Sobrante por revisar` si provisionales, `Faltante/Sobrante` si verificados, `Vencido sin conteo`. La columna numérica `Diferencia (S/)` retiene signo y valor original, sin presentarlo como confirmado cuando no lo es.
- `Observación` = solo `Mensaje adjunto: <reportNote(nota de usuario)>` o vacío. No incluir frases generadas de provisionalidad/Firestore/vencimiento en esa columna; conservar el evento y estado.
- Hora Lima; para conflictos del mismo minuto, `HH:mm:ss` real en auditoría y formato específico en `excelHelpers.excelValue`/`formats`, sin alterar el resto.

## 3. `Productos_Sedes`: orden correcto sin destruir P27

**Editar:** `salesWorkbook.js` y, si resulta necesario, `excelHelpers.js`.

- Fijar **explícitamente** columnas `['Sucursal','Producto','Cantidad vendida','Ventas (S/)']`; la sucursal va en **A**, no en B. Mantener valor de sucursal únicamente en primera línea del bloque.
- Reutilizar `_groupStart` P27; ahora resaltar Sucursal en **A**. No duplicar estilos; bordes solo celdas pobladas.
- Separador entre sedes `_kind:'group-spacer'` 13 pt; tickets mantienen 9 pt. Mismo ranking, importes y `filter:false`.

## 4. `Detalle_<sede>`: solo movimientos POS, incluido pie de página

**Editar:** `frontend/src/utils/salesDataProcessor.js` (`processSales`) y `salesWorkbook.js`.

- **Causa comprobada:** `processSales` agrega en sus líneas de pagos `uniqueReportPayments(reportRows(payments, scope))` a los mismos `groupsByBranch` que se exportan a `Detalle_*`. **No añadir esos pagos** (adelantos, abonos, reembolsos de pedidos) a dichos grupos; conservar íntegro `aggregateReport({sales,payments,...})`, `Auditoría_Pedidos`, `Estado_Pedidos`, resumen y `Resum_<sede>` mensual/anual.
- Mantener ventas POS, tickets anulados, compensaciones, artículos, `TOTAL TICKET`, `TOTAL AJUSTE` y separador 9 pt por ticket. No duplicar importes: movimiento POS en su primera línea, subtotales de producto como detalle; las filas de total **no son movimientos adicionales**.
- **Dependencia NUEVA del commit:** `channelFooter(metrics,...)` en `Detalle_*` mezcla POS+pedidos. Su pie debe ser **solo POS**, rotulado `Resumen POS de la sede`, con `metrics.posCash`, `metrics.posDigital` y `metrics.posRevenue` netos; no borrar el pie, ni cambiar el desglose completo de `Resum_*` mes/año. Adaptar sus tests.

## 5. `Auditoría_Pedidos`: grupos por pedido sin perder cobros

**Editar:** `frontend/src/features/reports/application/contractLedgerReport.js` y `salesWorkbook.js`.

- Cada movimiento conserva su importe firmado, sede, recogida, cajero, medio y número comercial. Añadir metadatos internos `_orderKey=[businessId,sourceId]`, `_occurredAt`, `_paymentId` (nunca columnas).
- Agrupar por `sourceId` auténtico, no cliente/número visible. Grupos por primer pago real; dentro por `occurredAt`, desempate `payment.id`; nunca ordenar texto `dd/mm/yyyy`.
- Una fila vacía `group-spacer` 13 pt entre pedidos; `filter:false`. Total del pedido solo referencia, no ingreso multiplicado.
- Respetar `MAX_EXPORT_ROWS`: si separadores elevan el total, fallar sin archivo parcial; no omitir pagos/filas ni ampliar lecturas.

## 6. Modal «Marcar entregado» correcto

**Editar:** `frontend/src/modules/contracts/components/ContractDetailsModal.jsx`; `frontend/src/shared/ui/Dialog.jsx` **solo si hacen falta props opcionales con defaults anteriores**.

`ConfirmDialog` de entrega carece de `children` y hereda botón peligroso rojo. Añadir cuerpo: número comercial real, título «¿Confirmar entrega?», «Confirma solo cuando ya entregaste el pedido» y, si saldo `>0`, «Saldo pendiente S/ X. Esta acción no registra un cobro»; de lo contrario «Quedará marcado como entregado». Altura ajustada, botones centrados y responsive (`Cancelar`, `Confirmar entrega` primario/éxito); conservar busy, Escape, foco, anti-doble clic y `onMarkDelivered`. Si se agregan props a `ConfirmDialog`, deben ser **opcionales** con defaults existentes (otras confirmaciones destructivas siguen rojas).

## 7. Latencia en POS/pedidos/caja: optimizar solo donde esté medido

**Rutas solo ante mediciones concretas:** `frontend/src/features/sales/hooks/usePOS.js`, `frontend/src/features/sales/application/saleQueue.js`, `frontend/src/features/sales/infrastructure/sparkSalesRepository.js`, `frontend/src/features/contracts/hooks/useContracts.js`, `frontend/src/features/cash-register/hooks/useCashRegister.js`.

Ruta POS auditada: `processSale→enqueue cifrado/IndexedDB→flush→runTransaction→verify(getDocFromServer)→acuse local→setLastSale`. Medir `DEV` sin datos sensibles: clic→spinner, enqueue, transacción, verify, acuse→pantalla; también abono/entrega/cierre. Mostrar spinner inmediato; botones de ticket **solo tras verificación remota**. Optimizar únicamente redundancia no financiera medida; conservar idempotencia, stock, caja, cifrado, permisos y recuperación. Si domina red, reportar sin prometer menos de 1 s.

## 8. Pruebas dirigidas; conservar P27

**Archivos test existentes:** `tests/reports.test.mjs`, `tests/excel-export.browser.test.mjs`, `tests/helpers/reportWorkbook.mjs`; `tests/sales.test.mjs` y prueba UI relacionada **solo si cambió su flujo**. Los tests de P27 ya exigen encabezado `A1`, celdas dispersas, bordes negros, estilos y cifras. **Adaptar expectativas, no borrar suites para que pasen.** En particular:

1. Fixture **7 cierres+1 vencimiento** con los valores del usuario: KPI/PDF **5 incidentes**, 3 diferencias cero no listadas; `estimated` no altera la detección de diferencias reales. Caso `null` diferente de cero.
2. `Auditoría_Cajas`: grupos por sesión, sólo 1 separador entre sesiones, observaciones humanas, ceros verificados/provisionales, apertura nocturna fuera de período no fabricada, hora Lima coherente.
3. `Productos_Sedes`: `A1='Sucursal'`, `B1='Producto'`, 13 pt entre sedes, `_groupStart` bold ahora **columna A**, sin bordes/celdas en huecos; totales idénticos. Actualizar test P27 que espera `[33,20]` y `bold` B.
4. `Detalle_*`: ningún movimiento de pedido en cuerpo **ni en pie POS**; anulaciones/compensaciones y subtotales siguen correctos. Rehacer test que antes esperaba `[6,20,20,37.30,80]` dentro de Detalle; demostrar `neto POS + neto pedidos = resumen`, con ajustes por canal sin doble sumar fila `TOTAL TICKET`.
5. `Auditoría_Pedidos`: mismo número de pagos y suma firmada, agrupados por `sourceId`, orden interno cronológico, 13 pt entre pedidos; `Resum_*` mensual/anual continúa reuniendo POS+pedidos.
6. Modal de entrega: saldo 0 y saldo positivo, sin espacio vacío ni botón rojo, sin doble envío; no alterar confirmaciones destructivas generales.
7. Conservar global por tenant, reuse de lecturas, timeout 90 s, PDF A4, Excel sin celdas vacías materializadas, seguridad de exportación, cash/venta con verificación.

**Ejecutar:** `npm run test:reports`, `node --test tests/excel-export.browser.test.mjs`, `node --test tests/sales.test.mjs`, `npm run check:build` (**no** emuladores pesados ni instalaciones). Si falla por entorno, indicar bloqueo real, no inventar OK. Orden: clasificación → caja → productos → POS/footer → pedidos → modal → medición mínima → tests. Respuesta Codex **máximo 12 líneas**, con archivos cambiados, pruebas y mediciones reales; sin git/gh/commit/push/deploy.
