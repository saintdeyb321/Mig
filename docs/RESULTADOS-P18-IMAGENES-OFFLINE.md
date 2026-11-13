# P18 · Imágenes multidispositivo y continuidad offline en Spark

## Cambios implementados

La prueba previa reprodujo la limitación de las fotos históricas. El contrato conservaba una referencia `local-image:` y Chromium solo podía resolverla en la cuenta con el Blob original en IndexedDB. Las pruebas previas también confirmaron que un borrador POS persiste localmente y que reconectar no lo convierte en un cobro.

- Las fotos nuevas se guardan en `contracts/{id}/media/{mediaId}`, un documento `Bytes` por foto. El contrato conserva `mediaIds`, `mediaRevision` y una reserva breve `pendingMedia` mientras se confirma una foto. `referenceImages` conserva las referencias históricas. El tope combinado es de 20 fotos por pedido.
- La compresión mantiene la proporción y admite un lado máximo de 960 px. WebP parte de calidad 0,78 y JPEG de 0,80 cuando WebP no está disponible. El objetivo es 100 KiB. Por encima de 160 KiB se pide recortar o seleccionar otra foto. El navegador valida firma de formato, tamaño y SHA-256 al leer la copia.
- El pedido y el anticipo se confirman antes de escribir fotos. La primera transacción de cada foto crea el documento y su reserva juntos. La segunda asocia la foto después de leer y verificar el binario desde el servidor. Cada operación usa el ID original. Si se corta la carga, se puede reanudar desde el detalle sin repetir el pedido ni su anticipo. Un archivo reservado sigue vinculado al pedido. Retirar una foto publicada requiere una acción explícita y una transacción que retira su referencia y su documento.
- La lista de pedidos solo lee los contratos. Detalle, edición e impresión solicitan fotos por ID con hasta tres lecturas concurrentes. Firestore Lite realiza las lecturas de bytes sin persistirlos en la caché de Firestore. Detalle y edición reutilizan los blobs verificados en memoria durante la vista. Al cerrar o cambiar el alcance se cancelan tareas obsoletas y se revocan sus URLs.
- Las Rules verifican el contrato padre, negocio, sede de origen, rol, licencia, tamaño real del binario, huella y cambios de manifiesto. El dueño y el cajero autorizado de origen pueden leer por ID. La sede de recojo conserva su ficha logística P17. Se rechazan listados de `media`, acceso directo ajeno y escrituras que dejen una foto sin reserva. Se excluye `media.data` de los índices de campo único.
- «Copiar fotos de este dispositivo» migra las referencias históricas cuyo Blob todavía existe en la cuenta y el navegador. La referencia local se reemplaza después de confirmar la copia remota. Se conserva el Blob histórico. Si falta, el pedido sigue siendo legible y se indica que la foto requiere el archivo original.
- Productos mantienen JPEG Base64 a 200 px, con un máximo de 128 Ki caracteres. QR mantiene el mismo campo Base64. Las cargas nuevas usan PNG a 600 px con un máximo de 384 Ki caracteres. Los QR JPEG anteriores siguen legibles. Se validan MIME, longitud y fallos de decodificación. La prueba verificó un QR a tamaño completo y en vista móvil.
- La recuperación POS busca por cuenta, negocio y sede con el índice compuesto local de Dexie. Al reconectar consulta únicamente recibos de intentos previos, en lotes de hasta diez. Si se interrumpe una lectura y regresa la conexión, se agrupa un nuevo ciclo. El cajero debe revisar y confirmar un borrador sin intento previo. Si IndexedDB falla antes del envío, el carrito permanece abierto. Los registros locales ilegibles o eliminados se identifican sin declarar un cobro ni cambiar IDs.

Se conservan el hotfix de `syncPickup` para fechas ausentes, la caja de 14 horas, las reglas P17 y el cifrado compatible de pendientes. La clave local derivada del UID protege la separación en la aplicación. Un UID no es un secreto frente a alguien con acceso al perfil o almacenamiento del dispositivo.

## Corrección posterior a la auditoría

El fallo de P08 se reprodujo en Windows. La espera exacta era la que debía mostrar «Copia local no disponible» después de borrar el borrador de la fixture. El estado seguía en `draft_offline`, con el último registro aún marcado como disponible. Se separó la lectura observable por clave primaria de Dexie del descifrado asíncrono. La aplicación invalida también respuestas antiguas del descifrado. La fixture espera que el observador vea el borrador antes de simular su eliminación, comprueba la eliminación y conserva la aserción que bloquea su confirmación. El tiempo de espera sigue igual.

