# MigaPOS · P17 — Caja vencida, avisos al dueño, aislamiento de contratos entre sedes y cierre del CI

> **Documento único de implementación y aceptación para Codex.** Auditoría de referencia: `fix/migapos-production-readiness`, commit publicado `0abfb0143f392759e06b4d1af9942e55c120d3ed`, 12 de noviembre de 2026. **La carpeta local es la fuente final**: comprobar cambios locales antes de editar; no sustituir modificaciones más recientes por código de GitHub. Trabajo en `C:\Proyectos\MigaPOS`.
>
> **Prohibido a Codex:** Git/GitHub, cambios de rama, commits, push, deploy, acceso al Firebase real, borrar registros, instalar dependencias o tocar marketing/audiovisuales. El propietario controla el versionado y publica manualmente las Rules.

## 1. Resultado de la auditoría previa: qué existe y qué falta

| Área | Confirmación en código | Defecto / decisión P17 |
|---|---|---|
| Caja de 10 horas | `useCashRegister.js` calcula caducidad; `sparkCashRepository.js` puede marcar `expired_unreconciled` **durante la apertura de la nueva caja** y reemplazar su candado en una transacción. Firestore Rules usa `request.time`. | No finaliza el turno vencido de manera independiente. La caja anterior queda pendiente hasta una recuperación/apertura explícita. |
| Reintentar comprobación | `CashRecoveryStatus.jsx` invoca `checkSession`, que reconsulta el estado/candado. | No es un nuevo cierre ni una reconciliación. Ocultar en estado normal; ofrecer únicamente si hay error, conexión recuperada o confirmación incierta. |
| Última recuperación | `lastRecovery` imprime ID técnico de sesiones en una tarjeta posterior. | Quitar esa tarjeta técnica; confirmar brevemente la apertura y presentar el historial/alerta en el lugar apropiado. Nunca revelar UUID al cajero salvo diagnóstico administrativo. |
| Dueño cierra caja de cajero | `firestore.rules` en `cashClosing` **permite al dueño cerrar una caja abierta de su mismo negocio/sede**. `useCashRegister` expone `canForceClose` y el cierre usa `preview` y candado. | Ya existe una base. Verificar y corregir UX para dueño en sede seleccionada, sesión ajena, cajero fuera de horario, turno vencido y respuestas ambiguas. No ampliar permisos a cajeros. |
| Avisos de caja | Campana: `notificationQueryRepository.js` proyecta `cash-close` desde `cash_sessions` con `closedAt`; la vista limita elementos y permite marcarlos leídos. | `expired_unreconciled` no tiene una proyección específica de vencimiento. Crear una fuente de evidencia verificable, sin avisos duplicados ni confiar en cálculos del navegador como arqueo. |
| Reportes | `cashAuditRows.js` ya crea el evento `VENCIMIENTO SIN ARQUEO` a partir de `expiredAt`. | Asegurar fechas/estado, sede, responsable, monto inicial y cifras informativas sin presentar efectivo contado cuando no existe. Conservar compatibilidad histórica. |
| Contratos | `ContractFormModal.jsx` usa `deliveryType` para sede de recojo; `contractQueryRepository.js` filtra por `branchId` de creación. | Un contrato creado en A para recoger en B **no se ve en B** mediante las consultas actuales. |
| Seguridad de lectura de contratos | `firestore.rules` `match /contracts` usa `tenantReader()`; este permite al cajero activo del negocio leer contratos de **cualquier** sede del mismo negocio, aunque la UI filtre. | **Brecha de privacidad potencial verificable.** La autorización de lectura debe ser de servidor por sede de origen o por un derecho limitado de recojo; no basta un filtro React. Las escrituras hoy dependen de `cashActor(old.branchId)` y están más acotadas. |
| CI P16 | GitHub Actions del SHA `0abfb014`: `43157560692` FAIL en P10-06 a 320×640. `sideBySide:false`, vuelto correcto y Cobrar visible. | Corregir diseño real para que recibido y vuelto estén juntos en 320×640, sin relajar la prueba ni crear overflow. El resto del CI debe volver a ejecutarse. |

### Advertencia arquitectónica obligatoria

