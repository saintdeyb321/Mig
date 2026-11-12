# P16 · Resultados de POS y SuperAdmin

## Implementación

- POS. Secciones en marfil, lavanda y menta. Los medios de pago conservan sus etiquetas, `aria-pressed`, foco y colores por canal. El botón Cobrar activo alcanza un contraste de 5,07:1 con texto blanco. El menor contraste medido de los bordes de los tres medios es 3,63:1. Se conserva el desplazamiento independiente de artículos, el foco en campos a baja altura y el límite de ocho productos distintos.
- Negocios. Lista acotada y buscador local por nombre, estado de conexión, actualización explícita, alta con resumen, renovación con vencimiento de Lima y confirmación de suspensión/reactivación. El titular se consulta bajo demanda. Las operaciones reutilizan la transacción y el ID original en el reintento. La renovación compara estado y vencimiento con el registro de la transacción. Ante respuesta ambigua solo un recibo de servidor coincidente confirma la operación.
- Cupos. El cupo activo es la entrada principal. El registrado permanece en opciones avanzadas con mínimo por inventario y cupo activo. El formulario muestra sedes activas, inactivas y registradas, exige revisión histórica y bloquea inventarios parciales. La transacción conserva las IDs y verifica el inventario vigente. Las sedes inactivas mantienen su historial y quedan fuera de los selectores operativos existentes.
- Descargas. Se reutilizan el permiso temporal y el repositorio de respaldos. El resumen Excel recorre solo negocio, licencia, sedes, categorías, productos, perfiles e invitaciones. Aplica páginas de hasta 200, límite de 100 o 500 documentos y límite de 16 MiB. Indica captura, alcance y estado por hoja. Las cadenas que empiezan con fórmulas se escriben como texto; los precios siguen siendo numéricos. El XLSX es legible sin cifrado. El JSON conserva AES-GCM opcional, checksum por colección, límites, cancelación y la exportación separada del dispositivo.
- Baja. Procedimiento informativo por canal verificado, copia cifrada, verificación local, inventario y dry-run. La ejecución destructiva permanece deshabilitada. La solicitud se coordina fuera de la aplicación.

## Lecturas antes y después

Se ejecutó el repositorio previo y el nuevo con el mismo espía local, filas sintéticas y propietario existente en cada negocio. Cada celda muestra solicitudes SDK / documentos devueltos. Las cifras excluyen dependencias internas de Rules, reintentos y cargos por consultas vacías. Son una medición del cliente, no un extracto de facturación.

| Negocios | Primera página antes → después | Cargar hasta ese total antes → después | Actualizar primera página antes → después |
| ---: | --- | --- | --- |
| 1 | 3 / 3 → 1 / 1 | 3 / 3 → 1 / 1 | 3 / 3 → 1 / 1 |
| 25 | 51 / 75 → 1 / 25 | 51 / 75 → 1 / 25 | 51 / 75 → 1 / 25 |
| 50 | 51 / 75 → 1 / 25 | 102 / 150 → 2 / 50 | 51 / 75 → 1 / 25 |

- Búsqueda, retorno a la pestaña y reconexión sin actualización solicitada. 0 lecturas de la lista en ambos diseños. En P16 reconectar mantiene las mutaciones bloqueadas hasta una lectura nueva. Los formularios abiertos conservan sus datos y permiten actualizar el acceso allí mismo; el reintento conserva su ID. Al volver a montar SuperAdmin se lee la primera página. Una última página llena puede generar una consulta vacía al pedir más.
- Renovación, estado y cupos. Tras confirmar, la lista releía la primera página. Ahora confirma solo la licencia afectada, 1 lectura adicional en lugar de 75 documentos con 25 negocios. La renovación/estado conservan 3 lecturas transaccionales y 2 escrituras de negocio/recibo por intento exitoso. El cupo conserva 2 lecturas y 2 escrituras transaccionales. La verificación del inventario de sedes se hace solo al abrir su formulario. El permiso de inventario requiere 1–2 escrituras de control y puede sumar lecturas de verificación. Una respuesta de renovación ambigua puede añadir la lectura de un recibo.
- Alta. Se conserva la lectura previa de recibo/correo, la transacción de siete documentos y la actualización de una página. El ahorro está en la eliminación del enriquecimiento global.
- Titular. 2 solicitudes explícitas por tarjeta, o 3 si se consulta la invitación. Memoria del módulo con TTL de 60 segundos, hasta 50 entradas y deduplicación de peticiones. Se invalida al actualizar, mutar la licencia afectada, perder conexión o salir de la identidad. La tarjeta histórica sin nombre de licencia permite consultar el nombre de tenant desde ese mismo contacto.
- Se evaluó escuchar la primera página con `onSnapshot`. Una reconexión puede volver a leer una página y un evento local no basta para autorizar una mutación. Se eligió paginación de servidor con Firestore Lite y memoria por montaje. Listado y contacto no usan la caché persistente del SDK completo. Ningún listener administrativo ni escritura de control al listar. Copiar el titular a licencia requeriría cambiar el esquema exacto de creación admitido por Rules, así que se conserva el modelo actual.
- Excel y JSON tienen alcances distintos. El Excel consume su propia captura acotada; no se lanza una descarga de tickets ni una segunda consulta para formatear el archivo. El JSON conserva el presupuesto original de hasta 5.000 documentos. Las páginas son internas a cada captura; no se ofrecen archivos de continuación ni cursores reanudables entre capturas.

## Evidencia visual

