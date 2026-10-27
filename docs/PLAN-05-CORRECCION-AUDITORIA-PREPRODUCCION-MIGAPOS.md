# MigaPOS — Plan 05: remediación verificable para lanzamiento comercial

**Estado:** EN EJECUCIÓN LOCAL en `fix/migapos-production-readiness`, base `16c1e8c` (incluye Plan 04, bootstrap offline y corrección de caja `dd731b4`). **No autoriza despliegues ni certifica producción.**

### Evidencia de ejecución — checkpoint A (26/10/2026)

El repositorio nativo ejecuta la venta de dos productos S/16, mixto S/4 efectivo + S/12 Yape, junto con ambos descuentos y la notificación, contra `firestore.rules` integradas en Emulator `demo-migapos`: APROBADO. El recibo permanece único y el reintento no descuenta de nuevo. No se reprodujo el 403 con este HEAD: no se modifica artificialmente `validPayment`, `saleContext`, `line`, `debit` ni `operationNotice` para ocultarlo. El formato real es `payment: mixto`, `splitPayments` y `stock[branchId]`; el informe no demuestra un defecto de enum o de stock global. Rules efectivamente publicadas y payload fallido original: NO VERIFICADOS, no disponibles en esta ejecución. Para diagnosticar el incidente real, el propietario debe conservar la versión publicada de `(default)` y el payload anonimizado del commit rechazado; no debe reintentar con un ID nuevo si el resultado anterior es incierto.

La ampliación a dos envíos iniciales concurrentes del mismo ID SÍ reprodujo `permission-denied`: la evaluación integrada reportó el límite de 1000 expresiones al intentar actualizar productos/recibo/notificación de un ticket que el otro intento ya había creado. Las políticas inmutables rechazan correctamente ese segundo commit. El repositorio recupera ahora exclusivamente un recibo de servidor equivalente (mismo ID y payload canónico); si no puede comprobarlo, devuelve `receipt-unverified`, nunca un éxito ni un rechazo financiero definitivo. Esto demuestra una causa local de 403 por carrera, no acredita que sea la causa del navegador real sin su payload/Rules publicados.

**Fuente:** informe externo «MIGAPOS — AUDITORÍA TÉCNICA INTEGRAL PREPRODUCCIÓN», entregado el 26-10-2026, con hallazgos `AUD-001` a `AUD-012` y cuatro observaciones P3. **Alcance de esa fuente:** el propio auditor declara haber examinado un ZIP sin descomprimir y el SHA antiguo `41dd809`. Por ello sus causas internas son mayormente *hipótesis*, no diagnósticos reproducidos. La auditoría externa **no sustituye** una inspección del HEAD vigente y de las Rules publicadas.

**Referencia GitHub contrastada:** `saintdeyb321/Mig`, `fix/operacion-saas-spark@b74092ff03f4f81340171167ca45b2d406f5e50d` (versión pública disponible durante la preparación del plan). Existe trabajo posterior reportado como local para el Plan 04; verificar su rama y sus cambios antes de editar. No trabajar desde `main@41dd809` ni revertir correcciones posteriores.

## 0. Aclaraciones esenciales antes de codificar

1. El 403 de una venta de **dos productos, S/ 16, S/ 4 en efectivo y S/ 12 en Yape** es **un defecto observado**. La causa precisa **no fue demostrada** por el informe. La transacción contiene `sales` (create), dos `products` (update) y `notifications` (create). Reproducir ese commit íntegro y determinar el predicado fallido y/o el presupuesto de accesos de Security Rules. Comparar reglas integradas con las efectivamente publicadas; si no se dispone de estas, indicar *no verificado*.
2. El código comprobado usa `payment: 'mixto'` y `splitPayments: { efectivo, yape }` en `validPayment()`, no `paymentMethod/paymentBreakdown`. **No ampliar enums ni cambiar el formato por copiar el informe**.
3. El stock actual usa el mapa `stock[branchId]` y la versión `posStockVersion[branchId]`, no `stockByBranch`. Una compatibilidad histórica solo se habilitará tras demostrar el esquema real; **no permitir un fallback a stock global que habilite descuentos en otra sede**.
4. El flujo de caja actual usa `cash_sessions` y `active_cash_sessions`; no cambiarlo a `cash_registers`. Verificar campos nuevos, por ejemplo `durationHours`, en el HEAD que realmente se ejecuta y sus reglas correspondientes.
5. Hay funciones `get()`/`getAfter()` para contexto de venta, productos y aviso informativo. El posible exceso de accesos por operación/transacción es una **hipótesis prioritaria a medir**, nunca una excusa para eliminar protección de roles, caja o licencia.
6. `runtimeCapabilities` mantiene `saleVoid: false` y `offlineSync: false` en la rama pública comprobada; y el cobro online está limitado a dos líneas por el protocolo. Las tres son **brechas comerciales explícitas**, no funcionalidades completas.

