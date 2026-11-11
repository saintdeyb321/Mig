# MigaPOS · Detalle claro en Excel

## Cambios del exportador

El detalle anterior asignaba cantidad 1, precio unitario y subtotal a los pagos de pedidos. También separaba el total del ticket de sus artículos y repetía la sede en la propia hoja. La regresión del caso S/ 163,30 falló contra esa salida antes del cambio. El registro está en `.release/qa-excel-detalle/baseline.log`.

Cada `Detalle_<sede>` identifica ventas POS, artículos adicionales, compensaciones POS, adelantos, abonos y reembolsos contables. `Importe movimiento (S/)` contiene el importe una vez por operación, en la primera línea del ticket. `Subtotal producto` describe los artículos. Los pagos de pedidos conservan el cliente, el medio de pago y la referencia comercial disponible, con los tres campos de artículo vacíos. Los tickets históricos sin comprobante vinculado siguen excluidos de los cobros y señalados como pendientes de conciliación.

Las fechas y horas se atribuyen con `America/Lima` y se escriben como valores numéricos de Excel. Los títulos del detalle indican sede y período. El formato de moneda, los anchos, el filtro y la inmovilización de encabezados se derivan de las columnas presentes. Los nombres y observaciones se exportan como texto literal. La hoja identifica las referencias y los responsables ausentes con etiquetas comprensibles.

## Reimportación del caso de aceptación

| Movimiento | Subtotal producto | Importe movimiento |
| --- | ---: | ---: |
| Venta POS Yape | S/ 20,00 | S/ 20,00 |
| Venta POS mixta | S/ 33,30 | S/ 37,30 |
| Segundo artículo del ticket mixto | S/ 4,00 | |
| Venta POS efectivo | S/ 6,00 | S/ 6,00 |
| Adelanto de pedido Yape | | S/ 20,00 |
| Abono de pedido efectivo | | S/ 80,00 |
| **Total** | **S/ 63,30** | **S/ 163,30** |

El resumen reimportado muestra S/ 163,30 en cobros registrados. Los S/ 100,00 de pedidos corresponden a pagos. El desglose del ticket mixto registra S/ 10,00 de efectivo y S/ 27,30 de Yape/Plin. Las pruebas de períodos y sedes verifican el neto firmado de compensaciones y reembolsos contra Dashboard y PDF. Una compensación o reembolso contable carece de evidencia de desembolso físico o digital por sí solo.

## Hojas y lecturas

| Hoja | Resultado |
| --- | --- |
| `Resumen_Financiero` | Indica el alcance y conserva los importes por canal y la advertencia histórica provisional. |
| `Detalle_<sede>` y `Resum_<sede>` | Atribución por pestaña. El resumen mensual y anual conserva el neto, los tickets y los pagos separados por día. |
| `Comparativa_Sedes` y `Productos_Sedes` | Se incluyen cuando el informe global tiene movimientos en más de una sede. `Productos_Global` conserva los artículos del alcance seleccionado. |
| `Auditoría_Pedidos` | Conserva origen y recojo. Incluye sede del movimiento en la vista global. El total comercial sigue siendo una referencia. |
| `Estado_Pedidos` y `Auditoría_Cajas` | Incluyen sede en la vista global. La caja conserva eventos independientes de apertura, cierre y vencimiento, con «No declarado» y «No calculable» cuando corresponde. |

Se añadieron **cero consultas a Firestore**. La prueba Chromium contó cuatro llamadas simuladas al preparar un período en frío y cero al reabrir la vista previa o repetir la descarga. El paso de PDF a Excel hizo una llamada de auditoría histórica que ya existía. La repetición de la descarga reutilizó el mismo Blob. Las mediciones corresponden a fixtures locales.

## Verificaciones locales

| Control | Resultado |
| --- | --- |
| Node (`reports`, `plan13`, `plan14`) | **PASS 69/69**. Incluye 10.000 líneas reimportadas en el límite, rechazo a partir de 10.001, dos sedes, aislamiento por negocio, histórico provisional, fechas, fórmulas como texto y conciliación de céntimos. |
| Chromium (`excel-export.browser.test.mjs`) | **PASS 3/3**. Descargas reales desde Vite dev y preview/PWA, reintentos de carga, aislamiento de alcance, reimportación y PDF local. |
| Lint y build/PWA | **PASS**. Precaché verificada de 2,89 MiB y carga diferida de Excel. Vite avisó de chunks mayores de 500 kB. |
| `npm run test:spark` | **FAIL 80/81**. El único fallo es el inventario Markdown. |
| Inventario Markdown | **FAIL 24/25**. Se registraron las seis rutas exactas solicitadas. El inventario señala cinco documentos locales de marketing adicionales. |
| Firestore Rules con emulador | **BLOCKED**. Java no está disponible en PATH de PowerShell. Se actualizó la aserción XLSX de la suite financiera para el nuevo encabezado. |

Los registros están en `.release/qa-excel-detalle/`. La prueba de inventario señala estas rutas adicionales fuera del encargo:

- `docs/PLAN-CIERRE-VIDEO-PROMOCIONAL-MIGAPOS.md`
- `docs/PLAN-MIGAPOS-VIDEO-V2-BRAG-MOVIL.md`
- `docs/PROMPT-CODEX-CONTINUAR-VIDEO-MIGAPOS.md`
- `docs/PROMPT-CODEX-MIGAPOS-BRAG-V2.md`
- `docs/PROTOCOLO-COLABORACION-VIDEO-MIGAPOS.md`

La verificación de CI queda pendiente del commit del propietario.

## Archivos modificados

- `frontend/src/utils/salesDataProcessor.js`
- `frontend/src/utils/excelHelpers.js`
- `frontend/src/features/reports/application/salesWorkbook.js`
- `frontend/src/features/reports/application/contractLedgerReport.js`
- `frontend/src/features/reports/application/cashAuditRows.js`
- `tests/reports.test.mjs`, `tests/plan13.test.mjs`, `tests/plan14.test.mjs`
- `tests/excel-export.browser.test.mjs`, `tests/spark-financial.rules.test.mjs`, `tests/ui-security.test.mjs`
- `docs/RESULTADOS-EXCEL-DETALLE-CLARO.md`
