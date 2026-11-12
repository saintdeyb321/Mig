# MigaPOS — P16 · Cierre de UX POS + simplificación segura de SuperAdmin

**Tipo:** plan técnico y criterios de aceptación para Codex. **Fecha:** 11/11/2026.
**Carpeta local exclusiva:** `C:\Proyectos\MigaPOS`.
**Rama de destino elegida por el propietario:** `fix/migapos-production-readiness`.
**Referencia publicada auditada:** `893a434c16d20b818b2f7c61538f27ae704fb091` (la carpeta local puede tener avances distintos: inspeccionar su código antes de editar).
**No tocar:** `marketing/`, `.agents/skills/brag-main/`, audiovisuales, rama `marketing/video-promo-migapos` ni commits ajenos.
**Regla operativa:** Codex NO ejecutará Git/GitHub, ni cambiará ramas, ni publicará a Firebase, ni instalará dependencias. El propietario realizará commits, pushes y despliegues. Si la rama local no es la indicada, avisar y no modificar hasta que el propietario la seleccione.

## 0. Meta y límites del trabajo

Entregar un POS con más vida, segmentación y estados legibles, y un SuperAdmin sencillo donde se puedan crear clientes, ver licencia, renovar, suspender, ajustar sedes y solicitar una copia de sus datos con alcance honesto. Reducir lecturas innecesarias sin suponer que `onSnapshot` es gratis ni comprometer aislamiento multitenant. **No introducir un borrado irrestricto de sedes o negocios.**

Este trabajo tiene **dos entregables independientes dentro de una sola fase**: A) UX POS y B) refactorización de SuperAdmin. No rehacer el diseño global, no tocar la rama del video, no añadir marketing ni crear un nuevo sistema de respaldo paralelo.

## 1. Hallazgos contrastados con código publicado

- POS: `frontend/src/modules/POS.jsx`, `frontend/src/modules/pos/PaymentParts.jsx`, `frontend/src/modules/pos/TicketParts.jsx`, `frontend/src/index.css`, `frontend/src/shared/styles/theme.css`. Ya existe una composición con carrito acotado y scroll independiente; **no romperla**.
- Los botones de pago actualmente usan clases como `bg-success-soft`, `bg-accent-soft`, `bg-stellar-soft` y variantes de `border-*`. Se pueden mejorar mediante **estilos del módulo y estados CSS**, sin alterar el cálculo de cobros.
- SuperAdmin: `frontend/src/modules/SuperAdmin.jsx`, `modules/admin/{ClientCard,BranchQuotaModal,BusinessDetailsDialog}.jsx`, `frontend/src/hooks/useSuperAdmin.js`.
- `createSparkAdministrationRepository.administrationPage`: consulta **hasta 25 licencias** y por cada licencia lee su tenant y busca propietario en users (y en invites cuando es necesario). Esto es una oportunidad real de ahorro. La lista NO utiliza actualmente un listener `onSnapshot`.
- `platformBusinessRepository.readPlatformBusiness` consulta sedes, usuarios, invitaciones y muestras de colecciones bajo demanda; **no es inventario completo**. Retirarlo de la pantalla de cliente no equivale a autorizar borrados.
- Crear negocio ya registra `tenants`, `licenses`, sede principal, ajustes, invitación y reserva de correo en una transacción idempotente; renovar licencia usa `operationId` para evitar duplicados ante reintentos. **Conservar**.
- `branchPolicy.js`: de 1 a 100 sedes **activas**, de 1 a 200 **registradas**, con `maxRegisteredBranches >= maxActiveBranches`. Valores iniciales: una activa y cinco registradas. La sede inactiva deja libre solo el cupo activo. Los IDs registrados no se reutilizan. Los inventarios históricos pueden requerir regularización y no se pueden reducir por debajo del uso real.
- `branchWrites.js` requiere transacción y bloquea inactivar si hay una caja/reserva activa. `cash_sessions`, `sales`, `contracts`, stock y pagos pueden seguir referenciando sedes inactivas.
- Ya existe `BackupPanel` + `backupRepository`: descarga JSON opcionalmente cifrado, consulta por páginas de hasta 200, con límite global de 100–5 000 documentos y 16 MiB, enumeración de colecciones conocidas y manifestación explícita de información faltante. NO incluye Firebase Auth, Storage ni contenido local de otras personas/dispositivos. Una copia parcial no debe presentarse como integral.
- `runtimeCapabilities.js`: Firebase Spark activo; Cloud Functions, Storage, trabajos de plataforma, purga remota y restauración privilegiada **deshabilitados**. No prometer que la web puede borrar exhaustivamente una empresa.

