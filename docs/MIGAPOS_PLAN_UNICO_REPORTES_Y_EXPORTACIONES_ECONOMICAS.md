# MigaPOS — Plan único REVISADO: dashboard y exportaciones mes/año sin lecturas históricas masivas (Firebase Spark)

**Repositorio:** `saintdeyb321/Mig` · **Rama:** `fix/migapos-production-readiness` · **HEAD auditado:** `2d7956d3167d921418585cc404083d2668a4595e` (17/11/2026).  
**Estado:** especificación completa para **una única ejecución de Codex**, sin cambios realizados por este documento.  
**Decisiones definitivas del propietario:** (1) Dashboard mes/año automático desde snapshots verificados, **sin advertencia ni botón de consulta histórica**; (2) exportaciones mes/año **solo resumidas**, **sin opción de exportación histórica detallada**; (3) **mantener Firebase Spark y publicar/actualizar snapshots exclusivamente con ejecución administrativa manual autorizada**, sin Blaze ni Functions desplegadas.  
**Alcance:** módulo Dashboard gerencial existente, exportador Excel/PDF, lector de snapshots, tests y guía operativa de activación Spark. No agregar paneles, tablas de auditoría ni botones en Dashboard. No dividir en P31-D/E o nuevas fases.

## 1. Diagnóstico auditado: qué existe y qué falla

1. `frontend/src/features/reports/hooks/useReports.js`: la condición `blocked = isSummaryPeriod(period) && historicalKey !== key` obliga al usuario a confirmar «Consulta histórica pendiente» en mes/año. Tras confirmar, `createReportResource()` descarga ventas, pagos, pedidos y anulaciones individualmente; `frontend/src/modules/Reports.jsx` dibuja el aviso. **Eliminar el camino documental para mes/año, no solo el aviso.**
2. `frontend/src/features/reports/infrastructure/dailyStatsRepository.js`: `getDailyStats()` llama a `getSalesInPeriod()` y recién después a `salesToDailyStats()`. Las filas diarias del Excel **no equivalen a una sola lectura de Firestore por día**. `functions/src/sales/stats.js` pertenece al flujo heredado; Spark no alimenta automáticamente `daily_stats`. Prohibido anunciar ahorros ficticios.
3. `frontend/src/features/reports/hooks/useExportSales.js` ya separa `readVerifiedSummary()` de `sessionReportReads().exportSnapshot()`; el segundo camino se usa con `acceptHistorical`. El exportador normal puede construir la salida resumida, pero el gate `VITE_REPORT_EXPORT_SUMMARIES_ENABLED` está OFF y faltan snapshots de producción certificados. **Eliminar enteramente la opción histórica mensual/anual, no dejarla escondida tras otro botón.**
4. `frontend/src/features/reports/application/summaryDocuments.js` **ya tiene** `buildSummaryWorkbook()` y `managementSummaryReportHtml()`, incluyendo `Resumen_Cajas`, `Resumen_Pedidos`, evolución diaria/mensual, indicadores y catálogo de productos. **Reutilizarlos**; no volver a añadir hojas `Auditoría_*` en mes/año.
5. `summaryReader.js` y `summaryView.js` ya pueden leer y validar proyecciones verificadas P31 por ID determinista y convertirlas en `summary`, `chartData`, `topProducts` y `contractCounts`, con `revision`, `coverage`, `validUntil`, identidad y productos. **El dashboard debe compartir el lector, no duplicar contabilidad.**
6. El commit `2d7956d` eliminó `frontend/src/modules/reports/ReportAudits.jsx`, `reportAuditRepository.js` y la tarjeta «Caja del período». **No reintroducirlos.**
7. El escritor P31 existe en `functions/src/reports/` y el CLI en `functions/scripts/report-backfill.mjs`, pero `firebase.json` Spark no despliega Functions y `REPORT_SUMMARIES_ENABLED` continúa OFF. **El modo Spark manual requiere que un operador autorizado genere/regenere los snapshots**: ni un build web ni un simple gate los crean.
8. La CI remota del commit base `44193615846` falló por la auditoría de seguridad `picomatch`. **No declarar CI verde, no silenciar `audit:security` y no mezclar ese bloqueo con las correcciones financieras.**

