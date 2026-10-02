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
2. El agente lee:
   - `AGENTS.md`
   - este documento;
   - los documentos específicos de la fase.
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
| 1 | Foundation: repositorio, env y Firebase CLI | PENDIENTE / EN PROGRESO |
| 2 | Seguridad SaaS multi-tenant | PENDIENTE |
| 3 | Arquitectura React y Data Layer | PENDIENTE |
| 4 | Ventas, inventario y motor offline | PENDIENTE |
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
Diseñar claims:

```text
tenantId
role
platformAdmin
```

o una estructura equivalente.

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
Introducirlo como defensa adicional.

No usar App Check como sustituto de Security Rules.

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

---

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