Se corrigió el manejo de excepciones después de confirmar el pedido. Una subida interrumpida o un fallo posterior de IndexedDB dejan el pedido confirmado y ofrecen reanudar las fotos en el detalle. Los identificadores de creación se conservan en IndexedDB mientras el pedido o sus fotos estén pendientes. Un reenvío de los mismos datos tras recargar conserva esos IDs, incluso si el usuario vuelve a seleccionar las fotos. Si Firestore aplicó el comando y se pierde la respuesta, se comprueba su huella, creador e ID de operación en el servidor. El reproceso conserva los IDs de las fotos y omite las ya asociadas. Un cambio de cuenta cancela la vista anterior. Las tareas que ya se confirmaron en servidor siguen recuperables.

## Métricas y límites

En Chromium, cuatro imágenes sintéticas de 1200×800 con letras y ornamentos produjeron 32 910, 42 636, 46 712 y 50 310 bytes WebP. La media fue de **42,1 KiB** y el mayor archivo fue de **49,1 KiB**. El JPEG de producto midió **6 195 caracteres Base64** y el PNG de QR **13 954**. Las fotos y QR de ensayo quedan en `.release/qa-p18/`.

| Pedidos, cuatro fotos por pedido | Lecturas de fotos al listar | Lecturas directas al abrir cada pedido una vez | Almacenamiento binario de la muestra | Techo binario |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 0 | 40 | 1,65 MiB | 6,25 MiB |
| 100 | 0 | 400 | 16,46 MiB | 62,50 MiB |
| 500 | 0 | 2 000 | 82,29 MiB | 312,50 MiB |

La tabla extrapola las cuatro fotos medidas. Antes de P18 había cero lecturas remotas de fotos y no había copias remotas. Ahora, un detalle frío de cuatro fotos requiere cuatro lecturas directas. La vista caliente reutiliza los mismos blobs con cero lecturas adicionales durante la ventana de caché. Otra cuenta autorizada, una nueva apertura o una impresión fría requieren sus propias lecturas.