## 2. Contrato funcional final — sin excepciones ni exportaciones históricas de mes/año

| Acción | Presentación obligatoria | Fuente Firestore | Prohibiciones |
|---|---|---|---|
| Dashboard Hoy / Esta semana | Tarjetas, gráficos, Top 5 y estados actuales | Consultas actuales acotadas | Cambiar comportamiento, fórmulas o agregar auditorías |
| Dashboard Este mes | **Misma interfaz original**, evolución por día, Top 5 y cifras de **sede activa**; **sin banner histórico** | **Snapshot P31 verificado de la sede**; solo catálogo necesario para Top 5 | Tickets/pagos/cajas/contratos individuales, `window.confirm()`, botón «Consultar documentos históricos» |
| Dashboard Este año | Misma interfaz, evolución por mes y Top 5 anual exacto por sede | Meses transcurridos hasta 12 snapshots P31 de sede + catálogo anual certificado | Recorrer todos los movimientos del año |
| Excel Hoy / Semana | Hojas y detalle actuales, con bordes | Lectores existentes | Cambiar su auditoría o sus cifras |
| Excel Mes | `Resumen_Financiero`, `Evolucion_Diaria`, `Resumen_Cajas`, `Resumen_Pedidos`, comparativa por sede y productos | Snapshot mensual **global** + páginas de productos verificadas | Hojas `Auditoría_Cajas`, `Auditoría_Pedidos`, `Estado_Pedidos` detallado o lecturas históricas |
| Excel Año | `Resumen_Financiero`, `Evolucion_Mensual`, `Resumen_Cajas`, `Resumen_Pedidos`, comparativa y catálogo anual | Hasta 12 snapshots globales y páginas de catálogo anual verificadas | Listados por transacción, descarga de ventas/pagos/contratos/cajas |
| PDF Mes/Año | Resumen visual financiero, **Cajas — resumen** y **Pedidos — resumen** por sede, sin tickets individuales | Mismos snapshots y corte financiero que Excel | Crear un lector independiente que vuelva a descargar movimientos |

**Agrupación:** mes → **fecha Lima × sede**; año → **mes × sede**. Filas de totales globales; si no existen movimientos, mostrar ceros solamente si existe snapshot vacío **verificado**. No emitir identidades de cajeros, documentos de clientes, notas privadas ni listas individuales en resúmenes.

**Fallo seguro y sin consultas costosas:** si el gate está OFF, falta un mes del año, hay índice/Rules sin publicar, el snapshot está caducado, su revisión no concilia, el catálogo está incompleto o cambió el alcance: mostrar «**Resumen no disponible**» con razón comprensible y, si se dispone de evidencia confiable, fecha del último corte en Lima. **No mostrar importes cero falsos, no conservar una vista vencida como actual, no ejecutar fallback a `sessionReportReads()` ni permitir exportación detallada de mes/año.**

**Decisión definitiva de UX:** quitar del módulo Reportes la advertencia histórica **y cualquier acción «Consultar documentos históricos»**. Quitar completamente del exportador mensual/anual **«Exportar historial del período»** y sus rutas `acceptHistorical`; no reemplazarlo por botón administrativo, menú oculto o acceso alternativo. Solo día/semana siguen teniendo auditoría detallada.

## 3. Cambios mínimos de código por archivo

### A. Dashboard gerencial — mes/año directo a snapshots verificados

**`frontend/src/features/reports/hooks/useReports.js`**

