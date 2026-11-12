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

La evidencia de acceso entre cuentas usa sesiones autenticadas separadas en el emulador. La evidencia de carga parcial, caché y compresión usa Chromium aislado con fallos controlados. Se requiere aceptación con dos dispositivos físicos, fotos reales de tortas y la aplicación lectora del QR de Yape/Plin. El QR sintético se decodificó en OpenCV a 600 y 200 px.

El respaldo general exporta las referencias y advierte que el contenido privado de `media` y las fotos históricas del navegador quedan fuera. PDF y Excel gerenciales no exponen fotos. Los borradores POS y fotos aún pendientes de subir dependen del dispositivo. Si se borra IndexedDB antes de confirmar la escritura, se puede perder la copia local.

## Archivos

- Rules e índices en `firestore.rules`, `firestore.indexes.json`, `scripts/firestore-index-inventory.mjs` y `docs/INDICES-FIRESTORE-MIGAPOS.md`.
- Contratos en `contractImagePolicy.js`, `contractImages.js`, `contractMediaRepository.js`, `useContractImageUrls.js`, `useContracts.js`, `ContractManager.jsx`, `ContractFormModal.jsx`, `ContractDetailsModal.jsx`, `ContractMediaActions.jsx` y `printDocument.js`.
- Productos, QR y respaldo en `shared/images/raster.js`, `ProductCatalog.jsx`, `useBranches.js`, `QRPaymentCard.jsx` y `backupRepository.js`.
- POS en `receiptRecovery.js`, `saleQueue.js`, `saleQueueStore.js`, `saleTransactions.js`, `pendingSalesCache.js`, `useRecentSales.js`, `usePOS.js`, `TicketParts.jsx` y `SalesHistory.jsx`.
- Regresiones en `spark-financial.rules.test.mjs`, `spark-local.browser.{html,test.mjs}`, `plan07.test.mjs`, `plan08.test.mjs`, `plan08-pos.browser.html`, `plan08.browser.test.mjs`, `plan13.test.mjs` y `ui-security.test.mjs`.

## Publicación manual

1. Verificar CI Ubuntu del SHA exacto y conservar una copia de las Rules publicadas y del inventario activo de índices de la base `(default)` de `migapos`.
2. Publicar la exención `media.data` y las Rules revisadas. Conservar los índices de caja y contratos de P17. Coordinar el cambio con Hosting `migapos-peru` y la actualización de la PWA. La interfaz anterior queda limitada a crear pedidos sin fotos nuevas tras aplicar las Rules P18.
3. Validar el piloto autorizado con dos dispositivos, dueño y cajeros de origen/recojo, un QR real, reconexión, caída a mitad de carga y borradores pendientes. Medir el uso de Firestore antes de ampliar el piloto.

La publicación queda pendiente de CI Ubuntu y de aceptación en dispositivos reales.
