# MigaPOS — P18 · Imágenes multidispositivo y continuidad offline segura

**Fecha de auditoría:** 12/11/2026 · **Proyecto:** `saintdeyb321/Mig` · **Rama auditada:** `fix/migapos-production-readiness` · **SHA remoto auditado:** `9d9a638ac910688d1912f4c1589c144e49e148f6`.

> **Límite de evidencia:** auditoría estática de los archivos publicados en GitHub; no es una prueba contra Firebase real. El propietario corrigió localmente `syncPickup` después de este SHA. Codex debe inspeccionar el árbol **local actual** y conservar esa corrección. Ningún cambio descrito aquí ha sido implementado ni publicado por esta auditoría.

## 1. Decisión resumida

**Riesgo confirmado 1 (alto):** las imágenes nuevas de contratos solo viven en IndexedDB del **dispositivo/cuenta** que las capturó. Firestore guarda `local-image:<businessId>:<contractId>:<uuid>` y **no el contenido**. Cambiar de PC, borrar datos del sitio, usar otra cuenta o fallar el almacenamiento local puede hacer que las fotos no estén disponibles. No afirmes que un backup del negocio recupera esas fotos.

**Riesgo confirmado 2 (alto para expectativas comerciales):** las ventas POS sin conexión **no se cobran ni sincronizan automáticamente**. Se guarda un borrador cifrado y durable en Dexie; al volver la conexión hay verificación automática, **solo lectura**, de recibos de operaciones que ya fueron intentadas. La confirmación de borradores exige intervención del cajero. Cambiar esta política sin un protocolo de autoridad de servidor puede generar stock equivocado, cobros duplicados o ventas asignadas a una caja vencida.

**Mejora preventiva 3:** fotos de productos y QR de Yape/Plin **ya son Base64 en Firestore**; comprimirlos otra vez sin límites ni ensayos podría empeorar la legibilidad del QR. Validar tamaños, MIME y seguridad, evitar imágenes gigantes y no introducir lecturas redundantes.

**Compatibilidad de plataforma:** se mantiene **Firebase Spark**. Cloud Storage for Firebase requiere Blaze; no instalar SDK, Cloud Functions ni habilitar facturación como supuesto oculto.

### Decisión de arquitectura cerrada (V2) — no dejar alternativas abiertas a Codex

**ELEGIDA: Firestore `Bytes` nativo, UNA foto comprimida por documento de medios privado y lectura bajo demanda. NO Base64 para fotos nuevas de contratos.** El binario comprimido se convierte a `Uint8Array` y se escribe mediante `Bytes.fromUint8Array(...)` del SDK de Firestore. En lectura se recupera con `toUint8Array()`, se construye un `Blob` con MIME comprobado y un `URL.createObjectURL()` temporal que debe revocarse al desmontar/cambiar de cuenta. Esta es **una conversión de formato para almacenamiento**, no un sistema adicional de pago ni Firebase Storage.

**Razón:** el método Base64 de Productos/QR es válido para imágenes pequeñas, pero añade aproximadamente 33 % de tamaño respecto al binario comprimido. Firestore soporta `bytes` como tipo nativo; ambos formatos tienen límite de **1 MiB por documento**. Usar `Bytes` en documentos independientes ahorra almacenamiento/transferencia y evita que la agenda descargue todas las fotografías al consultar contratos. No introduzcas campos `imagesBase64` ni campos `photoBytes` en `contracts/{id}`.

**Forma objetivo:** `contracts/{contractId}` conserva SOLO la lista breve de referencias/versiones de medios y los datos actuales; cada foto reside en `contracts/{contractId}/media/{mediaId}` con `data: Bytes`, `contentType`, `byteLength`, dimensiones, identificadores verificables (`businessId`, `originBranchId`), integridad (`sha256`) y versión. La ruta exacta debe ser compatible con las reglas de lectura, el contrato padre, las exportaciones y los límites actuales; no renombres colecciones financieras ni mezclas de sedes.

**Compresión definida:** WebP con pérdida a resolución máxima 960 px (sin agrandar originales), calidad inicial ~0,78; fallback JPEG ~0,80 cuando WebP no sea compatible. Objetivo ≤100 KiB binarios por imagen; **techo duro 160 KiB** por foto, después de codificar, sujeto a prueba visual de letras, adornos y detalles reales de una torta. Si una imagen legible no cabe en el presupuesto, ofrecer recorte/reintento y NO guardarla borrosa ni aceptar una imagen demasiado grande. No convertir un QR a formato con pérdida como parte de esta tarea. Mantener el máximo de imágenes existente en el código (20; los casos de 1 y 4 son pruebas representativas), sin reducirlo silenciosamente.

