# PLAN 02 — Recuperación funcional, consumo Spark, identidad y bajas MigaPOS

**Estado:** auditoría inicial del código, sin escritura real ni cambios desplegados.  
**Ramas:** comparar `main@41dd809` y `refactor/ux-tailwind-v4@da777d2` con el comportamiento histórico anterior a la migración Functions.  
**Restricción:** Spark real (`migapos`, base `(default)`, Hosting `migapos-peru`) sin Blaze, Cloud Functions, Storage ni backend externo.

## 1. Incidentes confirmados en el código

1. `frontend/src/features/sales/infrastructure/sparkSalesRepository.js` fija `SPARK_TICKET_LIMIT=2` y el frontend lo refleja. Es un **límite de implementación, no una cuota de Firebase Spark**.
2. `frontend/src/features/backups/components/BackupPanel.jsx` muestra exportaciones a `dueño` y `superadmin`; el repositorio `backupRepository.js` permite el rol `dueño`. **Contradice la política de administración del producto**.
3. `frontend/src/App.jsx` monta solo el módulo activo; `ContractManager` y su `useContracts` se desmontan cuando cambia la pestaña. Esto puede perder estado/paginación y producir reconexiones de listeners. `TenantProvider` y `CatalogProvider` sí permanecen en la sesión, pero no hay política de recursos global uniforme.
4. `useAuthManager.js` muestra «Tu cuenta ha sido eliminada» cuando el `onSnapshot(users/{uid})` devuelve documento inexistente. No prueba eliminación de Firebase Authentication. Debe diferenciar retrasos, cuentas no invitadas, errores y ausencia confirmada desde servidor.
5. `useLicenseAccess.js` da `missing` cuando no existe `licenses/{businessId}` en un snapshot; `RestrictedAccess.jsx` lo traduce incorrectamente a «El negocio ya no existe». No verifica `tenants/{businessId}` ni diferencia cache desactualizada de fallo de acceso/índice.
6. `client.js` ya inicializa Firestore con `persistentLocalCache` y `persistentMultipleTabManager`; además existe `subscribeTenantCache` basado en Dexie. No confundir cache persistente con *módulo montado* ni con garantía de cero lecturas.
7. `useReports` ya crea un caché con TTL, pero reportes, historial, contratos y Excel necesitan inventario real de lecturas, reconexiones, filtros, particiones y cuotas. La exportación de datos masiva puede superar la cuota Spark.

Estas observaciones **no demuestran que las cuentas o empresas se hayan borrado realmente**. Prohibido reparar recreando `users`, `licenses` o tenants sin diagnóstico verificable.

## 2. P0 — Recuperación de sesión, tenant y licencia (primero)

- En modo solo lectura, identificar el proyecto real, `auth.currentUser.uid`, `users/{uid}` y sus campos `role`, `status`, `businessId`, `branchId`.
- Comparar `licenses/{businessId}`, `tenants/{businessId}` y las reglas efectivamente publicadas. Registrar existencia, estado, expiración, origen del snapshot (`fromCache`) y errores de permisos por separado; nunca registrar PII ni tokens en consola.
- `useAuthManager`: estado explícito `loading`, `ready`, `needs-invite`, `profile-not-found-confirmed`, `permission-denied`, `network-error`, `suspended`, `shift-denied`. No cerrar sesión por un `null` transitorio o error offline sin confirmación del servidor; limpiar correctamente listeners/cachés al cambiar de UID.
- `useLicenseAccess`: estados distintos `loading`, `active`, `expired`, `suspended`, `license-missing-confirmed`, `tenant-missing-confirmed`, `permission-denied`, `offline-unverified`; invalidar estado anterior ante cambio de businessId/UID; no usar mensaje de inexistencia salvo evidencia real.
- Mecanismo seguro de reintento, diagnóstico y recuperación; **no acceso financiero ni modificación de permisos** cuando no se puede validar autorización.
- Si el error solo aparece en la rama UX, comparar con `main` y corregir el diferencial primero.
- No escribir datos en proyecto real sin consentimiento expreso.

