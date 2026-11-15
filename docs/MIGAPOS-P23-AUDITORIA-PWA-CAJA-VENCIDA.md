# MigaPOS P23 — Reparación de actualización PWA y continuidad de caja vencida

**Auditoría de referencia:** rama `fix/migapos-production-readiness`, GitHub HEAD `4effc1b9e589119913516905121daaee3d77f618` (15/11/2026). **Codex debe inspeccionar primero el HEAD local, `git status --short` y los cambios ya presentes.** No dar por hecho que la versión instalada en Android es la misma del repositorio. No sobrescribir cambios ajenos.

## Meta operativa

1. El botón de actualización realmente aplica la versión nueva cuando es seguro o muestra **por qué no puede hacerlo**, con reintento verificable. Dejar de mostrar un botón que parece no hacer nada.
2. Un turno de caja que alcanzó su plazo de 10 h (histórico) o 14 h (nuevo) **deja de admitir cobros desde el instante de vencimiento**, conserva su trazabilidad y **no impide abrir el turno siguiente** si un actor autorizado está iniciando una caja nueva y la sesión anterior es una sesión Spark íntegra y genuinamente vencida.
3. El turno previo queda identificado como **`expired_unreconciled` / cierre por vencimiento, sin arqueo**, con fecha/hora exactas de vencimiento, actor de materialización, `reconciliationPending: true`, `declaredAmount: null` y `difference: null`. Se mantiene aparte la **referencia estimada del efectivo** calculada con movimientos confirmados. No declarar jamás que hubo conteo físico o diferencia verificada.
4. Notificación legible para cajero/dueño de que el turno expiró, sin bloquear con avisos de «Comprobar estado» que no ejecutan una resolución accionable. Evitar repetición de toasts y escrituras por polling.
5. Dejar **toda la CI verde**, incluyendo el fallo real P22 en P19/Chromium, antes de desplegar. Sin commit/push/deploy por parte de Codex.

## Hallazgos verificados en el repositorio

### Actualizador PWA

- La captura muestra **«Ignorar (2h)» y «Actualizar»**, interfaz de `ReloadPrompt.jsx` **anterior a P22**. El código P22 remoto muestra «Más tarde», «Actualizar ahora» y «Reintentar». Este desfase prueba que al menos una instalación conserva el frontend antiguo o no se cargó el deploy nuevo; **no demuestra** por sí solo que el botón de P22 falle.
- `frontend/public/pwa-update-worker.js` intercepta `SKIP_WAITING` del cliente anterior con `stopImmediatePropagation()` y descarta el mensaje. El botón antiguo de Vite PWA envía precisamente ese mensaje al usar `updateServiceWorker(true)`; por eso puede parecer inoperante. **No retirar a ciegas esa intercepción:** el cliente antiguo también tiene un temporizador de recarga automática que podría interrumpir cobros. No hay forma segura de distinguir clic del usuario frente a temporizador antiguo usando únicamente ese mensaje.
- P22 usa un protocolo nuevo `MIGAPOS_ACTIVATE_UPDATE`, `registerPwa.js`, `updateRegistration.js` y comprobación de IndexedDB. La nueva implementación NO puede reparar el JS que ya está ejecutándose en un cliente obsoleto antes de que ese cliente recargue/cierre sus pestañas.
- La migración inicial segura para instalaciones legadas requiere cerrar **todas** las pestañas y ventanas/PWA de MigaPOS, finalizar operaciones y volver a abrir. Documentar el procedimiento sin borrar IndexedDB, borrar toda la caché, `unregister` indiscriminado ni reinstalación forzada. Verificar el comportamiento en Android Chrome y PWA instalada, no solo en Chromium de escritorio.

### Caja vencida

