# MigaPOS P31-B — Proyección financiera versionada y validación SHADOW (sin despliegue)

**Base auditada:** `saintdeyb321/Mig`, rama `fix/migapos-production-readiness`, commit `64ea46d3c7818e313959c7d83e0a9618065c535e` (P31-A). Este MD es **solo P31-B**: Codex ejecuta el código, no reaudita GitHub ni relee P25–P30. Respetar cambios locales. No alterar el esquema de la base actual sin autorización.

## 0. Hechos verificados — decisiones cerradas

- `frontend/src/features/reports/application/reportSources.js`: `SummaryReportSource` sigue siendo `representation:'document-fallback'`; mes/año **todavía consumen documentos históricos**. Conservarlo hasta que exista un resumen validado y autorizado.
- `useReports.js` → `reportResource.js` y `useExportSales.js` → `sessionReportReads.js` recorren documentos de `sales`, `payments` (incluido legacy), `contracts`, `pos_voids`, `cash_sessions`. P31-A midió en fixtures 5.000 movimientos: mes Dashboard/PDF/XLSX **8.725/8.845/8.870** documentos; año **8.725/10.185/10.210**. Son documentos retornados, NO costo facturado.
- P31-A construyó `tests/helpers/reportAggregationPrototype.mjs`, `tests/helpers/reportQueryFixture.mjs`, `tests/plan31-report-cost.test.mjs` y `tests/plan31-report-parity.test.mjs`; el `count/sum` solo cubre fixtures canónicos y no resuelve pagos embebidos, mezcla Plin histórica, estado de contratos, productos ni caja.
- **Error de fidelidad del simulador:** `reportQueryFixture.mjs > getAggregateFromServer()` filtra previamente filas que carezcan de *cualquiera* de los campos a sumar. En Firestore real, `count()` cuenta los documentos de la consulta y `sum()` ignora campos ausentes/no numéricos: corregir fixture para no otorgar paridad falsa. Documentación: https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- `daily_stats` es histórico de Functions, NO fuente completa Spark: `sparkSalesRepository.js` no lo escribe; `firestore.rules` bloquea escrituras cliente. **No usarlo ni reutilizarlo como resumen moderno.**
- CI histórica no está validada: `tests/plan13.test.mjs` registra 6 fallos en expectativas heredadas; `tests/spark-financial.rules.test.mjs:451` falla al inspeccionar Excel de una compensación mixta. Este último test usa `sheet_to_json({range:4})` pese a que encabezados nuevos comienzan desde fila 1, y busca el texto anterior «desembolso físico» frente al nuevo «desembolso»; verificar ambas causas sin ocultar un bug funcional. Mantener pruebas de reglas y financieras.

## 1. Objetivo de esta ejecución — SHADOW, no producto

Producir un **resumen mensual verificable e inmutable por revisión**, calculado desde fuentes documentales confirmadas, en memoria y en fixtures/emulador `demo-migapos` si ya está instalado. Debe poder reejecutarse de forma determinista, ser serializable sin documentos/IDs sensibles innecesarios y comparar al céntimo con el `aggregateReport` vigente. Preparar el contrato de persistencia, **sin activar escritor, trigger, cron, Cloud Functions ni nuevo índice en producción**.

### 1.1 Entidad: `MonthlyReportSnapshotV1`

Proponer un módulo puro (preferencia: `frontend/src/features/reports/domain/monthlySnapshot.js` o `frontend/src/features/reports/application/monthlySnapshot.js`) con interfaces:

- `buildMonthlySnapshotV1({businessId, periodKey, sales, payments, voids, contracts, sessions, coveredThrough, sourceRevision, ...})`
- `validateMonthlySnapshotV1(snapshot)` que rechaza `undefined`, NaN, cifras no enteras, tenant/mes erróneos, ausencia de evidencia o discrepancias; **0** es válido, “desconocido” no es 0.
- `combineYearSnapshotsV1(months, asOf)` para **todos los meses transcurridos del año hasta `asOf` en Lima** (12 en año cerrado; enero–mes actual en año en curso), mismo tenant/versión y sin duplicados. Meses futuros no existen y no se suman como meses faltantes; meses transcurridos faltantes sí bloquean el año verificable. Mostrar `calculatedThrough` del mes activo y no presentar período todavía abierto como cerrado.
- `snapshotFingerprint(snapshot)` determinista, estable ante reordenación de entrada y sin datos personales; no incluir fecha de ejecución inestable en el hash de contenido.

