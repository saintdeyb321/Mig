# MigaPOS — PLAN 08: Integridad de estados, anulaciones, inventario e historial

**Fecha:** 2026-11-02  
**Rama:** `fix/migapos-production-readiness`  
**HEAD revisado:** `9d071167add18d4468d4a1beb0c7f7608d1a186f` — *Correccion plan 07*  
**Fuente:** simulaciones manuales comunicadas por el propietario y revisión estática del repositorio en GitHub.  
**Estado:** incidencias abiertas; no autorizado para venta pública. Este documento no acredita resultados de pruebas nuevas.

## 1. Objetivo y alcance

Corregir integralmente la coherencia de los **estados visibles** con la **autoridad financiera remota**. El POS debe comportarse de forma entendible ante cobros, interrupciones de Internet, anulaciones, restitución de stock, arqueo e historial, sin generar dobles escrituras ni inventar confirmaciones.

**Incluye:** recuperación de anulaciones, verificación de restitución, modal y estado del historial, proyección de stock durante el cobro, operaciones desconectadas, UX del historial, arqueo comercial simple y límites de lecturas Firebase Spark.

**Excluye:** ventas offline automáticas no verificadas, conciliación financiera certificada, comprobación de devolución física sin evidencia, ampliación a 15 líneas, rediseño general, nuevas dependencias e infraestructura. Mantener el máximo atómico de ocho líneas hasta rediseño y certificación separados.

## 2. Hechos, código y riesgos

| ID | Prioridad | Observado por el propietario | Evidencia de código / evaluación | Resultado exigido |
|---|---|---|---|---|
| P08-01 | P0 | La anulación muestra «pendiente de comprobar» y luego se refleja aplicada; el modal permanece abierto y obliga a otra acción | `posVoidRepository.void()` hace transacción y lectura adicional `verify()`; el fallo de la lectura secundaria se transforma en `void-unverified`. `SalesHistory.jsx` cierra modal solo si la acción retorna `true`; escucha histórico por separado | Un resultado definitivo server-confirmed cierra el modal una vez; el estado incierto presenta opción *solo verificar*, sin nuevo intento de compensación; no duplicaciones |
| P08-02 | P0 | Tras una anulación, el producto parece no recuperar stock | `posVoidRepository.void()` ejecuta `tx.update(products[index].ref, stock + qty, posStockVersion + 1)` dentro de la transacción; `projectQueuedStock()` superpone descuentos locales sobre el stock remoto. **No está demostrada la causa exacta del caso real** | Verificar si el documento remoto cambió; corregir la proyección o el flujo que sea responsable sin hacer sumas de stock desde UI |
| P08-03 | P0 | Durante venta que agota stock, aparece transitoriamente un error «sin stock» antes de confirmación | `CatalogProvider` proyecta `projectionState: pending`; `usePOS` coteja carrito con datos publicados y `cartCatalogChanges` marca stock insuficiente. Posible carrera de estados, no fallo remoto demostrado | Mientras procesa, mostrar «Procesando...» sin falso fallo; al recibir el recibo, aplicar la proyección una sola vez; en rechazo verdadero, conservar carrito y advertir |
| P08-04 | P0 | Venta iniciada sin Internet queda como «pendiente»; reconexión y «consultar» dicen «no existe confirmación remota» | `saleQueue.enqueue()` guarda el intento; `saleTransactions` asigna `origin: offline` cuando `navigator.onLine=false`; `sparkSalesRepository.submit()` rechaza `origin !== online`; `receiptRecovery` solo verifica recibos, no envía operaciones desconectadas nuevas. **No es un fallo de recuperación de un commit preexistente** | Distinguir *borrador sin cobrar*, *cobro online de resultado incierto*, *confirmado*, *rechazado*. No anunciar «sincronizando» si no existe vía de aceptación; confirmar tras recuperar conexión solo mediante acción explícita y nueva autoridad remota, si resulta viable y segura |
| P08-05 | P1 | Historial obliga a activar «Solo pendientes»; tarjetas locales poco útiles y mensajes técnicos repetidos | `salesHistoryPresentation(pending, remote, pendingOnly=false)` retorna solo `remote`; `SalesHistory.jsx` expone checkbox; `SaleHistoryCard.jsx` representa locales como tarjetas mínimas y errores en primer plano | Una sola lista cronológica con tarjetas consistentes de tickets y borradores/intentos, con etiqueta breve y acciones pertinentes; rechazados definitivos en sección discreta de revisión, nunca como ingresos |
| P08-06 | P1 | Cierre caja muestra jerga de «compensaciones», «estimación», «conciliación», aun con diferencia 0 | `CashRegisterModals.jsx` renderiza múltiples detalles técnicos; `cashTotals.js` separa compensaciones POS sin garantizar salida física | Presentar arqueo breve, claro y didáctico. Conservar desglose en vista opcional y en informes. Si hay devolución física no acreditada, no afirmar que el efectivo físico ya salió |