- `frontend/src/features/cash-register/hooks/useCashRegister.js`: `recoverySession` está restringida al dueño o al cajero propietario del turno anterior. Si el nuevo cajero es **distinto** del responsable anterior, la sesión expirada aparece como `heldByOther`/`needsForceClose`, pero la UI puede seguir bloqueando «Abrir caja».
- `frontend/src/modules/CashRegisterModals.jsx`: `openingBlocked = (hasOpenSession && !replacingExpired) || expiryState?.busy` bloquea el botón cuando el turno vencido pertenece a otro cajero; `needsOpeningCheck` añade «Comprobar estado de caja» aun cuando el error requiere otra acción. `CashRecoveryStatus.jsx` ofrece «Comprobar estado» en un error que no desaparece solo por releer.
- `frontend/src/features/cash-register/infrastructure/sparkCashRepository.js` **ya soporta** reemplazar un candado Spark expirado en una **transacción atómica**: actualizar turno previo a `expired_unreconciled`, sustituir `active_cash_sessions` y crear la sesión nueva. Debe aprovecharse, no sustituirse por escrituras sueltas ni borrar el candado manualmente.
- `frontend/src/features/cash-register/infrastructure/cashRegisterRepository.js` usa `findOpenSession(..., { forOpening: true })`, emite `recoverSessionId` y recupera comandos. Revisar carreras entre `finalizeExpired()`, la lectura de `cash_sessions` y la apertura: si una confirmación o respuesta se pierde, releer servidor y reconocer únicamente una transacción efectivamente confirmada; no abrir duplicados ni cambiar IDs de idempotencia.
- `firestore.rules` aplica `cashExpiryRecovery`, `cashRecoveryLock`, `newCashLock`, `cashOpening` y `releaseCashLock`; además **requiere servidor** (`request.time`) y los roles/turnos válidos. Conservar esas barreras. `cashActor` aplica horario laboral al actor actual: alguien fuera de horario no puede abrir; ese rechazo es correcto y distinto del bloqueo por caja vencida.
- `cashExpiryTotals()` y `sparkCashClosingRepository.inspectExpiry()` ya proporcionan **referencia calculada desde ventas y pagos confirmados**; `cashAuditRows()` ya genera evento de vencimiento y estado de referencia calculada o pendiente. No sustituir por cálculo superficial (fondo inicial + ventas sin distinguir pagos, anulaciones, anticipos, reembolsos o periodos).
- `useCashRegister()` ya intenta materializar el vencimiento de manera oportunista cuando **el dueño** está conectado. Esto no equivale a un trabajo de servidor ejecutado exactamente al límite. En plan Spark, sin Functions/cron, definir **vencimiento lógico por fecha del servidor** y materialización idempotente por cliente autorizado al observarlo o abrir el turno siguiente. No prometer que Firestore se modifica estando todas las aplicaciones cerradas.

## A. Corrección PWA — prioridad alta

**Revisar:** `frontend/src/components/ReloadPrompt.jsx`, `frontend/src/features/pwa/{registerPwa,updateRegistration,localUpdateSafety}.js`, `frontend/public/pwa-update-worker.js`, `frontend/src/App.jsx`, `frontend/vite.config.js`, `scripts/check-build.mjs` y pruebas PWA.

