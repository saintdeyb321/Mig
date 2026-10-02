# AGENTS.md — MigaPOS

## 1. Propósito

Este archivo define las reglas obligatorias para cualquier agente de código que trabaje en MigaPOS (Codex, GPT Sol u otros).

MigaPOS es un POS SaaS multi-tenant orientado a panaderías y pastelerías. Maneja ventas, inventario por sucursal, cajas, contratos/pedidos, clientes, usuarios, licencias, reportes, alertas y operación offline. Los cambios pueden afectar dinero, stock, permisos, privacidad y costos de Firebase; por lo tanto, no se permiten refactors improvisados.

La prioridad es:

1. integridad de datos;
2. seguridad multi-tenant;
3. consistencia financiera;
4. reducción de lecturas/escrituras innecesarias;
5. mantenibilidad;
6. experiencia de usuario;
7. estética.

## 2. Regla principal

No parchear síntomas. Identificar la fuente de verdad, el dominio afectado y el flujo completo antes de modificar código.

Antes de editar un módulo crítico, revisar:
- llamada UI;
- hook;
- service/repository;
- Firestore Rules;
- índices;
- estructura persistida;
- flujo offline;
- reportes/agregados derivados;
- efectos sobre otros módulos.

## 3. Prohibiciones

Está prohibido:

- agregar secretos reales al repositorio;
- crear `.env` con credenciales reales y versionarlo;
- considerar una variable `VITE_*` como secreta;
- depender de `UserRoleGate`, `LicenseGuard` o cualquier guard de React como frontera de seguridad;
- autorizar operaciones privilegiadas únicamente con datos enviados por el cliente;
- crear lecturas Firestore globales sin tenant;
- cargar colecciones históricas completas sin paginación o justificación;
- crear listeners `onSnapshot` históricos ilimitados;
- duplicar una regla de negocio en modo online y offline;
- actualizar dinero, stock y agregados mediante operaciones no idempotentes;
- cambiar el significado o tipo de un campo existente silenciosamente;
- mezclar `Timestamp`, ISO string y `Date` arbitrariamente;
- guardar nuevas imágenes Base64 en Firestore;
- introducir `window.prompt`, `window.confirm` o lógica DOM imperativa nueva si existe alternativa React;
- versionar `dist/`, `dev-dist/`, artefactos Workbox u otros outputs de build;
- añadir otra copia de reglas, índices, configuración Firebase o helpers equivalentes;
- hacer deploy desde una tarea de refactor salvo autorización explícita;
- borrar datos reales;
- ejecutar migraciones destructivas sin mecanismo de rollback o plan documentado;
- reescribir todo el producto cuando una migración incremental sea posible.

## 4. Multi-tenancy

Todo documento de negocio debe quedar asociado explícitamente a un tenant mediante `businessId`/`tenantId`, salvo documentos globales de plataforma correctamente protegidos.

Toda consulta de negocio debe estar restringida al tenant.

Toda Security Rule debe validar tenant del lado servidor.

Nunca asumir que:

```js
where('businessId', '==', user.businessId)
```

protege los datos. Es un filtro de consulta, no una frontera de autorización.

Los roles administrativos deben provenir de una fuente que el cliente no pueda autoasignarse. La dirección objetivo es Firebase Custom Claims o una verificación backend equivalente.

## 5. Firebase y secretos

### 5.1 Configuración web de Firebase

La configuración pública de Firebase Web se cargará desde variables de entorno Vite para:
- separar development/staging/production;
- eliminar hardcodeos;
- facilitar migraciones de proyecto;
- evitar branding o IDs antiguos repartidos por el código.

Ejemplo de nombres permitidos:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

IMPORTANTE: `VITE_*` se incluye en el bundle del navegador. No almacenar ahí:
- claves privadas;
- service accounts;
- passwords;
- tokens administrativos;
- API keys de servicios privados;
- secretos de Functions;
- claves de Gemini/LLM;
- credenciales SMTP;
- webhook secrets.

### 5.2 Secretos backend

Todo secreto real debe vivir en mecanismos server-side:
- Firebase/Google Cloud Secret Manager;
- environment seguro de Functions;
- CI/CD secret store.

Nunca debe importarse un secreto del backend desde el frontend.

