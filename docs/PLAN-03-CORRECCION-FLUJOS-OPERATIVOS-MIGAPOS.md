# MigaPOS — Plan 03: estabilización operativa, cupos SaaS e inventario de índices Firestore

**Fecha:** 2026-10-24  
**Rama de referencia:** `refactor/ux-rescate-integrado` (`361d4a3bfb766cdd169c2aa2d4b496b62563c4c0`), verificar HEAD antes de cambiar archivos.  
**Entorno objetivo:** Firebase **Spark**, proyecto `migapos`, sin Functions, Storage ni Blaze.  
**Estado:** versión actualizada con bloque de índices; plan de implementación; NO autoriza despliegues ni borrados reales.

## Objetivo y alcance

Restablecer la experiencia operativa y la coherencia entre Firebase Auth, Firestore, caché, roles, sucursales y límites comerciales. Corregir los defectos vistos en capturas reales sin desmontar el rediseño Tailwind/Radix ni tocar los protocolos financieros ya verificados. Priorizar la recuperación de acceso y la integridad de datos sobre mejoras cosméticas.

### Evidencia observada (no confundir síntoma con causa)

| ID | Síntoma | Hallazgo en código / hipótesis a verificar | Resultado esperado |
| --- | --- | --- | --- |
| S01 | Primer inicio del dueño presenta «Invitación disponible» a pantalla completa | `profileSession.js` emite `needs-invite` cuando existe `invites/{email}` y aún no `users/{uid}`. Es onboarding diseñado, no una cuenta eliminada. | Alta de dueño clara y sin apariencia de error; aceptación idempotente y sin saltarse controles. |
| S02 | F5 muestra «Acceso sin verificar» brevemente y luego vuelve al POS | `profileAccess()` clasifica cualquier snapshot `fromCache` como `offline-unverified` y `useAuthManager()` lo publica en pantalla; `LicenseGuard` tiene un mecanismo similar. | Carga neutral mientras se confirma el servidor; errores persistentes solo cuando estén realmente diagnosticados. |
| S03 | En Personal aparece el dueño, luego un bloqueo temporal y después desaparece su tarjeta | `useUsersData()` combina `where('businessId','==',...)` y `where('role','!=','superadmin')`, `useScopedSubscription()` reemplaza datos ante error y `useUserManagement()` oculta los resultados durante `isGlobalLoading`. Comprobar índices, Rules, error, caché y cambios de usuario. | La tarjeta del dueño existe cuando corresponde, sin pérdidas silenciosas ni filtrado incorrecto; errores diagnosticables. |
| S04 | Selector de sucursales blanco/vacío en sidebar | `BranchSelectControl` utiliza `<select>` nativo con estilos oscuros, `value={value||''}` y muestra incluso sedes inactivas; `TenantProvider` debe normalizar selección. | Nombre actual legible, fallback coherente, sin selección inválida y sin controles en blanco. |
| S05 | Una sede inactiva sigue apareciendo en asignación de stock | `useProducts`/ProductCatalog recorren `businessBranches` sin estado unificado de sedes operativas. | No aceptar nuevas operaciones ni incrementos de stock en sedes inactivas; mantener datos históricos legibles. |
| S06 | SaaS Admin no limita cuántas sedes crea cada tenant | El esquema de `licenses` y la transacción `createTenant` no definen ni hacen cumplir `maxActiveBranches`. | Cupo configurado por SuperAdmin e **impuesto en Rules/transacciones**, incluyendo concurrencia y reactivación. |
| S07 | Notificaciones y conectividad se muestran al pie del sidebar | `AppLayout.jsx` los monta en el footer. | Controles accesibles en zona superior, también en móvil. |
| S08 | Scrollbar del sidebar grueso y con poco contraste intencional | `overflow-y-auto` sin token/estilo específico de scrollbar. | Barra delgada, visible y navegable con ratón, rueda y teclado. |
| S09 | SuperAdmin no dispone de detalles de negocio ni una baja operativa segura | `SuperAdmin.jsx` solo maneja alta, renovación, estado y exportación parcial. | Detalle del negocio, correos asociados **según Firestore**, checklist de Auth manual y flujo administrado de exportación/inventario/baja. |
| S10 | Solo aparece un índice compuesto en Firebase Console; los errores no muestran siempre el enlace de creación | `firestore.indexes.json` ya contiene **44 definiciones de índices compuestos** en 12 grupos de colección; son **configuración local**, no prueba de que se hayan creado en la base `(default)`. Los repositorios construyen consultas con `where`, `orderBy`, `in`, rangos y `documentId`. | Inventario de consultas e índices comprobable, tabla para creación **manual**, detección útil de `failed-precondition` y sincronización de la configuración sin desplegar. |

