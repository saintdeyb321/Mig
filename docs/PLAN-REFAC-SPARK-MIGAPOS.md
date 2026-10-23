# MigaPOS — Plan de reencaminamiento a Firebase Spark

**Versión:** 1.1 · **Fecha:** 23-10-2026
**Repositorio:** `saintdeyb321/Mig` · **línea base auditada:** `e92c702` (Fase 10)  
**Proyecto Firebase existente:** `migapos` · **Hosting:** `migapos-peru`  
**Decisión de producto:** **Spark obligatorio**; **sin Blaze, Cloud Functions desplegadas, Cloud Storage for Firebase ni backend de pago**. No se creará otro proyecto Firebase.

> Este plan reemplaza la **arquitectura objetivo** del refactor anterior, no sus datos ni su lógica comercial. Hasta demostrar los invariantes de cada operación, no se habilitarán escrituras financieras inseguras.

## 1. Diagnóstico y motivo del cambio

La aplicación actual arranca con Google Auth y Firestore, pero usa HTTPS Callable Functions como autoridad de operaciones financieras y administrativas. En Spark esas Functions no se pueden desplegar. Publicar `firestore.rules` no instala el backend y explica que `createTenant`, `getTenantAdministration`, `getLegacyContractPayments`, `submitSale` u `openCashSession` fallen con errores de red/CORS. Agregar `Access-Control-Allow-Origin`, cambiar la región, desactivar CORS o abrir reglas **no arregla** el origen.

**Restricción adicional vigente desde el 03-02-2026:** Cloud Storage for Firebase exige Blaze, incluso para el bucket predeterminado. Contratos con imágenes y backups en Storage necesitan otra solución.

**Servicios que conservamos:** Firebase Authentication (Google), Cloud Firestore, Firebase Hosting estático, reglas, índices, React/Vite/PWA, Dexie/IndexedDB, reportes y exportaciones locales. **Servicios que salen del camino operativo en Spark:** Cloud Functions desplegadas, triggers/scheduler, Firebase Admin SDK en producción, Cloud Storage, jobs de backup/purga server-side, Cloud Run y extensiones de pago.

**Cuotas orientativas de Firestore sin facturación:** 1 GiB almacenado, 50 000 lecturas/día, 20 000 escrituras/día y 20 000 eliminaciones/día. Verificar siempre cuotas actuales en Console. Spark puede suspender el servicio al exceder cuota; no es una garantía de escala gratuita ilimitada.

### Errores observados en la interfaz

| Síntoma | Diagnóstico | Tratamiento |
|---|---|---|
| CORS a `/getTenantAdministration`, `/createTenant`, `/getLegacyContractPayments` | Frontend invoca Functions que Spark no soporta en Firebase | Sustituir adaptadores por flujos Firestore seguros; no parchear CORS |
| Categorías/agenda `permission-denied` | El perfil `superadmin` de `platform-admin` no es el dueño de un tenant operativo | Separar UI/plataforma de contexto de negocio; nunca ampliar reglas globales por comodidad |
| Índice de `notifications` pendiente | Requiere desplegar índices, no solo Rules | Publicar exclusivamente índices faltantes, previa revisión |
| Mismo correo SuperAdmin como dueño | `createTenant` impide invitación si el email ya existe en `users` | Primero cuenta de dueño separada; preparar modelo de membresías multi-contexto en fase posterior |
| Logo no carga/PWA anterior | Asset existe; URL y caché deben verificarse | Diagnóstico Network/SW sin borrar IndexedDB |
| Cloud Storage para imágenes | No operativo en Spark | Rediseñar adjuntos con límites y degradación explícita |

## 2. Principios no negociables