## 2. Entregable A — POS más luminoso y dinámico, sin cambiar lógica

### 2.1 Guía cromática aproximada (sugerencia, ajustar contraste sobre pantalla real)

Mantener crema `#FFF9F1` del lienzo y violeta actual de marca. No aplicar fondos saturados a toda la pantalla. Evitar cambiar tokens globales si el ajuste es exclusivo del POS.

| Elemento | Superficie sugerida | Texto/acento | Intención |
| --- | --- | --- | --- |
| Panel exterior del ticket | marfil `#FFFEFC` | violeta `#352064` | Contenedor cálido, borde visible |
| Líneas de artículos / ticket vacío | lavanda muy clara `#FAF7FF` o marfil | texto oscuro | Diferenciar lista del fondo exterior |
| Total a cobrar | menta `#E8F8EE` | verde profundo `#086B4E` | Destacar la cifra sin verde oscuro sólido |
| Zona métodos de pago | `#F8F6FF` | bordes suaves | Dejar de parecer un hueco blanco |
| Efectivo en reposo | `#F4FCF6` | `#087B55` | Verde de billetes, claro |
| Efectivo seleccionado | `#DDF7E9` | `#087B55`, borde más fuerte | Estado seleccionado inequívoco |
| Yape/Plin en reposo | `#FBF7FF` | `#7540C6` | Lila cálido |
| Yape/Plin seleccionado | `#F0E4FF` | `#7138C0`, borde violeta | Morado claro difuminado |
| Mixto en reposo | `#F7FAFF` | `#315CC5` | Azul ligero |
| Mixto seleccionado | `#E8F0FF` | `#2B55B9`, borde azul | Azul claro, no opaco |
| Bloque monto/vuelto | lavanda-marfil `#FCF9FF` | cifras legibles | Contorno y separación entre input y resultado |
| Botón Cobrar activo | verde vivo moderado (p.ej. `#13A778`) | texto blanco con contraste suficiente | CTA principal, no esmeralda oscuro ni pastel deshabilitado |

Valores son guía, **no obligación exacta**. Comprobar WCAG AA: contraste de texto normal >= 4.5:1, iconografía/controles >= 3:1; foco visible. Evitar depender exclusivamente del color: `aria-pressed`, icono, etiqueta y estados. No hacer seleccionado oscuro uniforme; preferir superficie pastel + borde/acento + peso tipográfico.

### 2.2 Estructura del ticket

1. Cabecera lavanda suave y contador de productos.
2. Artículos con lista de scroll independiente, superficie reconocible, divisores ligeros y estado vacío claro. Evitar tarjetas gigantes dentro del ticket y conservar controles `+ / - / quitar` accesibles.
3. Total en banda menta contrastante, cifra jerarquizada.
4. Métodos de pago contenidos en un bloque propio, no sobre el mismo fondo del cuerpo.
5. Campo **Monto recibido** y resultado **Vuelto** lado a lado cuando quepan; mantener validación y formato. Si el ticket o el viewport no lo permiten, apilar de forma usable sin recortar el campo ni esconder el vuelto. En modo mixto conservar ambos inputs y su cálculo existente.
6. Footer Cobrar/Abrir caja siempre accesible, no empujado fuera de la pantalla por carrito infinito.
7. Seguir mostrando acciones y avisos reales de caja abierta, cerrada, vencida y modo de solo lectura, sin introducir cobros falsos.

### 2.3 Responsivo obligatorio

- Validar desktop 1440x900, **1280x560**, tablet aprox. 768x1024, mobile 390x844 y 320x640.
- El ticket debe mantener el total, métodos, monto y CTA visibles o alcanzables mediante un desplazamiento accesible bien delimitado; sin scroll anidado accidental ni panel empujando el layout.
- Probar teclado, zoom 125/200%, modo caja vacía, 1 y >=10 artículos, texto largo, importes grandes, errores, disabled, pending, drawer móvil.
- No alterar los hooks de ventas, reglas de validación decimal ni `usePOS` salvo necesidad demostrada estrictamente de presentación.

### 2.4 Aceptación POS