En el emulador, por foto publicada se contaron **2 lecturas transaccionales del padre, 2 lecturas de verificación y 3 escrituras**, antes de reintentos. Una carga de cuatro fotos usa 16 lecturas directas y 12 escrituras adicionales. Las Rules consultan también documentos dependientes. En una lectura de foto intervienen el contrato, perfil, licencia y negocio y, para un cajero, la sede. Esas lecturas pueden contar para el consumo real. La cuota gratuita de Firestore es de 1 GiB almacenado, 50 000 lecturas y 20 000 escrituras diarias y 10 GiB mensuales de transferencia saliente. [Cuotas de Firestore](https://firebase.google.com/docs/firestore/quotas) · [Lecturas de Rules y facturación](https://firebase.google.com/docs/firestore/pricing)

## Verificación y límites de aceptación

| Requisito | Estado local | Evidencia |
| --- | --- | --- |
| 0, 1 y 4 fotos, recogida en otra sede y anticipo único | PASS | Transacciones reales en `demo-migapos`, con fecha de entrega, confirmación perdida y un solo recibo de anticipo. |
| Reanudación y cambios de fotos | PASS | Reserva interrumpida, mismo ID tras reabrir Dexie, migración con Blob disponible, límite de 20 y retiro de referencia y binario en la misma transacción. |
| Privacidad e integridad | PASS | Dueño y cajero de origen permitidos. Sede de recojo y otro negocio rechazados. Listados, binarios excesivos, modificaciones directas y SHA-256 falso rechazados. |
| Carga bajo demanda y límites de imágenes | PASS | Cero lecturas de fotos en listado, cuatro en detalle frío, cero en reutilización dentro de la vista, tres solicitudes concurrentes como máximo y URLs revocadas. Tope binario probado en el emulador. |
| Continuidad offline | PASS | Borradores durables, revisión manual con precios actualizados, recibos consultados por ID original, reconexión intermitente, lease de pestañas, cambio de sede, pérdida de respuesta, cuota local, borrado simulado y caja vencida. |
| Reportes y respaldo | PASS | Descargas y reimportación PDF/Excel de P17-RC y backup cifrado. Los medios privados figuran como excluidos. |
| Aceptación física | BLOCKED | Falta probar un QR auténtico de Yape/Plin, fotos de tortas y el uso en dos dispositivos físicos. |
| Chromium Ubuntu y CI del próximo SHA | BLOCKED | Ubuntu local carece de Chromium, navegador Playwright y Node disponibles. La CI remota queda pendiente. |

Comprobaciones ejecutadas en el árbol local:

- Node: **203 aprobadas**. Incluye recuperación con reconexión intermitente, rechazo de borradores nunca enviados en la verificación de recibos, cuota, cifrado corrupto, idempotencia y exportaciones.
- Firestore Rules y transacciones en `demo-migapos`: **82 aprobadas**. Reejecución P18 de **3 aprobadas**, con rechazos explícitos a un usuario anónimo y a un cajero suspendido.
- Chromium Windows: **12 aprobadas** en las dos pasadas finales. Incluye IndexedDB real, ambas regresiones P08, imágenes P18, caja P17, POS 320×640 y 1280×560, backup cifrado y PDF/Excel. La primera ejecución extensa tuvo un fallo P08. Las pasadas focalizada y final pasaron con la corrección.
- Lint, build/PWA e inventario de índices: **PASS**. Inventario local con 53 índices compuestos, 33 requeridos y una exención de campo. La compilación conserva el aviso de tamaño de algunos chunks. El inventario desplegado queda pendiente de revisión.

La evidencia de acceso entre cuentas usa sesiones autenticadas separadas en el emulador. La evidencia de carga parcial, caché y compresión usa Chromium aislado con fallos controlados. Se requiere aceptación con dos dispositivos físicos, fotos reales de tortas y la aplicación lectora del QR de Yape/Plin. El QR sintético se decodificó en OpenCV a 600 y 200 px.

El respaldo general exporta las referencias y advierte que el contenido privado de `media` y las fotos históricas del navegador quedan fuera. PDF y Excel gerenciales no exponen fotos. Los borradores POS y fotos aún pendientes de subir dependen del dispositivo. Si se borra IndexedDB antes de confirmar la escritura, se puede perder la copia local.

Una futura exportación binaria requeriría autorización operativa del dueño, enumeración desde los manifiestos verificados, lectura paginada por IDs con límites de bytes y documentos, comprobación de hashes y archivo cifrado. El manifiesto tendría que declarar separadamente fotos confirmadas, reservas, referencias históricas y contenido no disponible. La autorización temporal de SuperAdmin no concede acceso a los binarios.

## Archivos

- Rules e índices en `firestore.rules`, `firestore.indexes.json`, `scripts/firestore-index-inventory.mjs` y `docs/INDICES-FIRESTORE-MIGAPOS.md`.
- Contratos en `contractImagePolicy.js`, `contractPhotoCompletion.js`, `contractImages.js`, `contractMediaRepository.js`, `sparkContractsRepository.js`, `useContractImageUrls.js`, `useContracts.js`, `ContractManager.jsx`, `ContractFormModal.jsx`, `ContractDetailsModal.jsx`, `ContractMediaActions.jsx` y `printDocument.js`.
- Productos, QR y respaldo en `shared/images/raster.js`, `ProductCatalog.jsx`, `useBranches.js`, `QRPaymentCard.jsx`, `backupRepository.js`, `remoteBackup.js` y `serverReadDatabase.js`.
- POS en `receiptRecovery.js`, `saleQueue.js`, `saleQueueStore.js`, `saleTransactions.js`, `pendingSalesCache.js`, `useRecentSales.js`, `usePOS.js`, `TicketParts.jsx` y `SalesHistory.jsx`.
- Regresiones en `spark-financial.rules.test.mjs`, `spark-local.browser.{html,test.mjs}`, `plan07.test.mjs`, `plan08.test.mjs`, `plan08-pos.browser.html`, `plan08.browser.test.mjs`, `plan13.test.mjs` y `ui-security.test.mjs`. `verify.yml` ejecuta también las regresiones P07/P08.

## Publicación manual

1. Verificar CI Ubuntu del SHA exacto y conservar una copia de las Rules publicadas y del inventario activo de índices de la base `(default)` de `migapos`.
2. Publicar la exención `media.data` y las Rules revisadas. Conservar los índices de caja y contratos de P17. Coordinar el cambio con Hosting `migapos-peru` y la actualización de la PWA. La interfaz anterior queda limitada a crear pedidos sin fotos nuevas tras aplicar las Rules P18.
3. Validar el piloto autorizado con dos dispositivos, dueño y cajeros de origen/recojo, un QR real, reconexión, caída a mitad de carga y borradores pendientes. Medir el uso de Firestore antes de ampliar el piloto.

La publicación queda pendiente de CI Ubuntu y de aceptación en dispositivos reales.

## Cierre local del SHA auditado `53db60c2`

La ejecución 43322608346 informó 79 pruebas aprobadas y dos errores de infraestructura Chromium, en el respaldo y la recuperación de sesión P15. El harness esperaba `DevToolsActivePort` y abría conexiones WebSocket separadas al navegador y a la página. Ahora abre Chromium con CDP por pipes, espera la respuesta a `Browser.getVersion` y adjunta una página propia en el mismo canal. Se conserva el presupuesto de arranque de 20 segundos. Se limita el uso de memoria compartida, se desactivan extensiones del entorno y cada fixture Vite usa su propia caché dentro del perfil temporal. Se reprodujo un fallo por ejecución paralela con caché compartida y la repetición aislada aprobó ambas pruebas. La causa exacta del cierre de Chromium en el runner Ubuntu queda sin confirmar.

La revisión detectó que un cliente autorizado podía reservar una foto usando bytes ajenos a JPEG/WebP con un MIME declarado válido y un SHA-256 correcto. `firestore.rules` ahora verifica la firma raster, además del tipo `Bytes`, los 160 KiB, el tamaño declarado y el hash. Firestore Rules verifican la cabecera y el cliente valida y decodifica las fotos al prepararlas. La regresión también exige que escribir solo el binario o solo su reserva deje ambos documentos intactos. Se conservan los permisos P17-RC, el protocolo de manifiesto y el hotfix de `syncPickup`. Se corrigió el texto del formulario para diferenciar las fotos confirmadas de las pendientes en el dispositivo. El respaldo sigue marcado como parcial para los binarios excluidos.

Archivos del cierre: `tests/helpers/browserHarness.mjs`, `firestore.rules`, `tests/spark-financial.rules.test.mjs`, `frontend/src/modules/contracts/components/ContractFormModal.jsx` y este documento.

| Verificación de cierre | Resultado |
| --- | --- |
| `npm run test:spark` con Node 22 y Chromium Windows | PASS · 81/81 |
| Backup y P15 en paralelo con cachés aisladas | PASS · 2/2. El ensayo anterior con caché compartida falló en la fase de la fixture, después de conectar CDP. |
| `npm run test:spark:rules` en `demo-migapos` | PASS · 82/82, incluidos 3 casos P18 con rechazo de binarios o manifiestos inválidos. |
| Regresiones Node P07/P08/P13 | PASS · 53/53 |
| Chromium Windows adicional | PASS · 9/9, con IndexedDB real, P08, POS móvil, caja de 14 h y exportaciones PDF/Excel. |
| Lint, build/PWA e inventario local | PASS · 45 archivos precacheados, 2,94 MiB, 53 compuestos, 33 requeridos y una exención. |
| Chromium Ubuntu y CI del SHA final | BLOCKED · Ubuntu local carece de Chromium y Node. |
| QR auténtico y piloto con dispositivos físicos | BLOCKED · aceptación del propietario pendiente. |

**Rules locales READY. Índices locales READY. Código local READY para revisión. Publicación NOT READY** hasta confirmar CI del SHA final y la aceptación del propietario.

### Configuración que debe verificar el propietario

1. En Firebase Console, proyecto `migapos`, base Firestore `(default)`, conservar una copia de las Rules publicadas y contrastar el inventario activo con `firestore.indexes.json`. El cierre no requiere compuestos nuevos ni eliminar compuestos existentes.
2. Verificar la exención de campo único con ID de colección `media`, ruta de campo `data` y modos de indexación desactivados. Su definición exacta es `{"collectionGroup":"media","fieldPath":"data","indexes":[]}`. Conservar los índices I51, I52 e I53 del [inventario local](INDICES-FIRESTORE-MIGAPOS.md).
3. Tras comprobar la CI del SHA final y autorizar la publicación, publicar el contenido de `firestore.rules` en esa base y coordinar la versión web de Hosting `migapos-peru`. El inventario activo y la aceptación del piloto deben comprobarse por separado.

## Bloqueo de auditoría del SHA `7c0fe8ed`

La ejecución 43327401975 reportó GHSA-qv5m-9pm6-hqp3 y GHSA-jpvv-r467-5p4w en `@hono/node-server@2.1.3`, dependencia de desarrollo de `firebase-tools@15.34.1 → @modelcontextprotocol/sdk@1.32.1`. El lockfile raíz fija `2.1.6` con la integridad publicada por npm. La versión satisface el rango del SDK y el peer admite el Hono 4 instalado. El cambio abarca una entrada de `package-lock.json`. `package.json` y la política de auditoría siguen intactos.

- **PASS** · `npm ci` instaló 685 paquetes y conservó el hash del lockfile. `npm ls` confirmó la cadena hasta `@hono/node-server@2.1.6`.
- **PASS** · `npm run audit:security` con 0 hallazgos raíz. El registro reportó 5 entradas de severidad baja en frontend y 1 en Functions. Los tres árboles quedaron sin hallazgos moderados, altos o críticos.
- **PASS** · Lint, build/PWA e inventario local de índices. La verificación de PWA confirmó 45 archivos precacheados y 2,94 MiB.
- **PASS** · `npm run test:spark` (81/81) y `npm run test:spark:rules` en `demo-migapos` (82/82). La repetición paralela de backup y P15 con CDP por pipes en Chromium Windows pasó 2/2.
- **BLOCKED** · Chromium Ubuntu y CI del SHA final. Ubuntu local carece de Node y Chromium disponibles.

**Código local READY** para subir y verificar en CI. La publicación sigue pendiente de la CI Ubuntu del SHA final y de la aceptación manual.