1. **No degradar seguridad:** nunca `allow write: if request.auth != null`, `allow read: if true` para datos internos ni confiabilidad financiera basada solo en campos enviados por React.
2. **No confiar en la UI:** roles, `businessId`, sede, estados, precios/costos, inventario, autorizaciones y licencias deben validarse en Security Rules y/o un diseño verificable por ellas.
3. **Conservar invariantes:** venta y stock consistentes; pagos/refunds firmados; caja y conciliación; idempotencia; historial; restricciones de tenant; recuperación de cola offline.
4. **No usar `service_account.json` en frontend, Hosting, `.env` Web o repositorio.** El rol inicial `superadmin` se aprovisiona manualmente en Firebase Console y las Rules impiden autoescalada.
5. **Sin borrados ni migraciones automáticas de información real.** Compatibilidad de lectura durante la transición, con rollback por funcionalidad.
6. **No simular confirmaciones:** una operación offline es **pendiente** hasta aceptación de Firestore; no imprimirla como confirmada ni descontar stock remoto sin transacción aceptada.
7. **No repetir 328 tests en cada cambio:** validar un flujo manual y un pequeño conjunto de checks de Rules/consistencia enfocados al código modificado. El control de seguridad no se omite por rapidez.
8. **No llamar a `cloudfunctions.net` en el modo Spark operativo.** Los adaptadores fallan claramente si una operación todavía no fue migrada.
9. **Ningún deploy sin autorización explícita**, aunque Hosting y Firestore estén disponibles en Spark.
10. **Anunciar las limitaciones reales:** no prometer equivalencia de seguridad/automatización con un servidor confiable donde Firestore Rules no pueda garantizarla.

## 3. Límite técnico decisivo: Firestore Rules no es un backend general

Firestore permite transacciones/batches atómicos, validación por Rules y `getAfter()` para comprobar documentos relacionados. **Pero Rules no ejecuta lógica arbitraria, no recorre cualquier número de líneas de una venta, no firma tiempos offline, no envía trabajos programados y limita los accesos**: hasta 10 `get/exists/getAfter` por operación y 20 por transacción/batch (algunos accesos pueden cachearse).

Antes de habilitar `submitSale` en Spark debemos demostrar, con **un prototipo acotado y adversarial**, que las Rules garantizan precio canónico, cantidad, stock, no duplicación, venta completa y alcance por tenant/sede para un ticket realista. No basta con transcribir `functions/src/sales/handlers.js` a React.

**Decisión de seguridad:** si una venta de N líneas no puede comprobarse íntegramente en Rules, limitar explícitamente el tamaño/alcance soportado y mostrar una restricción honesta. No aceptar una venta multi-item parcialmente verificada. Si no es posible conservar alguna garantía fundamental en Spark puro, documentar `BLOQUEO ARQUITECTÓNICO` antes de modificar datos financieros; ofrecer como alternativa futura un backend confiable externo opcional, **nunca como requisito de estas fases**.

### Contrato objetivo mínimo de una operación

- **Documento inmutable** e ID de operación único; crear solo si no existía, reintentos devuelven confirmación del mismo documento.
- **Tenant y sede** derivados de `request.auth.uid` y membresía persistida; ninguna reasignación por payload.
- **Precios** leídos de productos autorizados; cambios de catálogo/stock concurrentes se resuelven transaccionalmente o se rechazan.
- **Stock** no negativo y actualizado con semántica ligada a la venta; sin doble descuento ni devolución doble.
- **Pagos** movimientos firmados con relación al contrato/caja; sin ediciones retroactivas de importes.
- **Fechas**: `request.time` para aceptación remota; hora del dispositivo es metadato informativo, no comprobante de creación offline.
- **Reportes** derivados de movimientos confirmados; si no hay agregado seguro, usar consultas paginadas/acotadas antes que contadores manipulables.

## 4. Arquitectura objetivo Spark

```text
React / Vite / Firebase Hosting (migapos-peru)
  ├─ Google Authentication
  ├─ Perfil de plataforma y membresías de negocio
  ├─ Módulos POS, contratos, caja, catálogo, reportes
  ├─ Repositorios Firestore + transacciones controladas
  ├─ IndexedDB / Dexie: cola offline cifrada, reintentos, revisión
  ├─ Exportaciones CSV/XLSX y backup manual local
  └─ Imágenes: miniaturas Firestore acotadas o almacenamiento local explícito
                   │
                   ▼
        Firestore (migapos/(default))
          ├─ Security Rules estrictas, getAfter cuando proceda
          ├─ Índices y consultas compatibles con Rules
          ├─ Operaciones inmutables e idempotentes
          └─ Tenant/branch isolation
```

**Importante:** eliminar las Functions desplegadas como dependencia **no significa borrar el código de dominio**. Conservar `functions/src/.../domain` y los cálculos verificables mientras se extraen gradualmente a módulos puros compartidos. El código del servidor anterior sirve como especificación, no como autorización client-side.