- Efectivo/Yape/Mixto: reposo, seleccionado, hover, focus y disabled claramente diferentes; los tres comparten calidad estética.
- Carrito con bloques diferenciados y fondo crema-marfil sin parecer monocromático.
- El total y el vuelto reflejan exactamente el motor existente (centavos, sin redondeos nuevos).
- Sin ventas duplicadas ni cambio de comportamiento de botones, stock, bloqueo de caja y reintentos.
- Capturas Chromium comparativas de 1280x560 y móvil, con teclado y CTA verificables.

## 3. Entregable B — SuperAdmin con menos ruido y más claridad

### 3.1 Arquitectura de pantalla deseada

**Barra superior**: «Negocios» + «Agregar negocio»; indicador discreto de última actualización/estado de sincronización. Evitar botón enorme «Actualizar clientes». Conservar **Actualizar** manual como acción secundaria de recuperación, no cargar de nuevo automáticamente al buscar.

**Buscador**: filtra resultados **ya cargados**, avisa «Buscando en 25 negocios cargados» y propone cargar más; no fingir que filtra todo Firestore.

**Tarjeta compacta por negocio**: nombre, propietario/correo, estado de licencia, fecha de vencimiento, `Sedes activas: 2 de 3`, registradas `3` (historial). Tres acciones comprensibles:

- **Renovar licencia** (ver antes/después, confirmar).
- **Gestionar sedes y cupos** (una sola experiencia clara).
- **Descargar datos / Solicitud de baja** (separadas visual y operativamente).

Suspender/Reactivar en menú secundario con confirmación. ID técnico solo en «Información técnica» opcional para soporte; no en cabecera. Eliminar «Ver detalles» como listado extenso de personal/colecciones al abrir; NO retirar las verificaciones de autorización que otras acciones necesitan.

**Agregar negocio**: pasos lógicos (datos del negocio y propietario; licencia/meses; sedes contratadas), validaciones inline, claridad sobre sede principal automática e invitación, resumen antes de confirmar; reusar `createTenant`, `operationId` y la transacción actual.

### 3.2 Reducir lecturas sin falsa promesa de cero

**Antes de cambiar**: registrar con pruebas/espías cuántas consultas, documentos y escrituras de control se producen en 1, 25 y 50 clientes, abrir pantalla, cambiar filtro, editar cupo, renovar, volver de otra pestaña y reconectar.

**Objetivo**: suprimir el patrón N+1 de leer tenant y propietario de cada licencia en cada refresco. Diseñar un **resumen autorizado y mínimo**, preferiblemente materializado en licencia y actualizado atómicamente cuando corresponda, manteniendo fallback histórico bajo demanda si faltan campos. No copiar información sensible o secretos al resumen. Verificar Rules antes de usarlo y que la lectura global solo sea posible para SuperAdmin autenticado.

**Tiempo real**: `onSnapshot` **solo** para la página acotada de licencias realmente visible o para documentos puntuales, con baja al desmontar/cambiar sesión y paginación controlada. Una arquitectura híbrida (primera página en listener + siguientes bajo demanda y caché limitada por identidad, cursor y revisión) es preferible a escuchar todos los negocios. No crear un listener por negocio ni por empleado. Tener en cuenta que reconexiones prolongadas pueden volver a facturar lecturas y que el cache no reemplaza autorización confirmada.

**Si el cambio de denormalización es demasiado riesgoso** para Rules o las pruebas: no inventar una solución opaca; mantener la consulta actual, optimizar interfaz/caché y documentar costos y bloqueo. No abrir permisos para eludir lecturas.

**Requisitos**: no almacenar datos de otro negocio en caché compartida; deduplicar peticiones concurrentes por clave y TTL; invalidar al crear, renovar, suspender y cambiar cupo; nunca permitir escrituras desde datos `fromCache`, respuestas de cuenta anterior o licencia desactualizada. No hacer suscripción integral a `users`, `branches`, `sales` ni `contracts` para pintar tarjetas.

### 3.3 Cupos de sedes — experiencia simple y reglas inalterables

**Modelo real a comunicar**:

- «**Sedes que pueden estar abiertas al mismo tiempo**»: hasta `maxActiveBranches`.
- «**Sedes existentes en el historial**»: activas + inactivas, hasta `maxRegisteredBranches`; no es un segundo contrato comercial que el operador deba adivinar.
- «**Sedes activas hoy**» y «**Sedes inactivas**» en una mini barra.
- Inactivar una sede libera **solo** una plaza activa. El historial registrado permanece. No cambia IDs ni mueve ventas.