### 2.1 Respaldo de los casos observados

- Venta incierta durante corte de conexión, ID conocido: `801cfe74-6572-492c-b21a-1b6f659858ad` (sesión de simulaciones anterior).
- Intento completamente offline mencionado ahora: `44b71082-eec9-4826-af4d-32747d9354b9`.
- Anulación de venta de S/70, con modal congelado; monto y descripción observados, ID de anulación no proporcionado.
- Caja observada: fondo S/11, cobros en efectivo S/106.30, compensaciones S/−106.30, esperado S/11, contado S/11, diferencia cero. La aritmética reportada es consistente; **el texto y la evidencia de devolución física no lo son**.

**No crear ni repetir operaciones usando estos IDs**. Utilizarlos como referencia para inspección *solo lectura*, si el propietario proporciona la evidencia necesaria y autoriza.

## 3. Diseño de estados financieros

| Estado interno | Texto visible recomendado | Acción permitida | Efecto en libro/stock |
|---|---|---|---|
| `draft_offline` / intento nunca enviado | «Guardado en este dispositivo · sin cobrar» | Al reconectar: revisar precios/stock/caja, luego **Confirmar venta** de forma explícita y segura | Ninguno hasta commit remoto |
| `submitted_uncertain` | «Comprobando venta» / «No pudimos confirmar el resultado» | Verificar por ID original mediante servidor; sin segundo cobro automático | No modificar desde UI |
| `confirmed` | «Venta registrada» | Ver / imprimir comprobante real | Ya aplicado por transacción |
| `rejected` definitivo | «Venta no realizada» (en sección de revisión) | Ver motivo y conservar evidencia; nuevo cobro = operación nueva deliberada | Ninguno |
| `void_uncertain` | «Comprobando anulación» | Solo verificar el comprobante original, sin nueva compensación | No modificar desde UI |
| `void_confirmed` | «Venta anulada» | Ver comprobante de anulación | Stock compensado una vez en transacción |

**Regla:** Internet recuperado no equivale a commit confirmado. `navigator.onLine`, snapshots en caché y deducciones por stock no autorizan marcar una operación como confirmada. Para intentos completamente offline, si no es posible un envío seguro explícito, conservarlos como borradores no financieros sin prometer sincronización. Distinguir y preservar los registros heredados cifrados sin reescritura destructiva.

## 4. Criterios de aceptación por incidente

### P08-01 — Anulaciones y modal

1. Una anulación confirmada crea exactamente un documento `pos_voids/{saleId}` y grupos del protocolo, actualiza stock y versión, y queda visible en historial.
2. Se recibe el ack y el modal se cierra sin volver a pulsar; una lectura retardada no vuelve a abrirlo.
3. Si el commit fue aplicado pero se perdió su respuesta, una verificación server-only recupera el estado; nunca vuelve a escribir ni devuelve stock dos veces.
4. Si el servidor no confirma, mostrar aviso **breve** de estado incierto y permitir cerrar el modal de formulario o abrir una **vista de verificación** (no repetir el submit), preservando la evidencia local.
5. Reintento concurrente, otro actor, otra sede, ticket histórico o caja ajena mantienen las reglas previas y no escriben.

