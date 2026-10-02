# MASTER PLAN — Refactor integral de MigaPOS

## Propósito

Este documento es la referencia maestra de todo el proceso de refactorización de MigaPOS.

Debe ser leído por cualquier agente antes de ejecutar una fase, incluso si la tarea solicitada corresponde únicamente a una fase concreta.

El objetivo es evitar que:
- se pierda el contexto entre sesiones;
- se adelanten cambios pertenecientes a fases posteriores;
- se creen soluciones temporales incompatibles con la arquitectura objetivo;
- se repitan auditorías ya realizadas;
- una fase rompa el trabajo que otra necesita.

---

# Flujo de trabajo obligatorio

El proyecto se trabajará de forma iterativa.

Para cada fase:

1. GPT/Codex/Sol recibe únicamente el prompt de la fase actual.
2. El agente lee únicamente este documento, la única fuente permanente de contexto del proyecto.
3. Ejecuta SOLO esa fase.
4. Ejecuta lint/build/tests correspondientes.
5. No despliega producción salvo autorización explícita.
6. El usuario revisa y sube los cambios a Git.
7. El repositorio actualizado es auditado nuevamente.
8. Se detectan:
   - regresiones;
   - trabajo incompleto;
   - nuevas dependencias;
   - cambios necesarios al plan.
9. Solo después de aprobar la fase se genera el prompt de la siguiente.

Ninguna fase debe darse por finalizada únicamente porque compile.

---

# Estado de fases

Usar esta tabla como control de avance.

| Fase | Nombre | Estado inicial |
|---|---|---|
| 0 | Auditoría inicial | COMPLETADA |
| 1 | Foundation: repositorio, env y Firebase CLI | COMPLETADA |
| 2 | Seguridad SaaS multi-tenant | COMPLETADA |
| 3 | Arquitectura React y Data Layer | COMPLETADA |
| 4 | Ventas, inventario y motor offline | COMPLETADA |
| 5 | Contratos, pedidos y ledger de pagos | PENDIENTE |
| 6 | Caja, alertas y auditoría | PENDIENTE |
| 7 | Reportes, dashboard y Excel | PENDIENTE |
| 8 | Licencias, SuperAdmin, backups y borrado | PENDIENTE |
| 9 | Branding MigaPOS y limpieza general | PENDIENTE |
| 10 | Tests, CI, observabilidad y release | PENDIENTE |

Este estado debe actualizarse a medida que se aprueben fases.

---

# FASE 0 — Auditoría inicial

## Estado

COMPLETADA.

## Objetivo

Analizar el repositorio existente y detectar:
- fallos de seguridad;
- problemas de arquitectura;
- errores financieros;
- consumo innecesario de Firebase;
- duplicaciones;
- problemas offline;
- problemas de reportes;
- problemas de licencias;
- alertas;
- borrado;
- deuda técnica;
- branding heredado.

## Hallazgos principales

### Seguridad
- lecturas Firestore con aislamiento multi-tenant insuficiente;
- creación de usuarios demasiado permisiva;
- autorización dependiente del frontend;
- licencias bloqueadas principalmente en React.

### Firebase
- configuración hardcodeada;
- reglas e índices duplicados;
- proyecto Firebase CLI no alineado con la app;
- artefactos generados versionados.

### Offline
- descifrado sin UID en flujos del contexto;
- posible inconsistencia de stock por sucursal;
- retry no idempotente;
- pagos mixtos offline inconsistentes con online.

### Reportes
- consultas repetidas de contratos;
- cache incompleto;
- doble conteo/resta de anulaciones;
- esquemas incompatibles en Excel;
- histórico dependiente de `updatedAt`.

### Contratos
- pagos embebidos en arrays;
- imágenes Base64 dentro de Firestore;
- consultas que crecen con el historial.

### Caja
- riesgo de más de una caja abierta;
- cierre consulta contratos completos;
- autocierre dependiente de cliente.

### Alertas
- `read` global;
- listeners sin límites suficientes;
- mezcla de auditoría con notificación;
- eventos esperados por UI que no siempre se generan.

### Borrado
- borrado ejecutado desde frontend;
- colecciones omitidas;
- operación no reanudable ni idempotente.

## Regla

Los hallazgos de Fase 0 son el contexto base de todas las fases posteriores.