Ejemplo obligatorio: cliente contrató **3 sedes activas**; tiene 3 registradas, 2 activas y 1 inactiva. Vista: `2 de 3 sedes activas`; `3 sedes registradas, incluida 1 inactiva`. Si baja el plan a 2, debe funcionar sin eliminar una sede, siempre que queden como máximo 2 activas. Si hay 3 activas, bloquear y ofrecer desactivar una **después** de verificar cajas y pendientes. Cambiar el plan no inactiva sedes automáticamente. **No disminuir el máximo registrado por debajo de 3** ni reducirlo de forma implícita.

Implementar un formulario simplificado: cupo activo como entrada principal; cupo registrado solo en «Opciones avanzadas del inventario», mostrando mínimo obligatorio >= número registrado y >= cupo activo; los históricos sin inventario completo muestran «Necesita revisión», sin declarar automáticamente valores por conveniencia.

**No editar cupos con conteos de una muestra parcial**. Conservar la comprobación real de la lista de sedes e inventario canónico. Verificar concurrencia, race conditions y Rules. No relajar el procedimiento de regularización histórico para hacerlo menos incómodo.

### 3.4 Eliminar sede inactiva: análisis primero, no borrado inmediato

**La petición es válida, pero no implementar `deleteDoc(branch)` como solución rápida.** Una sede inactiva podría conservar ventas, stock, pedidos, arqueos, pagos, personal, anulaciones o documentos históricos. Eliminarla puede romper reportes, auditoría, y autorización. Tampoco implica por sí solo ahorro de lecturas: optimizar los lectores para ignorar sedes inactivas en pantallas operativas es distinto de borrar el documento.

Implementar ahora preferentemente:

- «**Archivar sede inactiva**»: ocultarla de selectores operativos por defecto y conservarla en consultas históricas. Debe ser un estado/presentación compatible con Rules existentes; si exigiría cambiar el protocolo de datos, aplazar la operación y usar estado `inactivo` + filtro sin escribir.
- «Eliminar sede» solo para una sede creada por error y **demostrablemente vacía**: propuesta para futura operación privilegiada tras auditar las referencias y el inventario completo. Si no puede probarse exhaustivamente con la arquitectura Spark actual, la acción **queda deshabilitada** con explicación humana; no borrado parcial.
- Nunca reutilizar IDs históricos, reducir `registeredBranchIds` ni borrar un historial contable por una operación de UX. Si se diseña un procedimiento futuro, requerirá plan/checkpoints, autorización separada, guardas atómicas y pruebas de aislamiento.

### 3.5 Copia de datos de un negocio — reemplazo de «Ver detalles»

Reemplazar la lectura costosa de detalles con un **centro de descarga bajo demanda**. Reutilizar `BackupPanel`, `backupRepository`, permisos temporales actuales y manifestación explícita de límites. No hacer consultas extensas al abrir la lista ni por accidente cuando se abre la tarjeta.

Ofrecer **dos productos distintos**:

**A. Resumen empresarial Excel (.xlsx), legible**
- Hojas por bloques: negocio/licencia, sedes (activas/inactivas), categorías, productos, empleados/perfiles, invitaciones y resumen de datos descargados; incluir periodos y advertencias de lo no incluido.
- Cada hoja indica fecha de captura, alcance y sección completa/parcial; no mostrar UIDs en la vista gerencial por defecto, pero conservar identificación técnica mínima necesaria en la copia especializada cuando se autorice y se proteja el archivo.
- NO sumar ventas históricas de todo el año ni traer todos los tickets/contratos para un simple resumen. No prometer un Excel anual exhaustivo cuando existan límites de registros.
- Proteger contra *formula injection* en nombres, direcciones y cualquier celda exportada; formatos semánticos y reimportación de prueba.

**B. Copia de datos estructurada y cifrada (.json.encrypted o el formato real existente)**
- Reutilizar la exportación ya implementada y sus límites visibles (hasta 5 000 docs / 16 MiB, páginas hasta 200, disponibilidad real por colección).
- En grandes volúmenes: ofrecer exportación por secciones independientes con cursores/checkpoints verificables (si son seguros y se pueden implementar); detenerse limpiamente al límite y permitir continuar sin duplicar ni saltar documentos. No simular completitud ni leer indefinidamente.
- Incluye manifest de completitud, exclusiones y checksum, y fecha; no exponer secretos; no descargar datos de terceros negocios.
- Respetar consentimiento/identidad del titular y medidas de privacidad para transferir el archivo, retención aplicable por revisión legal, y documentación de que **Auth, Storage y datos en dispositivos ajenos** no están incluidos cuando no puedan recuperarse.