**Operación segura:** persistir primero el contrato por el flujo idempotente actual y después las fotos, de forma que las Rules puedan comprobar existencia, negocio y sede de origen del contrato padre. Las escrituras de medios tendrán IDs estables por foto, reintentos sin duplicados y estados visibles: «Pedido guardado; X/Y fotos pendientes» cuando corresponda; **jamás repetir el anticipo** por un fallo de imagen. Asociar al manifiesto SOLO fotos confirmadas mediante lectura de servidor y validación de hash/tamaño; si falla la actualización del manifiesto, preservar la foto/referencia pendiente y permitir reanudar, con limpieza posterior y auditada de huérfanos (nunca borrado masivo o automático no certificado).

**Carga y coste:** cero lecturas de `media` al listar contratos; recuperar por IDs concretos al abrir detalle/edición/impresión, con concurrencia acotada (por ejemplo, 2–3 solicitudes a la vez), cancelación de tareas obsoletas y caché opcional aislada por negocio/usuario/contrato/revisión. Una foto consultada suele significar un documento leído; hasta 20 fotos siguen teniendo coste, por lo que NO activar `onSnapshot` sobre la subcolección de imágenes. Añadir exención de índice de campo grande `data` para la collection group `media`, si el inventario de índices lo permite, comprobado en emulador y en configuración revisada. Firestore Spark tiene 1 GiB de almacenamiento gratuito: medir crecimiento, no afirmar que el diseño es ilimitado.

**Seguridad:** `data is bytes`, `data.size()` y demás sintaxis de validación solo tras comprobar Rules en emulador. Exigir propietario autorizado o cajero de sede de origen, contrato del mismo negocio y campos inmutables, denegar lectura a sede solo de recogida, otras sedes y otros negocios, sin confiar en rutas conocidas. Medir reglas `get/exists` que generan lecturas facturables y evitar bucles que superen límites por operación. Eliminar/esconder medios solo con autorización comprobada; un URL `blob:` temporal no es un permiso de servidor.

**Compatibilidad:** Productos (`imageUrl`) y QR (`yapeQrUrl`) se dejan por ahora como JPEG Base64 en sus documentos porque son pequeños y ya funcionan en varias cuentas; se añaden validaciones de longitud/errores y se prueba QR realmente escaneable. No migrar estos campos a `Bytes` en P18. Imágenes históricas `local-image:` permanecen disponibles solo en navegador original hasta una migración explícita, verificada, sin pérdida ni borrado prematuro de IndexedDB.


## 2. Inventario comprobado de imágenes

| Recurso | Código | Dónde está | Fallo/riesgo |
| --- | --- | --- | --- |
| Foto de producto | `frontend/src/modules/ProductCatalog.jsx` + `features/catalog/hooks/useProducts.js` | Canvas 200×200, JPEG calidad 0,7; string `imageUrl` en `products/{id}` de Firestore | Multidispositivo **sí**. Cada snapshot de catálogo lleva Base64; validar tamaño y costo, no copiarla a tickets |
| QR por sede | `features/branches/hooks/useBranches.js` + `modules/QRPaymentCard.jsx` | Canvas hasta 600×600, JPEG 0,7; `yapeQrUrl` en `branches/{id}` | Multidispositivo **sí**. JPEG puede suavizar módulos QR: evaluar PNG/lossless y prueba real de escaneo |
| Foto nueva de contrato | `features/contracts/infrastructure/contractImages.js` | JPG principal (hasta 960 px/256 KiB) + miniatura (240 px/64 KiB) como `Blob` en Dexie `settings`; `referenceImages` solo referencias `local-image:...` en `contracts/{id}` | No accesible desde otras cuentas/equipos; potencial pérdida de evidencia. Límite de código: hasta 20; probar 1 y 4 sin restringir el actual |
| Foto histórica de contrato | `contractImages.js` | Ruta antigua o referencia que se conserva en lectura | No migrar automáticamente ni borrar si falta el binario original. Mostrar disponibilidad real |
| Fotos en impresión | `withResolvedContractImages` | Se resuelven desde IndexedDB local | Desde otro equipo pueden imprimirse sin foto; informar, no afirmar documento completo |

