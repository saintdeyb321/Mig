# MigaPOS P24 — Auditoría de caché, listeners y lecturas Firestore

**Fuente:** lectura estática de `saintdeyb321/Mig`, rama `fix/migapos-production-readiness`, commit `d9454305bb6629920775f01b77c000a7ec90fd41` (15/11/2026). Captura del usuario: campana roja 14 y posteriormente 0. **No se accedió a producción, no se midió facturación ni se modificó el repositorio.** CI de este commit: Success. Los números de listeners son límites de código y NO equivalen a lecturas facturadas. 

## Diagnóstico y riesgos por prioridad

### P0 — Contador fantasma de notificaciones: confirmado como comportamiento posible
- `frontend/src/features/notifications/hooks/useAlerts.js`: `useScopedSubscription(identityKey, subscribe, ..., { preserveOnError: true })`. La suscripción entrega datos incluso cuando `isStale: true` y no habilita `allowCachedData`.
- `frontend/src/components/NotificationBell.jsx`: el indicador utiliza `alerts.length` sin verificar `notificationsStale` ni si todos los marcadores de lectura están confirmados.
- `frontend/src/features/notifications/infrastructure/notificationQueryRepository.js`: las consultas de evidencia de dueño pueden emitir vistas desde caché; los marcadores de lectura se consideran verdaderos únicamente después del snapshot con `fromCache:false` y `hasPendingWrites:false`. El mismo usuario puede visualizar 14 avisos provenientes de caché y 0 cuando se confirman marcadores o una consulta actualizada. No probar que ocurrió exactamente así sin trazas de esa sesión.
- Solución: separar conteo `confirmedUnreadCount` y lista provisional. Si falta confirmación inicial, mostrar guion o indicador de sincronización en lugar de un número falso. Si había un último conteo verificado de la MISMA identidad, mantenerlo con señal de obsolescencia; nunca reaprovechar contadores de otro usuario/tenant. No eliminar avisos financieros por un error transitorio.

### P0 — Número excesivo de listeners en la campana del dueño
- `notificationQueryRepository.js`: siempre abre cuatro consultas superiores para dueño: `notifications` (hasta 30), `pos_voids` (30), `cash_sessions` por `closedAt` (30) y por `recoveredAt` (10). **Hasta 4 listeners de consultas** constantes.
- Cada aviso proyectado de las últimas tres consultas crea un `onSnapshot(doc('notifications', readMarkerId))`. Son **hasta 70 listeners de documentos adicionales** (30+30+10). La verificación se hace aun cuando el diálogo de la campana está cerrado. Además, `useAlerts.js` observa perfiles `users` para mostrar nombres (puede compartirse mediante `SessionResources`), y `NotificationBell.jsx` añade una consulta de cajas lógicamente expiradas de hasta 10 documentos solamente al abrir el diálogo.
- Con 14 avisos financieros pueden existir aproximadamente 4+14 listeners de notificaciones, más los de perfiles/globales. No suponer que 18 listeners son 18 lecturas exactamente: Firestore factura documentos, consultas y lecturas de Rules/indexes, especialmente en reconexión.
- Solución: definir presupuesto de consulta de notificaciones, desacoplar recuento validado y detalle, y eliminar el patrón de un listener permanente POR marcador si existe alternativa verificada con pruebas de Rules. No sustituir el sistema financiero por notificaciones no verificables. Evitar que marcar una notificación la haga reaparecer, y mantener la seguridad por usuario y tenant. Si no se puede reducir lectores sin desnaturalizar el recuento en tiempo real, documentar el coste y el motivo, y hacer la consulta de detalles solo al abrir la campana.

### P1 — Historial y anulaciones: N listeners para verificar recibos
- `frontend/src/features/sales/infrastructure/salesRepository.js`: `subscribeRecentSales` abre dos consultas, una ordenada por `confirmedAt` y otra por `createdAt`, cada una con `limit(50)`; solo cuando se usa Historial/ventana relacionada, con retención inactiva de recursos compartidos.
- `frontend/src/features/sales/hooks/useRecentSales.js` llama a `posVoidQueryRepository.subscribeIds` con los IDs de ventas candidatas a anulación.
- `frontend/src/features/sales/infrastructure/posVoidQueryRepository.js`: `subscribeIds` crea un listener individual para cada ID, hasta 50. Son hasta 52 listeners en el historial además de las fuentes de IndexedDB que no tienen costo Firestore. Evaluar lectura condicionada o por lotes respetando Rules y recuperación de anulaciones.

### P1 — Catálogo permanente con queries sin límite y reescritura Dexie
- `frontend/src/features/catalog/context/CatalogProvider.jsx` y `catalogRepository.js`: observan `products` y `categories` de todo el negocio sin límite, aunque el cajero solo trabaje una sede; esto beneficia el POS, pero escala con número de productos. Las fotos Base64 aumentan bytes transferidos, no el número de lecturas por documento.
- `frontend/src/core/cache/subscribeTenantCache.js` y `tenantCache.js`: ante snapshots confirmados vuelven a ejecutar sincronización completa (buscar claves, `bulkDelete`, `bulkPut`). Esto ocurre también por cambios de metadatos o cambios en un documento si no hay deduplicación; provoca trabajo IndexedDB innecesario, NO escrituras facturadas de Firestore.
- Mejorar deduplicación incremental por cambios reales y tenant; preservar soporte offline y la seguridad de proyecciones de stock. No eliminar Dexie para optimizar costos.

