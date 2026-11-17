# MigaPOS P31 — Auditoría técnica y arquitectura de reportes de bajo costo

**Estado:** PROPUESTA, no implementar masivamente todavía.  
**Repositorio:** `saintdeyb321/Mig` · rama `fix/migapos-production-readiness` · commit auditado `1ee06b24d437f7479c872c9e57c9dc79bacaa164` (P30).  
**Objetivo:** conservar integridad financiera, reducir lecturas pagadas de los filtros **mes/año** en dashboard gerencial y exportaciones Excel/PDF, mantener auditorías detalladas accesibles **bajo demanda**, no añadir costos de escritura desproporcionados. No cambiar POS, caja o contratos antes de demostrar equivalencia.

## 1. Evidencia comprobada en HEAD P30

| Componente | Código real | Observación de costo |
|---|---|---|
| Dashboard mes/año | `features/reports/hooks/useReports.js` → `application/reportResource.js` → `infrastructure/sessionReportReads.js` | `window.confirm` avisa el costo, pero aun así descarga ventas, pagos, contratos y anulaciones; el modelo suma en el navegador. |
| Excel/PDF mes/año | `features/reports/hooks/useExportSales.js` → `application/sessionReportReads.js > loadSnapshot()` | El filtro `mes` o `todo` lee *todos* los tickets hasta 10 000 y luego inicia pagos, contratos, compensaciones, cajas y conteo. El límite es **de protección de integridad**, no un presupuesto de lecturas. |
| POS | `features/sales/infrastructure/salesQueryRepository.js > createSalesPeriodReader` | Tres rangos de compatibilidad (confirmedAt Timestamp, createdAt Timestamp/ISO), páginas 200, max 10 000. |
| Pagos de pedidos | `features/payments/infrastructure/paymentRepository.js` + `compatiblePayments.js` + `sparkLegacyPayments.js` | Además del ledger en `payments`, la compatibilidad puede consultar hasta 500 contratos históricos y referencias de sedes. Recibir `requireMigrated:true` no desactiva por sí mismo este barrido. |
| Contratos | `features/contracts/infrastructure/contractPeriodRepository.js` | Consulta contratos completos por `createdAt` en tipos Timestamp e ISO. P30 agregó un `getCountFromServer` específico para anulados por `voidedAt`, que **sí** evita descargar cada contrato cancelado. |
| Cajas | `features/cash-register/infrastructure/cashQueryRepository.js > createCashAuditPeriodReader` | Consulta `openedAt` y `closedAt` (incluyendo aperturas previas al período), deduplica en memoria. Las filas detalladas de auditoría incluyen aperturas, cierres y vencimientos. |
| Anulaciones POS | `features/sales/infrastructure/posVoidQueryRepository.js` | Consulta comprobantes `pos_voids` individuales por `occurredAt`. |
| Estadísticas existentes | `daily_stats`, `functions/src/sales/stats.js` | Esquema heredado de actualización de ventas por Functions; **Spark POS actual** (`sparkSalesRepository.js`) no lo escribe, `firestore.rules` bloquea escrituras de clientes a `daily_stats`. No es una fuente completa de ventas Spark, pagos, anulaciones y cajas. |
| Presentación | `salesWorkbook.js`, `managementReportHtml.js`, `ReportParts.jsx` | El año/mes se titula «Resumen», pero las fuentes siguen siendo documentos individuales. Excel añade `Auditoría_Cajas`, `Estado_Pedidos`, `Auditoría_Pedidos` cuando hay datos incluso en mes/año. |
| Caducidad caché | `application/reportResource.js` | TTL para mes/año 15 minutos; reduce repeticiones dentro de una sesión pero no los barridos entre terminales ni el primer acceso. |
| CI | GitHub Actions para `1ee06b2`, ejecución `44018127485` | Fallo en `tests/spark-financial.rules.test.mjs`, subtest `Plan05 compensates an eight-product mixed ticket once...`, aserción Excel (línea 451). 88/89 pruebas en ese paso; no dar por verde el release. Incidencia separada de P31. |

**Invariante:** ninguna reducción de consultas puede cambiar netos, ventas POS, pagos de pedidos, métodos efectivo/Yape/Plin, tickets anulados, pagos/reembolsos, estado actual de pedidos creados en el período, incidencias de caja ni distinguir diferencias provisionales de confirmadas. Nunca inferir desembolso físico desde «reembolso contable».