**Protección actual:** `frontend/src/core/firebase/client.js` activa la caché persistente multi-pestaña de Firestore. Esa caché **no es una copia de seguridad ni equivale a replicar blobs de Dexie**.

## 3. Reglas de diseño para imágenes: NO meter todas en el documento del contrato

Firestore Standard tiene **límite de 1 MiB por documento**. Base64 incrementa aproximadamente un 33 % el volumen binario; además, leer `contracts/{id}` no debería descargar cuatro fotos grandes para mostrar una fila de la agenda. Evitar un campo `imagesBase64[]` indiscriminado dentro del contrato principal.

**Arquitectura P18 decidida, sujeta a validación de Rules, integridad y rendimiento (no una comparación abierta de Base64 vs Bytes):**

1. Mantener datos comerciales y financieros en `contracts/{id}`, con manifiesto pequeño de referencias de medios y el máximo actual de 20. No alterar `contractNumber`, `paidTotal`, saldos, fechas, operaciones, `branchId` ni Ledger.
2. Almacenar las fotos nuevas comprimidas en **documentos independientes**, `contracts/{contractId}/media/{mediaId}`, cada uno con `businessId`, `originBranchId`, `contentType`, `data` de tipo **Firestore `Bytes`** (NO Base64), tamaño, versión, SHA-256 y metadatos mínimos inmutables. **Una foto = un documento; jamás todas las fotos en el contrato**. Codex no debe elegir otra arquitectura sin evidenciar una incompatibilidad bloqueante con Rules.
3. Aplicar el contrato de compresión ya decidido: WebP 960 px máximo, calidad inicial 0,78 (fallback JPEG ~0,80), objetivo ≤100 KiB, techo absoluto 160 KiB **binarios** por foto. Preservar nitidez de textos/ornamentos y proporción; no reducir indefinidamente la calidad para forzar el límite. Validar tamaños antes de la escritura y `Bytes` contra el tamaño real del documento.
4. Crear el contrato primero con idempotencia existente, sin fotos remotas declaradas hasta confirmarlas; luego guardar cada foto por ID estable, verificarla y anexar al manifiesto de forma reanudable. Manejar 0–20 fotos, corte tras 1/4, fallos de permisos, reintento y pérdida de conexión; mostrar éxito parcial sin repetir contrato ni cobro inicial. Cualquier alternativa atómica debe demostrar compatibilidad con límites de Rules y no se adoptará por defecto.
5. **Lectura bajo demanda:** nunca descargar `Bytes` del listado ni por `onSnapshot` de los 100 contratos activos. Descargar únicamente al abrir detalle, editar o imprimir; caché de miniaturas/archivos indexada por usuario, negocio, contrato y revisión; invalidación por cambios de sesión. Contar lecturas por primera apertura y reingreso.
6. **Seguridad multitenant y por sede desde Rules:** dueño autorizado y personal de **sede de origen** pueden leer las fotos del contrato que les corresponde. La sede de recojo B solo recibe la ficha logística mínima P17; no conceder fotos, teléfono ni importes por tener una recogida en B. Prohibir escrituras arbitrarias, cambios de origen e imágenes cross-tenant. Validar MIME, `data is bytes`, `byteLength`, tamaño real, número de imágenes, referencia padre e identidad; no permitir URL remota arbitraria ni `data:` no validado. Configurar exención de índice para el campo binario `data` de `media`, sin tocar índices financieros.
7. **Migración compatible:** los `local-image:` existentes siguen funcionando en el navegador de origen. Migrar **solo bajo acción explícita y autorizada** desde el mismo dispositivo/cuenta que aún conserva el Blob, con confirmación remota antes de cambiar referencia. Nunca borrar IndexedDB antes de comprobar la nueva imagen en servidor. Si ya no existe la foto, indicar «Foto histórica no disponible; volver a adjuntar».
8. Exportación/backup: comprobar si los nuevos medios necesitan exportación privada bajo demanda y sus límites. No declarar backup completo cuando las imágenes antiguas todavía sean locales. Deshabilitar su exposición desde informes de gerencia o desde la ficha logística de otra sede.
9. **Productos y QR:** mantener su formato actual si pasa las pruebas de tamaño, lectura y calidad. Fijar longitud máxima y MIME; manejar errores FileReader/canvas y límites de dimensiones. Para QR probar conversión **sin pérdida (PNG)**, contraste, margen libre (quiet zone) y escaneo real desde pantalla móvil. No usar JPEG si deteriora la lectura. Si su Base64 supera umbral, comprimir/reducir resolución sin perder escaneabilidad. No crear copias redundantes en nuevos documentos si no hay beneficio medido.
10. **Costos:** mediciones reales/emuladas de bytes de catálogo, ramas y detalle; consultas y documentos por apertura/impresión, caché fría/caliente, 10/100/500 contratos, 4 fotos, múltiples cuentas. Hacer comparación antes/después y documentar límites diarios de Spark.