## Principios innegociables

- Firebase **Spark** con Auth, Firestore, Hosting, IndexedDB y PWA. Sin requerir Blaze, Cloud Functions, Storage ni un backend externo.
- Seguridad multi-tenant por **UID, businessId, branchId y rol**, verificada en Rules y en operaciones; SuperAdmin y dueño con competencias distintas.
- **Ni falsos éxitos ni cobros parciales:** la venta, inventario y comprobante deben ser íntegros o rechazados; pago y compensación idempotentes; no borrar histórico contable.
- Reglas **restrictivas**: prohibido `allow write: if true`, ampliar permisos para tapar 403, confiar en totales del cliente o desactivar una regla para que pase una prueba.
- Mantener compatibilidad con datos históricos, sesiones/pendientes IndexedDB y fotos locales. No purgar caché del usuario durante una migración sin inventario y procedimiento seguro.
- Auditoría e implementación locales/emulador; **sin deploy, escrituras reales, merge a main ni cambios de `.env`** salvo autorización posterior y específica.

## Etapa 0 — Línea base y matriz de evidencias (obligatoria)

- Identificar rama local, SHA, cambios no confirmados, commits de Plan 04 y las versiones reales de `firestore.rules`, `firestore.indexes.json`, frontend y módulos financieros. Conservar trabajo local existente; crear rama de corrección desde la versión funcional más actual.
- Inventariar invocaciones activas de `httpsCallable`/Functions y distinguir **referencias históricas inertes** de rutas runtime. No eliminar archivos legacy como requisito cosmético.
- Convertir `AUD-001…012` en una matriz: **confirmado/probable/riesgo/descartado/no verificable**, archivo y evidencia. **No asumir verdadero el parche sugerido por la otra IA.**
- Registrar cómo obtener y comparar las Rules publicadas en `migapos/(default)` sin cambiar su contenido. No afirmar que coinciden con el repositorio sin comprobación.
- Establecer fixtures representativos, **anonimizados**: dueño/cajero, licencia activa, una sede activa, caja abierta, dos productos con stock suficiente, venta mixta, un producto/sesión legacy.

## Etapa 1 — P0: ventas, stock, caja y errores 403 (AUD-001, 002, 003, 005)

**Objetivo:** que una venta legítima de dos productos online se confirme contra las reglas integradas, con stock exacto y notificación opcional sin falsificar estados.

- Reproducir la **transacción de cuatro escrituras** en el Emulador Firestore con las mismas estructuras observadas en el log de venta real. Localizar regla, predicado y presupuesto de accesos; contrastar la política actual del proyecto si se dispone de ella.
- Auditar `saleContext()`, `sale()`, `line()`, `debit()`, `operationNotice()`, `getAfter()`, `validPayment()` y todos los accesos a perfil/licencia/tenant/sede/sesión/lock. Documentar **causa comprobada**, no solo suposición de límite.
- Alinear esquema exacto **UI → canonicalSale → transacción → Rules** (identidad, sede, caja, importes en céntimos, medio mixto, timestamp de servidor, recibo, stock y versión).
- Mantener validación de precios/costos canónicos e integridad por artículo. Si el aviso `notifications` resulta no crítico y causa sobrecoste, rediseñarlo como eventual e idempotente **sin poder transformar un cobro confirmado en fallido ni crear un falso cobro**. No mover validaciones financieras fuera de la transacción.
- Probar escenarios negativo/positivo: 1 y 2 productos, efectivo/Yape/mixto, stock insuficiente, precio cambiado, turno incorrecto, caja cerrada/vencida, sede inactiva, licencia vencida, otra empresa, concurrencia y reintento mismo `saleId`.
- Comprobar que un commit rechazado no cambia venta/stock/aviso remotos y que el estado local distingue **rechazado**, **pendiente de confirmación** y **confirmado**.

