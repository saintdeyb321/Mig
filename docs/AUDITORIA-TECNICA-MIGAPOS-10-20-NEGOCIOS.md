# Auditoría integral MigaPOS: funcionalidad, caché, React y escalabilidad

**Fecha:** 5 de noviembre de 2026. **Referencia auditada:** `saintdeyb321/Mig`, rama `fix/migapos-production-readiness`, commit `abc0b96b3330d53cab0c3a085d7b89d14363369f` (Plan 10-6).

**Tipo de auditoría:** inspección estática del código publicado, fuentes de consulta y resultado del último workflow. **No realizadas:** pruebas de carga con Firebase real, React Profiler real, consulta del panel Firebase Usage, pruebas E2E autenticadas en producción, verificación de todas las Rules desplegadas. **No se han modificado archivos del repositorio, recursos remotos ni datos reales.**

## Dictamen ejecutivo

MigaPOS tiene fundamentos positivos para operar múltiples negocios: separación por `businessId`, repositorios especializados, transacciones atómicas de venta, control de stock por sucursal, protección frente a respuestas financieras inciertas, caché Firestore persistente, IndexedDB local, paginación en contratos y consultas, y reutilización de recursos por sesión.

No es posible afirmar que soporte 10–20 negocios simultáneos en Spark sin mediciones. Los principales riesgos de costo y rendimiento están en reportes históricos que reconstruyen agregados leyendo ventas individuales, listeners de notificaciones con múltiples sublisteners, catálogo completo en vivo, reprocesamiento innecesario de caché/snapshots y operaciones por venta de varias escrituras. La prueba CI aún falla por inicialización de Chromium en backups. **No se autoriza certificación de producción por el análisis estático.**

## Hallazgos priorizados

### A01 · ALTA · Reportes: agregación mensual/anual mediante lecturas individuales

En `frontend/src/features/reports/infrastructure/sessionReportReads.js`, `stats()` llama a `salesToDailyStats(await sales())`; `sales()` obtiene `getSalesInPeriod` con hasta 10 000 filas. `frontend/src/features/sales/infrastructure/salesQueryRepository.js` consulta los rangos `confirmedAt` Timestamp, `createdAt` Timestamp y `createdAt` ISO para compatibilidad, con páginas de 200 y eliminación de duplicados. Los reportes también leen pagos, contratos y compensaciones. **Hay límites y deduplicación**, pero el primer reporte de un período amplio sigue consumiendo lecturas históricas potencialmente considerables. Aunque existe colección `daily_stats`, su presencia no equivale a que este flujo la utilice actualmente.

**Recomendación:** instrumentar lecturas efectivas y comparar primero contabilidad actual con una estrategia incremental de agregados diarios por negocio y sucursal. Nunca reemplazar el ledger histórico ni alterar cifras sin pruebas de conciliación entre ventas, anulaciones y pagos. Solo migrar tras pruebas de equivalencia. Mantener consulta detallada por tickets bajo demanda.

### A02 · ALTA · Notificaciones: listeners documentales por cada aviso

`frontend/src/features/notifications/infrastructure/notificationQueryRepository.js`: suscripción a `notifications` (límite 30); para el dueño, otras dos consultas de `pos_voids` y `cash_sessions` con límite 30 cada una; los resultados de evidencia crean watchers documentales sobre marcadores individuales `notifications/{id}`. El máximo de sublisteners depende del conjunto observado; pueden ser numerosos por sesión de dueño. `useAlerts` vive en `AppLayout` y no solo cuando se abre el panel de la campana.

**Recomendación:** medir número real de listeners, entradas y reconexiones; diseñar indicador ligero y detalle bajo demanda, conservando los avisos importantes y comprobación de lectura. No reducir verificaciones financieras o permisos por mera optimización.

### A03 · ALTA · Catálogo y caché local: instantáneas completas

`catalogRepository.js` y `customerRepository.js` usan consultas en tiempo real por `businessId` sin paginación; en POS el catálogo completo es coherente con búsqueda instantánea, pero crece con la cantidad de productos y terminales. `subscribeTenantCache` sincroniza `bulkPut(remoteData)` y calcula diferencias de IDs cada vez que llega una instantánea confirmada. Los listeners usan `includeMetadataChanges: true`; deben comprobarse escrituras redundantes a IndexedDB y procesamiento adicional. En `CatalogProvider`, cada publicación de productos puede invocar lectura de pendientes `readPendingSales` y cálculo de stock proyectado.