Las referencias anteriores se tomaron de la validación local previa del POS. Todas las capturas usan datos de prueba. El árbol recibido para P16 ya tenía el lienzo `#fffefa` y se conservó ese token. La regresión P14-RC usa ese valor exacto y sigue comprobando el panel `#fffefc`.

| Vista | Anterior | P16 |
| --- | --- | --- |
| POS 1280×560 | [captura](../.release/qa-pos-ux/p10-06-visual/after-pos-caja-carrito-1280x560.png) | [captura](../.release/qa-p16/p10-06-visual/after-pos-caja-carrito-1280x560.png) |
| POS 390×844 | [captura](../.release/qa-pos-ux/p10-06-visual/after-pos-caja-carrito-390x844.png) | [captura](../.release/qa-p16/p10-06-visual/after-pos-caja-carrito-390x844.png) |
| Negocios escritorio | [captura anterior 1440×900](../.release/qa-pos-ux/p0907-visual/p0907-superadmin-desktop.png) | [captura 1280×560](../.release/qa-p16/plan09-visual/p16-negocios-1280x560.png) |
| Negocios móvil | [captura anterior](../.release/qa-pos-ux/p0907-visual/p0907-superadmin-mobile.png) | [captura 390×844](../.release/qa-p16/plan09-visual/p16-negocios-390x844.png) |

## Archivos

- POS: `frontend/src/index.css`, `frontend/src/modules/POS.jsx`, `frontend/src/modules/pos/{PaymentParts,TicketParts}.jsx`.
- SuperAdmin: `frontend/src/hooks/useSuperAdmin.js`, `frontend/src/modules/SuperAdmin.jsx`, `frontend/src/modules/admin/{ClientCard,NewBusinessDialog,BranchQuotaModal,BusinessDownloadsDialog}.jsx` y retiro de `BusinessDetailsDialog.jsx`.
- Acceso: `frontend/src/features/licenses/domain/licenseTerm.js`, `frontend/src/features/licenses/infrastructure/{administrationRepository,platformBusinessRepository,sparkAdministrationRepository}.js`, `frontend/src/core/firebase/queryCatalog.js` y regeneración de `docs/INDICES-FIRESTORE-MIGAPOS.md`.
- Backups: `frontend/src/features/backups/application/businessSummaryWorkbook.js`, `components/BackupPanel.jsx`, `hooks/useLocalBackup.js`, `infrastructure/backupRepository.js`.
- Pruebas: `tests/{plan09.browser.test.mjs,plan09.fixture.jsx,plan10-correction.browser.test.mjs,spark-startup.browser.html,spark-startup.browser.test.mjs,spark.rules.test.mjs,backups.browser.html,backups.browser.test.mjs,backups.rules.test.mjs,ui-security.test.mjs,helpers/browserHarness.mjs}`.

## Verificación

| Control | Resultado |
| --- | --- |
| Node: ventas, P09, P13, Spark, seguridad y backups | **PASS 111/111** |
| Límites de cupo (1/3/100 activos y 5/200 registrados, con entradas inválidas) | **PASS 9/9** |
| `npm run test:spark:rules` con Java 21 local y emulador `demo-migapos` | **PASS 74/74**. Incluye concurrencia, renovación repetida, cupos, permisos, finanzas y respaldo empresarial parcial. |
| Chromium de arranque Spark | **PASS**, 17 comprobaciones de alta, contacto bajo demanda, doble clic, reconexión, reintento, sesión e IndexedDB. |
| Chromium de caja y backup | **PASS 2/2**. Descargó y verificó AES-GCM y reimportó el XLSX parcial con precio numérico, fórmula como texto y exclusión de IDs. |
| Chromium P08, P09 y P10-06 | **PASS 4/4**. P10-06 completó 536 comprobaciones y 53 capturas. Verificó foco, apertura/cierre, efectivo, digital, mixto, nombre largo y cobro exacto hasta S/ 50.000 recibidos. |
| Lint, inventario de índices y build/PWA | **PASS**. 43 archivos precargados únicos, 2,90 MiB. Excel sigue diferido. Vite mantiene el aviso por chunks mayores de 500 kB. |

Se probaron 1280×560, 1366×768, 1440×900, 768×1024, 390×844, 375×667 y 320×640. Los equivalentes CSS de zoom se probaron a 1024×448 y 640×450. También se verificaron alturas de teclado simulado. El carrito permitió ocho productos distintos y bloqueó añadir el noveno.

Los conteos de listado están en [antes](../.release/qa-p16/reads-before.json) y [después](../.release/qa-p16/reads-after.json). Evidencia de [Rules](../.release/qa-p16/rules-final.log), [reconexión](../.release/qa-p16/browser-reconnect-final.log) y [UX](../.release/qa-p16/browser-verified.log).

## Pendientes de aceptación

El propietario debe revisar las pantallas y probar teclado físico y teclado táctil en sus equipos. El zoom se simuló mediante el ancho/alto CSS equivalente. Se necesitan medidas reales de facturación para extrapolar el ahorro con Rules a producción.

No hay copia integral de Authentication, Storage, fotos o pendientes de otros dispositivos ni rutas desconocidas de Firestore. Los inventarios históricos parciales necesitan regularización supervisada. No se puede demostrar que una sede inactiva carezca de referencias a ventas, stock, contratos, pagos, arqueos o usuarios. Tampoco hay inventario recursivo exhaustivo de un negocio. Cualquier limpieza futura necesita respaldo verificado, autorización independiente, rutas comprobadas, eliminación de hijos antes que padres, checkpoints reanudables y verificación posterior en un entorno administrativo autorizado. El piloto queda sujeto a aceptación humana.