**Puerta G1:** venta mixta de 2 artículos reproducible y aprobada; sin bypass de Rules ni pagos/stock dobles. Si falla: detener habilitación financiera.

## Etapa 2 — P0: cola durable, errores definitivos e idempotencia (AUD-004, 012)

**Checkpoint B implementado localmente:** `invalid-argument` y `permission-denied` prevalecen sobre palabras como «network/offline» del mensaje; un rechazo definitivo conserva evidencia cifrada, retira la proyección y no se reintenta. Un commit sin verificación remota permanece pendiente. Antes de repetir una operación ya intentada se consulta su ID: solo una ausencia comprobada y sin acuse anterior permite reintentar; errores de lectura permanentes exigen revisión manual sin nuevos cobros. Un recibo incompleto, ajeno o sin versiones no acredita éxito. POS distingue pendiente de confirmado y no invalida reportes por un ingreso incierto. Sin activar sincronización financiera offline, borrar IndexedDB ni cambiar su esquema. Pruebas focalizadas: clasificación, identidad, cifrado, proyección, acuse local perdido y escrituras reales con Rules integradas + lectura de recibo simuladamente denegada.

- Auditar `saleQueue.js`, `saleQueueStore.js`, `queueState.js`, `pendingSalesCache.js`, `projectQueuedStock.js`, `usePOS.js` y los clasificadores de error.
- Clasificar correctamente error **permanente** (`permission-denied`, `invalid-argument`, conflicto demostrado) frente a **incierto/transitorio** (red, timeout, comprobante no consultable). No borrar pendientes de situación incierta ni marcar un error como definitiva si pudo existir commit exitoso.
- Ante rechazo definitivo: conservar evidencia para revisión, eliminar la proyección optimista de stock y evitar reintentos automáticos infinitos. Ante resultado incierto: verificar comprobante remoto **con el mismo ID** antes de reintentar.
- No registrar `success` en UI cuando la venta no se confirmó; no interpretar `isOffline` como cobro aprobado. Reglas del caché por UID/negocio/sede y preservación de registros cifrados.
- Probar rechazo 403, desconexión antes/después del commit, rechazo tras retry, cambio de sesión, doble clic, reintento idempotente y reinicio PWA.

**Puerta G2:** cola consistente, ninguna venta perdida ni duplicada; proyección local y servidor claramente distinguibles.

## Etapa 3 — P0 comercial: tickets multiproducto y anulación (AUD-001, 008)

- Resolver la **limitación de cobro de dos líneas**, no solo el tamaño del carrito. Diseñar un protocolo Spark con verificación de precios, suma, identidad, caja, stock, concurrencia e idempotencia para tickets comerciales (probar 3, 5, 8 y 12 líneas, o justificar técnicamente un máximo visible y suficiente para el mercado objetivo).
- Evaluar de forma demostrable las restricciones de Security Rules, tamaño/batch/transacciones y precio de lecturas. **No dividir un único ticket en ventas independientes** si se pierde atomicidad del pago.
- Implementar anulación mediante **registro compensatorio inmutable** vinculado a la venta, motivo, restitución exacta de stock y devolución contabilizada en caja válida. Un único reembolso efectivo por venta; no borrar ni mutar arbitrariamente comprobantes históricos.
- Confrontar política de cajero/dueño para anular, sesiones cerradas y ventas históricas. La autorización debe estar en Rules. Si no se consigue garantía fuerte sin backend, mantener bloqueado y consignar **bloqueo de lanzamiento comercial**.

**Puerta G3:** tickets comerciales y anulación comprobados con carrera/reintentos y Rules. No declarar MVP vendible si alguno sigue bloqueado sin política de negocio explícita.

## Etapa 4 — P1: permisos, caja, contratos y datos históricos (AUD-006, 007, 008)

- Validar que dueños/cajeros no puedan modificar rol, cupos, negocio o sede fuera de autorizaciones; licencias, sedes inactivas, invitaciones y perfiles deben resistir carreras.
- Mantener `cash_sessions` + `active_cash_sessions`; definir propiedad del lock, quién puede cobrar sobre caja abierta por otra persona, turno del cajero y duración máxima **con tiempo del servidor**. No asumir que cambiar de cajero autoriza reutilizar cualquier sesión.
- Validar pagos de contratos, anticipos, entrega, cancelación y reembolsos como operaciones atómicas/idempotentes; balances no manipulables ni negativos. Probar perfiles y documentos históricos concretos.
- Reconciliar comportamiento de Frontend/Rules al cambiar de sesión, F5, cuenta y sede. Los errores transitorios no deben presentarse como negocio eliminado.

