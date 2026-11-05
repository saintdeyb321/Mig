# MigaPOS — Plan 04: cierre funcional, rendimiento y UX del MVP

**Base auditada:** `saintdeyb321/Mig`, rama `fix/operacion-saas-spark`, HEAD `b74092ff03f4f81340171167ca45b2d406f5e50d` (24/10/2026).  
**Destino:** rama de trabajo independiente `fix/mvp-operacion-rendimiento`; ninguna publicación automática ni merge a `main`.  
**Restricción:** Firebase Spark: Auth + Firestore + Hosting. Conservar aislamiento por tenant/sede, Roles/Rules, IndexedDB, cifrado, ventas pendientes e información histórica.

## 1. Diagnóstico verificado en el código

| Prioridad | Observación | Archivo / consecuencia |
|---|---|---|
| P0 | Excel diario/semanal falla aunque exista solo una venta | `frontend/src/features/cash-register/infrastructure/cashQueryRepository.js` usa `limit(10001)` en **cada** consulta del período. El servidor rechaza el límite antes de devolver datos. `useExportSales.js` llama a `getSessionsInPeriod` solo para Excel detallado. |
| P0 | No se pueden anular tickets | `runtimeCapabilities.saleVoid=false`; `voidSaleTransaction()` exige la capacidad y aún delega a `voidSale` (Cloud Functions fuera de Spark). `SalesHistory.jsx` deshabilita la acción y cierra el diálogo sin esperar confirmación. |
| P1 | Se muestran métricas internas a empleados/dueños | `Reports.jsx` expone el bloque `readDiagnostics()` y `resources.diagnostics()` siempre que `import.meta.env.DEV`; `npm run dev` lo hace visible a usuarios reales. |
| P1 | Reportes refrescan datos excesivamente | `useReports.js` dispara `refresh()` al recibir `focus` y `online`, y el `REPORT_TTL` del período diario/semanal es 30 s. `createReportResource()` puede reemplazar la vista por `LoadingState` al montar sin entrada vigente. |
| P1 | Montajes de Personal/otros módulos se duplican aparentemente | `frontend/src/main.jsx` usa `React.StrictMode` en desarrollo. `App.jsx` desmonta un módulo al cambiar de pestaña. La caché `sessionResources.js` conserva algunas suscripciones **en memoria** y las detiene tras 120 s de inactividad. Deben medirse montajes, renderizados y solicitudes por separado, no desactivar StrictMode. |
| P1 | F5 puede volver a consultar licencia/perfil | `useLicenseAccess.js` crea listeners de licencia y tenant por sesión nueva. Firestore tiene persistencia local, pero esos datos **no pueden sustituir una comprobación remota de permisos vigentes**. Dar presentación cache-first sin autorizar nuevas escrituras desde caché no verificada. |
| P2 | No existe límite temporal online explícito de caja | `sparkCashRepository.js` abre sin `expiresAt`; `saleContext()` comprueba `session.status='open'`, no `openedAt + duración`. El texto de reserva offline 18 h no autoriza caja Spark online. |
| P2 | Contratos no ofrece apertura de caja contextual | `ContractManager.jsx` no presenta control de caja; `sparkContractsRepository.js` exige caja para anticipos/devoluciones. |
| P2 | Agenda VIP/Clientes aún enlazada al contrato | `App.jsx`, `BottomNav.jsx` y `ContractFormModal.jsx` mantienen `AgendaManager` / `useCustomers` / búsqueda en agenda. Los contratos históricos **guardan clientName/clientPhone** y deben conservarse. |
| P3 | Diseño inconsistente y ayuda invasiva | Modal, footer, colores, avisos largos e indicadores técnicos en múltiples módulos. Mejorar sin alterar valores, validaciones y operaciones financieras. |
| Deuda comercial | Cobro de >2 líneas continúa bloqueado | `checkoutPolicy.js` y `firestore.rules` solo validan 2 productos. No declarar MVP POS general completo hasta resolverlo con un protocolo seguro. |

## 2. Objetivos y límites de seguridad

1. Corregir primero fallos reproducibles (Excel, errores de estado, anulaciones), después optimizar lecturas, y por último acabado UX.
2. No confundir render React con lectura Firestore: React puede renderizar varias veces por un cambio legítimo. Optimizar listeners, invalidez, `useSyncExternalStore`, dependencia de `useEffect`, foco y recuperación de servidor.
3. No perseguir «cero lecturas con F5» a costa de seguridad. Firestore cache sirve para pintar datos marcados como no confirmados; permisos, licencias y finanzas se comprueban contra el servidor según necesidad.
4. No habilitar en UI una transacción de anulación sin compensación financiera atómica (o protocolo recuperable probado), idempotencia, permisos y reglas completas. Un resultado favorable solo del frontend no basta.
5. Sin purgas, pérdida de datos históricos, eliminación de `customers` ni limpieza de IndexedDB. Eliminar **funcionalidad** Agenda VIP, no sus documentos previos.
6. No generar reportes parciales silenciosos: permitir paginación pequeña, máximo global con mensaje explícito y reportes detallados bajo demanda. La facturación se rige por datos leídos/índices, no por número de renders.