### 5.3 App Check

App Check será parte del hardening, pero no reemplaza Firestore Security Rules.

## 6. Firebase CLI y Hosting

Debe existir una sola configuración Firebase CLI en la raíz:
- `firebase.json`;
- `.firebaserc`;
- `firestore.rules`;
- `firestore.indexes.json`;
- futuras reglas de Storage/Functions según corresponda.

Para Hosting:
- usar project aliases claros (`dev`, `staging`, `prod`) cuando aplique;
- usar deploy targets si hay múltiples sitios de Hosting;
- no asumir que `projectId` de la app web y site ID de Hosting son el mismo valor;
- no ejecutar deploy en tareas de limpieza sin autorización explícita.

## 7. Dependencias y package manager

La raíz debe ser intencional.

Si el repositorio sigue siendo una aplicación frontend con configuración Firebase en raíz:
- las dependencias runtime del frontend pertenecen a `frontend/package.json`;
- Firebase CLI debe ser dependencia de desarrollo de la raíz solo si la raíz tiene scripts de tooling/deploy/emulators;
- no mantener dependencias Excel duplicadas en raíz si no existe código raíz que las utilice;
- no tener lockfiles redundantes sin una decisión explícita de workspace/monorepo.

Si posteriormente se adopta workspace npm, documentarlo antes de migrar.

No actualizar majors de dependencias dentro de una fase no relacionada.

## 8. Arquitectura React

Organizar por dominio/feature, evitando hooks gigantes.

Dirección objetivo:

```text
src/
  app/
  core/
  features/
    sales/
    inventory/
    cash-register/
    contracts/
    reports/
    notifications/
    customers/
    users/
    licenses/
  shared/
```

Un hook React coordina UI; no debe contener toda la lógica financiera del dominio.

Separar progresivamente:
- dominio puro;
- casos de uso;
- infraestructura Firebase;
- hooks/adapters React;
- componentes.

No introducir capas vacías solo por "Clean Architecture". Cada capa debe resolver acoplamiento real.

## 9. Estado global y cache

No convertir `GlobalDataContext` en una base de datos global.

Separar contextos por responsabilidad y frecuencia de cambio.

Datos apropiados para cache global/sesión:
- identidad/tenant;
- sucursales;
- settings;
- categorías;
- catálogo activo cuando su tamaño sea razonable.

Datos que deben ser query-driven/paginados:
- ventas históricas;
- contratos históricos;
- alertas históricas;
- reportes;
- auditoría;
- backups.

Todo cache local debe ser tenant-aware.

Nunca reutilizar datos de un tenant para otro tras logout/login.

## 10. Offline

Debe existir una sola semántica de operación para online y offline.

La cola offline debe usar:
- ID de idempotencia;
- estados explícitos (`pending`, `syncing`, `synced`, `failed`);
- retries controlados;
- error persistido;
- tenant;
- user;
- branch;
- versión del payload si aplica.

Una venta no puede descontar stock o incrementar estadísticas dos veces tras un retry.

El stock efectivo por sucursal debe conservar estructura consistente. No reutilizar `stock` como `number` y `map` a la vez.

## 11. Dinero e inventario

No usar floats arbitrarios sin política definida.

Hasta migrar a centavos enteros, todos los límites financieros deben usar validación explícita y tolerancia documentada.

Toda operación que modifica:
- venta;
- pago;
- reembolso;
- stock;
- caja;
- agregado diario;

debe ser atómica o idempotente de forma verificable.

No "reconstruir" a posteriori la sucursal de un movimiento financiero si puede persistirse cuando ocurre.

Cada movimiento financiero debería conocer:
- `businessId`;
- `branchId`;
- `sessionId` cuando corresponda;
- `userId/cashierId`;
- `sourceType`;
- `sourceId`;
- `method`;
- `amount`;
- `occurredAt`.

## 12. Fechas

Estandarizar persistencia:
- preferir `Timestamp`/`serverTimestamp()` en Firestore;
- `Date` solo en memoria/UI;
- ISO string solo cuando haya razón de interoperabilidad explícita.

Toda lógica de reportes debe definir zona horaria de negocio.

No depender de `updatedAt` para determinar si un evento financiero ocurrió dentro de un período.

## 13. Reportes