## 2. Decisión arquitectónica: separar resumen y auditoría

### A. Consultas detalladas (hoy/semana)

Conservar modelo comprobado actual, límites y `reportViewModel` para hoy/semana. Optimizar su lectura solo con evidencia y sin cambiar cierres/finanzas. Para el dueño, auditoría detallada sigue disponible para investigar una operación. Registros paginados con cursores (50–100 filas por página), fecha y sede; petición explícita, jamás precargar el año. No usar offsets.

### B. Tablero e informe gerencial mes/año

Crear `monthly_report_snapshots_v1` (o similar) **separado de `daily_stats` legacy**. Documentos de resumen por negocio/mes y opcionalmente sede/mes; no incluir arreglos infinitos de tickets, contratos, imágenes, o listas completas de productos. Un documento *global* por negocio/mes hace posible cargar 1 resumen mensual o 12 resúmenes para el año; en los meses activos puede mostrar fecha/hora de actualización y estado de completitud. El dashboard y el XLSX/PDF deben consumir el **mismo modelo de resumen** y mismos indicadores, sin volver a `loadSnapshot()` masivo para mes/año.

Campos conceptuales:

```js
{
  schemaVersion: 1,
  businessId, branchId: 'global', periodKey: 'YYYY-MM',
  complete: true, calculatedThrough: '<server instant>',
  sourceRevision: '<watermark/checkpoint>',
  pos: { cashCents, digitalCents, completedTickets, voidedTickets },
  contracts: { cashCents, digitalCents, paymentCount, cancelledInPeriod },
  adjustments: { posCashCents, posDigitalCents, refundsCashCents, refundsDigitalCents },
  cash: { reviewRequiredCount, confirmedShortCents, confirmedExtraCents, unverifiedCount },
  // summaryByBranch: solo métricas compactas por sede. Prohibido arreglos de movimientos.
}
```

Usar enteros de centavos para acumulaciones; `netCents` siempre debe derivarse/validarse contra componentes. Año: sumar los 12 meses del mismo negocio y esquema, sin duplicar una anulación, reembolso ni pago. La fecha `calculatedThrough` y `complete` **no certifican saldo físico** ni auditoría externa. Si la proyección está incompleta o la migración histórica no está verificada, mostrar error/aviso, nunca cero ni totales parciales como definitivos.

**Top 5:** el top 5 del año NO se obtiene sumando los top 5 de cada mes (un sexto producto recurrente puede ser primero anual). Requiere proyección anual por producto, catálogo anual o cálculo confiable en backend; dejarlo como `no disponible` hasta tener proyección exacta, no inventarlo.

**Estados de pedidos:** distinguir dos métricas diferentes: `pedidos creados en el período según estado actual` y `pedidos anulados durante el período` (P30). Cuando cambia hoy el estado de un pedido creado el mes pasado, puede modificarse su resumen histórico de estados; diseñar una proyección revisable y versionada, no un contador acumulativo por fecha de operación.

**Incidencias de caja:** distinguir apertura, cierre, vencimiento, caja que requiere revisión, estimación y diferencias confirmadas. Un cierre reconciliado con diferencia cero no es incidencia. Reabrir/reconciliar/cambiar estado actualiza o invalida el agregado sin duplicar eventos.

### C. Generación de los resúmenes

**Opción 1 — Sin Cloud Functions/Blaze (primera etapa, conservadora):**

1. Probar `getAggregateFromServer()` / `sum()` / `count()` en las colecciones y campos que sí tengan semántica estable. Una consulta de agregación escanea entradas del índice, no recupera cada documento; se factura típicamente por bloques de 1 000 entradas y hay mínimo de una lectura.
2. Un mismo `getAggregateFromServer` puede obtener varias `sum/count` sobre la **misma selección**; evitar N consultas separadas por cada tarjeta. Medir los index entries por consulta.
3. No convertir importes sin normalizar a netos estimados: ventas Spark originales y `pos_voids`, ventas legacy `voided`, pagos mixtos, reembolsos y fechas requieren pruebas de exactitud. `sum(sales.total)` **por sí sola no es ingreso neto**.
4. El primer resultado parcial válido puede ser `PEDIDOS ANULADOS` (ya existe P30). Las restantes métricas solo pasarán a agregación después de prueba de paridad; si no es posible, mantener día/semana y avisar que el resumen histórico no está habilitado hasta disponer de su proyección.
5. No introducir Cloud Functions como dependencia automática: **Cloud Functions for Firebase requiere Blaze**, y su ejecución/lecturas/escrituras tienen costos.