---

# FASE 1 — Foundation: repositorio, entornos y Firebase CLI

## Objetivo

Limpiar el terreno antes de tocar seguridad o reglas de negocio.

## Incluye

- `.gitignore`;
- `.env.example`;
- configuración Firebase Web vía env;
- validación de env;
- organización de `firebase.js`;
- consolidación Firebase CLI;
- proyecto Firebase correcto;
- Hosting target;
- rules/indexes oficiales únicos;
- limpieza de `dev-dist`;
- limpieza npm raíz/frontend;
- branding técnico básico;
- documentación de setup.

## No incluye

- nuevas Security Rules;
- Claims;
- Functions;
- reportes;
- ventas;
- offline;
- contratos;
- caja;
- alertas.

## Criterio de aprobación

Fase 1 se aprueba únicamente cuando:
- build funciona;
- lint no empeora;
- no hay config Firebase activa hardcodeada;
- los env locales no se versionan;
- `.env.example` existe sin valores reales;
- no hay artefactos generados trackeados;
- rules/indexes tienen una sola fuente oficial;
- estructura npm queda clara;
- Firebase project/Hosting queda correctamente preparado;
- no se ejecutó deploy no autorizado.

## Dependencia

Ninguna fase posterior de backend/seguridad debe empezar hasta aprobar esta fase.

---

# FASE 2 — Seguridad SaaS multi-tenant

## Objetivo

Convertir MigaPOS en un SaaS realmente aislado por tenant.

Esta fase es crítica.

## Problemas a resolver

- `allow read: if isAuth()` demasiado amplio;
- dependencia en roles almacenados en documentos manipulables;
- permisos frontend tratados como seguridad;
- lectura entre empresas;
- escritura de campos sensibles;
- licencias sin enforcement server-side.

## Trabajo

### Identidad
Usar `users/{uid}` protegido como fuente de identidad y autorización server-side en esta fase. Los roles canónicos son `superadmin`, `dueño` y `cajero`. Ningún usuario puede autoasignarse privilegios ni escoger un tenant durante el registro: el perfil nace de su invitación autenticada. La migración a Custom Claims o un backend equivalente se abordará posteriormente.

### Firestore Security Rules
Toda colección del tenant debe validar:
- usuario autenticado;
- tenant;
- rol;
- campos permitidos;
- invariantes de escritura.

### Usuarios
El cliente no podrá:
- autoasignarse `superadmin`;
- cambiar `businessId`;
- modificar claims;
- elevar rol.

### Plataforma
Separar claramente:
- usuario de tenant;
- owner/admin;
- platform superadmin.

### App Check
Pendiente del hardening posterior hasta contar con configuración real. No inventar site keys ni usar App Check como sustituto de Security Rules.

### Storage
Crear/revisar Storage Rules.

### Emulator tests
Agregar pruebas:
- tenant A → tenant A: permitido;
- tenant A → tenant B: denegado;
- cajero → operaciones administrativas: denegado;
- owner → operaciones autorizadas;
- role escalation: denegado.

## Criterio de aprobación

No se aprueba hasta demostrar mediante tests que un tenant no accede a otro.

## Implementación de Fase 2

- Firestore usa exclusivamente el perfil protegido `users/{uid}` para roles/tenant. Un perfil sin `status` conserva compatibilidad como activo; `inactivo` revoca el acceso de negocio. Los privilegios enviados en el token o el payload no autorizan operaciones.
- El registro requiere email verificado e invitación exacta. Tenant, rol, sede, turno y status provienen de ella. No existe bootstrap de superadmin desde el cliente; las cuentas de plataforma deben provisionarse por un mecanismo confiable.
- Email, tenant y fecha de creación no se sobrescriben al editar personal. La edición propia admite nombres y aceptación de términos con timestamp del servidor, sin modificar campos administrativos.
- Las escrituras de stock del cajero afectan únicamente su sede. Ventas, agregados y cajas requieren tenant/sede permitidos; la anulación conserva identidad, importes e items. Los contratos mantienen acceso entre sedes del mismo negocio.
- Ventas valida lista no vacía, tenant, actor, sede, total y fecha, sin máximo artificial de líneas. La semántica completa de items y la integridad matemática de ventas/agregados quedan para Fase 4, junto con la idempotencia offline. Contratos admite `entregado_con_deuda`, incluido el regreso a `entregado` al saldar la deuda.
- Settings utiliza el ID del documento como tenant canónico para compatibilidad con documentos antiguos sin `businessId`; al guardar se añade únicamente ese tenant. Los caches de UI se filtran por tenant y el contexto se reinicia al cambiar identidad/permisos.
- `storage.rules` deniega todos los accesos hasta la migración de imágenes de Fase 5. App Check queda pendiente de configuración real. No se desplegaron reglas ni se modificaron datos reales.