## 3. P1 — Caché, navegación, listeners y presupuesto de lecturas

- Inventariar `onSnapshot`, `getDocs`, `getDoc`, `getDocsFromServer`, listeners sin deduplicar, dependencias inestables de hooks, cambios de pestaña, login/logout, sedes y reconexión online.
- Medir/cuantificar **lecturas de documentos** por recorrido (primera carga, POS→Contratos→POS, regreso a Contratos, cambio de sede, foco/blur, reconexión, Excel), diferenciando caché local y servidor.
- Mantener un repositorio de recursos **por identidad + tenant + sede + filtros**, con snapshots compartidos donde sea viable, ciclo de vida claro, `stale-while-revalidate` para lecturas no financieras, deduplicación/inflight y paginación estable.
- Preservar filtros, scroll, selección y páginas ya consultadas al navegar si no hay riesgo de fuga entre usuarios. Evitar mantener montada indiscriminadamente toda la aplicación, listeners superfluos o cachés entre tenants.
- Firestore/Dexie cifrado/TTL/invalidation: separar reportes históricos cacheables de saldos, caja, pagos y permisos que requieren validación reciente. Nunca usar caché para confirmar una venta o privilegios.
- Excel: recuperar política histórica de exportaciones diarias/semanales y detalladas solo bajo demanda, con paginación acotada, consumo estimado, aviso/consentimiento y cache verificable; evitar repetir descargas para reconstruir el mismo período; reportes no deben hacer lecturas completas silenciosas.
- Instrumentación de diagnóstico de consulta en desarrollo sin exponer PII; anotar límites diarios Spark y estrategia de degradación digna cuando se agota la cuota.

## 4. P2 — Venta de múltiples productos sin límite comercial artificial

- Eliminar `SPARK_TICKET_LIMIT=2` **solo después** de diseñar y demostrar un protocolo seguro que admita tickets normales de cualquier número de líneas dentro de límites técnicos documentados.
- Investigar protocolos compatibles con Rules y Firestore: ítems inmutables por línea, verificación canónica de precio/stock, operación/cabecera/lineas, reserva o confirmación segura, idempotencia, concurrencia, cancelación/compensación, reintentos offline, comprobante íntegro y cálculo de totales verificable.
- Los límites `get/getAfter/exists` de Rules son 10 por escritura individual y 20 por transacción/batch total; estudiar los accesos repetidos, reglas integradas y costo real. No afirmar que un batch de muchos documentos sea una única venta atómica viable por defecto.
- **Prohibido** fraccionar el carrito en ventas independientes sin consentimiento, marcarlo confirmado antes de completar todos los ítems, confiar en importes del cliente, permitir stock negativo o degradar la seguridad.
- Diseñar esquema con un estado de operación recuperable y compensación idempotente si se necesitan etapas. Si no se puede demostrar atomicidad y verificabilidad del ticket completo solo con Spark, documentar el límite técnico y una alternativa comercial segura; no activar implementación falsa.
- Preservar tickets históricos, cantidades, formatos, impresiones, reportes, pagos mixtos y reglas de autorización. No cambiar esquemas en producción ni habilitar borrado de recibos.

## 5. P3 — Gobierno de datos, baja y exportación exclusiva SuperAdmin

**Política solicitada:** solo SuperAdmin inicia y entrega la exportación de información empresarial al solicitarse una baja. El propietario no debe tener exportación empresarial directa en Ajustes.