### P08-02 y 03 — Stock y carrito

1. Comprobar antes y después del mismo producto/branch en Firestore: `stock[branchId]`, `posStockVersion[branchId]`, `posLastVoidSaleId`; cotejar con `pos_voids.stockVersions` y `sales.items`.
2. Si `pos_voids` existe pero stock remoto no coincide, **bloqueo P0**, revisar causalidad y Rules; no «arreglar» sumando stock en el navegador.
3. Si stock remoto es correcto y UI incorrecta, corregir proyección (`projectQueuedStock`, `CatalogProvider`, `pendingSalesCache`) y la invalidación/retirada de proyecciones por ack de venta/anulación.
4. Mientras `processingRef` está activo, no mostrar advertencias transitorias por el propio commit. Tras confirmación, limpiar carrito una vez; si rechazo definitivo real, no ocultar el error.
5. No aplicar descuento local sobre snapshot que ya contiene el descuento confirmado; una anulación acreditada debe observarse sin F5.

### P08-04 y 05 — Offline e historial

1. Historial principal integra tickets confirmados y registros locales *visualmente diferenciados*, con fecha, importe, productos y método de pago cuando existan datos válidos. No contar borradores/intentos como ventas ni ingresos.
2. Eliminar checkbox «Solo pendientes» y evitar consultas duplicadas producidas por ese filtro; relegar intentos fallidos a sección discreta **Revisión local** accesible sin saturar el historial principal.
3. No presentar «Sincronización pendiente» para un intento nunca enviado al servidor. Usar «Guardado en este dispositivo · sin cobrar» hasta que exista un envío autorizado; para una respuesta perdida usar «Comprobando confirmación».
4. Un ticket realmente confirmado que perdió el ack se convierte en la tarjeta normal de venta mediante `getDocFromServer` y el ID original.
5. Si procede confirmación **explícita** de borrador tras reconexión, validar otra vez perfil, sede, caja abierta propia, horario, productos, precios, existencias y montos; exigir consentimiento comercial y no usar payload obsoleto como nuevo cobro sin revisión.
6. Cambio de cuenta, sede o cierre de turno no procesa borradores ajenos. Mantener cifrado y compatibilidad de Dexie/recibos históricos. No convertir el historial en lector masivo de Firestore.

### P08-06 — Arqueo comprensible

**Vista principal sugerida** (no es un nuevo protocolo contable):

- **Dinero con que abriste:** S/ X.
- **Ventas en efectivo registradas:** S/ Y.
- **Tickets anulados registrados:** N, S/ Z (ver detalle).
- **Dinero que contaste:** S/ W.
- **Comparación de caja:** «Coincide», «Faltan S/ n», «Sobran S/ n» **solo cuando los movimientos físicos estén respaldados**.
- Si hay anulaciones sin evidencia de devolución: «Hay N anulaciones. Confirma con el dueño si se devolvió dinero antes de cerrar; el resultado de caja es provisional.»
- Ayuda contextual: «Si devolviste dinero de una venta de otro turno, indícalo en las observaciones del cierre. No registres otro ticket para compensar.»

La información técnica (métodos, asiento contable, origen, incertidumbre y exportación) se conserva en **«Ver detalle»** e informes. Nunca esconder alertas reales ni fabricar como «cuadrado» un cierre con devoluciones no verificadas. No añadir consultas por cada elemento visual.

## 5. Implementación acotada y orden de trabajo de Codex

1. **P0 anulaciones:** modelar estados de UI, comprobar el recibo remoto, evitar modal huérfano y preservar un solo write financiero.
2. **P0 inventario:** contrastar servidor versus proyección, corregir carrera de catálogo y restitución visible; no inventar stock.
3. **P0 offline:** distinguir borrador nunca enviado y recibo incierto; diseñar recuperación segura y explícita; garantizar que no se habilita venta offline automática sin autorización.
4. **P1 historial:** integrar tarjetas, eliminar checkbox y jerga; mantener sección discreta de revisión y evitar lecturas repetidas.
5. **P1 cierre caja:** simplificar mensajes, mantener registros exactos y advertir devoluciones no acreditadas.
6. Verificar cada caso con test focalizado y un test Chromium donde haya carrera de React / modal; no repetir suites masivas.