## Pruebas de seguridad

El paquete raíz es tooling únicamente: `firebase-tools` y `@firebase/rules-unit-testing`, con su lockfile. Firebase SDK se instala como peer de la biblioteca de tests; el runtime React continúa exclusivamente en frontend. Se requiere Node compatible y Java 21+ disponible en PATH. Para esta validación se descargó un JRE portátil oficial con checksum verificado en la carpeta temporal, sin instalarlo en el sistema.

```powershell
npm ci
npm run test:rules
npm run test:architecture
npm ci --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
git diff --check
```

`test:rules` inicia Firestore y Storage en localhost con `demo-migapos`; el harness rechaza ejecutarse sin los hosts locales esperados. Los privilegios se desactivan únicamente para fixtures de prueba. Los tests incluyen ataques de tenant/sucursal, escalamiento, adición/eliminación de campos protegidos, consultas reales y batches POS/offline.

Validación al cerrar Fases 2–3: 81 tests de Rules aprobados, incluidos los batches completos de venta/anulación con 30 líneas y las transiciones de deuda. Los tests que exigían validación semántica individual de items se difieren al motor de Fase 4; se mantienen las pruebas de aislamiento y campos críticos. Instalaciones reproducibles raíz/frontend, lint, build y `git diff --check` aprobados. El build conserva avisos de tamaño/Browserslist; npm reporta 14 vulnerabilidades en tooling raíz y 13 en frontend, pendientes de revisión sin actualizaciones major improvisadas.

---

# FASE 3 — Arquitectura React y Data Layer

## Objetivo

Separar interfaz, dominio y acceso a Firebase.

## Problema actual

Muchos hooks actúan simultáneamente como:
- controller;
- repository;
- service;
- domain;
- cache;
- adapter Firestore.

Ejemplos:
- `useContracts`;
- `useCashRegister`;
- `useExportSales`;
- `usePOS`.

## Arquitectura objetivo

```text
src/
  app/
  core/
  features/
    sales/
      domain/
      application/
      infrastructure/
      hooks/
      components/
    inventory/
    contracts/
    reports/
    cash-register/
    notifications/
    users/
    licenses/
  shared/
```

## Trabajo

- crear repositories/adapters;
- separar casos de uso;
- dividir GlobalDataContext;
- introducir contextos por responsabilidad;
- definir cache tenant-aware;
- eliminar hooks duplicados;
- eliminar helpers duplicados;
- normalizar errores;
- normalizar fechas;
- evitar acceso Firestore directo desde componentes.

## GlobalData

No trasladar toda Firestore al contexto.

Cache de sesión recomendado:
- tenant;
- usuario;
- settings;
- sucursales;
- categorías;
- productos activos cuando sea razonable.

Query-driven:
- históricos;
- contratos viejos;
- auditoría;
- reportes;
- alertas viejas.

## Criterio de aprobación

La lógica de negocio crítica deja de vivir directamente en componentes React.

## Implementación de Fase 3