- Para `hoy`/`semana`, conservar exactamente `createReportResource()` y sus lectores actuales.
- Para `mes`/`todo`, seleccionar **perezosamente** `readVerifiedSummary({ resources, uid, identityKey, businessId, branchId: activeBranchId, period, revision, includeProducts:false })`, seguida de `buildSummaryView(data, period)` y del recurso de lectura/caché correspondiente. No instanciar `sessionReportReads()` ni hacer sus lecturas ni siquiera cuando el resumen no exista.
- Reintroducir solo el mecanismo mínimo de `createSummaryReportResource()` si es necesario; implementar deduplicación de solicitudes simultáneas, abort al cambiar identidad/sede/filtro, comprobación del `expiresAt`, invalidación por revisión y separación de scopes. No mostrar cifras obtenidas por otro usuario, sede, negocio, corte o revisión.
- Retirar `historicalKey`, `allowHistorical`, `requestHistorical`, `blocked` y todas sus dependencias **para mes/año**. El gate OFF debe devolver «Resumen no disponible» de manera inmediata y sin consultar historial; no ocultar el error como «sin ventas».

**`frontend/src/modules/Reports.jsx`**

- Quitar banner «Consulta histórica pendiente» y botón «Consultar documentos históricos» por completo, **sin abrir un nuevo diálogo ni confirmar lecturas**.
- Conservar exactamente las tarjetas de ingreso neto, POS, efectivo, Yape/Plin, indicadores, estados de pedidos, evolución y Top 5. No agregar «Caja del período», tablas/auditorías, `ReportAudits` ni otros filtros.
- Cuando un snapshot certificado esté disponible, mostrar cifras y «Actualizado hasta ... (Lima)» según corte real. Cuando falte, presentar estado compacto «Resumen no disponible / Pendiente de actualización administrativa», sin valores ficticios ni costos ocultos.

**`reportSources.js` y configuración**

- Conservar **un único gate frontend ya existente**: `VITE_REPORT_EXPORT_SUMMARIES_ENABLED=true` habilita **ambas** lecturas resumidas del Dashboard y Excel/PDF para mes/año. Aunque su nombre sea heredado, documentar claramente su alcance ampliado y **NO** crear otra variable paralela. El gate por defecto queda OFF.
- Los dos caminos de mes/año deben compartir la selección de snapshots y no tener una alternativa automática documental; el Dashboard respeta la sede activa, mientras Excel/PDF agregan todas las sedes.
- Mantener `REPORT_SUMMARIES_ENABLED` **OFF** en el servidor, y no configurar Functions en `firebase.json`.

### B. Excel y PDF — resúmenes, nunca auditorías detalladas en mes/año

**`frontend/src/features/reports/hooks/useExportSales.js` y `frontend/src/modules/ExportSales.jsx`**

- Mes/año: `readVerifiedSummary()` → `buildSummaryView()` → `buildSummaryWorkbook()` / `managementSummaryReportHtml()`. Eliminar `acceptHistorical` (parámetro, flags, estado, etiquetas, reintentos y bifurcaciones); eliminar el botón histórico del `<details>` y su texto de consentimiento para consultas masivas.
- La ruta optimizada **nunca** debe crear `sessionReportReads()` o ejecutar `exportSnapshot()`/`withContractAudit()`, ni siquiera si falla `readVerifiedSummary()`. Corregir las pruebas que todavía esperan el camino histórico; **no** eliminar comprobaciones de permisos, integridad y límites.
- Solo `hoy`/`semana` conservan lectores documentales y `buildSalesWorkbook()`. Mantener rutas de impresión PDF y descarga XLSX sin cambios ajenos.
- PDF y Excel del mismo usuario/negocio/scope/período/revisión y corte pueden compartir snapshot/caché. **No** mezclar global con sucursal ni usar datos caducados. Al cambiar formato, no hacer otra descarga si los datos verificados siguen vigentes.

**`frontend/src/features/reports/application/summaryDocuments.js`**