### Riesgos adicionales a revisar sin introducir cambios destructivos

- El cifrado local en `frontend/src/crypto.js` deriva la clave de un **UID**, que es un identificador y **no un secreto**; no lo considerar protección criptográfica fuerte frente a un atacante que accede al almacenamiento. Evaluar el modelo de amenazas y migración **versionada** sin invalidar ventas pendientes; no reemplazar a ciegas el algoritmo actual.
- El almacenamiento de fotos nuevas de contratos en Dexie es `Blob` local, no replicado. El browser puede perder esos datos por limpieza, perfil privado o fallos de cuota. Alertar antes de cerrar un proceso incompleto.
- Revisar reglas de longitud de `imageUrl` y `yapeQrUrl`: aunque Firestore rechace documentos sobredimensionados, esa validación tardía no es una buena experiencia de usuario.

## 4. Auditoría comprobada: ventas POS offline

Código: `frontend/src/offlineDB.js`, `features/sales/infrastructure/saleTransactions.js`, `application/saleQueue.js`, `application/draftCheckout.js`, `application/receiptRecovery.js`, `domain/queueState.js`, `infrastructure/saleQueueStore.js`, `infrastructure/sparkSalesRepository.js`, `hooks/usePOS.js`, `config/runtimeCapabilities.js`.

**Lo que ya funciona:**

- Dexie `migapos_offline_v2`, esquema v4, tabla `sales` con `localId`, negocio, sede, cuenta, estado, cifrado y reintentos. Una recarga F5 dentro del mismo perfil puede conservar el borrador; **no es solo RAM**.
- UUID/idempotencia y candado para dos pestañas (`navigator.locks` + lease en IndexedDB); reintentos no deben duplicar tickets.
- Una venta online incierta se revisa por recibo remoto con el **mismo ID**; no se crea otra venta para compensar la respuesta perdida.
- `startReceiptRecovery` ejecuta comprobaciones de **solo lectura** al montar y reconectar; no ejecuta `apply()` para borradores sin enviar.
- El POS ya informa literalmente «Sin conexión: puedes guardar un ticket sin cobrar. No se moverá inventario ni se enviará automáticamente al reconectar.»

**Lo que NO funciona como proponía la idea inicial:**

- `runtimeCapabilities.offlineSync: false` y `receiptOnlyRetries: true`.
- `sparkSalesRepository.submit` rechaza `origin !== 'online'` para nuevos movimientos.
- `draftCheckout.review/confirm` exige verificación actual del servidor y acción explícita del cajero; crea el movimiento financiero en una caja y contexto válidos **en ese momento**, no retroactivamente.

**Decisión de seguridad:** no activar auto-cobro/aumento de stock por reconexión sin demostrar un protocolo sólido de aceptación con autoridad de servidor. Una venta local no puede garantizar que la caja siga abierta, turno de 14 h vigente, precios idénticos, productos existentes y stock suficiente horas después. Si alguien entregó mercancía offline, hay un conflicto comercial que requiere conciliación; etiquetarlo como «confirmado» sería falso.

### Flujos objetivo permitidos para Spark

A. **Sin internet, venta aún NO confirmada:** «Ticket guardado en este dispositivo — pendiente de confirmar». Conservar carrito/borrador durable, UID, negocio, sede, precios originales, cantidades, fecha local informativa y `saleId`. No declarar cobro, reducir inventario global, emitir comprobante definitivo ni incluirlo como venta en dashboard/reportes. Mostrarlo en Historial → Pendientes locales, con estado y botón claro «Revisar y confirmar».

B. **Reconexión:** detectar conexión y sesión/sede estables; consultar de modo acotado si los IDs intentados ya existen en servidor, sin re-enviar cobranzas ni cambiar datos. Mostrar progreso sin crear tormentas de lecturas. Si era borrador nunca enviado, permitir acción explícita para revisar stock, precios, caja y pago nuevamente y confirmar.