**No sustituir un respaldo íntegro por un Excel bonito.** Si el objetivo legal/operativo exige una copia integral fuera del alcance de Spark, entregar un procedimiento manual verificable, no un botón que declare exportación completa falsamente. No prometer cumplimiento legal universal sin revisión específica.

**Costos y experiencia:** mostrar estimación/advertencia de lecturas antes de comenzar, progreso por sección, cancelar, reintentar, resumir parcialidad. Descargar la misma captura en dos formatos cuando sea posible desde la misma lectura (no repetir todos los getDocs para Excel y JSON); límites de memoria, cancelación, navegación, vencimiento de permiso temporal y limpieza de recursos.

### 3.6 Baja de negocio y limpieza de la BD: seguridad antes que rapidez

Separar explícitamente:

1. **Solicitud de baja** (se registra/procesa externamente de forma autorizada; no es borrado): confirmar negocio y titular, vigencia de obligaciones, exportación entregada, cajas/anticipos/pendientes, retención legal.
2. **Exportación e inventario**: generar copia cifrada, comprobar integridad y que el alcance sea completo o se declare parcial; inventariar colecciones conocidas, subcolecciones, padres eliminados y referencias. Exportación no modifica documentos comerciales.
3. **Plan dry-run de limpieza**: reusar `cleanupPlan`, manifiesto y `cleanupVerification` con rutas canónicas; no marcar una muestra vacía como base de datos vacía. Verificar relación con `users`, `invites`, `owner_email_claims`, `platform_operations`, sesiones de caja, contabilidad, y autenticación.
4. **Ejecutor destructivo separado y futuro**, solo en entorno administrativo de confianza y tras autorización independiente explícita, respaldo cifrado verificado y plan exhaustivo. Lotes pequeños, checkpoints persistentes, reanudación idempotente, control de propiedad de ruta, rate limiting, borrado de subcolecciones ANTES que padres, verificación final y mantenimiento de evidencia/auditoría mínima permitida por normativa. Sin crear purga desde React ni confiar en Rules para operaciones administrativas privilegiadas.
5. **Sin infraestructura autorizada ahora:** mantener el botón «Eliminar negocio» deshabilitado, explicar el motivo y el procedimiento. No añadir Cloud Functions/Blaze/SDK Admin/scheduler por iniciativa propia.

**Aviso técnico clave:** Firestore NO elimina automáticamente las subcolecciones cuando se borra un documento padre. Borrar una colección implica lecturas y escrituras; no hay «cascada gratis». No existe garantía de cero datos huérfanos sin inventario completo y verificación de rutas. Nunca ejecutar una prueba destructiva sobre `migapos` real.

### 3.7 Renovación de licencia y creación de cliente: regresión de extremo a extremo

- Mantener operación idempotente (`operationId`), expiración con horario de Lima y continuación desde `max(now, expiry)`. Comprobar escenarios: activa, vencida, suspendida, mantenimiento, clic doble, red caída tras confirmación, reintento con mismo ID, reintento con otros meses y operación ya registrada. Mantener bloqueos transaccionales.
- Renovar no es **cobrar dinero** automáticamente: si la UI indica «Confirmar Pago» sin cobro real, cambiar a «Confirmar renovación de licencia» y usar confirmación clara de duración/fecha final. No registrar pagos inexistentes.
- Alta: verificar nombre, Gmail, propietario distinto al admin, correo reclamado, invitación anterior, sede principal inicial, cupo, creación concurrente, expiración y permisos. No generar duplicados.
- Suspender/reactivar: confirmación, error recuperable, invalidación del resumen y comprobación del efecto en la sesión del dueño/cajero sin permitir ventas no autorizadas.

## 4. Archivos de estudio (usar el árbol LOCAL, no sobrescribir ciegamente)

**POS:** `frontend/src/modules/POS.jsx`, `frontend/src/modules/pos/PaymentParts.jsx`, `frontend/src/modules/pos/TicketParts.jsx`, `frontend/src/index.css`, `frontend/src/shared/styles/theme.css` y pruebas Chromium existentes.