**Firebase Spark sin proceso servidor programado no puede garantizar una escritura exacta a las 10 horas si nadie tiene la aplicación abierta.** Un `setInterval`, una pestaña, un listener o un Service Worker no son un scheduler fiable. La caducidad **lógica** sí puede ser absoluta a las 10 horas, respaldada por `request.time` en Rules, impidiendo nuevos cobros; la **finalización persistida** puede realizarse transaccionalmente en el primer cliente autenticado, autorizado y conectado (o al intentar abrir un turno). No afirmar «cerrado automáticamente a las 06:12» si el estado se persistió realmente a las 11:30. Registrar **hora efectiva del vencimiento** y **hora de constatación/finalización** por separado. No activar Cloud Functions, Cloud Scheduler, Blaze ni TTL sin autorización del propietario.

## 2. FRENTE A — Finalización segura de caja vencida

### A1. Modelo de estado, sin falsificar arqueo

Diseñar el protocolo exacto de estados y campos antes de implementar. Propuesta:

- `open`: turno iniciado; tiene `openedAt`, `openingAmount`, `businessId`, `branchId`, `userId`, `durationHours: 10` y candado único para la sede.
- `expired_unreconciled` (compatibilidad) o estado equivalente **sin arqueo**: vencimiento lógico a `openedAt + 10 horas`; no se inventan `declaredAmount`, `difference`, saldo contado, ganancias ni `closedBy` manual. Guardar `expiredAt` derivado y `finalizedAt`/`recoveredAt` según evidencia real, manteniendo compatibilidad con los informes y sesiones anteriores.
- `closed` / `closed_with_discrepancy`: cierre manual con dinero físicamente declarado, actor que realizó el cierre y estimación explícita como provisional.
- Una revisión posterior del dueño debe ser **un acto separado y auditable**, nunca reescribir retrospectivamente el arqueo ni cambiar silenciosamente el cierre del turno.

La frase preferida en la UI es **«Turno finalizado por vencimiento · sin arqueo»**; en la campana **«Caja vencida sin conteo»**. «Turno cerrado automáticamente» solo si está probada una finalización automática efectiva; incluso entonces conservar la aclaración «sin dinero contado».

### A2. Algoritmo de finalización

Implementar un camino independiente e idempotente `finalizeExpiredCash` (nombre a decidir) que:

1. **Lee del servidor** el candado canónico `active_cash_sessions/{hash(businessId,branchId)}` y la sesión apuntada; comprueba businessId/branchId, usuario y contexto de licencia/sede, estado `open`, runtime `spark`, fecha `openedAt` y plazo de 10h mediante **tiempo de servidor en Rules**.
2. En una **única transacción** valida el candado, cambia exclusivamente la sesión vencida al estado canónico y elimina/libera su candado, o sustituye el candado por una nueva sesión **si el protocolo de apertura conjunta lo exige**. Evitar ventanas entre «quitar lock» y «abrir» que creen duplicados o bloqueos.
3. **No abre automáticamente una caja nueva ni traslada su fondo inicial.** La caja siguiente empieza en cero o con fondo declarado por el siguiente cajero.
4. La transacción es idempotente ante doble clic, dos pestañas, dos cajeros, dueño+cajero, desconexión, commit sin respuesta y llegada tardía. Respuestas ambiguas se verifican de nuevo en servidor; nunca se reintenta a ciegas con ID distinto.
5. Ningún cliente puede finalizar o liberar un turno **antes** del vencimiento ni de otro negocio/sede. No hay dos cajas abiertas por sede. El bloqueo de ventas y pagos vencidos sigue aplicándose por Rules aunque la finalización aún no se haya persistido.
6. Si la sesión está en formato antiguo, falta un lock fiable, hay pagos locales pendientes o existe conflicto de concurrencia, **fail-closed** y mensaje de revisión; no migrar/alterar silenciosamente contabilidad.
7. Añadir mecanismo de **detección al volver a la app/reconectar/abrir módulo** y, opcionalmente, reloj de cliente como oportunidad de finalizar. Evitar listeners nuevos por cada componente y polling frecuente. Distinguir claramente disponibilidad del proceso y estado sin confirmar.

**Importante:** el diseño de Rules actual `cashExpiryRecovery` exige crear una nueva sesión y sustituir el lock en la misma operación. La finalización independiente requiere cambios explícitos y pruebas de `cash_sessions` **y** `active_cash_sessions`, incluyendo `releaseCashLock` y posibles índices. No intentar solo `tx.update(session)` porque Rules lo impedirá. Revisar el costo y el presupuesto de lecturas `get`/`getAfter` de Rules.

### A3. Información para la campana del dueño