Documento conceptual para posterior escritor *exclusivamente confiable*: `monthly_report_snapshots_v1/{safeBusinessId}_{YYYY-MM}`; usar ID determinista, sin exponer fotos, clientes, observaciones ni listas de tickets. **No implementar todavía ninguna lectura o escritura a esta colección en la app.**

Campos mínimos: `schemaVersion:1`, `businessId`, `periodKey:'YYYY-MM'`, `scope:'global'`, `status:'shadow'|'verified'|'incomplete'`, `sourceRevision`, `calculatedThrough`, `coverage` (ventas Spark+legacy; ledger migrado+legacy; anulaciones; contratos; cajas), `finance` con **centavos enteros**, `counts`, `channels` (cobros, compensaciones POS, reembolsos por efectivo y digital), `branches` compacto, `byDay` compacto y `cashReview` separado de ingresos. Formato debe permitir añadir sede y control anual sin romper V1. **Prohibido** arrays de movimientos originales o mapas de todos los tickets/fotos; prever límite de documento 1 MiB.

### 1.2 Paridad contable obligatoria

- **Fuente de verdad = código vigente** `aggregateReport` / `reportViewModel` / `cashAuditEvents` / `cashReviewPresentation`, no volver a programar fórmulas de dinero distintas. Acumular/serializar en centavos enteros, nunca sumar floats en proyecciones.
- Conservación: `neto = POS neto + pedidos netos = efectivo neto + Yape/Plin neto`, con compensaciones y reembolsos aplicados **una vez** según ID. Fondo de caja, arqueos, estimaciones y sobrantes/faltantes **NO** se convierten en ventas.
- POS histórico con `voided` sin recibo vinculado: no presentar como confirmado; `coverage` incompleta o advertencia explícita. Un recibo `pos_voids` de hoy que compensa venta de mes anterior se imputa a fecha de compensación; conservar venta original en su fecha.
- Pedidos: separar `pedidos cancelados durante el mes` por `voidedAt` de `pedidos creados en el mes según estado actual`. El último puede cambiar posteriormente: invalidación y reconstrucción de cohorte cuando se modifica un contrato.
- Cajas: apertura, cierre, vencimiento, diferencia confirmada/estimada, `coincide` y estado posterior. Un cierre con diferencia cero NO es incidente. No inferir desembolso físico de un reembolso contable.
- Productos: **NO** calcular Top 5 anual sumando Top 5 mensuales. En V1 separar cobertura de productos; preparar proyección por producto/bucket o indicar indisponible si no existe catálogo verificable. No eliminar el Top 5 de la versión actual.
- Si un mes de origen carece de datos migrados o hay una consulta que falla, `status:'incomplete'` y **prohibido** emitir cifras como «verificadas». Nunca reemplazar ausencia por cero.

### 1.3 Idempotencia y actualización eventual

- Construcción *full recompute* del mes desde el mismo conjunto de recibos confirmados debe producir el mismo fingerprint y montos (incluyendo reintento o entradas reordenadas). No insertar `FieldValue.increment()` en un snapshot sin deduplicación de eventos.
- Preparar un `planMonthRebuild(changedEvent)` puro que identifique meses afectados por: venta confirmada, `pos_voids.occurredAt`, `payments.occurredAt` y refund, `contracts.createdAt` / `contracts.voidedAt` / cambios estado-saldo, `cash_sessions.openedAt/closedAt` y reconciliación. Prohibido recomputar el año entero por un cambio de un turno.
- La persistencia futura debe ser **escrita por actor confiable**, con `sourceRevision` / CAS/checkpoint, validación global=Σsedes y publicación solo cuando el lote sea coherente. No crear funciones automáticas sin aprobación de plan Spark/Blaze y presupuesto de writes; todo queda SHADOW.