- **Urgente UI + permisos:** retirar el exportador de Ajustes y bloquear operaciones de exportación por `dueño` **tanto en lógica y reglas como en interfaz**, sin eliminar ni invalidar datos antiguos. No basta con esconder botones.
- `backupRepository` y Firestore Rules actuales NO conceden al SuperAdmin acceso general a todas las colecciones operativas. Resolver explícitamente el modelo de autorización/auditoría de acceso de plataforma y su impacto en privacidad; no dar permisos universales de escritura.
- Exportar bajo solicitud documentada por negocio, con identidad verificada, cifrado, manifiesto, datos excluidos, controles de integridad, paginación, límites/costo de lecturas, y entrega segura. No declararlo copia legal íntegra si faltan datos históricos, Authentication, fotos o pendientes locales.
- Fotos y pendientes solo en equipos particulares **no son remotamente recuperables** por SuperAdmin si nunca se sincronizaron: documentar consentimiento y extracción asistida cuando corresponda.
- Baja: estados `solicitada → bloqueada para nuevas operaciones → inventariada → exportada/entregada/confirmada → autorizada para depuración → depuración en curso → reconciliada → cerrada`. Registrar responsable, motivos, conservación legal y comprobantes, sin atribuir a logs del cliente valor probatorio absoluto.
- Crear **inventario recursivo de todas las rutas** y subcolecciones por `businessId` (sin asumir que borrar documentos padre borra subcolecciones). Diseñar limpieza idempotente y reanudable con cursores/checkpoints, conteos antes/después, auditoría y reconciliación de documentos huérfanos. Prohibir borrado de objetos de terceros.
- La eliminación masiva segura desde un cliente Spark puede no ser verificable o posible con Rules, y Firebase Auth de otros usuarios no se puede administrar desde un cliente normal. Mantener **purga productiva deshabilitada** mientras no se demuestre un protocolo seguro; diseñar, si hace falta, un procedimiento supervisado desde Firebase Console con identidad humana del propietario, sin Blaze, sin cuenta de servicio embebida y sin borrado automático no autorizado.
- **No autorizar ninguna eliminación real** como parte de este plan; no borrar usuarios ni negocios activos. La solicitud del cliente no sustituye política de retención ni obligaciones legales aplicables.

## 6. Criterios de cierre

- Acceso de dueño y cajero recuperado sin falsos mensajes ni escaladas de privilegios; diagnósticos permiten distinguir falta de perfil, tenant, licencia, reglas e Internet.
- Contratos→POS→Contratos preserva al menos filtros/paginación y evita lecturas de servidor innecesarias dentro de la política de validez definida.
- Se mide consumo de lecturas bajo uso normal; Excel solo consulta lo necesario para el período solicitado y no refresca de forma compulsiva.
- El negocio puede construir un carrito de múltiples productos; el cobro real de ese ticket solo se habilita al demostrar seguridad end-to-end con Rules integradas.
- Solo SuperAdmin puede realizar exportación empresarial; el acceso y alcance están efectivamente protegidos del lado de Firestore.
- Baja empresarial segura definida y con dry-run e inventario; destrucción real requiere autorización independiente y una vía técnicamente comprobada.
- No pruebas masivas añadidas. Lint/build/diff-check y verificaciones **focalizadas e indispensables** de reglas financieras, permisos, aislamiento, identidad y no-borrado. Aceptación manual del propietario sin tocar datos ajenos.
- Cambios en rama independiente de UX, sin deploy ni merge automático.

## 7. Base técnica oficial

- Firestore free tier: **50 000 lecturas, 20 000 escrituras, 20 000 eliminaciones por día, 1 GiB** (Standard; sujeto a términos actuales).
- Security Rules para transacciones: límites documentados de acceso a documentos; la existencia de `getAfter()` no implica agregación arbitraria segura.
- Firestore client local persistence **no garantiza cero nuevas lecturas** tras reconexiones o nueva suscripción.
- Gestión/borrado de cuentas Authentication ajenas pertenece a Admin SDK/Console, no a una operación privilegiada de React.

Documentación: https://firebase.google.com/docs/firestore/pricing ; https://firebase.google.com/docs/firestore/security/rules-conditions ; https://firebase.google.com/docs/firestore/manage-data/enable-offline ; https://firebase.google.com/docs/auth/admin/manage-users