Al finalizar un turno vencido, el dueño debe poder revisar **exclusivamente su negocio**, con sede y responsable identificables:

- Sede; responsable de la caja; fecha/hora de apertura; vencimiento efectivo; confirmación de finalización si ocurrió después.
- **Fondo inicial declarado** (S/), diferenciándolo de ingreso.
- **Cobros POS en efectivo** y **cobros por pedidos en efectivo** registrados en esa sesión (importe neto, cuando la evidencia alcanza).
- **Yape/Plin neto** correspondiente a esa sesión y sede; anulaciones/compensaciones explícitas, sin afirmar reembolso físico.
- **Efectivo teórico/esperado**, solo si se deriva mediante lector acotado y evidencia suficiente; indicar «referencia estimada, no arqueo».
- **Efectivo contado: No declarado**. **Diferencia: No calculable**. No mostrar «ganancia» o «utilidad» como sinónimo de ingresos ni de efectivo esperado.
- Si alguna parte no se puede certificar (límite, legado, permisos, consultas fallidas), señalar **«Importes pendientes de verificar»**; mostrar el evento sin fabricar ceros.

**Notificación con evidencia e identidad:** priorizar un evento inmutable y determinista asociado a `cash_sessions/{sessionId}`. Evaluar proyección del evento (como `cash-close` y `pos-void`) frente a aviso materializado en la misma transacción. Elegir la opción de **menor costo real** que supere pruebas de Rules y ofrezca persistencia/idempotencia (si se materializa, UID exacto del dueño + Rule que valide el evento; no permitir avisos falsos). Evitar avisos a cajeros, duplicados y lectura ilimitada de todas las cajas. Para importes, preferir un detalle bajo demanda o materialización claramente **provisional** con presupuesto probado; la campana puede mostrar resumen y enlace a auditoría. Marcar como leído **solo oculta el aviso**, jamás altera evidencia o sesión. Conservar alertas existentes y topes acotados. Usar nombres comerciales y fechas de Lima, no IDs técnicos.

### A4. Dueño de mayor rango, cajero fuera de horario y flujo UX

- Verificar la posibilidad **ya existente** de que el dueño cierre manualmente, desde su cuenta y sede física seleccionada, la caja todavía abierta por un cajero. `closedBy=ownerUid`, `userId=cajeroUid`, misma sede, conteo real y observación; no atribuirle la operación financiera al dueño. El dueño desde la vista global debe primero elegir sede, nunca cerrar masivamente.
- Un cajero fuera de su horario no obtiene permiso extendido por la llegada del dueño. El dueño sí puede intervenir según Rules.
- Si las 10h ya vencieron, **no permitir cierre manual ficticio** ni fingir conteo del turno ya expirado. Ofrecer finalización por vencimiento y revisión posterior registrada si se desea añadir un arqueo tardío; diseñar autoridad/datos de tal revisión por separado.
- La acción destacada al vencer será **«Finalizar turno vencido»** (cuando sea preciso) o **«Abrir caja nueva»** (cuando la finalización ya está confirmada). Si la recuperación conjunta es la única vía segura disponible, explicarla y dejarla transaccional; no fingir que ha finalizado sola.
- Ocultar **«Reintentar comprobación»** en estado confirmado; mostrar **«Comprobar estado»** solamente tras error, reconexión o resultado incierto.
- Retirar el aviso de éxito prolongado con UUID («Nueva caja abierta y confirmada / Anterior ... / Nueva ...»). Sustituir por confirmación corta y consulta del historial de caja / notificación del dueño; quitar `lastRecovery` si se queda sin consumidores.
- No trasladar ventas entre turnos, no alterar cuadres anteriores, no modificar los datos del fondo inicial de la siguiente caja.

### A5. Reportes y conciliación

- Conservar `VENCIMIENTO SIN ARQUEO` o renombrar coherentemente a `FINALIZADO POR VENCIMIENTO · SIN ARQUEO` en `cashAuditRows.js`, PDF, Excel y encabezados relacionados.
- La fecha de vencimiento pertenece al plazo **de origen**, no a la fecha tardía en que alguien descubre el estado. Los resúmenes diarios y por sede no deben duplicar cobros por aperturas/reintentos.
- Mostrar el responsable, sede, fondo, estado y ausencia de conteo con celdas explícitas «No declarado»/«No calculable».
- Reimportar XLSX, validar totales con POS/contratos y comprobar compatibilidad del reporte con sesiones de Plan 14 y legado sin reescribirlas.