1. **Diagnosticar dos generaciones:** obtener evidencia de `navigator.serviceWorker.getRegistration()`, `registration.active/waiting/installing`, `navigator.serviceWorker.controller`, scripts activos y `build/commit` cargado, sin registrar información sensible. Identificar si el móvil que muestra «Ignorar (2h)» está en JS anterior a P22. Garantizar que `/sw.js`, `/pwa-update-worker.js`, `index.html` y assets se sirven como se espera y que Hosting no desplegó `dist` antigua. No inventar estado remoto ni atribuir la causa exclusivamente al código sin verificar.
2. **Compatibilidad histórica segura:** conservar el bloqueo del `SKIP_WAITING` legado que puede ejecutarse por temporizador; no permitir saltarse comprobaciones de formulario o pendientes. Ofrecer una **ruta humana de primera migración** (cerrar todas las instancias de MigaPOS una vez y volver a abrir) para instalaciones anteriores que no puedan comunicar el protocolo nuevo; mantener la actualización moderna funcional a partir de ahí. Solo implementar bridge automático si es posible verificar, **desde el propio worker y de manera demostrable**, pestaña única, cliente seguro, sin formularios/caja y sin pendientes; en caso contrario, no hacerlo.
3. **Actualizador moderno:** usar una sola instancia y máquina de estados clara (`waiting`, `checking`, `blocked`, `activating`, `done`, `error`). Clic en «Actualizar ahora» o «Reintentar» debe ejecutar la verificación real, explicar motivo de bloqueo y recuperar después de cerrarse otra pestaña o resolver un pendiente. No usar un botón inerte. Esperar `controllerchange`/evidencia equivalente para recargar **solo una vez**, con timeout recuperable, y verificar nueva versión. Evitar carreras, listeners duplicados y falsos positivos de múltiples pestañas. No recargar durante login Google, caja abierta, carrito, formularios, operaciones no confirmadas, pendientes locales ni sesión que no puede probar seguridad.
4. Si el navegador/worker ya están actualizados pero existe una captura vieja, explicitar claramente la **diferencia entre deploy y caché/cliente legado** y cómo verificarla sin borrar datos. No introducir más endpoints de versión o workers salvo evidencia que justifique esa complejidad.
5. Probar migración de cliente legado a P23, botón moderno seguro, bloqueo con caja, ventas y formularios, varias pestañas, offline/reconexión, reintento, pérdida de acuse, ausencia de borrado IndexedDB y compatibilidad móvil Android cuando sea reproducible. Si falta entorno Android, declarar cobertura limitada.

## B. Caja vencida — continuidad operativa sin arqueo ficticio

**Revisar:**
- `frontend/src/features/cash-register/{domain/cashExpiry.js,hooks/useCashRegister.js,application/{localCashPending,cashExpiryTotals}.js,infrastructure/{cashQueryRepository,cashRegisterRepository,sparkCashRepository,sparkCashClosingRepository}.js}`
- `frontend/src/modules/{POS.jsx,CashRegisterModals.jsx,CashRecoveryStatus.jsx}` y `frontend/src/modules/pos/TicketParts.jsx`
- `frontend/src/features/reports/application/cashAuditRows.js` y lector de movimientos de reportes
- `firestore.rules` **solo si la mínima adaptación necesaria está demostrada por las pruebas**.

**Contrato de negocio obligatorio**