## 2. Validaciones prácticas sin costos productivos

**A. Corregir el fixture Firestore:** `tests/helpers/reportQueryFixture.mjs`: `count()` incluye todas las filas devueltas por la consulta, `sum()` ignora valor ausente o no numérico individualmente. Añadir test que combine `count`, `sum(a)`, `sum(b)` con valores ausentes y strings; evitar que el mismo fixture produzca una paridad artificial.

**B. Suite P31-B nueva:** `tests/plan31-monthly-snapshot.test.mjs` (o nombre equivalente) con casos concretos: mes sin operaciones; 2 sedes y totales globales; venta mixta exacta; reembolso pedido; anulaciones POS intra/intermes; doble recibo idéntico y conflicto de ID; contrato antiguo cancelado este mes sin pagos; caja vence sin arqueo y caja que cuadra; fallo de migración; periodos Lima 31/10→1/11 y cierre anual; reordenación de fuentes; Top 5 anual recurrente; 12 snapshots de año cerrado, año en curso con meses futuros ausentes y mes transcurrido faltante; repetición del mismo backfill. Paridad **al céntimo** con `aggregateReport`, sin omitir canales/volúmenes.

**C. Simulación de costos:** reutilizar P31-A con 100/1.000/5.000, registrar por separado «lecturas para construir» vs «lecturas estimadas al visualizar»; métricas de documentos fuente, documentos snapshot, operaciones y escrituras potenciales de checkpoint. No afirmar que la simulación mide facturación real de Firebase.

**D. CI histórica:** en una corrección mínima y separada de la lógica P31, ejecutar `node --test tests/plan13.test.mjs`; identificar los 6 fallos reales por mensaje. Actualizar expectativas **solo si** están obsoletas (límite 6 fotos, encabezados Excel nuevos, textos UX); de lo contrario corregir función. En `tests/spark-financial.rules.test.mjs:451`, usar `tableRows` o lectura XLSX con encabezado real y comprobar `COMPENSACIÓN POS` por importe negativo y nota contable vigente, sin quitar la aserción ni volver a `range:4`. Ejecutar `npm run test:spark:rules` solo si emuladores ya instalados y documentar qué pasó; no mutar datos de producción.

## 3. Alcance y archivos

**Tocar principalmente:** `frontend/src/features/reports/domain/` o `application/` (módulos puros nuevos), `tests/helpers/reportQueryFixture.mjs`, `tests/plan31-report-parity.test.mjs`, `tests/plan31-monthly-snapshot.test.mjs`, pruebas históricas focalizadas **solo por defectos demostrados**. Mantener `reportSources.js` y `useReports/useExportSales` sin conexión a proyección. Actualizar brevemente sección final del propio plan de P31 si es útil; no expandir documentos antiguos.

**No tocar:** POS operativo, reglas, índices, Firebase productivo, Cloud Functions desplegables, `daily_stats` legacy, contrato/estado de caja, foto/reembolso, almacenamiento, UI visual y dashboard, exportador actual, servicio de autenticación. No crear nuevas dependencias ni servidor ni instalar herramientas.

**Comandos de validación sugeridos:** `node --test tests/plan31-report-cost.test.mjs tests/plan31-report-parity.test.mjs tests/plan31-monthly-snapshot.test.mjs tests/plan13.test.mjs`; `node --test tests/reports.test.mjs`; `npm run indexes:check` solo si cambió catalogación de consultas; `npm run test:spark:rules` solo con emuladores presentes. No git/gh/GitHub, no commit/push/deploy, no cambios manuales de Firebase.

**Criterio de salida:** resumen SHADOW completo en fixtures canónicos con igualdad céntimo/estados/fecha Lima, fallo explícito en legacy incompleto, reintento determinista sin duplicación, pruebas históricas sin aserciones suprimidas, y reporte corto de costos para construir/leer. No declarar una reducción **real** de lecturas en mes/año: eso corresponde a P31-C tras aprobación del mecanismo confiable y presupuestos.