**Recomendación:** evitar sincronización IndexedDB cuando contenido confirmado no cambió; aprovechar `docChanges` o checks de versión, conservando la distinción entre snapshots de caché y servidor. Medir latencia del primer catálogo, bytes, número de documentos y actualizaciones por venta.

### A04 · MEDIA/ALTA · React: invalidaciones y renders evitables

`TenantProvider.jsx` y `CatalogProvider.jsx` crean valores de contexto inline; `useAlerts` reconstruye mapas y alertas con nombres durante renders; `SessionResources.cell().set()` notifica a todos los suscriptores aunque el valor de entrada sea idéntico. Esto ofrece oportunidades comprobables para disminuir actualizaciones, pero **no se han medido commits de React ni hay evidencia cuantitativa de renders excesivos**.

**Recomendación:** React Profiler por roles y escenarios, medir renders antes/después, memoizar valores de contextos cuando cambien dependencias reales y comparar igualdad de estados cuando sea seguro. Evitar memoización ornamental y no esconder actualizaciones financieras legítimas.

### A05 · MEDIA · Recursos de sesión y retención en memoria

`createSessionResources` comparte listeners, los detiene tras 120 s sin consumidores y limita a 12 entradas de lecturas completadas. Su `maxListeners=8` detiene watchers ociosos, pero no elimina necesariamente las entradas almacenadas en el `Map` de listeners/celdas. Es una oportunidad de higiene de memoria cuando se visitan muchas sucursales y vistas en una sesión larga.

**Recomendación:** instrumentar longitud efectiva de mapas y listeners vivos, eliminar entradas ociosas solo con política segura, sin perder recuperaciones o historial necesario.

### A06 · MEDIA/ALTA · Historial: varios listeners y comprobaciones por ticket

`subscribeRecentSales` usa dos queries limitadas a 50 (timestamps compatibles). `useRecentSales` puede añadir listeners documentales sobre recibos de anulación de los tickets del protocolo 2, además de cola local y verificaciones de intentos. Tiene límites y reutilización por recurso, pero puede aumentar costos en terminales que entran repetidamente a Historial.

**Recomendación:** observar conteo real por pantalla, diferenciar datos mostrados de validación financiera, y considerar consultas por lotes/estrategia de lectura bajo demanda sin debilitar las garantías de anulación.

### A07 · MEDIA · Excel: funcionalmente estructurado, pero pesado en períodos amplios

`useExportSales` carga `xlsx-js-style` de forma diferida, reutiliza consultas de `sessionReportReads`, aplica bloqueo de doble ejecución y construye un libro con resumen, pedidos, auditorías, comparativa de sedes, productos y detalle. `buildSalesWorkbook` detiene exportación por encima de 10 000 filas combinadas, evitando archivos parciales. No se detectó un bug contable por lectura estática.

**Recomendación:** mantener estructura y semántica; hacer pruebas de conciliación y rendimiento con 100/1000/5000 tickets, medir duración, tamaño y memoria del proceso en navegador. Reducir consultas de período amplio mediante agregación segura; usar Worker o exportaciones particionadas solo si la medición demuestra bloqueo de interfaz.

### A08 · MEDIA · Cierre de caja: lecturas históricas por sesión

`sparkCashClosingRepository` consulta sesión y realiza `readSales(session)` + `readPayments(session)` para mostrar un estimado de cierre. La paginación y límites evitan crecimiento indefinido, pero una caja muy activa puede leer muchos movimientos. No debe confundirse la estimación con conciliación bancaria o física certificada. Optimizar solo preservando comprobación y estados de discrepancia.

### A09 · BLOQUEANTE RELEASE · CI remota roja

Para commit `abc0b96b`, la ejecución `42062063126` termina fallando en `tests/backups.browser.test.mjs` al no iniciar Chromium con `DevToolsActivePort`; en esa etapa: 76 pruebas PASS, 1 FAIL. Este fallo no demuestra un error funcional en backup, pero impide la atestación de release. **No se debe saltar ni eliminar la prueba**: estabilizar el arranque de Chromium con diagnóstico del entorno y reintentar.

