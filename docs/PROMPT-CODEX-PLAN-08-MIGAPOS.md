# CODEX — MIGAPOS PLAN 08: corregir flujos reales sin romper operaciones financieras

**Rama esperada:** `fix/migapos-production-readiness`  
**HEAD de referencia:** `9d071167add18d4468d4a1beb0c7f7608d1a186f`  
**Referencia de auditoría:** `PLAN-08-CORRECCION-FLUJOS-MIGAPOS.md` (el propietario puede adjuntarlo). Si no está en el repositorio, sigue las incidencias descritas aquí; no esperes a que alguien lo copie.

Eres arquitecto senior de React, Firebase Firestore/Security Rules, IndexedDB/Dexie, consistencia financiera y UX para negocios. **Implementa las correcciones**, no entregues solo una propuesta. Prioriza errores operativos comprobados sobre refactorizaciones generales.

## Método obligatorio

- Trabaja en el directorio actual; no hagas **NINGÚN comando Git**, commits, ramas, worktrees, stash, push, merge, deploy ni acciones contra Firebase real.
- No instales Java, dependencias o herramientas; no modifiques `.env` ni credenciales. No generes MD: el propietario y el auditor gestionan documentación.
- No borres ni migres destructivamente IndexedDB, intentos cifrados, tickets, anulaciones, fotos, stock o datos financieros históricos.
- Lee solamente las rutas relevantes y sus dependencias directas; identifica causa antes de cambiar. Evita pruebas masivas; usa tests focalizados existentes y nuevos casos mínimos.
- Corrige todos los apartados **en un único recorrido**, sin detenerte a pedir autorización entre ellos. Si un apartado no puede implementarse de forma segura, no lo habilites; deja el bloqueo exacto y continúa con los demás.
- No rompas Spark, máximo de **8 líneas**, S/50 000, 1 000 uds/producto, céntimos estrictos, idempotencia, stock exacto, aislamiento multi-tenant, caja y turno por usuario/sede.
- NO habilites ventas financieras offline automáticas ni conciliación/devoluciones físicas certificadas. Ninguna recuperación puede volver a enviar una escritura financiera incierta.

## P0-1. Anulación aplicada, pero aviso de pendiente y modal atrapado

**Observado:** al anular un ticket aparece «Anulación pendiente de comprobar. Conserva el ID y el motivo; no repitas la devolución física». Un segundo después el historial muestra la venta anulada, pero el modal «¿Anular esta venta?» sigue abierto y su botón pasa a «Verificar anulación»; Cancelar resulta confuso.

**Investiga:** `posVoidRepository.js`, `voidRecovery.js`, `saleTransactions.js`, `useSalesHistory.js`, `SalesHistory.jsx`, `SaleHistoryCard.jsx`, `posVoidQueryRepository.js` y Rules asociadas.

**Pistas comprobadas:** `void()` ejecuta una transacción y luego hace `verify()` por servidor; si falla la segunda lectura, retorna `void-unverified` aunque la escritura pudiera estar aplicada. `SalesHistory.jsx` solo cierra el modal cuando `anularVentaConfirmada()` devuelve `true`; el listener de anulaciones opera por separado.

**Implementa:**
1. Una máquina de estados explícita: `idle → submitting → verifying → confirmed | uncertain | definitively_rejected`, con transiciones de UI coherentes.
2. Nunca volver a ejecutar `void()` por un click que solo pretende verificar. Un resultado incierto solo admite `verify()` con ID/motivo/actor/sede originales. Una segunda acción no crea una segunda compensación.
3. Si un recibo `pos_voids/{saleId}` se confirma desde el servidor y supera validación de identidad/payload, actualizar **todos** los estados relacionados (tarjeta, modal, caché local y avisos) y cerrar el modal de confirmación sin pedir un segundo clic.
4. Si sigue incierto, permitir cerrar el formulario sin destruir la evidencia, e informar con mensaje breve «Estamos comprobando la anulación. No la repitas». Si realmente se rechazó, informar causa y conservar la posibilidad de revisar el intento sin falsificar una anulación.
5. Manejar cambios de UID/sede, desmontaje, reintentos, ACK perdido y callbacks fuera de orden. No considerar `fromCache`/`hasPendingWrites` como autoridad.
6. Preservar inmutabilidad, idempotencia de `pos_voids`, grupos, stock y autorización del cajero.

**Prueba focalizada:** transacción aplicada + respuesta perdida + snapshot de historial posterior; modal cierra una vez; segundo clic no ejecuta escritura; ticket histórico/otra sede sin permiso sigue bloqueado.

## P0-2. Restitución de stock y aviso falso «sin stock» al cobrar

**Observado A:** al anular una venta, el usuario ve que el stock no regresa.
**Observado B:** al vender la última unidad, aparece advertencia de stock agotado **mientras el cobro aún está en proceso**; tras completar el cobro, la interfaz se normaliza.