**Opción 2 — Completa para SaaS (recomendada a escala, previa medición):** generación *server-side* autorizada de `monthly_report_snapshots_v1` y, si es necesario, snapshots diarios. Elegir una estrategia de procesamiento incremental sin dobles cargos contables:

- Derivar movimientos exclusivamente de recibos confirmados (`sales`, `pos_voids`, `payments`) y estados `contracts`, `cash_sessions`, nunca de datos cacheados del cliente.
- Contar cada movimiento una vez mediante identificador determinista `(sourceType, sourceId, version)` y deduplicación persistente/checkpoint; usar una transacción para aplicar un delta y marcarlo aplicado. Los triggers y reintentos son al menos una vez: sin idempotencia se inflaría el dinero.
- Movimientos retroactivos: atribuir anulación o reembolso a **su fecha efectiva** en Lima, no a fecha de venta/creación; revisar cambios de estado de contrato/arqueo sobre períodos anteriores.
- Evitar un único documento caliente actualizado por cada ticket de todas las sucursales. Preferir consolidación por lotes y por sede/período; proyectar resumen global mensual de forma controlada. Medir escrituras, lecturas de Functions y contention; la reducción de lecturas **no es gratuita**.
- Versionar (`schemaVersion`, `sourceRevision`, `calculatedThrough`) y publicar el snapshot como `complete:true` **solo tras** validar suma de sedes, canales y movimientos. Fase de «shadow mode» que compare 100 % contra `aggregateReport` actual en datos de prueba e históricos verificados.
- Para backfill histórico: una lectura controlada de la fuente es inevitable. Ejecutar **una sola migración administrativa** paginada con checkpoint, límites de costo y validación, jamás repetirla en cada apertura del dashboard.
- Seguridad: solo servidor/administración confiable puede escribir resúmenes; el dueño solo lee del `businessId` autorizado y los cajeros no obtienen datos de otras sedes. No modificar `daily_stats` heredado ni debilitar Rules.

### D. Auditorías de caja y pedidos mes/año

**Separar exportación consolidada de auditoría documental.** El botón «Mes/Año» genera `Resumen_Financiero`, resumen por sede, canales, anulaciones e incidencias agregadas y evolución mensual (12 valores al año) sin cargar movimientos individuales. No construir `Auditoría_Cajas`, `Auditoría_Pedidos`, ni `Estado_Pedidos` extensos en esos filtros; mostrar una nota «El detalle está disponible en Auditorías».

Proponer accesos independientes:

- **Auditoría de cajas:** filtros sede, rango acotado, `solo incidentes` por defecto; consultar `cash_sessions` paginado por fecha/estado (o índice de incidencias materializado si se desea por fecha de vencimiento) y abrir un turno individual por ID para ver arqueo y comprobantes. No consultar todas las aperturas/cierres del año en paralelo.
- **Auditoría de pedidos:** filtrar por sede, número de pedido, rango de pago y tipo (adelanto, abono, reembolso); `payments` paginados, `contracts` únicamente por ID de esa página para nombres/estados, sin un barrido completo de contratos legacy por defecto. Si `requireMigrated` o verificación falla, informar bloqueo y ofrecer proceso explícito administrativo de migración.
- **Historial anual descargable completo**: no puede ser «0 lecturas» si se solicita cada movimiento. Requiere paginación por meses, exportación separada y consciente del costo, o un archivo de archivo pre-generado y autorizado (reutilizado para consultas), no el dashboard.

### E. Reglas de rendimiento y UX