## Reglas no negociables

1. No borrar, migrar ni recrear documentos de producción automáticamente. No limpiar IndexedDB, pendientes financieros, fotografías ni datos PWA del usuario.
2. No modificar el motor de ventas y contratos salvo validaciones estrictamente necesarias de la sede activa; mantener inmutabilidad, idempotencia, stock por sede y las restricciones financieras existentes. No desbloquear tickets de más de dos líneas sin protocolo seguro, asunto pendiente por separado.
3. No usar Cloud Functions, Blaze, Firebase Storage, servicios externos de pago ni permisos genéricos `allow read/write: if superadmin()` sobre todas las colecciones.
4. Firestore Rules y operaciones transaccionales constituyen la autoridad. Una restricción visual por sí sola no protege cuotas ni operaciones.
5. Mantener compatibilidad con tenants/licencias y sucursales históricos; no asumir que los documentos antiguos tienen campos nuevos.
6. Los cambios de permiso/licencia exigen aceptación de una lectura confirmada; el caché no autoriza ventas, escrituras administrativas ni una cuenta distinta.
7. El propietario creará **manualmente** los índices tras revisar el inventario; Codex no ejecutará `firebase deploy`, no creará índices remotos ni cambiará la base real.
8. La ausencia de índice, un `permission-denied` y una red no disponible son errores diferentes: no se deben enmascarar como negocio eliminado, lista vacía ni licencia vencida.

## Bloque A — Sesión y alta de usuario (P0)

- Auditar `useAuthManager.js`, `profileSession.js`, `accessState.js`, `useLicenseAccess.js`, `LicenseGuard.jsx`, `RestrictedAccess.jsx`, `acceptInvitation.js`.
- Distinguir explícitamente `checking-server`, `needs-invite`, `ready`, `network-unavailable`, `permission-denied`, `profile-missing-confirmed`, `suspended` y `expired`. No reemplazar la pantalla completa por un error debido a un snapshot inicial `fromCache`.
- Para F5 y cambios de metadatos: mostrar una pantalla de carga sobria mientras se espera la primera lectura confiable del servidor, **sin permitir operaciones protegidas** hasta comprobar permisos. Si la conexión falla persistente, mostrar acción de reintentar y explicación real, sin entrar en bucle visual.
- Evitar que emisiones tardías de la sesión anterior sustituyan el estado del usuario nuevo; conservar aislamiento UID + negocio + sede, y respetar la expiración/inactividad confirmada.
- Primer login con invitación: usar una tarjeta de bienvenida con identidad del negocio, rol y botón claro «Activar mi cuenta»; no mostrar el octágono de bloqueo ni el mensaje de cuenta eliminada. La aceptación sigue requiriendo Google verificado, la invitación original y transacción idempotente. El perfil solo se crea cuando hay autorización correcta.
- No esconder errores de Rules tras reintentos infinitos ni recrear perfiles/licencias cuando faltan.

## Bloque B — Personal y estabilidad de datos (P0)

- Auditar `subscribeUsers`, `useUsersData`, `useUserManagement`, `useScopedSubscription`, `subscribeTenantCache` y Rules/índices de la consulta real.
- Instrumentar estados diagnósticos de datos: `loading`, `fromCache`, `server-confirmed`, `error`, `empty`; no convertir `permission-denied` o `failed-precondition` en lista vacía.
- Revisar el filtro `role != 'superadmin'` junto a `businessId == ...`: su índice compuesto y semántica con documentos históricos. Si se puede eliminar el filtro con un acceso acotado y protegido por Rules, hacerlo sin aumentar lectura innecesaria ni exponer roles ajenos.
- Validar que el propietario aparezca por su documento existente, sin duplicar invitaciones aceptadas ni mostrar perfiles de otros negocios.
- Conservar lista anterior etiquetada como desactualizada cuando corresponde, evitando flicker, pero invalidarla al cambiar UID/tenant. No usar datos cacheados para habilitar edición de usuarios sin permiso confirmado.