## 4. Resultado local P31-B

- `monthlySnapshot.js` reutiliza el modelo financiero y las clasificaciones de caja vigentes. El resultado es inmutable y contiene céntimos, conteos, canales y desgloses aditivos por sede y día. La validación comprueba ambos desgloses contra el total global e impone un presupuesto conservador de 512 KiB JSON. Productos quedan como `unavailable`.
- El proveedor futuro debe aportar los documentos confirmados, los pagos legacy normalizados y deduplicados con el ledger, el conjunto de cancelaciones por fecha efectiva y la evidencia por fuente. Una fuente fallida puede marcarse con su cobertura en `false`. Una proyección incompleta devuelve cifras nulas. Un conflicto de IDs o de negocio se rechaza. La validación estructural requiere complementarse con evidencia del escritor confiable.
- `calculatedThrough` es el corte financiero, acotado al fin del mes. `evidenceThrough` conserva el corte de la revisión de origen, incluso cuando el mes anterior se reconstruye tras una corrección. La combinación anual exige todos los meses transcurridos y evidencia disponible para el `asOf` solicitado. SHA-256 identifica el contenido sin la revisión administrativa ni la hora de lectura de esa evidencia.
- `planMonthRebuild` reúne fechas anteriores y nuevas, incluido el mes de creación de un pedido cuyo estado cambia. Una anulación POS afecta su fecha efectiva y también puede invalidar un original legacy cuando aporta el comprobante faltante. La reconstrucción de caja usa apertura, cierre y vencimiento sin expandirse al año entero.
- El simulador de diagnóstico cuenta las filas seleccionadas y suma cada campo numérico por separado. La prueba con ausentes y textos detecta huecos de cobertura. Firestore documenta que una agregación combinada de campos distintos puede restringir el conjunto al que contiene todos los campos. La comparación de este fixture por sí sola carece de evidencia para activar consultas agregadas. [Agregaciones Firestore](https://firebase.google.com/docs/firestore/query-data/aggregation-queries).

| Movimientos simulados | Operaciones de construcción | Documentos fuente retornados | Documentos de resumen al visualizar |
| ---: | ---: | ---: | --- |
| 100 | 14 | 324 | 1 mes / 12 año cerrado |
| 1.000 | 22 | 1.966 | 1 mes / 12 año cerrado |
| 5.000 | 56 | 8.916 | 1 mes / 12 año cerrado |

La construcción simulada reutiliza el snapshot documental de P31-A e incluye una lectura de cancelaciones para obtener fecha y sede. El presupuesto supone una escritura de snapshot y una de checkpoint por revisión que agrega contenido, con cero escrituras en un reintento idéntico. Las pruebas hacen cero escrituras de proyecciones. Los retornos observados y la estimación de visualización son métricas distintas de la facturación.
Los snapshots serializados midieron 25.657, 26.062 y 26.447 bytes respectivamente.

Las correcciones históricas conservan las aserciones. P13 separa el neto POS del ledger de pedidos en detalle, verifica cupo 6 con conservación de 20 fotos y comprueba los estados de cierre y de anulación actuales. P05 localiza el encabezado real de la hoja y exige una sola compensación por −S/10, estado `ANULADO` y la nota contable vigente.

**PASS** · 116 pruebas Node (incluidas las 22 P13), lint y 89 pruebas de Rules con el emulador existente `demo-migapos`, incluida P05. Se ejecutó el guard de aislamiento y la misma lista de archivos del script Spark. La primera ejecución con `--index_file` falló en tres pruebas de backups porque el emulador Native rechaza esa opción. La repetición con la configuración Native estándar aprobó las 89 pruebas.

Para P31-C quedan el escritor autenticado, un checkpoint/CAS por revisión coherente, la aprobación de un backfill acotado, el costo real de índices y el contrato para productos. `SummaryReportSource` conserva `document-fallback`.