- Nunca precargar detalle de mes/año al abrir la pantalla. Eliminar la confirmación alarmista **cuando** se cambie a snapshots baratos.
- 1 consulta de 1 snapshot global para un mes, máximo 12 documentos globales para un año; sin consultas ocultas de `sales/payments/contracts/cash_sessions/pos_voids` desde mes/año. Si hay desgloses por sede, usar snapshots compactos o lecturas explícitas y acotadas por sede.
- Prohibido hacer `getDocs()` con `limit(10_000)` y llamarlo «resumen». Cortar antes de consultas amplias y mostrar error claro si no está preparado el snapshot.
- Año/mes muestran `Actualizado hasta hh:mm (Lima)` y `Resumen verificado` / `Actualización pendiente`; nunca cifras parciales como completas ni ingresos mezclados con diferencia de caja.
- TTL por identidad/tenant/sede/período/versión/revisión; invalidación al cambiar de usuario/negocio; no confiar en sesión local para habilitar escrituras.
- Instrumentar presupuesto separado de lecturas de consultas de reportes; `Query Explain` (servidor) para inspección de índices facturados, sin hacer auditorías masivas en producción por prueba.

## 3. Presupuesto de referencia (NO medición Firebase real)

Ejemplo anual: 6 000 ventas + 1 600 pagos + 600 contratos + 300 cajas + 200 anulaciones = 8 700 documentos fuente potencialmente recuperados (y podrían existir barridos legacy/páginas adicionales). Alternativa: 12 snapshots globales mensuales = 12 documentos de resumen. **El ahorro de lecturas al consultar el reporte sería ~99.86 % en este ejemplo;** falta contabilizar generación/materialización y posibles lecturas de reglas. Documentos totales no equivalen siempre exactamente a lecturas facturadas: consultar índices, mínimo por query y reglas puede aumentar el importe real.

| Alternativa | Lecturas al consultar | Escrituras extra | Riesgo de paridad | Recomendación |
|---|---|---|---|---|
| Caché TTL existente | Altas en primer acceso | 0 | Bajo | Mantener pero insuficiente |
| `count/sum` de Firestore | Bajas/moderadas por entradas de índice | 0 | Alto si se suman campos no normalizados | Emplear solo con pruebas por métrica |
| Snapshots mensuales materializados | 1 mes; ~12 año por negocio global | Sí, más generación | Medio si no hay idempotencia/checkpoints | **Destino recomendado**, desplegar por fases |
| Descargar auditoría completa automáticamente | Altas | 0 | Paridad actual conocida | **No** para mes/año |
| Auditoría paginada bajo demanda | Acotadas a página | 0 | Bajo si consultas cubren período | **Sí** para detalle histórico |

## 4. Implementación secuencial recomendada a Codex

**P31-A (diagnóstico, sin cambiar contabilidad):**
1. Registrar **contadores de documentos y número de queries** para `mes/todo`, separados por `sales`, `payments`, `legacyContracts`, `contracts`, `voids`, `cash`, `cancelledCount`, dashboard y XLSX/PDF. Fixtures 1/7/30/365 días y 1, 100, 1 000, 5 000, 10 000 movimientos. No usar producción para simular volúmenes.
2. Redactar mapa de origen/cálculo de cada tarjeta/hoja (incluyendo productos, cancelaciones, incidencias, estados y métodos). Asegurar que actualmente `getDailyStats()` vuelve a leer tickets; no tratar `daily_stats` como fuente universal.
3. Prototipo aislado de `read-time count/sum` con pruebas de igualdad en fixtures Spark/legacy. No habilitar en la pantalla si falla una métrica.
4. Separar interfaz `DetailedReportSource` (día/semana) / `SummaryReportSource` (mes/año), sin romper reportes existentes.
5. Entregar presupuesto de costo por estrategia y decisión Spark vs Blaze; sin deploy, nuevos índices/reglas ni migraciones.

**P31-B (proyección financiera y backfill):**
1. Acordar y validar backend autorizado y costo de escritura. Introducir esquema versionado y proyección exacta con deduplicación, estados de integridad y reembolsos contables claramente identificados.
2. Construir snapshots de prueba y compararlos con fuente real en emuladores, incluyendo historiales de períodos cruzados y reintentos.
3. Backfill idempotente manual/checkpoint de históricos; publicar Rules/índices solo tras revisión humana.