### P1/P2 — Cache de sesión y retención de listeners
- `frontend/src/core/session/sessionResources.js`: `watch()` comparte por clave, mantiene listeners 120 segundos tras perder su último consumidor; este margen evita reconectar con cada cambio rápido de módulo, pero mantiene tráfico durante el intervalo.
- `maxListeners=8` no significa límite estricto de memoria: al superar el número, `halt()` detiene los inactivos pero NO elimina la entrada de `listeners` ni `cells`; `values` también puede crecer con claves por sede/módulo. No hay prueba de fuga infinita con un negocio de pocas sedes, pero el mapa no está formalmente acotado hasta cerrar sesión.
- `reads` sí tiene límite de 12 entradas; `reportCache` también máximo 12. El proveedor se desmonta/limpia por identidad; los listeners documentados utilizan funciones `unsubscribe`. No hay evidencia de listeners globales huérfanos continuos.
- Establecer evicción por LRU/TTL de entradas inactivas que NO incluyan operaciones, colas, comandos idempotentes ni datos financieros en curso. No reducir a 0 el idle sin medir el efecto de reconexión.

### P2 — Informes, mantenimiento y límites de diagnóstico
- `frontend/src/features/reports/application/reportResource.js`: cache de hasta 12 entradas, TTL de 2 min para periodos cortos y 15 min para mes/todo; `useReports.js` intenta actualización cuando vuelve el foco/conexión. El cache es intencional, no todo refresh ejecuta consulta si TTL vigente.
- `frontend/src/hooks/useMaintenance.js`: un listener sobre `system/status`, de larga duración y con unsubscribe; razonable en costo salvo si se multiplica por instalaciones/pestañas.
- `frontend/src/core/firebase/client.js`: `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`, una decisión correcta para caché multipestaña; no garantiza cero lecturas. Una desconexión >30 min puede causar lecturas de consulta completas al reconectar.
- `frontend/src/core/firebase/readDiagnostics.js`: contabiliza solo `checkedRead` (consultas de una sola ejecución), no todos los `onSnapshot`, ni Rules, ni lecturas de índices, y por tanto NO muestra el total facturable.
- `sessionResources.diagnostics().serverRows` cuenta filas emitidas en snapshots; se puede incrementar por emisiones de metadatos que NO son nuevos documentos facturables. Tratarlo como observabilidad de aplicación, no factura.

## Matriz de acciones (sin cambiar lógica financiera)

| Prioridad | Acción | Criterio verificable |
|---|---|---|
| P0 | Evitar mostrar contadores transitorios de caché/ack | Inicial cache 14 -> servidor 0 no muestra 14 como confirmado; error de conexión no genera 0 engañoso |
| P0 | Medir y reducir listeners de notificaciones, especialmente marcadores por documento | Contabilizar listeners y arranques/paradas por fuente e identidad; arquitectura final acotada documentada |
| P1 | Reducir verificaciones individuales de anulaciones en Historial sin alterar evidencia | Repetir historial no dispara N suscripciones si no cambiaron IDs; preservar reglas e idempotencia |
| P1 | Evitar sincronizaciones Dexie completas en snapshots solo de metadatos | Mismo contenido de productos/categorías no produce `bulkPut` redundante |
| P2 | Auditar retención/ejectión en `SessionResources` | Cambio repetido de sede y módulo no deja crecimiento ilimitado de Map ni listeners vivos |
| P2 | Medición de datos y conexión | Reporte local de escucha por consulta, visitas en frío/en caliente, reconexión, multipestaña y errores |

## Protocolo de medición, obligatorio antes/después
1. En emuladores `demo-migapos`, inyectar SDK Firestore con wrappers de `onSnapshot`, `getDocFromServer`, `getDocsFromServer`, `getDoc`, `getDocs`; registrar starts/stops, scopes, eventos `fromCache`, docs recibidos y docChanges. NO interpretar cada snapshot como una lectura facturable.
2. Probar dueño con 0/14/30/70 avisos; cajero con 0/14; abrir/cerrar campana repetidamente; cambiar cinco veces módulos y sedes; renovar Auth, reconectar, abrir dos pestañas, activar/desactivar PWA. Verificar cancelación `unsubscribe` y que el conteo verificado no oscile por marcadores de caché.
3. Escenario específico 14 -> 0: simular evidencia cacheada con 14 marcadores inicialmente desconocidos y después 14 confirmados como leídos por servidor. Probar además que alertas nuevas permanecen y las otras 14 no reaparecen.
4. Reportar costo incremental estimado solo como `documentos recibidos de servidor por tipo de consulta`, no como factura exacta. Cross-check con Firestore Usage/Cloud Monitoring en periodo controlado. Las Rule dependent reads y index entry reads no se estiman por `snapshot.size`.
5. Instrumentación solo de desarrollo/pruebas; no registrar emails, documentos, tokens o contenido de ventas; no instalar paquetes ni enviar telemetría externa.
6. Mantener pruebas Spark/Rules/Chromium, sesión, caja, POS, cifrado y `npm run release:build -- --env production`. No modificar Rules salvo demostración y tests de seguridad.