## Bloque C — Sedes activas y selector (P1)

- Construir un criterio reutilizable `isBranchOperational`, usado por UI, hooks y comprobaciones de escritura; estado desconocido o inactivo no se interpreta como activo.
- `BranchSelector` debe mostrar la sede actual o un placeholder claro, y filtrar sedes operativas; el dueño podrá ver información histórica de las inactivas en Ajustes, pero no seleccionarlas como sede para operar. El cajero asignado a una sede inactiva debe recibir un bloqueo comprensible.
- Revalidar `activeBranchId` cuando cambian las sucursales; no conservar un ID inexistente o inactivo como sede operativa; conservar `global` solo donde el flujo de solo lectura lo admita.
- Excluir sedes inactivas del alta de producto y de la distribución editable de stock. Preservar saldos históricos en el documento, sin ponerlos a cero ni migrarlos a otra sede.
- Revisar creación, edición, apertura de caja, venta, contratos, asignación de cajeros, QR y reportes para que respeten inactividad; denegar escrituras financieras a sede inactiva **desde Firestore Rules** cuando sea viable, con revisión del uso de accesos documentales.
- No permitir desactivar la última sede necesaria o una sede con sesiones activas/pagos pendientes sin una política de cierre segura; manejar tales casos mediante aviso y bloqueo, no borrado automático.

## Bloque D — Cupos de sedes por licencia (P1, requiere Rules)

- En SuperAdmin permitir configurar el cupo para un tenant nuevo, con valor predeterminado razonable **definido por política de producto**, y ajustar el cupo de un tenant existente mediante operación administrativa auditable y transaccional.
- Modelar `maxActiveBranches` (o nombre final documentado) **solo editable por SuperAdmin**. Presentar `activas / máximo` al dueño y SuperAdmin, y explicar qué sucede al llegar al límite.
- Diseñar e implementar un mecanismo de cupos **resistente a operaciones concurrentes**, apoyado por documentos de control/reserva o contadores transaccionales verificables con Rules (`getAfter()` cuando aplique). No confiar en `branches.length`, un query desde React ni en un campo `branchCount` libremente editable por el dueño.
- Precisar la política: si el cupo cuenta sedes activas, las inactivas no consumen el cupo; reactivarlas debe reservar plaza y quedar sujeta al mismo control. Los IDs históricos permanecen y no pueden reasignarse a otro negocio.
- Preparar compatibilidad de licencias existentes sin campo de cupo y reconciliación manual de sedes heredadas; no suspender de golpe negocios existentes ni inventar un valor restrictivo silencioso.
- Asegurar reglas de provisioning y actualización, no permitir que el dueño cambie el límite o burle el control con escrituras directas. Respetar límites de access calls de Firestore Rules.

## Bloque E — Navegación y micro-UX (P1)

- En desktop ubicar `NetworkBadge` y `NotificationBell` en la parte superior, agrupados y etiquetados; evitar duplicados con la cabecera móvil. El botón salir puede permanecer abajo.
- Sidebar: scroll solo para lista de módulos, scrollbar delgada con pulgar blanco/gris contrastante sobre pista oscura; `scrollbar-width: thin` y fallbacks `::-webkit-scrollbar` en CSS especializado mínimo. Mantener soporte táctil, rueda y teclado.
- Evitar selectores blancos sobre blanco; estilos para `select` nativo y `<option>` compatibles con tema oscuro. No introducir otra biblioteca visual solo por esto.
- Comprobar estrechamiento y zoom: elemento activo visible, navegación legible, sin solapamiento de header/sidebar ni scroll horizontal.

## Bloque F — Detalle de negocio y baja administrativa (P2)