- `app/providers/SessionProviders` agrega Tenant/Branch y Catalog como contextos separados. La clave de identidad reinicia los providers y sus módulos al cambiar UID, tenant o permisos; los callbacks pendientes se invalidan al limpiar suscripciones.
- Repositories por dominio encapsulan Firestore para catálogo, sedes, settings, usuarios, clientes, ventas, contratos, caja, reportes, licencias y notificaciones. Firebase se inicializa únicamente en `core/firebase/client`; los paths anteriores son re-exports de compatibilidad.
- Se eliminó `GlobalDataContext`. Users/invites se escuchan únicamente en gestión de usuarios; customers en Agenda o el formulario de contratos; últimas 50 ventas en SalesHistory; contratos conserva su listener por módulo. Branches utiliza únicamente el snapshot inicial, y desktop/móvil comparten una suscripción de notificaciones.
- Dexie conserva su esquema. Lecturas y borrados de catálogo/personal filtran tenant, la sincronización rechaza IDs que colisionen con otro tenant y los DTOs preservan el ID real del documento. El cache de reportes incluye identidad/tenant en su clave.
- Firestore salió de todos los componentes visuales, incluida aceptación de términos y entrega de contratos. POS usa settings del provider y conserva `lastSale` local; consume el único `useCart`, con el comportamiento de stock/cantidades anterior. Fechas y errores usan helpers puros compartidos en los flujos migrados.
- Se conservan cálculos, colecciones, payloads, `payments[]`, imágenes, arqueo, autocierre y el adaptador financiero existente. Descifrado/cola/retries offline, fórmulas y rangos de reportes, modelo de alertas y operaciones de SuperAdmin/borrado continúan pendientes de sus fases; `wipeTenantData` no se modificó.

Validación: 15 tests de arquitectura aprobados para aislamiento del cache, colisiones, respuestas tardías, cleanup, identidad, fechas, errores e interpretación de stock; 81 tests de Rules aprobados; lint sin errores/warnings, build y diff check aprobados. Una comparación AST confirmó que el adaptador financiero y el carrito canónico conservan sus operaciones. No hubo deploy, migraciones ni acceso a datos reales.

---

# FASE 4 — Ventas, inventario y motor offline

## Objetivo

Garantizar consistencia financiera y exactamente una aplicación por operación.

## Problemas actuales

- retry puede aplicar incrementos dos veces;
- `decrypt` inconsistente;
- stock remoto/local con modelos diferentes;
- pagos mixtos online/offline diferentes;
- múltiples implementaciones de una venta.

## Arquitectura objetivo

Una venta tiene un ID de idempotencia.

```text
saleId / idempotencyKey
```

Online u offline deben terminar pasando por la misma semántica.

## Trabajo

### Venta
Definir caso de uso único:
- validar;
- crear venta;
- actualizar stock;
- actualizar agregados;
- registrar auditoría.

### Offline queue

Estados:

```text
pending
syncing
synced
failed
```

Campos:
- idempotencyKey;
- businessId;
- branchId;
- userId;
- payload;
- retries;
- lastError;
- version.

### Stock

Modelo único:

```text
stockByBranch
```

No permitir que `stock` represente unas veces número y otras mapa.

### Retry

Una misma venta jamás debe:
- descontar stock dos veces;
- incrementar revenue dos veces;
- crear métricas duplicadas.

### Tests

Casos:
- online;
- offline;
- reconnect;
- commit exitoso + fallo local;
- retry repetido;
- mixed payments.

## Criterio de aprobación

Mismo input → mismo resultado, sin importar cuántos retries existan.

## Implementación de Fase 4