**P31-C (cambio de UI/export):**
1. Cambiar el dashboard `mes/todo` y Excel/PDF a snapshots; conservar `hoy/semana` y semántica de exportación detallada.
2. Exportación mensual/anual **gerencial** sin auditoría documental embebida; añadir pantalla/flujo de auditoría paginada independiente por tipo y sede.
3. QA de responsive, cifras, tiempo de generación, privacidad y límites; confirmar que ninguna consulta masiva queda escondida.

**No hacer en esta fase de análisis:** publicar reglas, instalar servicios, activar Blaze, leer la base productiva, producir informes parciales sin aviso, registrar dobles abonos, añadir writes del cliente no verificables, mutar la contabilidad del POS o cambiar la estructura de cierres de caja.

## 5. Criterios de aceptación verificables

- Mes: `<= 1` lectura documental del resumen global por negocio (aparte de verificaciones de reglas y consultas opcionales explícitas); año `<= 12` resúmenes globales. Ningún lector masivo de tickets/pagos/cajas/contratos en el camino feliz mensual/anual.
- `summary.netRevenue = posRevenue + contractRevenue = efectivoNeto + digitalNeto`, con importes centesimales exactos y compensaciones/refunds una sola vez.
- Anulación de venta o pedido de mes anterior aparece en **fecha de anulación**, no altera arbitrariamente la fecha de cobro original; 2 reembolsos del mismo pedido no equivalen a 2 pedidos anulados.
- Los conteos de `estado actual de pedidos creados en mes` y `anulados durante mes` están diferenciados y correctos.
- Cajas con diferencia cero no se cuentan como incidencia, cierres con revisión pendiente no generan faltantes confirmados falsos, vencimientos sin arqueo se distinguen.
- Restaurar/cambiar de sesión, perder red, reintentar la proyección, repetir webhooks y suspender el navegador nunca duplican dinero.
- Pruebas A/B de exactitud y mediciones de lecturas realizadas; registrar costos de los procesos de generación **además** del consumo al visualizar.

## Documentación oficial para decisiones de costo

- Firestore agregaciones: https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- Firestore precios de lecturas/índices: https://firebase.google.com/docs/firestore/pricing
- Escribir agregados: https://firebase.google.com/docs/firestore/solutions/aggregation
- Query Explain: https://firebase.google.com/docs/firestore/query-explain
- Cloud Functions y Blaze: https://firebase.google.com/docs/functions/quotas

## 6. Resultados locales de P31-A

`DetailedReportSource` distingue hoy/semana y `SummaryReportSource` distingue mes/año. Ambos adaptan los lectores documentales verificados que ya usa la aplicación. Dashboard y exportador seleccionan el puerto por período y comparten los recursos y políticas de caché actuales. El prototipo `count/sum` solo vive en pruebas. La alternativa de 1 documento por mes y hasta 12 por año sigue siendo el objetivo para una proyección completa.

### Recorrido actual y medición

- **Dashboard** · Usa la sede activa (o global), abre ventas, pagos con compatibilidad, contratos creados y compensaciones. Mes inicia esos lectores en paralelo. Año espera a ventas antes de solicitar los demás. `aggregateReport` calcula en el navegador.
- **XLSX/PDF** · Usan alcance global. Mes y año esperan el límite de ventas, luego lanzan las fuentes complementarias, apertura/cierre de caja y el conteo P30. Comparten `exportSnapshot` y su caché de sesión. XLSX agrega una búsqueda por ID para identificar pedidos de pagos cuyos contratos quedaron fuera del intervalo de creación. PDF usa el mismo modelo financiero y omite esa búsqueda. El conteo P30 está disponible en su snapshot y actualmente solo se presenta como indicador independiente en Excel.
- **Caché** · TTL de 15 minutos para mes/año y 2 minutos para hoy/semana. El caso caliente usa la misma sesión, negocio, período y sede global. Una sede física, otra terminal o una invalidación puede repetir lecturas. Repetir PDF→XLSX dentro del TTL reutiliza las fuentes comunes.

Ejecutar `node --test tests/plan31-report-cost.test.mjs tests/plan31-report-parity.test.mjs`. `P31_VOLUME` registra las 20 combinaciones de períodos y volúmenes. Usa los lectores reales y un SDK de prueba con documentos sintéticos de dos sedes, fechas Timestamp e ISO y 1 turno por sede por día. Los movimientos de cada combinación son tickets, pagos y compensaciones. Las cajas y contratos se contabilizan aparte. Las celdas de esta tabla son **operaciones del SDK / documentos retornados**. Una agregación cuenta como operación y retorna cero documentos. Los resultados incluyen páginas vacías y documentos que se recuperan más de una vez. La medición cubre preparación de datos. La prueba de paridad reimporta el XLSX y comprueba el HTML imprimible con el mismo modelo.