## 6. Reglas y presupuestos que no se deben romper

- Spark sin Blaze, Cloud Functions desplegadas ni infraestructura nueva.
- Máximo ocho líneas, S/50 000 por ticket/recibido/vuelto, 1 000 unidades por producto, precisión estricta de dos decimales.
- Venta y anulación atómicas e idempotentes, stock no negativo, autoría por UID/rol/sede/caja/turno, sin acceso cross-tenant.
- Registros inmutables, `saleId` original, cifrado Dexie, históricos, fotografías y pendientes conservados.
- Rules de Firestore respetadas, sin debilitar autorizaciones ni crear índices sin consulta demostrada.
- No tomar una lectura de caché como confirmación, no forzar segundas escrituras inciertas, no inventar conciliación ni devolución física.
- No reintroducir avisos por lecturas transitorias; limitar `onSnapshot`, reusar suscripciones y medir potencial sobrecoste de Spark.
- Bloqueo CI por `minimatch` conocido: no mezclar corrección de dependencias en este plan; registrarlo como pendiente de release comercial.

## 7. Simulaciones manuales mínimas tras la corrección

| ID | Simulación | Esperado |
|---|---|---|
| QA08-01 | Venta con stock 1 y cobro online | Sin advertencia falsa durante el cobro; un ticket y stock final 0 |
| QA08-02 | Anular ese ticket | Modal termina correctamente; exactamente una compensación; stock vuelve a 1 en Firestore y pantalla |
| QA08-03 | Anular de nuevo, incluso con recarga/F5 | Sin doble compensación ni doble restitución |
| QA08-04 | Anulación confirmada y acuse perdido | Verificación por servidor; modal no queda bloqueado; no nueva escritura |
| QA08-05 | Corte antes de enviar venta | Borrador sin confirmar, sin cobro ni descuento financiero remoto; reconexión ofrece flujo explícito seguro |
| QA08-06 | Corte después del commit | Mismo `saleId` y tarjeta normal tras verificar; no otro ticket |
| QA08-07 | Historial mixto: confirmado + pendiente + rechazado | Tarjetas comerciales coherentes, sin checkbox, sin contabilizar pendientes |
| QA08-08 | Fondo 10, anulación de ticket anterior de 4, dinero físico devuelto 4 | Aviso claro de devolución por verificar y observación; no certificar saldo físico sin evidencia |
| QA08-09 | Caja fondo 11 + cobros 106.30 + compensaciones −106.30 + contado 11 | Vista simple, sin jerga técnica; sin atribuir falsamente un faltante/sobrante físico |
| QA08-10 | Dos usuarios, cambio sede, F5 y desconexión | Ninguna vista financiera de otra identidad, ninguna escritura duplicada |

**Detener la prueba financiera afectada** si ocurre stock remoto inconsistente, ticket duplicado, compensación repetida o autorización indebida. No borrar documentos de prueba antes de auditar la evidencia.

## 8. Revisión y cierre

**Método de trabajo:** Codex modifica **solo código y tests**; el propietario hace el commit; ChatGPT compara el diff/HEAD y audita; luego se despliega únicamente Hosting si no hubo cambios en Rules/índices, o se revisa primero cualquier publicación necesaria. No hacer commits, ramas, stash, worktrees, deploy o instalaciones automáticas desde Codex.

**Salida exigida:** causa por incidencia, archivos modificados, resultados de pruebas, riesgos no resueltos, cambios de Rules/índices (si los hay) y checklist QA08. No declarar MVP vendible hasta reproducir manualmente los flujos P0 y documentar la política de devoluciones físicas.