- `saleModel` valida el payload canónico v1: `saleId == localId == idempotencyKey`, tenant, sede física, usuario, caja, items únicos, cantidades enteras, precios y pagos. Los importes se normalizan a dos decimales y las comparaciones admiten ruido menor a S/ 0.005. El costo de cada línea se captura antes de encolar; costo, ganancia, pagos y agregados comparten helpers. El calendario de negocio usa `America/Lima`; Firestore persiste `Timestamp` y el payload JSON cifrado usa ISO para interoperabilidad.
- Online y reconnect pasan por `applySaleOnce`: lee el recibo, productos y agregado antes de escribir; un recibo idéntico devuelve `ALREADY_APPLIED` y uno diferente genera conflicto. Venta, stock de la sede y `daily_stats` se confirman en una sola transacción. Se conserva el esquema de claves literales con puntos del agregado online; los mapas anidados de retries anteriores se incorporan al tocar ese agregado, sin reconstruir históricos ni modificar reportes.
- Dexie mantiene `migapos_offline_v2` y actualiza su esquema a v3 sin borrar datos. Conserva ciphertext/IDs/estados antiguos y recupera el mapa raw de caches previamente proyectados. La cola persiste tenant/sede/usuario, versión, retries, error y tiempos; usa `pending → syncing → synced`, `failed` para errores deterministas y backoff hasta 60 segundos para fallos transitorios. Descifra con `await` y el UID registrado; los legados sólo se reclaman si el payload confirma usuario/tenant actuales.
- La venta queda durable antes del intento remoto. Un fallo de acknowledgement se recupera con el mismo ID; `syncing` abandonado vuelve a procesarse tras 120 segundos. Promesas serializadas, Web Locks y lease Dexie renovable impiden flush simultáneos; App reintenta al iniciar, al recuperar conexión y cada 15 segundos, respetando backoff y cambios de identidad. Se conserva el merge de cajas anterior a las ventas; una caja pendiente demora únicamente sus ventas.
- El cache de productos guarda snapshots raw. La UI deriva un único mapa efectivo por producto/sede, excluye recibos ya aplicados y nunca persiste descuentos de pendientes. El total escalar del DTO es sólo presentación; la edición de inventario usa el mapa remoto. Historial deduplica por ID, prefiere el recibo remoto y muestra estado/error de fallos legibles.
- `voidSaleOnce` lee el recibo remoto y revierte stock/agregados una sola vez, con alerta determinista `VOIDED_SALE_{saleId}`. Las carreras de Rules se resuelven comprobando el recibo mediante una lectura autorizada; un rechazo sin operación confirmada conserva el error. La anulación requiere conexión.
- Rules refuerza identidad inmutable, tenant/sede/usuario/caja, pagos y stock no negativo del cajero. Los documentos existentes conservan aislamiento y compatibilidad de void; se permite comprobar recibos/agregados ausentes para transacciones. La semántica arbitraria de items se valida en el dominio, sin simular un límite de 20 líneas en Rules.

Validación ejecutada: `npm run test:architecture` (15 tests), `npm run test:sales` (25), `npm run test:rules` (81 de seguridad + 12 de integración Firestore/Storage Emulator con `demo-migapos`), `npm run test:offline-db` (16 comprobaciones en IndexedDB/Web Locks reales usando Edge headless y un perfil temporal aislado), `npm run lint --prefix frontend`, `npm run build --prefix frontend` y `git diff --check`: aprobados. El test de navegador admite `MIGAPOS_TEST_BROWSER` para otra ruta Chromium/Edge; no abre la base de la aplicación. El emulador utilizó el JRE 21 portátil existente en PATH. Se mantienen los avisos previos de tamaño de chunks/Browserslist. F4-01–F4-30 verificados; no se actualizaron dependencias, no hubo deploy, commits ni cambios del índice/historial de Git, ni acceso a datos reales, y no se inició Fase 5.

---

## Hardening final de Fase 4

`submitSale` y `voidSale` migraron a Functions/Admin SDK con Auth, perfil protegido y dominio puro compartido. El cliente ya no escribe ventas/stats/stock POS; Rules mantiene el inventario manual del dueño y protege `VOIDED_SALE`. El servidor fija costos/nombres del catálogo al primer commit y conserva precios del ticket canónico offline. Dexie v4 conserva idempotencia server-side y distingue `createdAt/queuedAt/syncedAt`; `saveCashSession` protege las ventanas y autoriza previamente aperturas offline. Operaciones antiguas sin ventana verificable conservan payload/error para revisión; receipts existentes se confirman durante retry. CatalogProvider usa ack/versiones de stock sin lecturas remotas de receipts. Fases 5/6/8 siguen pendientes; sin deploy ni datos reales.

Validación del hardening: `npm ci` raíz/Functions/frontend; `npm test` (135: arquitectura 15, ventas 26, dominio Functions 6, Rules 66, callables en Functions/Auth/Firestore/Storage Emulator 22); IndexedDB/locks/ack (18 comprobaciones en Edge aislado); lint/build/diff-check aprobados. Functions se verificó con Node 22 y Java 21; build conserva avisos previos de chunks/Browserslist. npm reporta 2 vulnerabilidades moderadas en Functions y las anteriores 14/13 en tooling/frontend, sin upgrades ajenos a esta fase.

# FASE 5 — Contratos, pedidos y ledger de pagos

## Objetivo

Separar los movimientos financieros del documento de contrato.

## Problema actual

```text
contracts/{id}
  payments: [...]
```

provoca:
- crecimiento indefinido;
- consultas costosas;
- filtering client-side;
- dificultad en reportes;
- dificultad en caja.

## Arquitectura objetivo