## 3. FRENTE B — Privacidad y autorización de contratos entre sedes

### B1. Política funcional precisa

- **Sede de origen** (`branchId`): donde se creó el pedido; conserva control comercial/financiero, cobros, anticipos, devoluciones, anulaciones y auditoría.
- **Sede de recogida**: definida por `deliveryType` actual cuando representa el ID de otra sede activa; **no** usar ese string libre como autorización confiable sin validación server/Roles. `domicilio` NO es una sede.
- A creada + recogida A ⇒ cajeros de A pueden ver el contrato; cajeros de B **no** deben poder leerlo, buscarlo por ID ni listar su información privada.
- A creada + recogida B ⇒ A conserva acceso de origen y B puede **ver información mínima necesaria para preparar/entregar**, con permisos específicamente definidos. El dueño del negocio puede ver todos sus contratos desde global o sedes.
- La sede B **no** puede editar precios, anticipo, pagos, devolución, cancelación, identidad de pago ni mover arbitrariamente el origen. Si se autoriza confirmar entrega desde B, debe existir un comando separado de mínima autoridad con actor, lugar y fecha verificables; NO reciclar `updateContractDocument` genérico.
- Si B está inactiva o el pedido ha sido reasignado, validar transición y preservar historial de origen/recogida sin exposición residual.

### B2. Hallazgo y corrección de seguridad

Actualmente:

- `contractQueryRepository.js`: `where('branchId','==', activeBranchId)`; no incorpora sede de recogida.
- `firestore.rules` `match /contracts` usa `tenantReader()` para `get/list`; `tenantReader()` permite a cualquier cajero activo del mismo `businessId` leer contratos ajenos a su sede. **El filtro React es solo de presentación, no una barrera de seguridad.**
- `sparkContractsRepository.js` usa `cashActor(contract.branchId)` para editar, cobrar y entregar; protege gran parte de las escrituras en sede de origen, pero impide entrega física en B y no resuelve la lectura.

Por tanto, **auditar y restringir `get` y `list` en Rules**, con pruebas negativas reales por UID, sede, negocio, invitación, rol y sesión. No ampliar `tenantReader()` global. Las queries deben cumplir las restricciones de Rules; no hacer lectura global para filtrar localmente.

### B3. Modelo recomendado (decisión sujeta a pruebas)

**Primera opción por privacidad:** mantener contrato completo solo para su sede de origen y dueño; crear **proyección mínima de recogida**, sin datos financieros/personales innecesarios, solo cuando `pickupBranchId` es una sede distinta. Una transacción autorizada debe crear/actualizar de manera consistente dicha proyección y validar su correspondencia con el contrato; Rules concede a B lectura y una acción logística limitada. Una eliminación de proyección o cambio de recogida debe ser transaccional y auditable. Los costes adicionales de escrituras/lecturas deben justificarse y medirse.

**Alternativa** si una proyección complica excesivamente transacciones/Rules: documentos con `originBranchId`, `pickupBranchId` y `visibleBranchIds` derivados de manera segura, consultas indexadas y Rules por lista de sedes. **Advertencia:** Firestore Rules no oculta campos concretos de un documento permitido; si B lee el contrato entero, también lee cliente, contacto y datos financieros. No elegir esta opción si incumple la privacidad solicitada.

- Mantener compatibilidad de pedidos históricos con `deliveryType` (sede o `domicilio`) sin inventar acceso cruzado. Migración explícita, versionada, por lotes y probada o lectura restringida hasta revisión.
- Registrar un solo origen financiero: cobros, devoluciones, conciliación y reportes se atribuyen correctamente a su `businessId`, `sessionId` y sede financiera. La entrega en B no duplica ingreso ni mueve stock de A silenciosamente.
- Para el dueño, vista global con paginación y los índices necesarios; para cajero, solo origen o proyecciones de recogida. No descargar contratos de todas las sedes para filtrar en cliente.
- Validar cambios de sede de recogida solo con autorización de dueño o permisos de negocio previamente establecidos; definir qué ocurre si ya está en producción, tiene pagos o fue entregado.
- No cambiar de manera insegura el modelo de facturación/contratos solo para cumplir UX. Si el flujo seguro no cabe en Rules Spark, conservarlo bloqueado y documentar limitación concreta.