C. **Venta enviada pero respuesta perdida:** consultar recibo remoto inmutable por ID. Si está confirmado, marcar `confirmed` y actualizar interfaz; si hay incertidumbre, conservar pendiente **sin intentar cobrar otra vez automáticamente**. Si está rechazado por política, explicar el motivo y conservar evidencia local para revisión.

D. **Caja vencida / cerrada / cambio de turno:** nunca imputar automáticamente la venta a una caja antigua o nueva ni darle hora financiera retroactiva. En revisión, requiere una caja vigente en la sede y cuenta autorizada; distinguir venta original offline de fecha de confirmación efectiva.

E. **Varios dispositivos y cuentas:** un borrador local no migra por sí mismo. No hacerlo visible en otra cuenta/sede desde cachés. Si se necesita circulación entre dispositivos, diseñar una transferencia autorizada separada, no una sincronización oculta de borradores incompletos.

F. **Fallo IndexedDB (QuotaExceededError, modo privado, limpieza, error de cifrado):** no mostrar «guardado» si la transacción local falló. Conservar el carrito en pantalla, explicar que no hay persistencia garantizada y ofrecer reintentar/guardar una exportación local cifrada si se puede; no afirmar recuperación garantizada tras desinstalar, borrar caché o cambiar de perfil.

G. **Avisos de interfaz:** diferenciar `borrador`, `envío incierto`, `confirmado por servidor` y `rechazado`. Nunca usar la misma etiqueta «Venta realizada» para estados no confirmados. Deshabilitar opciones de «cobrar otra vez» mientras se comprueba un ID.

### Qué NO hacer

- No cambiar `offlineSync` a `true` sin protocolo probado.
- No simular la hora de servidor con el reloj local.
- No hacer writes financieros de Firestore desde un service worker o cron no autorizado.
- No tratar un snapshot cacheado como confirmación de stock/pago.
- No quitar validación de caja/turno/licencia para aceptar ventas antiguas.
- No eliminar los registros locales antes de confirmar recibo y recuperación. No sobrescribir el `saleId` al reintentar.

## 5. Regresiones obligatorias

### Imágenes

1. Producto: crear, abrir sesión en segundo dispositivo/cuenta autorizada, consultar catálogo sin errores; tamaños acotados.
2. QR: guardar en A, visualizar en B con una cuenta autorizada del mismo negocio/sede; escanear un QR real; eliminar/reemplazar sin datos viejos y sin cache cruzada.
3. Contrato sin imágenes, con 1 y 4 fotos: fecha de entrega real (evita el bug previo `Timestamp.isEqual(undefined)`), origen A, recogida A o B, con y sin anticipo. Confirmar media y contrato con reintentos, sin pagos duplicados.
4. Dueño y cajero de sede A en dispositivos diferentes ven sus fotos autorizadas. Cajero de B **no** ve fotos ni datos personales del contrato A→B, pero ve ficha logística P17.
5. Cambio de cuenta/negocio, cancelación durante upload, fallo a mitad, doble click, F5, desconexión, QuotaExceededError y foto histórica ausente. No fugas ni medios huérfanos.
6. Reportes PDF/Excel, recibos y visualizador: no mostrar foto inaccesible como existente; no romper paginación ni exportación P17-RC.
7. Medir bytes y lecturas; cero descargas de media en el listado por defecto; pruebas de fotos con texto legible y QR escaneable.

### POS/ventas

8. Offline: guardar borrador durable, F5, volver a la misma cuenta/sede, reconectar; **cero escrituras financieras automáticas** de ese borrador.
9. Al reconectar: se verifican recibos previamente intentados; nunca se duplica `saleId`, pago, stock ni aviso.
10. Dos pestañas, dos dispositivos, red intermitente y respuesta perdida después del commit; bloqueo de reenvío incierto.
11. Precio/stock cambiados durante offline; sede inactiva; licencia suspendida; turno 14 h expirado; dueño/cajero fuera de horario; login con otro UID. Rechazos claros, sin confirmación indebida.
12. Permisos cross-tenant/cross-branch y acceso directo a `contracts/{id}/media/{mid}` usando **emulador Rules**.
13. Revisión explícita de borrador con caja válida: verificar importe y método, enviar una vez, recibir recibo confirmado, quitar la presentación provisional; reportes muestran únicamente ventas confirmadas.
14. Simular `QuotaExceededError`, corrupción local y borrado manual de IndexedDB: UI no promete datos recuperables si no están.
15. `npm run test:spark:rules`, Node de ventas y contratos, Chromium real (Windows y CI Ubuntu), lint, build/PWA, inventario de índices, análisis de costos.