```text
payments/{paymentId}
```

Cada movimiento:

```text
businessId
branchId
sessionId
userId
sourceType
sourceId
type
method
amount
occurredAt
```

Ejemplos `type`:

```text
advance
payment
refund
```

## Contratos

El contrato conserva:
- total;
- balance;
- estado;
- datos comerciales;

pero el historial financiero vive en `payments`.

## Imágenes

Mover Base64 de Firestore a Firebase Storage.

Guardar:
- storagePath;
- URL o mecanismo de descarga;
- thumbnail.

## Queries

Contratos:
- activos/próximos;
- paginados.

Histórico:
- carga bajo demanda.

## Migración

Debe existir estrategia compatible para contratos antiguos.

## Criterio de aprobación

Caja/reportes pueden obtener pagos por rango/session sin cargar todos los contratos.

---

# FASE 6 — Caja, alertas y auditoría

## Objetivo

Hacer confiables las operaciones operativas y de supervisión.

## Caja

### Problemas

- carrera para abrir caja;
- cálculo dependiente de consultas pesadas;
- autocierre no realmente server-side.

### Trabajo

Garantizar una sola caja activa por:
- tenant;
- branch.

Introducir lock/transacción/documento determinístico o Function.

Cierre:
- consultar movimientos por `sessionId`.

## Alertas

Separar:

```text
audit_events
notifications
```

`audit_events`:
- inmutables;
- representan lo ocurrido.

`notifications`:
- destinatario;
- readAt/acknowledgedAt;
- estado personal.

## Eventos esperados

Ejemplos:
- SALE_VOIDED;
- CONTRACT_VOIDED;
- CASH_DISCREPANCY;
- SHIFT_MISMATCH;
- REGISTER_EXPIRED.

## Criterio de aprobación

Dos administradores pueden gestionar su estado de lectura independientemente.

---

# FASE 7 — Reportes, dashboard y Excel

## Objetivo

Corregir exactitud financiera y consumo Firebase.

## Problemas detectados

- listener diario vuelve a consultar contratos;
- contratos se descargan completos;
- doble resta de ventas anuladas;
- DTOs incompatibles en Excel;
- cache sin TTL real;
- histórico basado en `updatedAt`;
- límite de filas aplicado después de descargar.

## Modelo de reportes

Definir métricas inequívocas:

```text
posRevenue
contractRevenue
refunds
netRevenue

cashRevenue
digitalRevenue

completedSales
voidedSales
contractPayments
```

## Agregados

Mantener:

```text
daily_stats
```

pero como proyección oficial.

Posible futuro:

```text
monthly_stats
```

si el volumen lo requiere.

## Excel

Separar:

```text
query
→ domain calculation
→ report DTO
→ XLSX presentation
```

Todas las filas de una misma tabla usan el mismo schema.

## Tests

Fixtures conocidos:

```text
ventas
anulaciones
contratos
reembolsos
mixtos
cross-branch
```

Comparar exactamente:
- dashboard;
- Excel;
- agregados.

## Criterio de aprobación

Día/semana/mes/año entregan cifras reproducibles y consistentes.

---

# FASE 8 — Licencias, SuperAdmin, backups y borrado

## Objetivo

Mover funciones de plataforma fuera del navegador.

## Licencias

El frontend mantiene UX.

El backend/rules protege realmente.

## SuperAdmin

Operaciones privilegiadas:
- crear tenant;
- cambiar licencia;
- suspender;
- backup;
- borrar tenant;

deben ejecutarse server-side.

## Borrado

No ejecutar desde browser.

Flujo objetivo:

```text
tenant.status = deleting
↓
job backend
↓
batches
↓
Storage
↓
verificación
↓
audit
↓
deleted
```

Debe incluir como mínimo:
- users;
- products;
- categories;
- sales;
- daily_stats;
- branches;
- invites;
- cash_sessions;
- alerts/notifications;
- audit events;
- contracts;
- payments;
- customers;
- settings;
- licenses;
- archivos Storage.

Preferir:
- soft delete;
- periodo recuperable;
- borrado definitivo posterior.

## Backups

Backup debe usar una snapshot/estrategia consistente y no depender de la UI.

## Criterio de aprobación

Un cliente manipulado no puede ejecutar operaciones de plataforma.