### B4. Pruebas de amenazas mínimas (obligatorias, emulador)

1. Cajero A no puede leer/listar/alterar contrato exclusivo de B por SDK ni URL/ID directo.
2. Cajero B no puede leer/listar/alterar contrato exclusivo de A.
3. A crea para recoger en B; A ve contrato completo; B ve **solo la información autorizada**; C ve nada.
4. B no puede cobrar, devolver, cancelar ni editar importes de A, aunque manipule cliente, `deliveryType`, `pickupBranchId` o payload.
5. B puede confirmar entrega solo si existe protocolo logístico autorizado y contrato elegible; la operación es única, auditable e idempotente; A/dueño ven el resultado.
6. Dueño global lee contratos de todas sus sedes pero no de otro negocio; SuperAdmin no adquiere acceso financiero operativo.
7. Casos `domicilio`, sede inválida/inactiva, cambio de recogida, contrato heredado y cuenta suspendida.
8. `limit`, reglas de consulta, índices compuestos y coste de lecturas para 100+ pedidos por sede.
9. Dos sedes modifican/entregan el mismo pedido simultáneamente: no hay doble estado, doble cobro ni pérdida de datos.

## 4. FRENTE C — Regresión P16 del POS móvil

El SHA de GitHub `0abfb014` no certifica release: Actions `43157560692` falla en `tests/plan10-correction.browser.test.mjs:259` a **320×640**: `{ "change":"S/ 10.05", "sideBySide": false, "chargeFixed": true, "chargeEnabled": true, "horizontalOverflow": false }`. El fallo está en el layout de `PaymentParts.jsx`, `TicketParts.jsx` o CSS asociado.

- Mantener **Monto recibido** y **Vuelto** lado a lado a 320×640 y 390×844, sin solape, texto truncado ilegible o desbordamiento horizontal.
- Conservar foco de teclado, 8 productos distintos, desplazamiento independiente de ítems, total y botón Cobrar visibles a 1280×560 y 320×640.
- Mantener cálculo exacto de vuelto y validación de efectivo/mixto/Yape. No suprimir datos ni aflojar tests para pasar.

## 5. Plan de implementación por orden de riesgo

1. **Auditoría local y matriz de invariantes** de caja, tickets, contratos, notificaciones y Rules. Identificar versión local y pruebas existentes sin ejecutar Git.
2. **Corrección P10-06** breve para desbloquear regresión móvil.
3. **Modelo de finalización de turno vencido**, con transición idempotente, barrera temporal Rules, candado, dueño, UI y compatibilidad histórica.
4. **Notificación dueño y auditoría**, con origen de evidencia, coste acotado y campos sin arqueo ficticio.
5. **Permisos de contratos**: primero pruebas negativas sobre la brecha; luego modelo mínimo seguro, queries, Rules y UX de recojo entre sedes.
6. **Regresión transversal**: ventas, cambios de cajero, vencimiento durante consulta, reportes, Excel/PDF, inventario de índices y consumidores de notificaciones; ningún cambio a marketing o SuperAdmin P16 salvo dependencia inevitable y justificada.

## 6. Archivos y puntos técnicos a inspeccionar (no lista cerrada)

- Caja: `frontend/src/features/cash-register/{hooks/useCashRegister.js,infrastructure/sparkCashRepository.js,infrastructure/sparkCashClosingRepository.js,infrastructure/cashQueryRepository.js,infrastructure/cashRegisterRepository.js}`, `frontend/src/modules/{CashRecoveryStatus.jsx,CashRegisterModals.jsx,POS.jsx}`, `frontend/src/modules/pos/TicketParts.jsx`.
- Avisos: `frontend/src/features/notifications/{hooks/useAlerts.js,infrastructure/notificationQueryRepository.js,infrastructure/sparkOperationNotice.js}`, `frontend/src/components/NotificationBell.jsx`.
- Reportes: `frontend/src/features/reports/application/{cashAuditRows.js,managementReportHtml.js}`, exportadores Excel/PDF relacionados.
- Contratos: `frontend/src/features/contracts/{hooks/useContracts.js,infrastructure/contractQueryRepository.js,infrastructure/sparkContractsRepository.js,application/contractCommands.js}`, `frontend/src/modules/contracts/{ContractManager.jsx,components/ContractFormModal.jsx}`.
- Seguridad: `firestore.rules`, `firestore.indexes.json`, `frontend/src/core/firebase/queryCatalog.js`, scripts de inventario de índices y pruebas Rules.
- Tests: `tests/plan10-correction.browser.test.mjs`, `tests/spark-financial.rules.test.mjs`, `tests/spark.rules.test.mjs`, `tests/contracts.integration.test.mjs`, `tests/plan14.test.mjs`, pruebas de notificaciones y nuevas pruebas P17.