### A10 · BAJA · Detalles de implementación de bajo costo

`contractQueryRepository.js` repite un filtro `branchId` idéntico en la consulta paginada de históricos. Es redundancia demostrada, no prueba de lecturas duplicadas; corregir de modo acotado y probar equivalencia de consultas/índices.

## Puntos fuertes verificados por inspección

- `core/firebase/client.js`: `persistentLocalCache` con `persistentMultipleTabManager`, además de Dexie para registros específicos.
- `core/cache/tenantCache.js`: validación del `businessId` y rechazo de colisiones de IDs entre tenants.
- `core/session/sessionResources.js`: recursos compartidos de sesión, TTL de lecturas, cancelación y señales para distinguir caché de servidor.
- `contracts`: suscripción activa limitada a 100; historial paginado de 25.
- `sales`: transacción atómica, verificación del recibo, comprobación de stock y versiones, identificador de operación; no se recomienda cambiarlo para optimizar costo sin auditoría financiera.
- `reports`: validación de alcance, conciliación por método de pago y límites para impedir exportar datos incompletos o parciales.

## Firestore Spark y 10–20 negocios

Según documentación oficial consultada el 5 de noviembre de 2026, la cuota gratuita de una base Firestore por proyecto es **50 000 lecturas/día, 20 000 escrituras/día, 20 000 borrados/día, 1 GiB almacenado y 10 GiB de salida al mes**. Estos límites **se comparten entre todos los negocios en el mismo proyecto**. Fuente: https://firebase.google.com/docs/firestore/quotas . Los listeners pueden facturar lecturas iniciales y actualizaciones; la reconexión depende del caché persistente y tiempo desconectado (https://firebase.google.com/docs/firestore/pricing).

**Presupuesto ilustrativo:** 20 negocios × 3 sesiones/terminales × 200 productos por consulta completa = **12 000 documentos iniciales** de catálogo si todos se leen desde servidor en ese escenario; no incluye categorías, otros listeners, ventas ni reportes. No es una medición real ni significa 12 000 lecturas en todos los escenarios. En una tienda con tickets de hasta 8 líneas, una venta también puede realizar múltiples escrituras (recibo, stock, grupos por líneas, aviso), por lo que 20 000 escrituras/día puede ser una restricción igual de importante.

La división matemática 50 000 / 20 = 2 500 lecturas por negocio por día es solo una distribución del cupo, no una garantía: el SaaS administrador y otros módulos también consumen lecturas; además hay picos. **No autorizar la venta de 20 licencias Spark por intuición:** medir primero tráfico real y someter a carga representativa en un entorno aislado.

## Plan de trabajo propuesto (separado del UX)

1. **P11-00 observabilidad:** contador de suscripciones/consultas por módulo y rol (diagnóstico local sin datos sensibles), panel Firestore Usage por día, métricas React Profiler, caché y horas pico. Baseline con dispositivos representativos.
2. **P11-01 CI:** estabilizar Chromium de backups sin eliminar assertions, obtener CI verde y revisión de Rules.
3. **P11-02 Firestore reads:** catálogo cache/deltas, notificaciones, historial, recursos inactivos. Pruebas de equivalencia de estados y scopes.
4. **P11-03 reportes/Excel:** mediciones por períodos y escalas, estrategia de agregados solo tras diseño de conciliación y corrección de anulaciones; pruebas fiscales y de totales.
5. **P11-04 React/memoria:** perfiles de render, memorias de contexto, snapshots sin cambios, fugas de listeners, mediciones después.
6. **P11-05 ensayo escalabilidad:** 10 y 20 tenants aislados con datos sintéticos, límites Spark por volumen de tráfico, arranques concurrentes, períodos y picos de ventas; sin escribir datos reales. Dictamen de capacidad en base a mediciones.

**No autorizar a Codex a usar Git, GitHub, `gh`, despliegues ni credenciales. El propietario controla publicación y ChatGPT verifica los commits publicados.**

## Alcance de conclusiones

Hallazgos A01–A03, A05–A07 y A09 se sustentan en rutas y código específicos. El orden de «módulo que MÁS lee» es una **hipótesis técnica** hasta obtener métricas por negocio y módulo; tampoco puede acreditarse que la caché sea óptima, ni certificar la capacidad 20 negocios con inspección estática únicamente.