- Conservar `Resumen_Cajas` y `Resumen_Pedidos` existentes, con encabezados y **bordes visibles en cada celda con información**. En mes, agrupar por día/sede; en año, por mes/sede. No insertar `Auditoría_*`, `Estado_Pedidos` ni una lista de movimientos.
- `Resumen_Cajas`: aperturas, cierres, cuadradas, con sobrante/faltante, vencidas sin conteo, pendientes de revisión, cierres sin verificar y **diferencias confirmadas** (nunca inventar diferencias cuando no se contó la caja).
- `Resumen_Pedidos`: pedidos creados/entregados/pendientes/anulados, adelantos, abonos, reembolsos contables, importes netos y desglose efectivo/Yape-Plin. Separar importe contable de devolución efectiva. No confundir pedidos anulados por fecha de cancelación con su estado al crearse.
- Conservar `Resumen_Financiero`, evolución, Top 5/catálogo y comparativa de sedes; verificar sumas contra métricas POS, reembolsos y documentos legacy, céntimo a céntimo. Respetar el límite físico de Excel y el de tamaño del snapshot.

**`frontend/src/features/reports/application/salesWorkbook.js`**

- **No eliminarlo**: sigue necesario para día y semana. Solo impedir que su ruta con auditorías se invoque desde mes/año normal. Si quedaron ramas muertas específicas de exportación histórica mes/año, retirarlas sin dañar pruebas y operaciones detalladas diarias/semanales.

### C. Spark: snapshots generados manualmente y siempre verificables

- **No activar Blaze**, no desplegar Functions ni triggers/scheduler P31. Los archivos `functions/src/reports/*` se reutilizan como librería administrativa **local** y en el emulador; el único escritor de producción será el CLI existente `functions/scripts/report-backfill.mjs`, ejecutado manualmente por operador autorizado con acceso administrativo seguro.
- Reutilizar las colecciones P31 existentes: `report_month_snapshots_v1`, `report_product_totals_v1`, `report_day_buckets_v1`, `report_source_contributions_v1` y `report_projection_state_v1`. No migrar ni reescribir transacciones, pagos, contratos o cajas para generar resúmenes.
- El operador hace backfill inicial de **todos los meses necesarios, incluso vacíos**, y certifica por negocio y por sede según el lector: validar que el CLI publica snapshots **globales y de sede** compatibles con `keyOf(businessId, branchId, month)`; si no, reparar únicamente la publicación y probarlo en emulador, nunca inventar IDs o falsificar `verified`.
- Para anual, además de los meses individuales `verified`, generar el catálogo anual exacto de productos mediante la opción `--year YYYY --apply`; validar que Top 5 coincide con los productos de todos los meses y sucursales, incluidas anulaciones y fechas cruzadas.
- **Actualizar manualmente** tras cambios de ventas, anulaciones, pagos, reembolsos, contratos o cajas; el corte certificado tendrá fecha/hora Lima y `validUntil`. Un resumen que vence no se mostrará, y el sistema no consultará movimientos de manera automática para «repararlo».
- **Límite operativo explícito:** Spark + backfill manual **no brinda datos en tiempo real ni informes siempre disponibles sin intervención humana**. No prometer a propietarios que cada venta actualizará el mes instantáneamente. Documentar frecuencia operativa de regeneración del mes activo y prioridad de meses históricos afectados por devoluciones/anulaciones. Un operador debe asumir esa rutina antes de activar mes/año.
- Revisar `firestore.rules` y los 6 índices P31 documentados (y el índice P29 `contracts` si falta). **No publicarlos en este encargo**, no eliminar índices antiguos y no crear índices por meras lecturas `getDocFromServer` por ID. Las reglas de escritura de cliente deben seguir denegadas para snapshots y checkpoints; el Admin SDK requiere credenciales fuera del repositorio.

### D. Guía operativa precisa de activación manual — obligatoria para considerar terminado el plan

Actualizar `docs/MIGAPOS_P31_ACTIVACION_REPORTES.md` con un recorrido completo Spark sin Functions:

1. Verificar la CI y las pruebas focalizadas; registrar el bloqueo preexistente de `picomatch` sin modificar ni deshabilitar `audit:security`.
2. Respaldar Rules actuales; publicar **manualmente** las nuevas Rules desde Firebase Console, y verificar los compuestos necesarios y exenciones en la base `(default)`. Esperar «Habilitado» y no dar por hecho que los índices de Git están desplegados.
3. En `demo-migapos` ejecutar el CLI primero como **dry-run** con datos de prueba. Probar `--apply` solamente en el emulador. Medir lecturas de origen, escrituras de contribuciones, buckets, checkpoints, snapshots y productos; confirmar revisiones y que los lectores `global`/sede pueden acceder.
4. Para **producción**, proporcionar un ejemplo de invocación del CLI con `--project migapos`, `--business <ID_REAL>`, `--month YYYY-MM`, `--documents N`, `--writes N`, `--authorize-project migapos`, **solo como instrucción condicionada a aprobación del propietario**, credenciales administrativas externas y respaldo. El script por defecto es dry-run; `--apply` solo después de medir presupuesto y validar el lote. No ejecutar comandos reales en esta implementación. No escribir ni copiar credenciales a documentos, repositorio, terminal compartido o mensajes.
5. Procesar todos los meses transcurridos y vacíos desde el inicio del año considerado, repetir hasta `verified`, y después publicar el catálogo anual con `--year YYYY --apply` conforme a cobertura. Para negocios con varios años, ejecutar por año solicitado y nunca fingir que un mes ausente equivale a cero.
6. Comprobar que el snapshot por negocio/global y por sede tenga `coverage` completo, `sourceProof`, `revision`, `calculatedThrough`, `evidenceThrough`, `validUntil`, catálogo y conteos correctos. Verificar con un caso de contrato creado en un mes y cancelado en otro; pagos legacy/mixtos; cierres abiertos o vencidos en otra fecha.
7. **Solo después de validarlo**, activar el único gate `VITE_REPORT_EXPORT_SUMMARIES_ENABLED=true` en la configuración de frontend de producción y generar un build nuevo autorizado. En Spark, `REPORT_SUMMARIES_ENABLED` permanece OFF. Asegurar que no se filtren variables de emulador ni credenciales.
8. Documentar rutina de actualización y vencimiento, señales visibles de snapshot pendiente, recuperación por reejecución idempotente de backfill y reversión: apagar solo el gate, dejando mes/año como «Resumen no disponible» **sin fallback al historial**; hoy/semana mantienen el funcionamiento. Registrar que Hosting no publica automáticamente Rules/índices.

**Bloqueo explícito:** la implementación de frontend puede estar lista en una sola ejecución, pero **el despliegue NO garantiza mes/año disponible** hasta generar snapshots reales en Firestore, verificar permisos y mantenerlos dentro de vigencia mediante un operador autorizado. Si la rutina manual no es sostenible, documentarlo; **no reemplazarla por Functions/Blaze sin nueva aprobación**.

## 4. Pruebas obligatorias y criterios de aceptación (NO aprobar por UI aparente)