**Puerta G4:** operaciones con permisos estrictos y compatibilidad histórica controlada, sin escrituras automáticas destructivas.

## Etapa 5 — P2: consultas, caché, Excel y offline de lectura (AUD-010, 011, 012)

- Corregir `limit(>10000)` y queries no paginadas; preservar períodos diario/semanal detallado y mensual/anual resumido, detectar exports parciales y mantener políticas explícitas de consumo.
- Auditar renders React **separados** de remounts, listeners y lecturas remotas; mejorar TTL, invalidación dirigida, filtros y revalidación. No prohibir renders legítimos ni desactivar `StrictMode` para ocultar errores.
- Cerrar fugas de caché entre usuarios/negocios/sedes. Offline con caché **solo para lectura autorizada por política local**, sin vender permisos cacheados como autorización financiera.
- Diagnosticar `permission-denied`, `failed-precondition` y conexión por separado; nunca sustituir una consulta fallida por un «sin registros» engañoso.

**Puerta G5:** reportes completos, consumo acotado, caché aislada y cambios de conexión sin falsos éxitos.

## Etapa 6 — SuperAdmin, exportación y baja (AUD-009)

- Exportación empresarial exclusiva SuperAdmin con comprobación de completitud/alcance, integridad y entregables. Comunicación de baja **por WhatsApp externo**, sin crear tickets en el producto.
- Vista «Ver detalles»: usuarios/correos Firestore, UIDs, sedes, licencia y manifiesto de rutas, incluyendo subcolecciones conocidas y las que no puedan descubrirse desde el cliente.
- Eliminar Auth manualmente **no borra** sus documentos en Firestore. No dar por suficiente el inventario parcial ni habilitar borrado indiscriminado de otro tenant.
- Implementar **primero** dry-run, manifiesto reproducible y procedimiento administrativo fiable que detecte huérfanos. La ejecución de purga permanecerá deshabilitada hasta disponer de mecanismo seguro y autorización expresa; un SDK navegador no puede garantizar por sí solo descubrimiento de todas las subcolecciones.

## Verificaciones focalizadas y criterios de salida

| Área | Criterio de aprobación |
| --- | --- |
| Compilación | lint, build/PWA, diff-check, dependencias sin vulnerabilidades críticas conocidas |
| Rules/ventas | Reglas **integradas** en emulador; positivo/negativo y presupuesto de accesos para cada escritura; pruebas de concurrencia e idempotencia |
| Financiero | venta normal/mixta multiproducto; caja, anulación y contratos coherentes; ninguna confirmación local falsa |
| Seguridad | dueño/cajero/superadmin y tenant cruzado; modificaciones maliciosas rechazadas |
| Offline/caché | cambio UID/sede, F5, reconexión y cola, sin fuga ni doble cobro |
| Históricos | lectura y protocolo de migración no destructivo ante esquemas anteriores |
| Excel | diario/semanal detallado, mensual/anual resumido, sin truncar silenciosamente |
| Publicación | reglas e índices efectivos comparados; snapshot de políticas actuales y rollback preparado; rollout con autorización explícita |
| Aceptación | propietario ejecuta recorridos manuales reales sobre negocio laboratorio, después de autorizar publicaciones; registrar resultados y errores |

**Veredicto de salida:** No listo para producción mientras persista cualquier P0 financiero o de aislamiento, cobro comercial esencial bloqueado, anulación imprescindible no soportada o errores 403 inexplicados. Un resultado de CI verde habilita *aceptación manual*, no venta a clientes automáticamente.

## Entrega esperada de Codex

1. Commits pequeños en rama de corrección; distinguir defectos confirmados vs hipótesis descartadas.
2. Tabla `AUD-001…012` con evidencia actualizada y archivos editados.
3. Resumen de resultado por puertas G1–G5 y restricciones reales remanentes.
4. Reglas/índices pendientes de publicación, **sin publicarlos**.
5. Pasos breves de aceptación manual de caja → venta → anulación → contratos → Excel → sesión/offline → SuperAdmin.
6. No crear fases infinitas ni documentos paralelos; actualizar `docs/MASTER-PLAN.md` y este Plan 05.