| Días | Movimientos | Dashboard frío | PDF frío | XLSX frío | Dashboard→PDF | PDF→XLSX |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 8/2 | 13/6 | 13/6 | 5/4 | 0/0 |
| 1 | 100 | 8/201 | 13/205 | 15/225 | 5/4 | 2/20 |
| 1 | 1.000 | 16/1.825 | 21/1.829 | 24/1.854 | 5/4 | 3/25 |
| 1 | 5.000 | 50/8.725 | 55/8.729 | 58/8.754 | 5/4 | 3/25 |
| 1 | 10.000 | 90/16.725 | 95/16.729 | 98/16.754 | 5/4 | 3/25 |
| 7 | 1 | 8/2 | 13/30 | 13/30 | 5/28 | 0/0 |
| 7 | 100 | 8/201 | 13/229 | 15/249 | 5/28 | 2/20 |
| 7 | 1.000 | 16/1.825 | 21/1.853 | 24/1.878 | 5/28 | 3/25 |
| 7 | 5.000 | 50/8.725 | 55/8.753 | 58/8.778 | 5/28 | 3/25 |
| 7 | 10.000 | 90/16.725 | 95/16.753 | 98/16.778 | 5/28 | 3/25 |
| 30 | 1 | 8/2 | 13/122 | 13/122 | 5/120 | 0/0 |
| 30 | 100 | 8/201 | 13/321 | 15/341 | 5/120 | 2/20 |
| 30 | 1.000 | 16/1.825 | 21/1.945 | 24/1.970 | 5/120 | 3/25 |
| 30 | 5.000 | 50/8.725 | 55/8.845 | 58/8.870 | 5/120 | 3/25 |
| 30 | 10.000 | 90/16.725 | 95/16.845 | 98/16.870 | 5/120 | 3/25 |
| 365 | 1 | 8/2 | 19/1.462 | 19/1.462 | 11/1.460 | 0/0 |
| 365 | 100 | 8/201 | 19/1.661 | 21/1.681 | 11/1.460 | 2/20 |
| 365 | 1.000 | 16/1.825 | 27/3.285 | 30/3.310 | 11/1.460 | 3/25 |
| 365 | 5.000 | 50/8.725 | 61/10.185 | 64/10.210 | 11/1.460 | 3/25 |
| 365 | 10.000 | 90/16.725 | 101/18.185 | 104/18.210 | 11/1.460 | 3/25 |

Los valores de XLSX reflejan las lecturas hasta preparar su entrada. En el caso mensual/anual de 10.000 movimientos, Excel rechaza después esa entrada al sumar los pedidos creados al límite de 10.000 filas fuente. Con 10.001 tickets Spark, el guard anual del dashboard y el de exportación de mes/año cortan tras 51 consultas y 10.001 documentos de ventas. El dashboard mensual ya había lanzado otras 5 consultas vacías. Al llegar al sexto lote de legacy se devuelven hasta 600 contratos y se corta antes del ledger. Se midió un segundo barrido total al reintentar, compartido entre consumidores simultáneos.

**Desglose con 5.000 movimientos.** La última columna estima el mínimo de unidades de lectura del módulo bajo el supuesto de que el conteo P30 escanea hasta 1.000 entradas. Añade una unidad por consulta vacía y excluye reglas e índices facturables de otras consultas.

| Módulo | Cuándo se lee | Mes Q/docs | Año Q/docs | Mínimo estimado mes/año |
| --- | --- | ---: | ---: | ---: |
| `sales` | Dashboard, PDF, XLSX | 35/6.750 | 35/6.750 | 6.751/6.751 |
| `payments` | Ledger tras verificar legacy | 6/1.000 | 6/1.000 | 1.001/1.001 |
| `legacyContracts` | Compatibilidad de pagos | 4/375 | 4/375 | 375/375 |
| `contracts` | Pedidos creados en el período | 3/350 | 3/350 | 351/351 |
| `voids` | Comprobantes POS por fecha efectiva | 2/250 | 2/250 | 250/250 |
| `cash` | PDF y XLSX, antes de deduplicar apertura/cierre | 4/120 | 10/1.460 | 122/1.462 |
| `cancelledCount` | Agregación global P30 en exportación | 1/0 | 1/0 | 1/1 |
| `contractAudit` | Búsqueda por ID adicional de XLSX | 3/25 | 3/25 | 25/25 |