## 3. Checkpoint A — Excel y consultas de reportes (P0)

- Eliminar `limit(10001)` de `cashQueryRepository.js`. Implementar paginación con cursor, páginas acotadas (p.ej. 100–200), dos representaciones temporales de histórico (`Timestamp` e ISO), deduplicación por ID y un máximo **total** configurable; abortar si se excede sin guardar un Excel parcial.
- Revisar `salesQueryRepository.js`, `paymentQueryRepository.js`, `contractPeriodRepository.js`, `getSessionsInPeriod`, inclusive/exclusive de fechas y límites de páginas. Eliminar páginas de tamaño inválido y bucles que no terminan si el límite ya fue alcanzado; abort y errores con contexto `cash-period`.
- Recuperar política funcional: diario/semanal detallado por ticket; mensual/anual resumen por día. Minimizar consultas duplicadas y reutilizar recursos válidos dentro de la misma identidad/sede/período. Verificar coherencia entre venta confirmada, caja y contrato.
- Separar un error de consulta de la lista de tickets; nunca mostrar simultáneamente «sin registros» y una falsa ausencia financiera.
- Quitar el bloque JSON `Lecturas observadas` del flujo normal, incluso ejecutando `npm run dev`. Si se conserva, que sea herramienta técnica separada, habilitada explícitamente solo para desarrollo, sin datos sensibles y sin afectar renders.
- Verificación focalizada imprescindible: período diario/semanal con 0, 1 y varios tickets; mezcla de fechas ISO/Timestamp; varios pages, límite global y reportes mensuales/anuales sin regresiones.

## 4. Checkpoint B — Anulación POS real (P0 financiero)

- Estudiar el esquema actual de `sales/{id}`, `products/{id}` (`stock`, `posStockVersion`, `posLastSaleId`), `cash_sessions`, `payments`, reportes y recibos.
- Diseñar un **documento compensatorio inmutable** e idempotente por venta anulada, sin borrar ni sobreescribir recibo de venta original. Registrar actor, motivo, momento servidor, negocio/sede, sesión de devolución actual, montos y método de reembolso; distinguir devolución de caja de reversión de venta.
- Las Rules deben comprobar recepción válida de la venta original, ausencia de compensación previa, stock restaurado exactamente una vez, versiones concurrentes, negocio y rol, sesión/caja vigente y estado histórico de la venta. Coordinar `getAfter()` y límites de lecturas/reglas. Si caja original ya cerró, no reabrirla ni modificar saldos cerrados: compensar con nueva operación autorizada y trazable o bloquear.
- Permisos de cajero limitados a sede/sesión/política verificables; dueño con permisos administrativos pero nunca sin autorización financiera. Evitar devolución real de efectivo/digital sin confirmación explícita del operador: el ledger registra lo que realmente se devolvió.
- Adaptar Historial/Reportes/Excel y cierre para netear compensaciones sin doble resta, sin borrar ventas, sin crear un segundo ticket de venta falso.
- Solo habilitar `saleVoid` al estar integrado el repositorio Spark + Rules **y** aprobadas pruebas focalizadas de concurrencia/idempotencia/doble compensación/otro tenant/stock cambiado. Si el protocolo no puede garantizarse bajo Spark, dejar deshabilitado, mostrar impedimento concreto y no afirmar que el MVP comercial está cerrado.
- Aprovechar para revisar, como deuda comercial separada, protocolo multiproducto: el carrito acepta más de 2 pero la confirmación no; no quitar el candado sin prueba transaccional real. No partir una venta en tickets independientes.

## 5. Checkpoint C — Caché inteligente, navegación y recursos (P1)