---

# FASE 9 — Branding MigaPOS y limpieza general

## Objetivo

Terminar de convertir el sistema personalizado en un producto SaaS reutilizable.

## Trabajo

Eliminar referencias:
- Kprichitos;
- Angie;
- números o nombres comerciales hardcodeados;
- textos específicos de un tenant.

Centralizar:

```text
brandName
support
billing
legalVersion
urls
```

## Limpieza

Eliminar:
- código muerto;
- hooks duplicados;
- utilidades duplicadas;
- reglas antiguas;
- índices antiguos;
- comentarios decorativos;
- archivos legacy sin consumidores.

## Seguridad UI

Escapar contenido en:
- tickets;
- contratos;
- documentos HTML de impresión.

Agregar/revisar CSP.

## Criterio de aprobación

No existe personalización específica de Kprichitos fuera de datos de tenant.

---

# FASE 10 — Tests, CI, observabilidad y release

## Objetivo

Cerrar el refactor con controles para evitar regresiones.

## Tests

### Unitarios
- cálculos financieros;
- stock;
- pagos;
- report DTOs.

### Integración
- sales;
- contracts;
- cash sessions;
- offline sync.

### Firebase Emulator
- Rules;
- Functions;
- multi-tenant.

## CI

Pipeline mínimo:

```text
install
lint
test
build
rules tests
```

## Observabilidad

Configurar:
- error tracking;
- logs estructurados;
- métricas Functions;
- Firebase usage/budgets;
- alertas de consumo.

## Release

Usar:
- preview Hosting;
- staging;
- checklist;
- rollback.

## Criterio de aprobación

Ningún release depende de ejecutar manualmente pasos no documentados.

---

# Dependencias entre fases

```text
FASE 1
  ↓
FASE 2
  ↓
FASE 3
  ↓
FASE 4
  ↓
FASE 5
  ↓
FASE 6
  ↓
FASE 7
  ↓
FASE 8
  ↓
FASE 9
  ↓
FASE 10
```

Sin embargo pueden existir pequeños trabajos paralelos.

Regla:
si una fase necesita cambiar datos persistidos definidos por una fase anterior, se detiene y se revisa arquitectura antes de continuar.

---

# Puntos de auditoría obligatorios

Después de cada fase revisar:

## Seguridad
- ¿se amplió algún permiso?
- ¿apareció acceso cross-tenant?
- ¿se añadieron secretos?
- ¿cliente controla campos privilegiados?

## Firebase
- listeners;
- lecturas;
- queries;
- índices;
- límites;
- paginación.

## Datos
- compatibilidad;
- migración;
- timestamps;
- IDs;
- idempotencia.

## React
- dependencias hooks;
- rerenders;
- context;
- cleanup.

## Calidad
- lint;
- build;
- tests;
- código duplicado.

---

# Regla de prompts futuros

Los prompts de Fases 2–10 NO deben escribirse de forma genérica antes de tiempo.

Después de cada fase:
1. se audita el commit actualizado;
2. se compara contra este MASTER PLAN;
3. se corrigen desviaciones;
4. se crea el prompt exacto de la siguiente fase basándose en el estado REAL del repositorio.

Esto evita que un prompt antiguo obligue al agente a trabajar sobre una arquitectura que ya cambió.

---

# Resultado objetivo final

MigaPOS debe terminar como:

```text
MigaPOS
│
├── Frontend React
│   ├── UI
│   ├── feature hooks
│   └── cache local
│
├── Firebase
│   ├── Auth
│   ├── Firestore
│   ├── Storage
│   ├── App Check
│   ├── Hosting
│   └── Emulator
│
├── Functions
│   ├── tenant provisioning
│   ├── privileged operations
│   ├── financial commands
│   ├── aggregation
│   └── tenant deletion
│
├── Domain
│   ├── sales
│   ├── inventory
│   ├── payments
│   ├── contracts
│   ├── cash
│   ├── reports
│   └── licenses
│
└── CI / Tests / Observability
```

Principios finales:

- seguro por tenant;
- operaciones financieras idempotentes;
- consultas escalables;
- offline confiable;
- reporting consistente;
- Firebase eficiente;
- código modular;
- producto sin personalización fija;
- despliegues reproducibles;
- arquitectura preparada para crecer.