## 6. Plan de implementación reducido y ordenado

**Fase 0 — Reproducir y medir.** Antes de modificar, pruebas con 2 cuentas/2 navegadores sobre `demo-migapos`: foto de contrato ausente en segundo equipo; QR/producto visibles; borrador offline perdura pero no sincroniza solo; recopilar conteos de bytes/lecturas. Conservar el hotfix local de `syncPickup` y revisar diferencias locales antes de tocar el archivo.

**Fase 1 — Medios.** Implementar **la arquitectura Bytes por documento** definida al inicio; Rules restrictivas, lectura bajo demanda, compresión de calidad acotada, escritura idempotente después de confirmar el contrato, manejo de fotos parcialmente pendientes y migración sin pérdida. Validar seguridad contra lectura directa y proyección de recojo.

**Fase 2 — POS offline.** Auditar ciclo de vida con casos críticos. Mejorar UX/errores, reconexión de lectura, persistencia local y revisión manual. No prometer venta confirmada ni habilitar auto-aceptación insegura. Si no existen regresiones reales de esa política, limitar cambios a UX y pruebas.

**Fase 3 — Cierre.** Tests, CI, plan de datos antiguos, budgets y pruebas visuales; documentar campos/Rules/índices necesarios para publicar. No ejecutar cambios reales sin autorización del propietario.

## 7. Aceptación para producción

- Fotos nuevas de contratos disponibles entre cuentas autorizadas y dispositivos, en límite de tamaño y costo, **sin abrir acceso de la sede de recogida a información privada**.
- Fotos antiguas sin blob se etiquetan como no disponibles y siguen legibles los contratos.
- Productos y QR no se degradan; QR escaneables; Firestore no almacena imágenes binarias excesivas ni Base64 nuevos en contratos.
- Ninguna foto/media se descarga al listar 100 contratos; solo al abrir uno, editar o imprimir.
- Todo borrador offline está **persistido o claramente marcado como no guardado**; no se factura ni descuenta inventario antes de confirmación de servidor.
- Reconexión recupera confirmaciones remotas sin duplicar cobros; venta offline pendiente exige revisión cuando no hubo intento previo.
- Rules de media y caja/contratos mantienen la seguridad P17-RC; pruebas negativas pasan.
- Se preservan P17-RC, fallos históricos documentados, notificaciones, caja 14h, sedes y reportes.
- **CI Ubuntu verde para SHA exacto**, Rules e índices publicados manualmente y aceptados en un negocio de ensayo antes de nuevos clientes reales.

## 8. Restricciones y entrega de Codex

- Solo `C:\Proyectos\MigaPOS`, árbol local de `fix/migapos-production-readiness` previamente seleccionado por el propietario; NO usar Git/GitHub (ni `git status`), commits, cambios de rama ni push.
- No tocar archivos de marketing, videos, contenido audiovisual o la rama promocional.
- No acceder a Firebase `migapos` real, no borrar colecciones, no ejecutar deploy, no instalar Java/dependencias ni cambiar plan Spark.
- No debilitar Rules, permisos, idempotencia, auditorías ni conciliación financiera. No habilitar Sync automático financiero mediante un booleano.
- Evitar cambios masivos: preferir dominio reutilizable, pruebas, consultas acotadas y observabilidad sin datos sensibles.
- Entregar `docs/RESULTADOS-P18-IMAGENES-OFFLINE.md`: causas, diseño aplicado, pruebas PASS/FAIL/BLOCKED, métricas SDK, tamaño medio/peor de imágenes, comportamiento entre equipos, seguridad Rules, lista de archivos y pasos manuales de publicación. Señalar cualquier limitación que impida lanzar MigaPOS.

## 9. Fuentes y rutas auditadas

- Repositorio: https://github.com/saintdeyb321/Mig/tree/fix/migapos-production-readiness
- Firestore, cuotas y documento 1 MiB: https://firebase.google.com/docs/firestore/quotas
- Firestore, caché web: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firebase Storage y Blaze: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Prácticas de índices y campos grandes: https://firebase.google.com/docs/firestore/best-practices

- API `Bytes.fromUint8Array` / `toUint8Array`: https://firebase.google.com/docs/reference/js/firestore.bytes
- `bytes` en Firestore Rules: https://firebase.google.com/docs/firestore/security/rules-fields
- Recomendación de eximir campos grandes de índices: https://firebase.google.com/docs/firestore/best-practices