**Investiga:** `posVoidRepository.js`, `CatalogProvider.jsx`, `projectQueuedStock.js`, `projectProducts.js`, `pendingSalesCache.js`, `saleQueue.js`, `queueState.js`, `usePOS.js`, `useCart.js`, `cartCatalog.js`, `TicketParts.jsx`, `catalogRepository.js` y autorización de actualización de productos en `firestore.rules`.

**Pistas comprobadas:** la anulación transaccional llama a `tx.update(product, stock + qty, posStockVersion + 1)`. El catálogo visible calcula un `stock` proyectado sobre recibos pendientes, y `usePOS`/`cartCatalogChanges` reaccionan a ese valor. La causa exacta del stock no restituido **NO se ha demostrado**: puede ser remoto, de proyección, de sede o de suscripción.

**Implementa:**
1. Demostrar con tests y trazas dirigidas (sin usar producción) si el stock remoto se restituye; contrastar `stock[branchId]`, `posStockVersion[branchId]`, `posLastVoidSaleId` y `pos_voids.stockVersions` para venta/anulación de 1 y varias líneas.
2. Si la transacción de anulación falla, no mostrar estado confirmado. Si remoto está bien pero UI mal, corregir la proyección y el retiro de débitos pendientes por versiones, no sumar stock en UI ni inventar recargas completas.
3. Las proyecciones optimistas **no deben producir errores visuales falsos** mientras se procesa el cobro propio. Diferenciar `processing`, `pending uncertain`, `confirmed`, `rejected` en carrito y catálogo.
4. Evitar descuento doble cuando el snapshot remoto ya incluye la venta; permitir que una compensación verificada incremente el stock visible sin F5.
5. Mantener bloqueos genuinos de stock remoto insuficiente, competencia de dos cajeros, producto desactivado/cambio de precio y venta después del cierre.
6. Minimizar listeners/lecturas de Firestore; no introducir un listener nuevo por cada producto del carrito.

**Prueba focalizada:** última unidad en dos navegadores, confirmación lenta y proyección local; anular después y observar versión/stock; reconexión/caché, cancelación y cambio de sede.

## P0-3. Offline: no vender una promesa falsa de sincronización

**Observado:** una operación nueva iniciada sin Internet se guarda localmente, el historial dice «Venta aún no confirmada»; al reconectar y pulsar «Consultar confirmación» responde «Venta pendiente: no existe confirmación remota» reiteradamente.

**Pista comprobada:** `saleTransactions.js` asigna `origin: offline` a intentos desconectados y `saleQueue.enqueue()` los guarda; `sparkSalesRepository.submit()` exige `origin: online`; `receiptRecovery` verifica recibos, pero **no confirma automáticamente** ventas iniciadas por completo offline.

**Implementa sin debilitar seguridad:**
1. Distinguir mediante estado persistente los casos `never_submitted_offline`, `submitted_uncertain`, `confirmed`, `definitively_rejected` y `requires_review`, conservando compatibilidad con ciphertext y registros anteriores.
2. Para intentos **nunca enviados**, mostrar «Guardado en este dispositivo · sin cobrar» y productos/importe, NO «sincronizando» o «venta hecha»; no imprimir recibo confirmado, no descontar inventario remoto y no incluirlos en ingresos.
3. Al volver Internet, ofrecer acción clara «Revisar y cobrar ahora» con validación remota actual de caja, sede, turno, catálogo, precio, stock, importes y permisos antes de crear **una** operación autorizada. No enviar silenciosamente operaciones heredadas, ni reutilizar payload obsoleto sin revisión, ni convertir un rechazo en confirmado. Si el protocolo no permite esta acción de forma segura, conservar el borrador y explicar la necesidad de volver al POS con datos actuales; no implementes automatismos peligrosos.
4. Para ventas *sí enviadas* con ACK perdido, `getDocFromServer` por el **mismo ID original**, verificación estricta e idempotente y actualización de la tarjeta sin segunda escritura.
5. Evitar bucles de `receipt-not-found` en un borrador que nunca se envió. Reservar «Verificar comprobante» para operaciones que podrían haber llegado al servidor.
6. Limitar lecturas tras reconexión y limpieza de listeners; jamás procesar registros de otra identidad/sede ni eliminar evidencia histórica cifrada.

**Prueba focalizada:** offline antes de submit, corte después de commit, reconexión, F5, cambio de UID/sede, rechazos del servidor y duplicación por doble clic.

## P1-4. Historial como una lista comprensible

**Observado:** «Solo pendientes», conteos técnicos y tarjetas escuetas de intentos; al desmarcar, los registros locales desaparecen de la vista principal.

**Pista comprobada:** `salesHistoryPresentation(pending, remote, false)` devuelve solo `remote`. `SaleHistoryCard` tiene un `if (s.isOffline)` que evita reutilizar la tarjeta normal.