**Regla de negocio:** el dueño se comunica directamente con SuperAdmin por WhatsApp externo; NO crear tickets, bandejas, solicitudes ni integración de WhatsApp.

- Añadir en cada tarjeta de SuperAdmin «Ver detalles», sin convertir el listado paginado en consultas masivas. Cargar información solo al abrir el detalle.
- Mostrar tenant, licencia, cupo/consumo de sedes, conteos disponibles y **correos de perfiles `users` e invitaciones `invites` que las Rules permitan leer**, con rol, estado, UID si está documentado y sede. No afirmar que es una lista completa de Firebase Authentication: el SDK web no permite enumerar todas sus cuentas.
- Sección «Baja de negocio» como procedimiento guiado: (1) identificar tenant/propietario, (2) advertir sobre pagos/pendientes/fotos, (3) exportar e inventariar, (4) comprobar archivo y registrar entrega por WhatsApp fuera de la app, (5) mostrar checklist de cuentas de Authentication que el SuperAdmin gestionará manualmente, (6) verificar rutas conocidas y subcolecciones, (7) preparar purga bajo autorización separada, (8) verificar conteos y ausencia de datos identificados.
- Eliminar Authentication manualmente **no prueba** que ya no existan perfiles o subcolecciones de Firestore. Tampoco habilita automáticamente el borrado: exigir comprobación de alcance, sesiones y respaldo antes de la fase destructiva.
- Firestore **no borra automáticamente subcolecciones** al eliminar el documento padre. El SDK web no enumera subcolecciones desconocidas ni ofrece borrado en cascada atómico. La herramienta actual de inventario es explícitamente parcial.
- Dar una opción real «Preparar eliminación / Ver detalle de limpieza» ahora. Habilitar «Ejecutar eliminación» solo si un procedimiento confiable, exhaustivo, reanudable e idempotente ha demostrado garantías suficientes en Spark para todo el esquema, incluyendo subcolecciones históricas, referencias huérfanas y control de concurrencia. Si no es viable desde el navegador, documentar/automatizar un **procedimiento administrativo supervisado desde entorno confiable** sin desplegar backend, y mantener deshabilitada la purga web. Nunca fingir limpieza completada.
- La herramienta debe usar `businessId` canónico; nunca eliminar por correo, texto libre, wildcard o prefijo. Registros compartidos y de plataforma requieren decisión explícita, no borrado ciego.
- No ejecutar purga real ni eliminar usuarios Auth durante este encargo.

## Bloque G — Revisión de integración y eficiencia (P2)

- Mantener `SessionResources` y el caché por sesión al pasar por Personal, Contratos, POS, Ajustes y SuperAdmin.
- Medir cambios de listeners y lecturas que realmente lleguen a Firestore; no prometer cero lecturas solo porque un componente conserva estado visual.
- Centralizar errores `permission-denied`, `failed-precondition`, `unavailable` y diferencia entre caché y servidor. Los índices nuevos se agregan a `firestore.indexes.json` y se documentan para publicación posterior.
- Verificar reconciliación de los estados de suscripción, tenant, caché y sede tras F5, cambio de usuario y cambios de estado/licencia.
- Conservar UX Tailwind/Radix mejorada; no volver a una migración masiva de CSS.

## Bloque H — Descubrimiento y habilitación manual de índices Firestore (P1)

**Problema verificado:** el repositorio define actualmente **44 índices compuestos** en `firestore.indexes.json` (colecciones `contracts`, `cash_sessions`, `sales`, `payments`, `users`, `invites`, `notifications`, `products`, `daily_stats`, `alerts`, `audit_events` y `platform_jobs`), mientras el propietario observa solo el índice de notificaciones creado en Firebase Console. **Definido en Git != desplegado en Firebase.** Además, los índices automáticos de un campo normalmente no aparecen entre los compuestos y no deben contarse como pendientes.

### H1. Catalogar consultas reales sin gastar lecturas de Firestore