`daily_stats`/agregados deben convertirse en fuente optimizada para dashboards, no en una segunda lógica contradictoria.

Los reportes deben tener DTOs canónicos antes de Excel.

Está prohibido construir una misma hoja con objetos que tengan esquemas incompatibles.

Los exports deben:
- consultar solo el rango requerido;
- paginar cuando corresponda;
- separar cálculo de presentación;
- ser deterministas;
- poder validarse contra fixtures/tests;
- no depender de listeners permanentes.

## 14. Alertas y auditoría

Separar:
- evento/auditoría inmutable;
- notificación al usuario;
- acknowledgement/lectura por usuario.

Un `read: true` global no debe significar que todos los administradores lo leyeron.

Los listeners de notificación deben tener límite y orden.

## 15. Borrado de tenant

El borrado total de tenant no debe ejecutarse desde el navegador.

Debe ser una operación backend administrativa:
- autorizada;
- idempotente;
- reanudable;
- auditable;
- con estado (`active`, `deleting`, `deleted`);
- con verificación de colecciones;
- cubriendo datos de clientes, contratos, Storage y derivados.

Preferir soft-delete/periodo de recuperación antes del borrado físico definitivo.

## 16. Branding

La marca de producto es `MigaPOS`.

Evitar hardcodeos comerciales específicos de un cliente.

Datos como:
- marca;
- soporte;
- teléfonos;
- cobro de licencia;
- URLs;
- versión legal;

deben centralizarse en configuración.

No confundir nombre de marca con IDs técnicos históricos de Firebase. Una migración de Firebase es una operación de infraestructura separada.

## 17. Calidad de código

Código nuevo:
- nombres semánticos;
- funciones pequeñas;
- early returns;
- errores tipados o normalizados;
- sin comentarios decorativos tipo "MAGIA", "PERFECTO", "BLINDAJE";
- comentarios solo para explicar decisiones no obvias;
- evitar duplicación;
- evitar estado derivado;
- evitar `useMemo/useCallback` sin beneficio verificable;
- mantener dependencias de hooks correctas;
- limpiar listeners/timers.

Cuando se toque una función crítica, mejorar tests antes o junto con la refactorización.

## 18. Validación mínima antes de finalizar cualquier fase

Ejecutar, cuando aplique:

```bash
npm ci
npm run lint
npm run build
```

y los tests disponibles.

Cuando se introduzcan reglas Firebase:
- usar Firebase Emulator Suite;
- agregar tests de Security Rules;
- probar tenant A vs tenant B;
- probar rol no autorizado;
- probar escritura de campos protegidos.

No ocultar warnings o fallos con `eslint-disable` global salvo justificación documentada.

## 19. Compatibilidad

Las fases deben ser pequeñas y reversibles.

Por defecto:
- no romper datos existentes;
- no renombrar colecciones en una sola operación;
- no modificar estructuras persistidas sin estrategia de compatibilidad/migración;
- mantener adaptadores temporales cuando hagan falta;
- eliminar compatibilidad antigua únicamente cuando su migración esté completada.

## 20. Forma de trabajar del agente

Para cada tarea:

1. leer `AGENTS.md`;
2. leer los documentos de `docs/` relevantes;
3. inspeccionar el código afectado antes de editar;
4. indicar hallazgos adicionales importantes;
5. realizar únicamente el alcance de la fase solicitada;
6. no adelantar otras fases salvo bloqueo técnico;
7. ejecutar validaciones;
8. resumir:
   - archivos cambiados;
   - decisiones;
   - riesgos;
   - pruebas;
   - trabajo pendiente.

Si descubre una vulnerabilidad P0 fuera del alcance:
- documentarla inmediatamente;
- aplicar un hotfix mínimo solo si dejarla intacta hace inseguro el trabajo actual;
- no convertir ese hallazgo en una refactorización no autorizada.

## 21. Definición de terminado

Una fase no termina porque "compila".

Termina cuando:
- cumple sus criterios de aceptación;
- no introduce secretos;
- lint/build/tests pasan o las excepciones están documentadas;
- documentación queda actualizada;
- no quedan archivos duplicados creados por la propia fase;
- el diff es coherente con el alcance;
- las operaciones destructivas no fueron ejecutadas sin autorización.