Se midieron, además, dos lecturas puntuales de sede para cuatro pagos embebidos en dos contratos. La lectura legacy del ejemplo hizo 3 operaciones y devolvió 4 documentos (2 contratos y 2 sedes). La auditoría XLSX volvió a identificar 2 contratos en un lote. Estos cálculos son presupuestos de la consulta, sin datos de facturación reales. [Precios de lecturas e índices de Firestore](https://firebase.google.com/docs/firestore/pricing).

### Mapa de métricas y cobertura

| Pantalla, indicador u hoja | Origen y cálculo actual | Requisito para un resumen exacto |
| --- | --- | --- |
| Ingreso neto, ventas de mostrador y pagos de pedidos (Dashboard, `Resumen_Financiero`, PDF) | Venta confirmada o histórica admisible; compensación `pos_voids`; adelantos, abonos y reembolsos del ledger compatible. Neto POS + neto pedidos = neto efectivo + neto digital. | Integrar comprobantes por su identidad estable y fecha efectiva Lima. El prototipo coincide al céntimo en fixtures Spark con cobertura canónica. |
| Canales, cobros registrados y ajustes contables | Efectivo, Yape/Plin y mixto por sus componentes de cobro, compensación y reembolso. Los ajustes pueden dar neto negativo. | Campos fiables para cada canal. Los ajustes contables carecen de prueba de desembolso físico o devolución digital. |
| Tickets, anulados POS, promedio, cantidad de pagos y ajustes | Originales válidos y comprobante POS único por ID. Un histórico `voided` sin comprobante excluye el cobro y muestra revisión. El promedio divide el neto POS entre los tickets válidos. Pagos y reembolsos cuentan movimientos separados. | Resolver enlaces original-anulación y advertencias legacy. Derivar el promedio del período completo. |
| Evolución de ventas y comparativas | Agrupación por día y sede. El año agrupa por mes. `Comparativa_Sedes` y PDF muestran netos por sede. | Validar cada sede y la suma global. El resumen necesita desglose temporal diario para la gráfica mensual y mensual para la anual. |
| Dashboard de pedidos, pedidos del PDF y `Estado_Pedidos` | Pedidos creados en el período según estado actual. Con saldo excluye cancelados. | Recalcular la cohorte de creación al cambiar saldo o estado, incluso en meses anteriores. |
| `PEDIDOS ANULADOS` en Excel | P30 cuenta documentos `cancelado` con `voidedAt` dentro del período. Incluye pedidos anteriores y sin cobros. Cada pedido se cuenta una sola vez. | Conservar alcance global autorizado y fecha verificable. Un histórico sin `voidedAt` queda fuera. |
| Top 5, productos del PDF, `Productos_Global` y `Productos_Sedes` | Unidades e importes de artículos vendidos menos compensados. Se consolidan por producto y sede. El ranking agrupa por nombre. | Proyección anual exacta por producto. La prueba demuestra que un producto sexto cada mes puede liderar el año. |
| `Detalle_<sede>` / `Resum_<sede>` | Detalle por ticket y artículo en hoy/semana. Mes/año agrupa por día desde los mismos documentos. La auditoría de pedidos queda aparte. | Resumen compacto con totales y una ruta de investigación documental paginada y autorizada. |
| `Auditoría_Pedidos` | Movimientos del ledger por ID y origen financiero, con estado/número del pedido cuando puede verificarse. | Consulta explícita por período, sede y tipo con cursor y referencias de contratos limitadas a la página. |
| `Auditoría_Cajas`, diferencias y avisos del PDF | Apertura, cierre o vencimiento a partir de `cash_sessions`. La referencia puede usar movimientos del mismo turno. Diferencia confirmada, estimación y vencimiento sin arqueo tienen semánticas propias. PDF muestra hasta seis incidencias. | Conservar fecha efectiva y confirmación, distinguir cero de no declarado, excluir el cierre coincidente de las incidencias. |

`getDailyStats()` recupera los tickets con `getSalesInPeriod()` y proyecta con `salesToDailyStats`. El agregado persistido `daily_stats` pertenece al código histórico de Functions. POS Spark escribe recibos, las Rules bloquean escrituras de cliente en esa colección y el agregado legado carece de cobertura probada de pagos, compensaciones y cierres Spark.

### Alcance del prototipo y presupuesto

- El prototipo ensaya 8 consultas por alcance (3 grupos POS, 1 conjunto de compensaciones y 4 grupos del ledger). Combina conteo y sumas sobre cada selección. Prueba octubre, noviembre, año y una sede física. Con ajustes cruzados el fixture da **−S/30,50 en noviembre** en el modelo actual, el XLSX reimportado y el HTML imprimible. P30 distingue el conteo por fecha efectiva del estado de pedidos por fecha de creación. La prueba legacy reproduce las ausencias de tickets con ISO, mixtos históricos y pagos embebidos. El ledger migrado coincide si los IDs deterministas se deduplican. Un `sum` omite tipos no numéricos y combinar varios campos puede excluir documentos que carezcan de alguno. Sigue pendiente validar cobertura de índices, Rules del alcance autorizado y coherencia temporal entre las ocho consultas. Firestore ejecuta estas agregaciones contra servidor, sin caché offline ni listeners. [Agregaciones, filtros y límites de Firestore](https://firebase.google.com/docs/firestore/query-data/aggregation-queries).
- **Spark actual** · Mantener P30 y las fuentes documentales. `count/sum` de servidor consume cuota de Firestore: estimar `max(1, ceil(entradasEscaneadas / 1.000))` por consulta en el supuesto estándar. Ocho consultas cuestan al menos ocho unidades, aun con conjuntos vacíos. La cuota gratuita de referencia es de 50.000 lecturas y 20.000 escrituras diarias por base elegible, compartida con operación normal. Para estimar un importe monetario hacen falta el índice elegido, las lecturas de Rules y la tarifa de la región. [Precios de Firestore](https://firebase.google.com/docs/firestore/pricing).
- **Consulta de snapshots** · El ejemplo de 8.700 documentos fuente pasa a 12 documentos globales al consultar el año (99,86 % menos documentos en ese ejemplo). Un mes requiere uno. El presupuesto de generación es aparte. Si se consolidan dos sedes y global por cada mes, una generación completa reemplazaría hasta 36 documentos de resumen por año y negocio, además de las lecturas de origen, verificaciones, checkpoints e invalidaciones. La deduplicación incremental costaría, como mínimo, una escritura de marcador por movimiento aplicado y las de consolidación, más reintentos y verificaciones.
- **Decisión para la siguiente fase** · Una proyección completa requiere un escritor autorizado, verificación de integridad por negocio/sede, revisión de períodos afectados y deduplicación persistente. En Spark, un proceso administrativo externo solo sería viable tras autorizar las credenciales, el presupuesto y la operación. Si se adopta Cloud Functions para esa tarea, el proyecto necesitaría Blaze y presupuesto de ejecuciones, lecturas, escrituras e índices. Validar primero en un entorno separado con una ejecución acotada de Query Explain mediante IAM. Las cifras de P31-A son locales. [Planes Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) · [Query Explain](https://firebase.google.com/docs/firestore/query-explain).

### Validación local

- **PASS** · 100 pruebas Node focalizadas, incluidas las seis de P31-A. Dos escenarios Chromium (XLSX mensual y anual desde preview, PDF semanal y reutilización hacia XLSX), lint, build/PWA y `check:build`.
- **FAIL preexistente** · `tests/spark-financial.rules.test.mjs:451` volvió a fallar en `demo-migapos` al buscar la compensación en la hoja `Detalle_` del ticket mixto. La prueba llama directamente a `buildSalesWorkbook`. La suite histórica `tests/plan13.test.mjs` tuvo seis fallos en expectativas de Excel, arqueo y cupo de fotos. Ambas verificaciones ejercitan las rutas anteriores a la selección de fuente de P31-A. Se conservaron las aserciones.