**SuperAdmin:** `frontend/src/modules/SuperAdmin.jsx`, `frontend/src/modules/admin/{ClientCard,BranchQuotaModal,BusinessDetailsDialog}.jsx`, `frontend/src/hooks/useSuperAdmin.js`, `frontend/src/features/licenses/infrastructure/{sparkAdministrationRepository,platformBusinessRepository,administrationRepository}.js`, `frontend/src/features/branches/domain/branchPolicy.js`, `frontend/src/features/branches/infrastructure/branchWrites.js`, `frontend/src/features/backups/**`, `frontend/src/config/runtimeCapabilities.js`.

**Seguridad/pruebas:** `firestore.rules`, `tests/spark.rules.test.mjs`, `tests/spark-financial.rules.test.mjs`, `tests/backups.test.mjs`, `tests/backups.browser.test.mjs`, `tests/backups.rules.test.mjs`, `tests/plan09.browser.test.mjs`, `tests/plan13.test.mjs`, `tests/cash-amount.browser.test.mjs` y los tests específicos de administración existentes. No modificar Rules sin protocolo de pruebas y autorización; preferir conservarlas.

## 5. Secuencia de trabajo y criterios de cierre

1. **Inventariar el árbol local** y estado real de componentes, licencias, seguridad y test scripts. Mantener fuera marketing. No usar Git; si Codex desconoce rama, pedir al propietario que confirme antes de editar.
2. **Capturar línea base** de UI y costo de lectura (contar `getDoc`, `getDocs`, listeners, reconexión, escrituras de control) sobre fixtures aislados; guardar números en resultados.
3. **POS**: aplicar tratamientos cálidos y segmentación, probar montos, métodos, caja, teclado, 1280×560 y móvil.
4. **SuperAdmin**: simplificar lista/tarjeta/alta/renovación/cupos. Priorizar reducción demostrable de N+1 y snapshot acotado; no perder fallbacks ni controles históricos.
5. **Descarga**: mejorar acceso a respaldo existente y, si es razonable sin nuevos riesgos, Excel resumido por secciones; no una copia integral inventada. No cargar colecciones masivas al renderizar lista.
6. **Bajas**: UX informativa, dry-run/seguridad y análisis de eliminar sede vacía/negocio; sin ejecutar borrado real ni abrir funciones destructivas.
7. **Pruebas:** Node unit/domain, Chromium, aislamiento cross-tenant, cuotas 1/3/100, registered 5/200, inventario parcial, caja abierta al inactivar, creación concurrente, doble renovación/reintento, exportación parcial, cancelación, salida de sesión, CSS, keyboard, lint, build/PWA, Rules con emulador únicamente si Java ya existe. Marcar BLOCKED si no.
8. **Medir antes/después** de consultas/documentos y tamaño de exportación. Las reducciones deben demostrarse mediante pruebas; no afirmar «cero lecturas» cuando un listener podría reconectar.
9. Crear `docs/RESULTADOS-P16-POS-SUPERADMIN.md`: archivos modificados, capturas de 1280×560 y móvil, costos comparados, pruebas exactas, funciones implementadas, riesgos residuales y alcance incompleto (Auth/Storage/histórico). **No ocultar FAIL ni BLOCKED.**

### Condiciones STOP obligatorias

- Conflictos de ramas, cambios no identificados de marketing o archivos del video.
- Una consulta devuelve datos de otra empresa; una licencia o cuota puede mutar por caché no confirmada.
- Necesidad de relajar Firestore Rules para soportar lectura o borrado.
- Exportación etiquetada «completa» con secciones inaccesibles, limitadas o rutas desconocidas.
- Un flujo de baja eliminaría datos reales, permitiría reusar branch IDs o afectaría historiales.
- Pruebas financieras o de aislamiento dejan de pasar.

## 6. Referencias técnicas verificables

- Firestore: borrar documentos no elimina sus subcolecciones; operaciones de borrado por colección consumen lecturas y escrituras. https://firebase.google.com/docs/firestore/manage-data/delete-data
- Las suscripciones `onSnapshot` pueden facturar lecturas nuevas al reconectar y cuando se actualizan documentos. https://firebase.google.com/docs/firestore/pricing
- Transacciones y lotes tienen límites y dependen de reglas de seguridad. https://firebase.google.com/docs/firestore/manage-data/transactions

**Principio rector:** claridad visual y reducción de costo demostrada, sin comprometer la integridad contable, la privacidad o la capacidad de recuperar el historial.
