# MigaPOS — Auditoría P15 (focalizada): recuperación de sesión / acceso

Referencia publicada revisada: `fix/migapos-production-readiness`, commit `533972db5c7812812842e37b648b91079d61bb3e` (Plan 14). La implementación local puede contener cambios posteriores; Codex debe inspeccionarla, **sin Git/GitHub**.

## Síntoma del propietario

Con localhost abierto durante inactividad, la app dejó de mostrar el sistema y pasó a:

> Configuración no encontrada. El servidor no devolvió los registros de negocio y licencia esperados.

F5 no lo corrige; borrar caché/reautenticarse sí lo corrige. No hay evidencia de eliminación de datos. Borrar caché no debe ser el procedimiento normal: podría perder borradores locales.

## Hallazgos comprobados

1. Mensaje exacto: `frontend/src/components/RestrictedAccess.jsx` → estado `tenant-missing-confirmed`.
2. Clasificador: `frontend/src/core/session/accessState.js`, `licenseAccess()`. Tras recibir dos snapshots de servidor, si no hay `license.data` ni `tenant.data`, devuelve `tenant-missing-confirmed`. Si solo falta licencia, devuelve `license-missing-confirmed`. Un snapshot solo de caché se clasifica `offline-unverified`.
3. Suscripciones: `frontend/src/features/licenses/infrastructure/licenseRepository.js` consulta `licenses/{businessId}` y `tenants/{businessId}` con `onSnapshot(..., {includeMetadataChanges:true})`.
4. `frontend/src/features/licenses/hooks/useLicenseAccess.js` mantiene estado de ambos documentos; `retry` fuerza nuevo ciclo. `online` lo activa solo si ocurre el evento de reconexión. `setInterval(publish, 10000)` recalcula sin forzar lecturas nuevas.
5. Firebase Auth se observa con `onAuthStateChanged()` en `frontend/src/hooks/useAuthManager.js`; no hay un mecanismo específico de refresco verificable con `getIdToken(true)` vinculado al reintento. **No asumir que un token expirado explica por sí mismo el estado de documentos ausentes.**
6. `frontend/src/hooks/useShiftMonitor.js` cierra sesión por fin de horario configurado **solo al cajero**, no al dueño por inactividad. Ese evento debe diferenciarse del estado de licencias.
7. Firestore usa caché persistente IndexedDB multitab en `frontend/src/core/firebase/client.js`; la UI y el monitor de reintento no deben exigir borrar caché.
8. `RestrictedAccess.jsx` ya ofrece `Volver a comprobar acceso`; primero verificar por qué falla esa acción.

## Hipótesis — NO afirmarlas como causa sin reproducción

- Contexto `businessId` obsoleto, cambio de perfil/negocio sin invalidar todos los listeners.
- Proyecto Firebase incorrecto (variables Vite dev versus producción), o emuladores inaccesibles.
- Carrera de autenticación/suscripciones o tratamiento incorrecto de metadatos tras reconexión/F5.
- Los documentos realmente no existen en el proyecto consultado; caso que **debe** seguir bloqueado.
- Error de red o autorización mal clasificado en el punto anterior a la presentación.
- Un cliente con SW/versiones heterogéneas puede mostrar código antiguo; solo investigar si la evidencia lo respalda.

## Diseño de corrección mínima

- **Conservar fail-closed**. Nunca autorizar operaciones por snapshots `fromCache`, IndexedDB o perfil antiguo. Sin licencia confirmada, no permitir cobros ni escrituras.
- Instrumentación **temporal y segura** (solo desarrollo y/o códigos acotados): entorno, indicador de coincidencia de identidad, presencia booleana de documentos, `fromCache`, `hasPendingWrites`, códigos SDK y momento de escucha/reintento; **sin** correos, UID, IDs completos, tokens, documentos o importes en logs.
- Si hay `tenant-missing-confirmed`, habilitar revalidación explícita acotada: verificar identidad/cuenta y proyecto, opcional `auth.currentUser.getIdToken(true)` **solo en acción de reintento** y un `getDocFromServer` de ambos documentos, solo si puede acotarse por identidad. Reabrir listeners/descartar respuestas anteriores por generación. Eliminar cualquier estado de error temporal previo después de evidencia positiva confirmada.
- Revalidación fallida por `permission-denied`: mostrar lectura denegada; `unavailable`: mostrar conexión pendiente; **servidor confirma ausencia real**: conservar `Configuración no encontrada`; licencia suspendida o vencida: conservar bloqueo.
- Con un mismo reintento, máximo un paquete acotado (hasta dos lecturas de documentos + lectura de perfil si es indispensable); sin polling de Firestore, sin bucles por intervalo.
- No limpiar IndexedDB, Storage, Service Worker ni datos de otro negocio como «reparación».

## Matriz de aceptación

| Caso | Esperado |
| --- | --- |
| Dueño deja pestaña inactiva durante horas, servidor accesible | Sigue autenticado y vuelve a confirmar negocio/licencia; sin borrar caché |
| Cajero fuera de su horario real | Cierre de sesión explícito por turno, NO error de configuración |
| F5 con Auth persistente y licencia vigente | Recuperación automática o reintento, sin borrador perdido |
| Offline y caché con datos | Estado pendiente/sin verificar; bloquea nuevas escrituras |
| Auth caducada o token renovado | Reintento seguro y acotado; sin saltarse permisos |
| `permission-denied` | Mensaje exacto, no simular ausencia de datos |
| `licenses` y `tenants` ausentes **confirmados** | `Configuración no encontrada`, sin autocrear ni autorizar |
| Cambio de negocio, UID, otra pestaña | Respuestas de contexto anterior descartadas |
| Volver del background (visibilitychange/focus) | Una revalidación limitada si procede, sin bucles ni tormentas de lecturas |
| Red intermitente vuelve a funcionar | Estado correcto al reintentar sin reinicio ni borrado de la caché |

## Criterio de cierre

La causa debe reproducirse mediante prueba o diagnosticarse con metadatos fiables. PASS solo con recuperación real, permisos fail-closed y sin perder borradores. Tests Node/Chromium, Firebase Rules (CI), lint y build deben pasar. NO declarar producción preparada por una sola recarga satisfactoria.