- Auditar los repositorios y hooks **utilizados por el frontend Spark**: `getDocs`, `getDocsFromServer`, `onSnapshot`, `collectionGroup`, `query`, `where`, `orderBy`, `limit`, `startAfter` y variantes. Incluir consultas de autenticación, Personal, invitaciones, sedes, productos, contratos activos/históricos, pagos, caja, ventas, reportes, SuperAdmin y notificaciones.
- Producir un inventario **determinista y regenerable sin conectarse a Firebase**. Se puede implementar un comando local (por ejemplo, `npm run indexes:inventory`) que analice la definición JSON y los patrones de consulta; no hace falta una herramienta pesada ni otro SDK. Inspeccionar manualmente los casos dinámicos que el análisis estático no puede resolver.
- Detectar índices definidos pero sin referencias en el frontend Spark (posibles históricos/legado), consultas que requieren un índice nuevo y duplicados equivalentes. **No eliminar automáticamente** ninguno: podrían estar siendo usados por clientes desplegados o por consultas antiguas.
- Revisar específicamente el índice `users(businessId ASC, role ASC, __name__ ASC)` asociado a Personal y distinguir una falta de índice de un rechazo de Rules. No afirmar que toda consulta con `!=` falla necesariamente: la necesidad exacta depende de sus filtros y ordenamientos.
- Priorizar el inventario por flujo: **P0 Acceso/Personal**, P1 POS/Caja/Contratos, P2 Reportes/Exportación, P3 Administración/legado. Evitar crear 44 índices a ciegas sin validar su uso actual.

### H2. Comparación con el estado publicado

- `firestore.indexes.json` es **estado deseado del código**, no estado remoto. La tabla generada marcará `Definido localmente`, `Requiere validación`, `Posible faltante`, `Confirmado remoto` solo si existe evidencia; el valor predeterminado será `No comprobado en Firebase`.
- Si el propietario proporciona un archivo exportado **solo de lectura** desde su sesión autenticada, compararlo sin credenciales en el repositorio. Comando opcional de consulta (NO deploy):

  ```powershell
  npx firebase firestore:indexes --project migapos --database "(default)" > .release/indexes-publicados.json
  ```

  No ejecutar ni exigir este comando dentro de Codex; alternativamente, el propietario revisa **Firebase Console → Firestore → Índices compuestos**. Tratar la información publicada como privada del proyecto y no incluir secretos ni datos de negocio en informes Git.
- Comparar por **collectionGroup, queryScope, campos en orden, ASC/DESC, arrayConfig y otras opciones de índice pertinentes**, normalizando formatos; conservar `fieldOverrides`. Un índice diferente en orden o ámbito no es necesariamente equivalente.

### H3. Entregable útil para creación manual

- Crear `docs/INDICES-FIRESTORE-MIGAPOS.md`, una sola guía breve pero exhaustiva, con una fila por índice relevante y estas columnas: `Prioridad`, `Módulo/consulta origen`, `Colección`, `Ámbito`, `Campos en orden`, `Estado local`, `Estado remoto`, `¿Crear manualmente?`, `Observaciones`. Indicar con claridad los casos dinámicos no verificados.
- Para cada índice marcado como necesario, detallar exactamente cómo introducirlo en **Firebase Console → proyecto migapos → Firestore `(default)` → Índices → Añadir índice**, con direcciones de campo, ámbito y nombre de colección; cuando proceda, un enlace de error real de Firebase, **sin fabricar URLs `create_composite`**.
- Permitir que el propietario vaya marcando `Pendiente`, `En creación`, `Habilitado` a medida que los crea. **No declarar que un índice ya existe solo porque aparece en Git.**
- Anotar que las construcciones de índice pueden tardar varios minutos; volver a probar la consulta solo al figurar como `Habilitado`.

### H4. Diagnóstico de índice faltante en la aplicación