## 7. Aceptación y medición obligatorias

### Seguridad y dinero
- Misma sede: un único candado/caja operativa; simultaneidad y reconexión no duplican ni finalización ni apertura.
- Caja vencida: no se realizan ventas ni pagos posteriores a `openedAt+10h` aunque cliente mienta sobre reloj o recargue; sin servidor disponible queda bloqueada.
- Caja nueva: fondo y `sessionId` propios; ninguna venta ni pago del turno anterior se atribuye al nuevo.
- Notificación y reporte: fondos, efectivo, Yape/Plin, contratos, anulaciones y fechas **de la misma sede y sesión**, sin datos de otras sedes/negocios; ningún valor no comprobado se inventa.
- Dueño puede gestionar manualmente caja ajena **dentro de la autoridad verificada**; cajero de otra sede/fuera de horario no puede.
- Contratos exclusivos se mantienen privados por Rules; contratos A→B permiten únicamente información y operaciones logísticas autorizadas en B.

### Calidad y costos
- Casos caja: abrir, 9h59m, exactamente 10h, 10h01m, app cerrada durante vencimiento, reconexión, dueño/cajero simultáneos, doble click, respuestas ambiguas, caja histórica y responsable desconectado.
- Casos notificación: una sola visible al dueño, marcar leída, reconexión y múltiple dispositivo; no muestra UID ni se entrega a otra sede/cuenta.
- P10-06: Chromium Linux y Windows a 320×640, 390×844, 1280×560, zoom/teclado.
- Contratos: matriz de amenazas B4 por lectura directa, list, consultas y escrituras; índices probados con emulador.
- Medir solicitudes/documentos leídos, escrituras, listeners y coste de Rules antes/después; no agregar polling ilimitado ni nuevas colecciones sin justificar.
- Ejecutar pruebas Node, emuladores Firestore Rules/transacciones, Chromium, lint, build/PWA, `indexes:check`; si falta Java o hay bloqueos, declarar BLOCKED, **no PASS**.
- Las reglas de seguridad propuestas requieren despliegue manual **separado** por el propietario; no declarar la funcionalidad lista en Hosting mientras Rules de producción no estén verificadas.

## 8. Límites y decisiones que deben documentarse sin ocultarlos

- Finalización «en el momento exacto» sin clientes conectados: **no garantizable en Spark** sin trabajo programado confiable. La barrera de cobros es garantizable en Rules; la persistencia queda diferida hasta un actor autorizado.
- Aviso en la campana sin ninguna sesión activa ni proceso servidor: tampoco puede entregarse antes de que exista una escritura/evento observable en Firestore. Explicar este límite al propietario.
- Conciliación financiera completa: las reglas Spark no certifican una suma arbitraria de todo el libro. La referencia calculada debe ser provisional; nunca una declaración física.
- Firestore no ofrece redacción de campos a nivel de documento en sus Rules; el cajero de recogida debe recibir una vista mínima separada si importa privacidad.
- Es posible que ampliar las Rules para nueva transición/aviso requiera límites de presupuesto por transacción; no debilitar seguridad ni saltar `getAfter` para «hacer pasar» tests.

## 9. Entregables y criterio GO / NO-GO

Crear `docs/RESULTADOS-P17-CAJA-CONTRATOS.md` con: arquitectura final/decisiones, flujo y máquina de estados, casos de seguridad, pruebas, métricas, índices necesarios, capturas antes/después, lista exacta de archivos, alertas pendientes y **qué requiere publicar el propietario** en Firebase Console.

**GO técnico** solo con emuladores verdes, matriz de seguridad de contratos verde, P10-06 verde, reportes y notificaciones consistentes y CI verde del SHA que luego publique el propietario. **NO-GO** si se puede leer un contrato ajeno por SDK, abrir dos cajas, inventar importes o atribuir operaciones del turno anterior al nuevo.

En el cierre de Codex, distinguir claramente: implementado / parcialmente implementado / bloqueado por Spark / requiere publicación de Rules. **No ejecutar Git, deploy ni tocar Firestore real.**