## 5. Mapa de migración por módulo (basado en `main`)

| Módulo | Ruta actual / dependencia | Destino Spark |
|---|---|---|
| Configuración | `frontend/src/core/firebase/client.js`, `config/environments.js`, `vite.config.js` | `VITE_APP_ENV=production`, Auth y Firestore; Storage/Functions excluidos de runtime Spark |
| SuperAdmin | `features/licenses/infrastructure/administrationRepository.js`, `hooks/useSuperAdmin.js` → callables | Lectura paginada y provisioning mediante batch Firestore con Rules solo `superadmin` |
| Licencias y tenant | `functions/src/platform/{access,administration}.js` | Documentos `tenants`, `licenses`, `branches`, `settings`, `invites` con reglas específicas y `getAfter()` si cabe en límites |
| Roles e invitaciones | `firestore.rules`, `features/users/infrastructure/userRepository.js`, `hooks/useAuthManager.js` | Bootstrap manual del único admin, invitación con email verificado, dueño/cajero protegidos; luego membresías |
| Menús/contexto | `App.jsx`, `BottomNav.jsx`, `TenantProvider.jsx` | Separar SuperAdmin del contexto operativo; no montar listeners de una empresa ficticia `platform-admin` |
| Catálogo y agenda | `features/catalog`, `features/customers` | Mantener Firestore directo; validar que los writes corresponden a un dueño de tenant activo |
| Caja | `features/cash-register/infrastructure/cashRegisterRepository.js` → callables | Transacciones Firestore con bloqueo de sesión, apertura/cierre/reconciliación y límites verificables |
| Ventas y stock | `features/sales/infrastructure/saleTransactions.js` → `submitSale`, `voidSale` | Protocolo de escritura atómica y validado por Rules; primero una prueba de factibilidad de ticket multi-producto |
| Offline | `features/sales/application/saleQueue.js`, `offlineDB.js` | Conservar cola cifrada por identidad/tenant; confirmar solo tras write remoto; conflictos a revisión |
| Contratos y pagos | `features/contracts/infrastructure/contractRepository.js`, `features/payments/infrastructure/paymentRepository.js` → callables | Operaciones Firestore inmutables, paginadas, idempotentes y protegidas contra refund falso |
| Reportes | `features/reports`, `daily_stats`, `payments`, `sales` | Proyecciones a partir de datos confirmados; evitar contadores alterables y lecturas globales |
| Notificaciones | `notificationQueryRepository.js`, `firestore.indexes.json`, triggers de `functions/src/index.js` | Índices publicados; mensajes creados por operaciones válidas o indicación explícita de funcionalidad no automática |
| Fotos/adjuntos | `features/contracts/infrastructure/contractImages.js` → Firebase Storage | Imagen pequeña optimizada en Firestore solo con tamaño total seguro y validación; originales locales con advertencia de no sincronización; sin prometer 20 fotos de 5 MB |
| Backups, jobs y purge | `hooks/useAdminBackup.js`, `functions/src/platform/jobs.js` | Exportación manual paginada/autorizada y verificación local; purga automática queda deshabilitada hasta solución segura |
| Hosting, release | `firebase.json`, `scripts/release.mjs`, workflow | Protocolo seguro **solo Hosting + Rules + índices**, sin Cloud Functions ni Storage |

## 6. Ejecución por fases cortas

### SPARK-0 — Congelar el contrato y eliminar confusión de entornos

**Resultado:** `migapos` reconoce inequívocamente modo Spark; ninguna vista simula que hay Cloud Functions operativas.

- Crear capa explícita `runtimeCapabilities` y estrategia de repositorios `spark` (no llamar `httpsCallable()` en flujo Spark). No utilizar flags inseguros por usuario o localStorage.
- Mantener `frontend/.env.local` real sin tocarlo; no exponer ni requerir cuenta de servicio.
- Desacoplar `App.jsx`, `BottomNav.jsx`, `TenantProvider.jsx` para que rol `superadmin` no intente POS/categorías/agenda de `platform-admin`.
- Inventariar todas las llamadas a Functions y Storage; marcar flujo bloqueado con mensaje legible, sin llamadas de red fallidas en bucle.
- Asegurar que URLs estáticas de branding funcionen y el SW no sirva una versión incompatible; nunca limpiar IndexedDB por defecto.
- **Salida:** UI SuperAdmin utilizable para el siguiente módulo, navegación limpia, build sin dependencias ocultas del backend.