**Implementa:**
1. Quitar checkbox «Solo pendientes» y su maquinaria innecesaria; una lista ordenada de ventas confirmadas y operaciones/borradores locales no confirmados, sin duplicación por `saleId`.
2. Las tarjetas locales deben compartir distribución de fecha, sede, productos, importes, método de pago y detalles con las confirmadas, con **badge pequeño y veraz**: «Por confirmar» (commit incierto) o «Guardado · sin cobrar» (offline nunca enviado).
3. Al confirmarse por servidor, la tarjeta se convierte en confirmada sin duplicación ni salto innecesario. No mezclar borradores con métricas financieras.
4. Los intentos rechazados definitivamente se muestran en una sección secundaria plegable «Revisión local», sin esconderlos ni permitir borrado inseguro.
5. Solo ofrecer acciones permitidas por estado; mensajes comerciales breves, diagnóstico técnico en detalle plegable. Optimizar lecturas: reutilizar snapshots, no crear consultas individuales para renderizar cada tarjeta.
6. Preservar el historial real, comprobantes y permisos de dueño/cajero.

**Prueba:** una confirmada, una incierta, un borrador offline, un rechazo; transición de una incierta a confirmada; navegación y F5.

## P1-5. Arqueo de caja claro para dueños y cajeros

**Observado:** fondo S/11 + efectivo POS S/106.30 − compensaciones S/106.30 = estimación S/11; contado S/11, diferencia S/0. La interfaz muestra bloques extensos de «conciliación pendiente», «compensaciones», «estimación» que dificultan entender el cierre.

**Investiga:** `CashRegisterModals.jsx`, `cashTotals.js`, `sparkCashClosingRepository.js`, `cashRegisterRepository.js`, informes/Excel correspondientes.

**Implementa:**
1. Vista principal de arqueo breve con lenguaje cotidiano: «Dinero al abrir», «Cobros en efectivo», «Tickets anulados» (cantidad y monto), «Dinero contado», «Resultado de caja». Ayuda contextual «¿Cómo registrar anulaciones?» y explicación accesible, no 5 párrafos técnicos.
2. **Si no hay anulaciones sin evidencia de devolución**, indicar «Coincide», «Faltan S/…» o «Sobran S/…» según resultado verificable. Si hay devoluciones físicas NO acreditadas, indicar «Revisar anulaciones con el dueño» y diferencia *provisional*; no etiquetar como saldo físico certificado ni fingir que se entregó dinero.
3. No borrar ni alterar los asientos de `pos_voids`, ventas, cierre, método de pago o los reportes; conservar desglose completo en «Ver detalle» y Excel. No suponer que una compensación equivale a salida de billetes/Yape.
4. El usuario puede explicar en observaciones del cierre que devolvió S/4 de ticket de día anterior, pero la nota por sí sola **no convierte esa devolución en comprobación automática**. No implantar aún nuevas opciones de desembolso.
5. No añadir lecturas remotas solo para decorar el modal; usar el resumen ya obtenido. Mantener bloqueo de caja y requisitos de motivo cuando correspondan.

**Prueba:** fondo 11, cobros 106.30, anulaciones 106.30, contado 11; además fondo 10 y anulación de ticket de turno anterior de 4 con devolución física declarada: no presentar automáticamente faltante/ganancia certificada.

## Verificación y criterios de entrega

- Corrige los flujos completos: repositorio → estado local → hook → componentes → suscripción → contabilidad. Nada de «arreglar el mensaje» mientras la inconsistencia persiste.
- Añade casos específicos Node y Chromium para carrera de render y recuperación, con mocks que distingan lectura cacheada vs `getDocFromServer` real.
- No hacer pruebas financieras con Firebase productivo ni instalar Java. Si Rules cambian, deja listado de archivos y pruebas pendientes de publicación manual, sin desplegar nada.
- Asegura `lint`, `build/PWA`, tests focalizados y `indexes:check` **solo si las consultas cambian**; no vuelvas a ejecutar suites enormes repetidamente.
- Conserva la compatibilidad histórica, la autoría por actor, exactitud de stock y conteos de reportes.
- No mezcles la vulnerabilidad transitoria de desarrollo `minimatch` o el bloqueo de CI con este plan; no debilites auditoría de seguridad.

### Respuesta final (máximo 35 líneas)

1. Causa real y corrección de P0-1 a P1-5, diferenciando confirmación de hipótesis.
2. Archivos de código y tests modificados (solo lista).
3. Resultados de pruebas/lint/build y los casos que no se pudieron ejecutar.
4. Si hay cambios de Rules o índices, definiciones precisas para revisión manual.
5. Qué sigue bloqueado y por qué, sin fingir funcionalidad offline o conciliación física.
6. Checklist de 8-10 simulaciones manuales concretas y su resultado esperado.

**DETENTE AL TERMINAR LAS CORRECCIONES. NO HAGAS GIT NI COMMITS.** El propietario confirmará los cambios; otro agente auditará y preparará la siguiente simulación.