1. Hora de vencimiento: `openedAt + durationHours` (10 h histórico, 14 h nuevo), nunca prorrogable por reloj cliente. Desde ese instante Rules **impiden** ventas, cobros/anticipos y cierres manuales tardíos vinculados al turno previo. La UI trata ese turno como vencido incluso antes de la materialización remota.
2. Un usuario activo, autorizado para esa sede, dentro de horario y con licencia válida, puede abrir el siguiente turno con fondo inicial nuevo aunque la caja anterior esté vencida, **incluido otro cajero distinto al anterior**. No exigirle revisar o contar el turno vencido para poder operar. Distinguir esto de una caja **todavía vigente**, de permisos insuficientes, ausencia de conexión, cola de pagos incierta, candado corrupto o sesión histórica sin protocolo; esos casos requieren protección explícita y no deben ignorarse.
3. En caso normal, realizar un **único commit Firestore** con creación de sesión nueva, transición del turno anterior a `expired_unreconciled` y reemplazo de candado, o reutilizar `finalizeExpired()` seguido de apertura con recuperación de carrera verificada. Preferir **la transacción de rotación existente**. Ninguna operación debe abrir dos cajas simultáneas por carrera, dos dispositivos o reintento. Conservar ID idempotente y `getAfter()`/`request.time` de Rules.
4. Corregir `recoverySession` y `openingBlocked` para permitir **el turno vencido válido de otro cajero**. Evitar esperar a un auto-finalizador exclusivo del dueño para poder abrir. En lectura/consulta distinguir sesión vigente, vencida recuperable y anomalía real. Actualizar/cancelar correctamente los estados viejos tras confirmación; no dejar `needsOpeningCheck=true` indefinido. Retirar «Comprobar estado de caja» y «Comprobar estado» **de los avisos rutinarios de vencimiento**, sustituyéndolos por «Abrir nueva caja» (con acción real) o aviso compacto informativo. Para respuestas de apertura ambiguas, conservar una verificación automática contra servidor con la misma idempotencia y mensaje de error real, pero sin botones decorativos.
5. **Historial/importe:** registrar hora exacta de vencimiento, sesión anterior, responsable de la sesión, actor que confirmó la expiración y motivo `shift-time-limit`. Mantener `reconciliationPending=true`, `declaredAmount=null`, `difference=null`; jamás inventar `closedAt`, dinero contado o cuadre. El monto **esperado/referencia** se calcula sobre movimientos confirmados y dentro de la ventana de la sesión, incluyendo cobros POS, contratos, medios digitales, anulaciones, compensaciones y reintegros, reutilizando `cashExpiryTotals()` y lectura acotada. Mostrar `S/ ...` con etiqueta **«Referencia calculada; sin arqueo»** solo si el conjunto ha sido validado; en caso contrario **«Referencia pendiente de verificar»** y opción de consultar en Historial/Reportes, sin bloquear la nueva caja. No guardar un valor ficticio en Firestore ni asumir que `0` es un saldo verificado.
6. **Avisos:** emitir mensaje legible y no repetitivo al detectar vencimiento/materialización; si se requiere aviso persistente al dueño, reutilizar el sistema existente con ID determinista, validaciones de Rules y pruebas de no falsificación/no duplicado. No convertir alertas informativas en evidencia financiera y no crear infraestructura adicional sin necesidad.
7. **Spark:** sin tarea programada de servidor, el vencimiento es **lógico e inmediato** para operaciones (por Rules), mientras que la etiqueta persistida en Firestore se materializa con la siguiente interacción autorizada/conectada. Ser transparente con ese límite técnico. No introducir Blaze, Cloud Functions, cron, listener por segundo o nuevas colecciones para esta reparación.

## C. Casos obligatorios de pruebas

**Seguridad / emulator** (`tests/spark-financial.rules.test.mjs`, `tests/spark.rules.test.mjs`, tests cash de dominio):
- Caja anterior vence exactamente por timestamp servidor. Se rechazan ventas y pagos posteriores vinculados al ID anterior aunque el cliente falsee la fecha.
- **Otro cajero activo y autorizado**, dentro de horario, abre nueva caja tras el vencimiento de un turno ajeno; dueño también puede; el anterior queda `expired_unreconciled` y el candado apunta solo al nuevo.
- Caja todavía vigente no se sustituye; un actor fuera de horario, otra sede/tenant, suspendido o sin licencia no puede abrir.
- Dos aperturas simultáneas para la misma sede: una sola gana; reconexión y respuesta perdida no duplican apertura ni alteran la historia.
- Reintento luego de cierre concurrente/materialización por otro actor: refresca servidor e identifica la operación confirmada con el ID correcto. Estados huérfanos o corruptos no se «reparan» borrando candados.
- Sesión previa de 10 h y de 14 h, vencimiento exacto, frontera UTC/Lima, fondos en céntimos, devoluciones y pagos mixtos; `declaredAmount/difference=null`, referencia verificada o pendiente, sin alteración de ventas/contratos.
- Registros locales de venta incierta **no se descartan ni se reetiquetan** para desbloquear; mantener resguardo del historial.

**Interfaz móvil** (`tests/plan17-cash.browser.test.mjs`, `tests/plan09.browser.test.mjs`, `tests/cash-amount.browser.test.mjs`):
- Cajero B observa caja de A expirada: puede tocar «Abrir caja nueva», introducir el fondo y confirmar; puede registrar una venta solo después de apertura validada.
- No aparecen «Comprobar estado»/«Comprobar estado de caja» como CTA en el vencimiento rutinario. No aparecen notificaciones de error falsas ni modales atrapados en `needsOpeningCheck`.
- Historial de caja muestra hora de expiración y **referencia calculada, sin arqueo** cuando es verificable; si no hay cobertura total, muestra explícitamente pendiente.
- Actualizador PWA no puede interrumpir modal de apertura, caja vigente, venta en proceso, borradores ni otras pestañas.