**Aceptación manual:** login SuperAdmin, abrir módulo SaaS; cero requests a `cloudfunctions.net` en esa vista; sin pérdida de datos locales.

### SPARK-1 — SuperAdmin y creación real de empresas **(primer desbloqueo de negocio)**

**Resultado:** crear `MigaPOS Laboratorio` desde el panel y ver su licencia y sede sin Functions.

- Leer licencias/tenants directamente con paginación; manejar indexación y estados vacíos.
- Crear tenant, licencia, sede principal, settings e invitación de dueño en **una operación atómica**. Asegurar idempotencia de `operationId`, unicidad de email de dueño dentro de las restricciones del modelo y falla sin residuos si ya existe.
- Endurecer Rules `tenants`, `licenses`, `branches`, `settings`, `invites`, `platform_operations` para esta operación **solo SuperAdmin autorizado**, validando documentos relacionados sin exceder límites de Rules. Nadie puede concederse `superadmin`.
- Conservar `businessId` y roles actuales para lectura; no destruir perfiles existentes.
- `createTenant` con el mismo correo del SuperAdmin sigue **explícitamente rechazado** bajo el modelo `users/{uid}` único; usar temporalmente otro correo de dueño. Diseñar membresías múltiples en una fase separada, no modificar silenciosamente identidad/rol.
- No implementar aún backups/purgas ni escrituras financieras.

**Aceptación manual:** SuperAdmin crea negocio con Gmail diferente, aparece sede y licencia; propietario acepta invitación con Google; cuenta ajena no puede crearse tenant ni cambiar licencia.

### SPARK-2 — Catálogo, sedes, usuarios, agenda, índices

**Resultado:** dueño crea categorías, productos, contactos y usuarios dentro de su tenant.

- Corregir `permission-denied` reales revisando query vs Rules y `businessId` activo; no permitir `superadmin` escribir como dueño de otro tenant.
- Publicar/revisar índices necesarios, en particular `notifications` (`businessId`, `userId`, `readAt`, `createdAt DESC`).
- Conservar precios, stock por sede, esquema de productos y datos existentes.
- Revisar límites de lectura de listeners; sin suscripciones de tenant anterior tras logout.

**Aceptación manual:** dueño crea categoría + producto + contacto, y nada aparece bajo otro tenant.

### SPARK-3 — Caja + factibilidad de ventas (puerta de seguridad)

**Resultado:** apertura de caja real en Firestore y diseño de venta segura demostrado antes de habilitar botones de cobro.

- Trasladar dominio de caja (validaciones, snapshots, bloqueo por sede, timestamps y cierre) a funciones puras reutilizables.
- Diseñar Rules y transacciones para `cash_sessions`, `active_cash_sessions` y operación de apertura; usar `request.time`, IDs estables y campos inmutables.
- Probar un **prototipo adversarial mínimo** de venta con varios productos: precios falsos, tenant cruzado, stock negativo, payload incompleto, doble submit y condiciones de carrera. Medir accesos `getAfter` y límites de batch.
- Definir el máximo de líneas por ticket verificable bajo Spark. Si el ticket completo no puede validarse, **no activar venta real todavía**: documentar el bloqueo y decidir un protocolo compatible.
- Mantener solo un camino de operación para evitar dobles descuentos.

**Aceptación manual:** abrir caja, persistir estado y recargar. La venta solo se habilita tras pasar la puerta de factibilidad, no por apariencia de UI.

### SPARK-4 — POS real, anulación y offline