## Resultado local P24

La campana conserva el último recuento verificado de la identidad actual mientras el servidor confirma las fuentes y sus acuses. Sin un recuento previo muestra «–». Los acuses se observan por negocio, usuario, tipo e ID de origen en lotes de hasta 24. Cuatro filtros por miembro del `in` y el orden implícito caben en el límite de 100. Las tres fuentes financieras y la consulta de avisos anteriores siguen activas para conservar el recuento en vivo.

### Comparativa en el emulador `demo-migapos`

| Rol / avisos sintéticos | Consultas antes → después | Escuchas por documento antes → después | Snapshots de servidor antes → después | Filas de servidor antes → después |
|---|---:|---:|---:|---:|
| Dueño / 0 | 4 → 4 | 0 → 0 | 4 → 4 | 0 → 0 |
| Dueño / 14 | 4 → 5 | 14 → 0 | 18 → 5 | 14 → 14 |
| Dueño / 30 | 4 → 6 | 30 → 0 | 34 → 6 | 30 → 30 |
| Dueño / 70 | 4 → 9 | 70 → 0 | 74 → 9 | 70 → 70 |
| Cajero / 0 | 1 → 1 | 0 → 0 | 1 → 1 | 0 → 0 |
| Cajero / 14 | 1 → 1 | 0 → 0 | 1 → 1 | 14 → 14 |

Se midió un ciclo de suscripción hasta el primer recuento confirmado, con evidencia sintética sin acuses previos. Cada inicio tuvo su correspondiente cancelación. Las llamadas de una sola ejecución fueron 0 en todos los ciclos. Los recuentos de cambios de documentos de servidor fueron 0, 14, 16 y 40 para dueño y 0 y 14 para cajero en ambas versiones, con el cliente reutilizado entre escenarios. Las filas emitidas y los eventos de caché o metadatos son observaciones del SDK. La facturación y las lecturas de Rules/índices quedan fuera de esta medición.

- Chromium comprobó un flujo compartido de avisos y cero consultas de detalle con la campana cerrada. Abrirla activa personal y vencimientos lógicos para el dueño. Cerrarla, cambiar de identidad o desmontar libera sus escuchas. La suscripción de personal se comparte si otro módulo sigue usándola.
- Dos clientes simultáneos del emulador vieron el mismo aviso. El acuse de uno retiró el aviso de ambos y la reconexión no lo reintrodujo. Las consultas directas con otro usuario o negocio fueron rechazadas por las Rules vigentes.
- El historial pasa de hasta 50 escuchas de recibo a dos consultas por `saleId` (52 → 4 contando las dos de ventas que existían). La suite verifica 50 IDs con recibos presentes y ausentes, y rechaza otras sedes y negocios. Reordenar IDs no reinicia las consultas.
- Dexie omite la transacción para snapshots confirmados idénticos y escribe filas modificadas en orden cuando el contenido difiere. En la prueba, dos cambios y una repetición confirmada produjeron dos transacciones y una fila por escritura. La proyección de stock y las colas usan sus autoridades existentes.
- SessionResources libera las entradas inactivas por LRU o TTL, conserva consumidores activos y limita las lecturas completadas retenidas a 12. Los recursos de operaciones, comandos y vistas conservan su ciclo de vida por identidad.

### Validación local

PASS en Node (97), Chromium (7 casos distintos), Spark Rules (86), lint, build de producción, `check:build` y `git diff --check`. Chromium cubrió campana, recuperación de identidad, arranque Spark, IndexedDB, carreras del POS y actualización segura de PWA entre pestañas. Las consultas por lotes se probaron con las Rules locales vigentes. Queda fuera de la medición la verificación de índices desplegados y facturación en Firebase real.

## Referencias
- [Código de notificaciones](https://github.com/saintdeyb321/Mig/blob/d9454305bb6629920775f01b77c000a7ec90fd41/frontend/src/features/notifications/infrastructure/notificationQueryRepository.js)
- [Control de caché y listeners](https://github.com/saintdeyb321/Mig/blob/d9454305bb6629920775f01b77c000a7ec90fd41/frontend/src/core/session/sessionResources.js)
- [Caché Dexie](https://github.com/saintdeyb321/Mig/blob/d9454305bb6629920775f01b77c000a7ec90fd41/frontend/src/core/cache/subscribeTenantCache.js)
- [Firestore — facturación](https://firebase.google.com/docs/firestore/pricing)
- [Firestore — límites gratuitos](https://firebase.google.com/docs/firestore/quotas)