- Mantener `React.StrictMode`; comprobar montajes extra de desarrollo frente a remounts reales y re-suscripciones. Instrumentar temporalmente contador de **requests reales**, suscripciones, `fromCache`, cambios de claves, invalidaciones y duración; sin JSON visible a usuarios.
- Refactorizar **mínimamente** el ciclo de `useReports` para evitar refetch incondicional en `focus`/`online`; usar TTL consciente de período y cambios relevantes, single-flight deduplicado y refresco manual explícito. Separar recurso/carga del render: retener resultados autorizados de misma sesión durante revalidación y evitar pantalla completa de loading.
- Unificar recursos de Personal, Contratos, Historial, Reportes y caja por `UID + businessId + branchId + criterio`. Suspender listeners inactivos, límites de memoria, limpieza en logout/cambio de identidad, invalidación puntual al mutar y protección de promesas tardías. No montar todas las páginas siempre.
- F5: bootstrap suave con estado cacheado **solo de presentación**, revalidación en paralelo y acceso restringido hasta confirmación del servidor. No garantizar cero lecturas de seguridad: los datos obsoletos nunca pueden autorizar venta/cobro, creación de usuario ni acceso privilegiado.
- Evitar parpadeos y repetición de tarjetas; rastrear causa exacta de doble carga en Personal antes de modificar efectos. Verificar usuario dueño/cajero con cache de otra identidad fuera de alcance.
- Evitar cambios que obliguen a reconsultar licencia cada pocos segundos; el estado confirmado permanece estable hasta evento relevante; usar escucha compartida mientras dure la sesión.

## 6. Checkpoint D — Caja segura y accesible en Contratos (P2)

- Definir política explícita: **propuesta** duración máxima de 10 h para nuevas sesiones online (configuración 8/10/12 h solo si puede protegerse mediante Rules). Documentar el default; no asumir que existía ya. No cambiar significado de cajas históricas sin regularización.
- Guardar tiempo de apertura servidor y vencimiento verificable en Rules. Toda nueva venta, anticipo o devolución requiere `request.time` dentro de la sesión autorizada, con lock y sede. La UI muestra tiempo restante y alerta de expiración; nunca puede extenderlo modificando reloj local.
- Al vencer, bloquear nuevos cobros; permitir cierre tardío seguro y guiado, sin borrado del historial ni cierre automático ficticio. Sin backend no prometer cierre programado si el usuario está desconectado.
- Compartir un único estado de caja por sesión/sede entre POS y Contratos. Incorporar en cabecera o junto a CTA Nuevo Pedido un acceso «Abrir caja» contextual y visible **solo con sede activa y permisos**. Usar el modal/hook existente; después de confirmar, refrescar estado una vez y continuar con el contrato, sin duplicar apertura/caja. Sin caja se pueden redactar pedidos sin anticipo si lo permite el protocolo vigente; cobros requieren caja.

## 7. Checkpoint E — Retirar Agenda VIP y acabado UX (P2–P3)

- Retirar entrada Agenda VIP de desktop/móvil, `App.jsx` y `getSessionModules`, y la dependencia de `useCustomers()` / «Buscar en Agenda» del modal de nuevo pedido. Mantener en contratos nombre, teléfono y datos de entrega, editables manualmente. Preservar todos los contratos y sus datos históricos.
- Quitar listeners, imports, categorías de navegación y consultas de `customers` no usadas. **No borrar** `customers` antiguos ni su colección de Firestore, ni inventarios/backups que den cuenta de esos datos; revisar referencias externas y tests existentes.
- Adoptar variantes UI reutilizables: encabezados violetas, secciones cortas numeradas como modal Contratos, importes destacados, botones proporcionados y simétricos, footer fijo cuando corresponda, menos textos explicativos permanentes. Las advertencias críticas se mantienen breves y accesibles.
- Revisar móvil, scroll/foco/modal, acceso a caja y contraste de tarjetas; preservar PWA, ticket impreso, Excel e iconografía.

## 8. Validación mínima y publicación

- Lint, build/PWA y `git diff --check`.
- Solo pruebas focalizadas necesarias para lógica monetaria y Rules (anulación, vencimiento de caja, permisos, idempotencia), paginación Excel, identidad/caché, sin suites visuales masivas.
- **No deploy, merge, cambios .env, borrado de datos, ni escrituras a Firebase real.** Crear commits por checkpoint en rama separada. Las Rules se publicarán **solo** con permiso expreso y copia previa de la versión actualmente desplegada.
- Actualizar `docs/MASTER-PLAN.md` con una referencia y estado por checkpoint. Documentar lo realmente desbloqueado y lo que siga restringido (POS >2 líneas, offline financiero, baja en cascada, conciliación certificada).
- Criterio MVP: diario/semanal Excel correcto; reportes sin JSON; UX estable y datos de sesión sin fugas; contratos con acceso directo a caja; Agenda VIP retirada sin perder historiales; controles de duración de caja seguros; anulación y tickets multiproducto solo declarados terminados si garantizados por Rules/ledger y demostrados.