- Centralizar el manejo de errores de lectura Firestore `failed-precondition`, `permission-denied` y `unavailable` con contexto no sensible del módulo/consulta. Si el SDK devuelve un enlace real a Firebase Console para el índice faltante, **mostrarlo en un diagnóstico para el operador/administrador o en modo desarrollo**, con etiqueta «Crear índice en Firebase Console»; nunca construir el enlace a mano ni mostrar URLs desconocidas como enlaces confiables.
- Si el error carece de enlace, mostrar `Colección + módulo + consulta identificada + campos/dirección` procedentes del inventario, con instrucciones para encontrarlo en la guía. Conservar el error técnico para diagnóstico y un mensaje comprensible al usuario final, sin exponer datos de otros negocios.
- No hacer consultas globales o forzar todos los módulos del POS para provocar errores: el inventario debe funcionar en frío, sin consumo de cuota. El diagnóstico adicional solo se activa cuando **una consulta existente falla**.
- Cualquier índice nuevo detectado debe agregarse a `firestore.indexes.json` y al catálogo, **sin publicarlo**. Confirmar que el código no confunde la falta de índice con la inexistencia de usuarios/licencias o con una lista legítimamente vacía.

### H5. Criterio de cierre

El propietario puede leer la guía, identificar qué índice crear para un fallo concreto y habilitarlo manualmente sin buscar errores en consola. Codex informa cuáles índices están definidos localmente y **cuáles no puede confirmar en remoto**. Ningún índice se crea, publica ni elimina automáticamente.

## Orden de implementación para Codex

1. **Checkpoint A (P0):** F5/invitación/Personal. Un commit autocontenido.
2. **Checkpoint B (P1):** selector/estado de sede/stock/cupo protegido por Rules. Un commit o dos si Rules requiere un cambio independiente.
3. **Checkpoint C (P1):** notificaciones, indicador online y scrollbar del sidebar. Un commit visual.
4. **Checkpoint D (P2):** detalles del negocio, correos vinculados y preparación de baja; **no purga real** hasta garantías técnicas explícitas. Un commit.
5. **Checkpoint E (P1, índices):** inventario reproducible de consultas/índices, diagnóstico `failed-precondition`, guía para crear índices en Console y comparación local/remota opcional. Un commit.
6. Revisar conflictos y documentación. No fusionar ni desplegar; esperar pruebas manuales del propietario.

## Verificaciones acotadas y aceptación manual

No crear suites masivas ni ejecutar todas las históricas; sí realizar verificaciones focalizadas imprescindibles de permisos, concurrencia/cupos y ausencia de borrados:

- Lint, build/PWA y `git diff --check`.
- Casos dirigidos de Auth: primer acceso invitado, F5 con caché, servidor recuperado, cambio de UID y error real.
- Personal: dueño visible, error índice/Rules, suscripción y caché sin listas vacías engañosas.
- Sedes: inactividad en formularios y operaciones, cupos concurrentes, creación/reactivación y perfiles históricos.
- SuperAdmin: roles y scope de datos; funciones destructivas inaccesibles mientras estén bloqueadas.
- Índices: verificar que el inventario local sea legible, que distinga `definido` de `publicado`, que no invente URLs y que `failed-precondition` no se confunda con `permission-denied`. No requerir conexión a Firebase real ni ejecutar consultas de prueba que consuman lecturas.

**Aceptación manual por el propietario:** dueño primer login → Personal → F5 → POS → Personal → activar/desactivar sede → Producto → selectores → SuperAdmin detalle y cupos → inspección de checklist de baja **sin eliminar** → abrir la guía de índices → crear manualmente los prioritarios en Firebase Console → reintentar las consultas afectadas.

## Entregables

- Rama nueva basada en `refactor/ux-rescate-integrado`, nunca en `main` antiguo.
- Commits por checkpoints y una descripción de cambios reales.
- `firestore.rules` / `firestore.indexes.json` preparados, pero **no publicados**.
- Lista de rutas del esquema que el inventario de baja logra cubrir y de las que no puede comprobar.
- `docs/INDICES-FIRESTORE-MIGAPOS.md` y, si aporta valor, un script local reproducible para inventariar los índices sin red; **ningún índice creado remotamente**.
- `docs/MASTER-PLAN.md` actualizado brevemente y referencia a este plan.
- Sin push, merge o deploy automáticos salvo autorización explícita posterior.

## Fuentes técnicas