**CI P22 ya falló**, no posponer su corrección: `https://github.com/saintdeyb321/Mig/actions/runs/43766229336`. Error P19 en `tests/plan09.browser.test.mjs:652`, 320 px: el fixture devolvió `footers: []` mientras el test esperaba botones de tarjetas. Diagnosticar la carga/sincronización del fixture antes de medir; **no suprimir la aserción** ni fabricar un `PASS` sin tarjetas visibles. Asegurar que los datos inyectados aparezcan realmente, y comprobar acciones y tamaños a 320/360/390/412/768 px.

## D. Límites de implementación y validación

- **No tocar** textos legales, SHA-256, aceptación P21, suscripciones, modelos de contratos/ventas ajenos a caja, permisos generales o colecciones financieras sin necesidad demostrada. Si Rules cambian, enumerar cada autorización exacta y probar aislamiento por tenant/roles y ausencia de escalación.
- Cero eliminación de datos, `clear()` de IndexedDB, `indexedDB.deleteDatabase`, `caches.delete` global o `unregister()` masivo. No utilizar `skipWaiting` generalizado o `clientsClaim` de forma insegura.
- Primero pruebas focalizadas de caja/PWA/P19, después `npm run test:spark:rules`, lint, build de producción, `npm run check:build`, pruebas Chromium y `git diff --check`. Reproducir la CI entera; la referencia de aprobación es **GitHub Actions en el commit final**, no solo un informe local.
- Antes de cierre de tarea, recorrer manualmente flujo **A vence → B abre → B vende → A aparece expirada en Reportes**.
- No hacer commit, push ni deploy; entregar máximo 12 líneas con archivos, cambios, PASS/FAIL y bloqueantes. No imprimir logs grandes ni reescribir documentación legal.

## Criterio de salida

P23 está terminado **solo** si el viejo botón tiene una vía de migración segura documentada, el actualizador moderno funciona de verdad, el cajero B puede abrir tras vencimiento normal de A sin arqueo ficticio, la referencia esperada se expresa honestamente y **toda la CI está en verde**. Hasta entonces, no publicar producción.

## Migración de una instalación que muestra «Ignorar (2h)»

1. Termina los cobros en curso, guarda los formularios y revisa los pendientes en Historial.
2. Cierra todas las pestañas de MigaPOS. En Android, cierra también la ventana de MigaPOS instalada desde la vista de apps recientes y las pestañas de Chrome que tengan la aplicación abierta.
3. Vuelve a abrir MigaPOS con conexión. El navegador puede activar el worker en espera al liberarse el último cliente. Si todavía aparece el aviso antiguo, el propietario debe comprobar qué build sirve Hosting antes de repetir la migración. Conserva el almacenamiento del sitio y la instalación.

Para distinguir una publicación anterior de un cliente que sigue ejecutando un build previo, compara en DevTools el módulo de entrada cargado con el asset que referencia el `index.html` servido por Hosting y con el artefacto atestado del SHA que se publicó. En la pestaña afectada, esta consulta de solo lectura muestra los estados del worker sin imprimir datos de negocio:

```js
const reg = await navigator.serviceWorker.getRegistration();
const state = worker => worker && { url: new URL(worker.scriptURL).pathname, state: worker.state };
console.table({ active: state(reg?.active), waiting: state(reg?.waiting),
  installing: state(reg?.installing), controller: state(navigator.serviceWorker.controller) });
console.log(document.querySelector('script[type="module"][src]')?.getAttribute('src'));
```

Un `/sw.js` con la misma URL puede corresponder a dos builds. Comprueba también el asset de entrada y el worker auxiliar en el artefacto publicado. El mensaje `SKIP_WAITING` del aviso antiguo se ignora porque el mismo cliente lo enviaba desde su temporizador. El botón moderno comprueba condiciones seguras antes de solicitar la activación.