1. **Spy de rutas Firestore:** dashboard mes/año, Excel mes/año y PDF mes/año en modo verificado: **cero llamadas** a `getSalesInPeriod`, `getPaymentsInPeriod`, `getContractsInPeriod`, `getSessionsInPeriod`, `getContractAuditDocuments`, `readVoidsInPeriod`, `exportSnapshot` y cualquier consulta por movimiento. Solo lecturas puntuales de snapshots y productos. Repetir con gate OFF, snapshot ausente, vencido, incompleto, Rules denegadas y usuario/sede cambiados: igualmente **cero consultas históricas**.
2. **Dashboard:** no aparece «Consulta histórica pendiente», «Consultar documentos históricos», ni un reemplazo que sugiera consultar miles de movimientos. Si existe resumen verificado, las mismas tarjetas, gráficos, Top 5 y alcance de sede reproducen el oráculo financiero al céntimo; si no existe, aparece «Resumen no disponible» sin ceros falsos. Aislamiento entre tenants, fecha/corte Lima, abort y caché por revisión.
3. **Exportador:** no aparece «Exportar historial del período» ni opciones equivalentes, ni se acepta `acceptHistorical` para mes/año. XLSX real de mes/año reabierto: hojas `Resumen_Financiero`, `Resumen_Cajas`, `Resumen_Pedidos`, evolución y productos; **sin `Auditoría_Cajas`, `Auditoría_Pedidos`, `Estado_Pedidos` ni `Detalle_*`**. PDF mes/año muestra «Cajas — resumen» y «Pedidos — resumen» sin movimientos individuales.
4. **Formato Excel:** bordes en todas las celdas con información, formatos de soles, cifras negativas, totales y nombres de sedes. Validar que agrupación mes = día/sede y anual = mes/sede; totales globales cuadran exactamente. No suprimir hojas cambiando su nombre o agrupando después de descargar todos los documentos.
5. **Contabilidad:** casos de ventas POS mixtas, anulaciones, reembolsos intermes, contrato legacy creado antes del pago/cancelación, efectivo/digital, caja sin conteo, conciliaciones y productos. Confrontar con calculadora/oráculo documental local, al céntimo. No alterar dominios originales ni tests de seguridad.
6. **Modo Spark administrativo:** dry-run y apply en emulador con varios meses, sedes y meses vacíos; backfill reanudable/idempotente; catálogos anuales y caducidad. Probar que NO se configura/despliega Functions y que el navegador NO escribe agregados. Si el CLI no produce snapshots global/sede que lee el cliente, corregirlo o reportarlo como bloqueo demostrado; nunca marcar cobertura `verified` de forma artificial.
7. **Costos medidos:** mes normalmente 1 punto de lectura de snapshot por scope + páginas de producto; año hasta 12 puntos de snapshot + catálogo anual, con metadatos/Rules adicionales. Registrar conteos **de documentos retornados y operaciones en fixtures/emulador**, no presentarlos como lecturas facturadas reales. Registrar por separado el costo del backfill manual y actualizaciones posteriores.
8. **Regresión:** hoy/semana sin cambios. Ejecutar focalizados existentes `tests/plan31-final.test.mjs`, `tests/plan31-monthly-snapshot.test.mjs`, `tests/plan31-report-cost.test.mjs`, `tests/plan31-report-parity.test.mjs`, `tests/excel-export.browser.test.mjs`, `tests/reports.test.mjs`, `tests/plan13.test.mjs`, `tests/plan14.test.mjs`, Rules P31 en `demo-migapos` si emulador instalado, lint, build/PWA, `check:build` e `indexes:check`. Reescribir únicamente expectativas obsoletas del botón histórico que explícitamente se retira; mantener verificaciones financieras y de seguridad. No ocultar fallos.

**Aceptación final:** dashboard y exportaciones de mes/año **consumen exclusivamente snapshots P31 verificados**, muestran cifras correctas y hojas resumidas, no tienen advertencias/acciones de consulta histórica y no descargan movimientos originales; día/semana siguen igual. **No afirmar «listo para producción» si falta backfill real, Rules/índices, gate, CI o presupuesto operativo manual.**

## 5. Ejecución, límites y entrega de Codex

- Trabajar sobre árbol **local**: inspeccionar `git status --short` y preservar cambios no confirmados. **NO** `git reset --hard`, `git clean -fd`, revert general, commits, push, merge ni deploy.
- No alterar Firebase productivo ni instalar dependencias nuevas. No desplegar Functions, crear otro sistema de reportes ni añadir componentes de auditoría al dashboard. Reutilizar módulos P31 ya construidos.
- Entregar únicamente las correcciones de código necesarias, pruebas y guía Spark revisada, sin nuevos planes MD por fases. No deshabilitar `audit:security` ni simular CI remota verde.
- Respuesta final de Codex máximo 15 líneas: archivos; PASS/FAIL reales; hojas XLSX y bloques PDF verificados; conteos de lecturas individuales = 0 en mes/año; costo de snapshots y backfill; activación Spark manual pendiente; seguridad/CI pendientes.