> **Decisiones de la puerta SPARK-3 (23/10/2026, base `4a513df`):** SPARK-1/2 y apertura online de caja implementadas y validadas localmente; publicación y aceptación manual aún pendientes. Alta atómica con recibo y reserva permanente de correo; para usuarios históricos sin reserva, preflight de email como SuperAdmin y prohibición absoluta de sobrescribir su perfil. Rules no puede reemplazar esa consulta por una búsqueda de email global.
>
> Las sedes nuevas incorporan `sparkCashVersion: 1` inmutable. El candado conserva `SHA-256(JSON.stringify([businessId, branchId]))`, comprobado también en Rules. Una sede histórica sin marcador conserva lectura y exige una revisión posterior antes de abrir; no se habilita por una escritura libre de React ni se borran sesiones/candados/IndexedDB. Confirmación de apertura con Timestamps de servidor; lectura compatible con ISO anteriores. El cierre no está implementado en Spark todavía.
>
> Catálogo: mapa de stock existente, validación acotada a 6 sedes por producto y transacción para detectar ajustes concurrentes. Prototipo de venta **solo en emulador**: máximo 2 productos por ticket online, todos los renglones y descuentos vinculados al receipt, importes/costos canónicos, efectivo/Yape/mixto, idempotencia y concurrencia probadas. Las variantes iniciales de 3/4 líneas alcanzaron el límite de 1000 expresiones. **BLOQUEO ARQUITECTÓNICO del POS general sin límite/offline** hasta diseñar y validar su protocolo: la alternativa Spark demostrada es el ticket online de 2 productos con límite visible. No extrapolar equivalencia a tickets mayores ni publicar las Rules del prototipo. SPARK-4 debe integrar el diseño con catálogo, conservar el dominio/cola y repetir los casos adversariales antes de activar ventas; `financialOperations` y `offlineSync` permanecen OFF.
>
> Referencias: [accesos y atomicidad de Rules](https://firebase.google.com/docs/firestore/security/rules-conditions), [hashing](https://firebase.google.com/docs/reference/rules/rules.hashing). Detalle de estados, pruebas y pasos manuales en `MASTER-PLAN.md`.

**Resultado:** flujo completo caja → venta → stock → historial → anulación, sin Functions.

- Implementar venta atómica/limitada conforme al protocolo aprobado en SPARK-3, receipt inmutable e idempotencia.
- Al anular, registrar movimiento compensatorio único, restaurar stock una sola vez; no editar historial original.
- Conservar Dexie, cifrado, leases, retry, separación por usuario/negocio y cola recuperable.
- Venta desconectada = **pendiente**, nunca respaldada por un timestamp inventado; al reconectar, validar estado real de precios, licencia, caja, stock y permisos. Rechazos quedan para revisión.
- Evitar que un SW antiguo o cambio de cuenta recicle ventas de otra identidad.

**Aceptación manual:** ticket efectivo, ticket mixto, desconexión/reconexión, una anulación y stock consistente; sin escrituras fuera de tenant.

### SPARK-5 — Contratos, cuotas, refunds y cierre de caja

**Resultado:** crear contrato, registrar adelanto, cuota posterior, cancelación y refund verificable.

- Extraer la lógica del ledger actual sin cambiar el signo ni el significado de cada importe.
- Diseñar esquema de movimientos inmutables por operación y reglas para `contracts`, `payments`, `cash_sessions` sin confiar en `paidTotal` arbitrario del cliente.
- Mantener soporte de datos legacy y distinguir migración de vista de migración de datos.
- Conciliación y cierre no permiten alterar pagos ya confirmados; reintentos no duplican abonos.
- Activar solo los escenarios cuyos invariantes se pueden verificar dentro de Rules.

**Aceptación manual:** contrato con anticipo, nueva cuota, reembolso/cancelación, caja cuadra, otro tenant no puede consultar ni modificar.

### SPARK-6 — Reportes, alertas, imágenes y límites de Spark

**Resultado:** resumen diario/histórico razonable y módulos sin llamadas a Storage/Functions.

- Reportes/Excel desde movimientos validados, filtros e índices, paginación y límites de cuota. No persistir agregados que cualquier navegador pueda falsificar.
- Alertas creadas dentro de operaciones autorizadas cuando sea seguro; sin prometer scheduler ni avisos server-side automáticos.
- Eliminar dependencia operativa de `firebase/storage` en contratos. Implementar **solo** miniaturas muy pequeñas con límites totales/documentales en Firestore, o adjuntos locales en IndexedDB con advertencia explícita: no disponibles en otros dispositivos. Un documento Firestore no puede superar 1 MiB; evitar base64 originales.
- Marcar imágenes legacy de Storage como no disponibles en Spark si no hay acceso a sus objetos. No borrar referencias ni fingir recuperación.

**Aceptación manual:** reportes coherentes con tickets y pagos reales; exportar Excel; imprimir contrato con imagen compatible sin 402/403 de Storage.

### SPARK-7 — Backups, operación de plataforma y publicación controlada

**Resultado:** operación Spark utilizable y limitaciones de mantenimiento transparentes.

- Sustituir backup cloud autónomo por exportación **manual, paginada y tenant-scoped** desde navegador autorizado, con manifiesto, checksums y descarga local. Diferenciar esto de una copia server-side íntegra o recuperable automáticamente.
- Deshabilitar de forma explícita **purga masiva automática**, restauración privilegiada y jobs programados sin backend. No implementar «borrar todo» client-side como falsa alternativa.
- Rehacer release para Hosting + Rules + índices sin desplegar Functions/Storage ni enganchar hooks que exigen esas capacidades. Conservar guardas de proyecto y exigir confirmación de `migapos`/`migapos-peru`.
- Revisar índices, cuotas, reglas, roles, rutas antiguas, PWA y compatibilidad con usuarios ya existentes.
- QA manual guiado con tenant ficticio y operaciones **deliberadamente reales en `migapos`**, precedido de backup disponible y consentimiento explícito sobre el entorno.

**Aceptación manual:** navegar todas las áreas soportadas sin errores permanentes; crear/cerrar negocio de laboratorio; datos correctos; operaciones no soportadas deshabilitadas de forma honesta.

## 7. Riesgos, límites y decisiones que deben verse en el producto

| Riesgo | Decisión |
|---|---|
| La lógica de autorización financiera no cabe en Rules | No abrir permisos; limitar producto/operación o detener fase para replantear protocolo |
| Tickets multi-producto arbitrariamente extensos | No prometer soporte sin demostrar integridad y límites de reglas |
| Offline puede falsificar hora de creación | Mostrar pendiente, validar al sincronizar y escalar anomalías a conciliación |
| Dashboard de grandes volúmenes | Paginar/acotar intervalos; vigilar 50k reads/día Spark |
| Adjunto grande/cross-device | No soportarlo en Spark puro sin otra infraestructura; miniaturas limitadas o local no sincronizado |
| Backend jobs, backups automáticos, borrado programado | No disponibles con Spark puro; operación manual acotada y declarada |
| Mismo Gmail SuperAdmin y dueño | Requiere modelo de contextos/membresías con autorización robusta; usar segundo Gmail temporalmente |
| Datos ya creados durante F1–F10 | No borrar, convertir ni migrar a ciegas; usar lectura compatible y cambio incremental |
| URLs/Rules ya publicadas | No cambiar producción antes de revisión de diff, autorización y reversión por fase |
| Cloud Functions/Storage en SDK cliente | Retirar importaciones/calls del runtime Spark según fases; no solo ocultar un error de consola |

## 8. Forma de trabajar con Codex (rápida y controlada)

- **Una fase por prompt y un commit por fase.** Codex lee este archivo y solamente los módulos de esa fase.
- No iniciar cada fase con auditoría completa ni correr 328 tests. Ejecutar `npm run lint --prefix frontend`, `npm run build --prefix frontend`, `git diff --check` y **2–5 comprobaciones relevantes** (Rules/invariantes) cuando haya escrituras protegidas. Ninguna prueba de permisos se reemplaza por «funciona en mi navegador».
- Después de cada fase, el usuario realiza **1–3 operaciones manuales reales** en un tenant de laboratorio; registrar errores observados con ruta, operación y código, no un log masivo.
- No usar service accounts en React y no automatizar despliegues. La validación de Roles/Rules se realiza antes de publicar una nueva política.
- Mantener `docs/MASTER-PLAN.md` como registro histórico; añadir sección **«Cambio de arquitectura: Spark obligatorio»** que referencie este plan. No reescribir ni borrar la historia F0–F10; marcarlas como «implementadas para Functions, incompatibles con Spark» donde corresponda.
- Actualizar checklist/estado: `SPARK-0`…`SPARK-7` con `PENDIENTE`, `EN PROGRESO`, `BLOQUEADA`, `VALIDADA MANUALMENTE`.
- Entrega Codex ≤8 líneas: commit, archivos clave, operación manual disponible, riesgos y pasos restantes.

## 9. Primer encargo exacto a Codex — SPARK-0

> **SPARK-0, solo arquitectura de arranque y UI:** toma `main` de `saintdeyb321/Mig` (`e92c702` de base). Lee `docs/MASTER-PLAN.md` y `docs/PLAN-REFAC-SPARK-MIGAPOS.md`. No crear otro Firebase, no Blaze, no Functions ni Storage en runtime Spark, no deploy, no tocar `.env` ni base de datos real. Implementa una configuración `spark` explícita, aísla adaptadores que hoy llaman `httpsCallable` o `firebase/storage` con fallos amigables en las funciones aún no migradas; separa SuperAdmin de los providers/contextos de negocio y oculta POS, categorías, agenda, contratos, caja y reportes en contexto `platform-admin`. No aflojes `firestore.rules`; no alteres dominio financiero, colas Dexie ni datos persistidos. Verifica que login + panel SaaS no produzcan llamadas a `cloudfunctions.net` y que el índice de notificaciones no se consulte como tenant ficticio. Revisa estáticos/logo/PWA sin borrar IndexedDB. Registra inventario de llamadas y las nuevas fases en `docs/MASTER-PLAN.md`, referenciando este plan; no borres la historia F1–F10. Valida solo lint, build, diff-check y checks focalizados. Entrega ≤8 líneas y detente; el siguiente encargo será `SPARK-1` (crear tenant/licencia/invitación vía Firestore transaccional y Rules estrictas).

## 10. Fuentes técnicas oficiales consultadas

- Plan Spark y restricciones: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Storage requiere Blaze desde 2026: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Reglas, `getAfter()` y límites 10/20: https://firebase.google.com/docs/firestore/security/rules-conditions
- Cuotas Firestore: https://firebase.google.com/docs/firestore/pricing
- Límite por documento (1 MiB): https://firebase.google.com/docs/firestore/quotas

**Estado actual (base `f5ee85d`, SPARK-4–6):** POS online operativo localmente con límite visible de 2 productos, versiones `posStockVersion[branchId]`, Rules principales y receipt inmutable; el fixture escalar fue retirado. Cola cifrada intacta: proceso aislado del nuevo ID online, revisión/consulta de receipt sin nuevo cobro; sincronización offline y anulación POS deshabilitadas por falta de protocolo de tiempo/compensación integral demostrado.

Contratos Spark nuevos: anticipo/cuotas/edición/entrega/cancelación por dueño y refunds idempotentes por neto de método, con ledger inmutable y proyección vinculada por Rules. Operaciones en sede de origen; cobros/devoluciones con caja propia abierta, datos comerciales/entrega sin cobro no exigen caja; históricos solo lectura, sin migración automática. Cierre Spark operativo/forzado por dueño libera candado y bloquea movimientos nuevos; `reconciliationPending: true`, estimación de navegador claramente no certificada. Conciliación privilegiada y ramas históricas sin marcador conservan bloqueo.

Reportes/Excel desde documentos confirmados y fechas de servidor, estados de pedidos del período, consultas paginadas de 200 con máximo 10000 movimientos; compatibilidad embebida limitada explícitamente a 500 contratos por negocio, sin omitir silenciosamente inconsistencias. Sin agregados client-side persistidos ni polling financiero continuo. Alertas informativas ligadas atómicamente al movimiento, dirigidas a su actor. Fotos locales comprimidas, hasta 20 referencias pequeñas, 256 KiB + 64 KiB por imagen, IndexedDB por identidad; sin blobs/base64 en Firestore ni promesa de sincronización. Referencias antiguas se conservan y se imprime sin foto cuando no está disponible.

SPARK-4/5 validadas localmente en este alcance seguro con restricciones anteriores; SPARK-6 validada localmente. Rules integradas y comprobaciones de cola/imágenes en Chromium aprobadas; lint/build/diff-check registrados en `MASTER-PLAN.md`. Publicación de Rules/índices y aceptación manual pendientes; SPARK-7 pendiente. Se conserva `migapos`/`migapos-peru`, sin deploy ni datos reales. Las decisiones históricas de SPARK-3 y F1–F10 anteriores no habilitan Functions/Storage ni autorizan operaciones restringidas.