- Firestore Rules y consultas: https://firebase.google.com/docs/firestore/security/rules-conditions
- Consultas con `!=` e índices compuestos: https://firebase.google.com/docs/firestore/query-data/queries
- Eliminación de documentos/subcolecciones: https://firebase.google.com/docs/firestore/manage-data/delete-data
- Definición y gestión de índices: https://firebase.google.com/docs/reference/firestore/indexes
- Creación manual de índices: https://firebase.google.com/docs/firestore/query-data/indexing
- Comando de consulta `firestore:indexes` (solo lectura): https://firebase.google.com/docs/cli


## Ejecución local · fix/operacion-saas-spark

- A implementado: espera neutral acotada (10 s), invitación verificada con activación explícita y comprobación del perfil desde servidor. Personal consulta solo `businessId ==` (Rules ya autorizan al dueño ese alcance), filtra plataforma al presentar y retiene resultados únicamente en la sesión UID/tenant. Errores/caché bloquean edición y muestran reintento, sin representar un fallo como lista vacía. Se impiden emisiones tardías del caché tras error. 10 controles focalizados de sesión aprobados; lint aprobado. No es diagnóstico de los datos/índices publicados.
- B–E pendientes de implementación en los siguientes checkpoints de esta rama. No se publicó ni modificó Firebase real.


### Checkpoint B · sedes y cupos implementados localmente

Criterio único: solo `status == activo` es operativo; estado ausente/desconocido no autoriza. Selector legible oscuro, con selección normalizada por rol; F5 espera la confirmación inicial también en sedes. Formularios excluyen inactivas y conservan stock histórico; no convierten stock numérico legado. Rules rechazan cambios de stock inactivo y nuevas asignaciones/operaciones financieras; se mantiene el protocolo monetario de hasta dos líneas.

Política visible: un negocio nuevo empieza con 1 sede activa por defecto; SuperAdmin elige 1–100 y puede modificar el límite. `licenses.activeBranchIds` y `branchQuotaVersion:1` son el registro de plazas, actualizado atómicamente con una única transición de sede y verificado por `getAfter`; el dueño nunca cambia `maxActiveBranches`. Inactivas no consumen plaza; no se puede cerrar la última activa. Cada cambio administrativo queda ligado a un receipt inmutable `setTenantBranchQuota`.

Históricos sin cupo conservan operaciones actuales y edición de datos de sede, pero altas/reactivaciones requieren inventario confirmado en el modal SuperAdmin y aceptación explícita de regularización. La lista inicial es una **atestación administrativa**, no prueba web de exhaustividad global; Rules bloquean nuevas altas/estados sin cupo y luego serializan cada plaza. Si el inventario está limitado, contiene estados desconocidos o difiere del registro existente, no se regulariza desde la app.

Inactivación: exige `branchLifecycleVersion:1` y ausencia transaccional del lock canónico de caja/reserva; la apertura concurrente se comprueba contra el estado vigente de sede. Los negocios históricos sin esa marca no pueden inactivarse automáticamente. Antes de asignarla manualmente en Console, un administrador debe revisar en el negocio/sede todas las `cash_sessions` abiertas/reservadas (incluidas antiguas), `active_cash_sessions` y pendientes de cada dispositivo/cuenta con consentimiento; cerrar/resolver por el flujo autorizado y conservar prueba de revisión. No borrar sesiones, stock, pendientes ni fotos, ni marcarla solo porque el lock no existe. Esta intervención no se ejecutó y no se convierte en un botón de migración. Edición de cupo no certifica cierre histórico.

Verificación local B: 12 casos seleccionados en Emulator Suite `demo-migapos` aprobados: carreras de alta/reactivación, slots falsos/cupo propio, caja abierta, stock inactivo conservado, asignación rechazada, última sede, regularización explícita, estados desconocidos y dos recorridos financieros existentes. Lint y build/PWA aprobados. Rules preparadas, **no publicadas**; publicación manual debe preceder al uso real del nuevo protocolo de cupos.

Checkpoint C implementado: conectividad/notificaciones en el encabezado desktop, salida al pie; región de navegación enfocable con scroll nativo y barra fina visible en Firefox/Chromium. CSS especializado reducido, sin restaurar hojas heredadas. Verificación visual manual con el propietario pendiente.
