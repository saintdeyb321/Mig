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
2. El agente lee este documento y, para las fases Spark, `docs/PLAN-REFAC-SPARK-MIGAPOS.md`, aprobado por el titular.
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
| 5 | Contratos, pedidos y ledger de pagos | COMPLETADA |
| 6 | Caja, alertas y auditoría | COMPLETADA |
| 7 | Reportes, dashboard y Excel | COMPLETADA |
| 8 | Licencias, SuperAdmin, backups y borrado | COMPLETADA |
| 9 | Branding MigaPOS y limpieza general | COMPLETADA |
| 10 | Tests, CI, observabilidad y release | LISTA PARA STAGING |

Este estado debe actualizarse a medida que se aprueben fases.

## Reencaminamiento Firebase Spark — base `e92c702`, 23/10/2026

Rige `docs/PLAN-REFAC-SPARK-MIGAPOS.md`. Spark es obligatorio: proyecto `migapos`, Hosting `migapos-peru`, Authentication, Firestore y persistencia local; sin Blaze, Cloud Functions desplegadas, Storage ni backend de pago. F1–F10 conservan su historia y dominio, pero su dependencia de servidor **no acredita funcionamiento financiero en Spark**. Los procedimientos históricos de despliegue/backend no se aplican a esta transición; la publicación Spark se revisará en SPARK-7. No se hizo ningún deploy.

| Fase | Alcance | Estado |
|---|---|---|
| SPARK-0 | Capacidades, arranque y separación plataforma/negocio | EN PROGRESO: código y validación local completados; aceptación manual con login real pendiente |
| SPARK-1 | Lectura SaaS y creación atómica real de negocio/licencia/sede/invitación, Rules estrictas | COMPLETADA LOCALMENTE; publicación de Rules y aceptación manual pendientes |
| SPARK-2 | Catálogo, sedes, usuarios, agenda e índices | COMPLETADA LOCALMENTE; comprobación real de Rules/índices y UI pendiente |
| SPARK-3 | Caja y puerta de factibilidad de venta segura con Rules | COMPLETADA LOCALMENTE para apertura online nueva y prototipo de 2 productos; POS general bloqueado |
| SPARK-4 | POS, anulación, stock e idempotencia/offline | VALIDADA LOCALMENTE para POS online de 2 productos; anulación POS y sincronización offline BLOQUEADAS |
| SPARK-5 | Contratos, ledger, cuotas, refunds y cierre | VALIDADA LOCALMENTE para contratos Spark y cierre operativo; históricos en lectura, conciliación certificada BLOQUEADA |
| SPARK-6 | Reportes, alertas, imágenes y cuotas Spark | VALIDADA LOCALMENTE; publicación de Rules/índices y aceptación manual pendientes |
| SPARK-7 | Backups locales, mantenimiento y publicación controlada | IMPLEMENTADA, PENDIENTE DE PUBLICACIÓN Y ACEPTACIÓN MANUAL |

### SPARK-4–6 — ejecución desde `f5ee85da5ad5375328abeac085537b7fb19749f3`

**Destino vigente:** Spark, Authentication + Firestore + Rules + Hosting `migapos-peru`, proyecto `migapos`. Sin Functions/Storage/Blaze, deploy, cuentas de servicio, cambios de `.env` o datos reales. Los inventarios SPARK-0 y F1–F10 siguientes son históricos; este apartado registra el comportamiento actual.

- **SPARK-4:** `sparkSalesRepository` confirma online, con IDs estables, receipt inmutable, transacción y lectura posterior del servidor. Máximo **2 productos distintos/ticket**, visible en POS; Cantidades enteras hasta 1000000 por producto e importes/costo/recibido hasta S/ 1000000000: el repositorio informa el exceso y rechaza el ticket entero; no modifica tickets históricos. Rules integradas comprueban perfil/rol/tenant/sede/licencia/horario de servidor, caja Spark y candado, precios/costos canónicos, centavos, efectivo/Yape/mixto/vuelto y todos los descuentos. `posStockVersion` continúa como **mapa por sede**, conservando las versiones de otras sedes; receipt incluye versiones verificadas para retirar proyecciones locales. Catálogo no puede escribir `posLastSaleId`/versiones ni borrar productos con versiones financieras. El fixture escalar incompatible fue retirado; `tests/spark-financial.rules.test.mjs` carga exclusivamente `firestore.rules`.
- **Restricciones SPARK-4:** anulación POS OFF: las Rules actuales solo autorizan débito de inventario y ledger de contratos; falta un crédito de stock enlazado de forma indivisible al refund POS y su sesión de caja, validado dentro de los límites de Rules; venta original inmutable. `offlineSync` OFF: no existe protocolo que pruebe una hora offline ni autorice precios/caja/licencia históricos. Se conserva Dexie, cifrado, esquema, leases y payload original. Cada cobro online procesa solo su ID nuevo, sin vaciar pendientes previos ni sincronizar cajas antiguas. Desconexión/acuse perdido queda **pendiente**, también en impresión. Historial permite filtrar los últimos 50 pendientes y **consultar receipt remoto sin cobrar**; solo un receipt equivalente recupera el acuse local. No se borran registros.
- **SPARK-5:** contratos nuevos con `sparkContractVersion: 1`: alta idempotente con recibo `spark_contract_operations`, anticipo, cuotas, saldo, edición comercial permitida, entrega con/sin deuda, cancelación por dueño y devoluciones. Operan en la sede de origen; cobros/devoluciones requieren caja Spark propia abierta, mientras alta sin anticipo, edición y entrega no exigen caja; no se habilitan cobros cruzados entre sedes. `payments` es ledger inmutable firmado por signo; Rules vinculan cada pago al incremento exacto de `paidByMethod`, `paidTotal`, saldo y versión del contrato. Cancelación conserva contrato y abonos, devuelve una vez el neto verificable de cada método (efectivo/Yape/Plin) con IDs estables y `reversalScope: contract-method-balance`; no inventa reversos por movimiento antiguo. Las lecturas reutilizan el parser puro histórico extraído a `functions/src/contracts/domain/legacyPaymentPlan.js`, con IDs de vista idénticos, sin migrar/escribir datos históricos. Contratos legacy conservan lectura/impresión; escrituras financieras bloqueadas hasta revisión, nunca se certifica un saldo legado arbitrario.
- **Caja:** apertura/cierre online de sesiones Spark; cierre propio o forzado por dueño del tenant/sede, idempotente, declaración y motivo protegidos, liberación atómica del candado. POS/cuotas/refunds requieren caja abierta en el estado final de la operación; no pueden añadirse después del cierre ni dentro del mismo lote de cierre. El resumen calcula fondo, efectivo POS/contratos, digital/mixtos y diferencia desde libros confirmados, pero persiste como **`closeEstimate.authority: client-estimate` y `reconciliationPending: true`**. La UI/Excel no lo presentan como conciliación certificada: una operación concurrente puede alterar la estimación previa. `cashReconciliation` OFF porque Rules no suma arbitrariamente todo el ledger. Sedes sin `sparkCashVersion: 1` y candados antiguos no se activan/migran/eliminan automáticamente.
- **SPARK-6:** dashboard diario/histórico y Excel detallado/resumido derivados de ventas/pagos confirmados; ventas Spark se consultan por `confirmedAt` del servidor, nunca por fecha local para atribuir ingreso. Lecturas compatibles ISO/Timestamp, paginación de 200 y máximo 10000 movimientos por consulta; abortan sin reportes parciales. Estados de pedidos creados en el período (pendientes/entregados/cancelados/deuda) y hoja `Estado_Pedidos`, incluso sin anticipo. Compatibilidad de pagos embebidos: barrido acotado de **500 contratos del negocio**, con verificación de sede; más volumen, fechas/métodos ambiguos o cobros sin libro verificable exigen revisión, sin inferir importes. Los agregados se derivan en memoria reutilizando dominio, no se escriben `daily_stats` manipulables; sin listener global ni polling financiero continuo. Alertas informativas por operación autorizada, atómicas y para su actor; no hay triggers, scheduler ni notificación certificada de importes.
- **Imágenes:** compresión local JPEG (entrada JPEG/PNG/WebP hasta 5 MiB y 24 megapíxeles; máximo 256 KiB + miniatura 64 KiB), hasta 20 referencias pequeñas por contrato, sin blobs/base64 en Firestore. IndexedDB existente, claves por UID/negocio/contrato, sin borrar ni cambiar esquema/cola. Solo dispositivo/cuenta actual; sin sincronización ni garantía de backup compartido. Referencias Storage antiguas conservadas, marcadas no disponibles; impresión de texto sigue operativa sin foto. Logo, PWA e impresión sandbox conservados.
- **Capacidades:** `saleOnline`, `contractPayments`, `cashClosing` ON; `saleVoid`, `offlineSync`, `cashReconciliation`, `cloudFunctions`, `cloudStorage`, `platformJobs` OFF. No existe desbloqueo financiero global.

**Validación local:** lint, build y diff-check; Rules Spark integradas **34/34** (15 financieras + 19 de autorización/provisioning/caja), incluyendo idempotencia, carreras de última unidad/abonos/catálogo/cierre, aislamiento, horarios, pagos manipulados, compensación de tres métodos y no duplicación. Chromium aislado: **9 checks** de compresión/IndexedDB/cambio de cuenta/cola cifrada y etiqueta de pendiente; comprobaciones Spark de capacidades/SDK/branding aprobadas. Sin cambios del árbol de dependencias: no se repitió auditoría ni suite histórica completa. Permanece el aviso de chunks grandes del build.

**Pendiente externo:** revisar/publicar `firestore.rules` y nuevos índices `confirmedAt`/contratos en `firestore.indexes.json` con autorización posterior; nada se desplegó. Aceptación manual posterior a publicación: dueño con sede Spark → abrir caja → ticket efectivo y mixto de 1–2 productos → stock/historial/impresión; contrato con anticipo → cuota → entrega → cancelación con devolución por dueño → reporte/Excel → cierre operativo; desconectar y revisar pendientes sin sincronizarlos; foto local y otra cuenta/dispositivo sin ella. El cierre técnico de SPARK-7 se registra en el apartado siguiente; su publicación y aceptación manual siguen pendientes.

### SPARK-7 — implementación desde `4314fbc55bdc007a26f811ae544b38e2fe24399e` (23/10/2026)

**IMPLEMENTADA, PENDIENTE DE PUBLICACIÓN Y ACEPTACIÓN MANUAL.** Se trabaja en `main`; el titular revisa, crea el nuevo commit y lo sube según el flujo de este plan. No se ejecutó deploy ni login real, no se crearon cuentas/datos en `migapos`, no se tocaron `.env` ni se usaron cuentas de servicio. CI remota del nuevo código pendiente.

- **Exportación manual:** dueño en Ajustes y SuperAdmin por empresa. Abrir el panel no consulta Firestore; requiere consentimiento y descarga explícita. Verifica UID/perfil del servidor, negocio y Rules vigentes; SuperAdmin no hereda acceso a catálogo/contratos/sedes. Páginas de hasta 200, máximo configurable 100/500/2000/5000 documentos totales y 16 MiB remotos; puede consumir lecturas adicionales de perfil/páginas vacías. No reserva cuota global ni garantiza disponibilidad al agotarse Spark. Incluye `tenants`, `licenses`, `settings` (empresa), `branches`, `categories`, `products`, `customers`, `sales`, `contracts`, `payments`, `cash_sessions`, `active_cash_sessions`, `users`, `invites`, `spark_contract_operations`, `alerts`, `audit_events`, cuando las Rules autorizan. Se omiten credenciales y campos sensibles; empresa/perfiles tienen listas permitidas. Cada colección declara cantidad, estado y advertencia si está limitada/inaccesible; continúa con el alcance permitido.
- **Archivos locales separados:** consentimiento propio y cifrado obligatorio para pendientes/fotos. Lee hasta 500 ventas pendientes de UID/negocio y examina hasta 500 cajas locales; cajas no descifrables quedan advertidas sin exponer otra identidad. Fotos JPEG del usuario/negocio actual, hasta 100 y 4 MiB binarios, con original comprimido y miniatura. No modifica IndexedDB, esquema, cifrado anterior, cola, leases, recibos ni referencias Storage. Registros históricos sin identidad indexada, imágenes ajenas y otros dispositivos no se incluyen. No sincroniza ni acredita ingresos.
- **Formato:** JSON versionado, fechas de inicio/fin del dispositivo (no confirmación financiera), colecciones/cantidades/advertencias y SHA-256 por colección/global; fotos también incluyen digest binario. Cifrado ofrecido y activado por defecto: AES-256-GCM, PBKDF2-SHA256 con 310000 iteraciones, salt/IV aleatorios; contraseña de 12–1024 caracteres solo en memoria y borrada del formulario después de cada intento. Su pérdida impide recuperar el archivo. Máximo 24 MiB de contenido antes de cifrar; reducir/separar el alcance si se excede. La descarga es real; conviene verificar el archivo guardado mediante dry-run local. El dry-run comprueba versión, negocio, cantidades y hashes: **0 escrituras**, ninguna restauración disponible. No certifica origen, saldos ni conciliación; JSON sin cifrar contiene información personal. No es copia integral de Firebase ni snapshot atómico; no exporta Authentication, secretos, Storage, subcolecciones o colecciones no declaradas. Evitar movimientos concurrentes al exportar y conservar los archivos en un lugar privado.
- **Plataforma/UX:** se retiran hook cloud, pantallas de jobs, descarga de partes Storage, purga y borrado de tenants; permanecen alta, licencias, invitaciones, activación/suspensión y sedes. Sin scheduler ni restauración privilegiada. UID/email de sesión proceden de Auth y no pueden ser reemplazados por campos históricos del perfil. Términos, agenda, exportador y notificaciones muestran diagnóstico de permisos/conexión/índices; una suscripción fallida no se presenta como «sin notificaciones». No se parchea CORS.
- **Invariantes conservados:** POS online hasta 2 productos, receipt inmutable, precios/stock por sede, idempotencia y confirmación remota; anulación POS y sincronización financiera offline OFF. Contratos Spark/ledger inmutable y restricciones históricas intactos. Cierre con `reconciliationPending: true`, sin certificación. Reportes excluyen pendientes. No se modificaron `firestore.rules`, `firestore.indexes.json` ni `.firebaserc`; revisión focalizada comprobó índices existentes de notificaciones (`businessId/userId/readAt/createdAt DESC`), ventas por `confirmedAt` y contratos por estado/fecha/rangos, sin abrir permisos ni agregar índices especulativos.
- **Release Spark:** `firebase.json` operativo sin recursos/hooks de Functions/Storage; emuladores solo Auth/Firestore. Configuración de producción generada con únicamente Hosting y Firestore `(default)`, site exacto `migapos-peru`, proyecto `migapos`, SPA estática y CSP sin endpoints de emulador/Functions/Storage. Base bloqueada para deploy por defecto. Guard exige configuración generada, reconocimiento exacto de proyecto/site, checkout limpio, commit/fingerprint con CI aprobada y hashes del entorno público, build completo, configuración y política archivada; el fingerprint normaliza LF/CRLF de texto para Windows/Linux. `prepare` solo admite artefactos demo de CI; producción exige `release:build`. CI verifica exportador/Chromium/Rules, genera configuración demo y nunca despliega. Logo, actualización explícita del SW y persistencia se conservan; no hay limpieza IndexedDB.

**Validación local de SPARK-7:** lint; build/PWA y `check:build`; 10 tests focalizados de formato/cifrado/tamper/secretos/cuota/guardas/índices/tooling; 3 tests de exportación con las Rules principales en Firestore Emulator `demo-migapos`; Chromium aislado: 8 comprobaciones de exportación/descarga cifrada/consentimiento/integridad/identidad/IndexedDB y 10 de arranque SuperAdmin. Configuración real de destino validada localmente, sin conexión Firebase. Diff-check y configuración generada sin deploy. Aviso conocido de chunks grandes. No se repitieron suites históricas ni se declara aprobado el login Google real o CI remota.

**Archivos de publicación futura:** contenido completo de `frontend/dist/` (incluye `index.html`, assets, `manifest.webmanifest`, `sw.js`, Workbox e iconos), `firestore.rules`, `firestore.indexes.json`, usando exclusivamente `firebase.production.generated.json` generado desde el commit final. `.firebaserc` conserva el destino existente; `.release/*` son comprobantes/copias locales, no recursos a publicar. Nunca publicar config demo, `.env`, Functions, Storage, fuentes de tests ni datos de prueba. El build de validación del árbol sin commit no sustituye al build del commit limpio aprobado.

**Procedimiento vigente preparado, NO ejecutado contra Firebase (PowerShell/Windows):** usar Node 22, CLI instalada desde lockfile y cuenta humana del propietario; nunca cuenta de servicio. Estas instrucciones no autorizan publicación. Antes de sustituir Rules o índices, realizar y revisar las siguientes lecturas con autorización del propietario:

1. Firebase Console → proyecto **migapos** → Firestore Database → base **(default)** → **Rules**. Seleccionar/verificar la versión **actualmente publicada** (no un borrador del editor); anotar identificador o fecha/hora de publicación y revisor. Copiar todo su texto a `.release/captured-firestore.rules` en UTF-8, contrastarlo otra vez con la versión publicada y conservarlo fuera del checkout. No pulsar Publicar. Esta captura de procedencia es **manual**: el script local no consulta Firebase ni puede certificar que el operador copió la versión correcta.
2. Registrar esa copia local con el comando siguiente. Crea `.release/published-policy/migapos/SHA256/{firestore.rules,manifest.json}` con proyecto/base, versión declarada, revisor, fecha de captura y hash; `source: firebase-console-manual`, `publicationVerified: manual`. El SHA-256 detecta cambios posteriores del archivo, no demuestra su procedencia por sí solo.

```powershell
node scripts/release.mjs record-published-rules --env production --file .release/captured-firestore.rules --version "VERSION_O_FECHA_PUBLICADA" --reviewer "PROPIETARIO" --confirm-console "migapos/(default)"
```

3. Revisar los índices activos en Console (compuestos, ámbito de consulta, estado y exenciones de campo). Como alternativa de **solo lectura**, la CLI instalada admite `npx --no-install firebase firestore:indexes --project migapos --database "(default)" --json`; guardar y revisar su resultado antes de autorizar cambios. **Este comando no se ejecutó aquí.** Comparar el conjunto activo con `firestore.indexes.json`: conservar índices/exenciones existentes que sigan siendo necesarios, incluso si no los utiliza este refactor. Si falta alguno en el candidato, incorporarlo mediante revisión y nuevo commit/CI/build antes de publicar. Nunca confirmar eliminaciones inesperadas ni usar `--force`. El reconocimiento del hash siguiente es una declaración de revisión del propietario, no una consulta automática de producción.
4. Revisar/commitear/subir el código final y obtener CI aprobada del **mismo commit limpio**. Descargar su artefacto como `.release/ci-verification.json`, conservar la configuración pública real existente y reconstruir. No heredar variables demo de las pruebas. En la sesión futura autorizada:

```powershell
npm run release:check -- --env production
npm run release:build -- --env production
npm run check:build
npm run release:plan -- --env production
$env:MIGAPOS_RELEASE_ENV = 'production'
$env:MIGAPOS_ALLOW_RELEASE = 'migapos/migapos-peru'
$env:MIGAPOS_PREVIOUS_RULES = 'SHA256_COPIA_PUBLICADA_IMPRESO'
$env:MIGAPOS_REVIEWED_INDEXES = 'migapos/(default)/' + (Get-FileHash .\firestore.indexes.json -Algorithm SHA256).Hash.ToLowerInvariant()
```

Las guardas exigen ambos registros/reconocimientos además de commit, CI y build coincidentes. **Los archivos `.release/policy/migapos/SHA_COMMIT/` son del repositorio/build (`source: repository-build`, `publicationVerified: false`), no snapshots de producción y no se aceptan como origen de rollback.** Un build de validación con cambios locales debe repetirse después del commit final limpio. No publicar archivos demo ni `.env`.

Solo tras autorización posterior, ejecutar individualmente estos comandos (sustituir `SHA12` por el prefijo del commit final); el argumento `--only` con coma queda entre comillas para PowerShell:

```powershell
npx --no-install firebase hosting:clone migapos-peru:live migapos-peru:rollback-SHA12 --project migapos
npx --no-install firebase deploy --only "firestore:rules,firestore:indexes" --project migapos --config firebase.production.generated.json
npx --no-install firebase deploy --only hosting --project migapos --config firebase.production.generated.json
```

Esperar índices listos antes de aceptar consultas. Si falla una etapa, detener publicación y comprobar el estado real. Nada de lo anterior se ejecutó contra Firebase en esta corrección.

**Rollback separado:** conservar el canal anterior y verificar su vigencia. Con autorización específica, `npx --no-install firebase hosting:clone migapos-peru:rollback-SHA12 migapos-peru:live --project migapos` revierte solo Hosting; aceptar la actualización/recargar la PWA sin borrar IndexedDB. No revierte permisos, índices ni documentos.

Para Rules, usar exclusivamente la copia publicada registrada y revisada: `node scripts/release.mjs rollback-plan --env production --published-policy SHA256_COPIA_PUBLICADA`. Prepara localmente `firebase.production.rollback.generated.json` y su recibo con solo Rules `(default)`, sin índices/Hosting/datos. El antiguo `--snapshot SHA_COMMIT` queda rechazado. Revisar la diferencia, mantener CI/build actuales y reconocer además `MIGAPOS_ALLOW_POLICY_ROLLBACK=migapos/(default)/SHA256_COPIA_PUBLICADA`. Solo en otro encargo autorizado: `npx --no-install firebase deploy --only firestore:rules --project migapos --config firebase.production.rollback.generated.json`. Si la procedencia o vigencia de la copia no puede verificarse, **no hay rollback de Rules certificado disponible**; no sustituirla por un archivo Git. Revisar una corrección compatible. Sin restauración de documentos ni eliminación de índices. La copia real permanece pendiente del propietario; no se fabricó una captura de producción.

**Aceptación manual REAL pendiente (solo después de publicación y autorización expresa):** estas operaciones **escribirán datos reales en `migapos`**, incluso usando nombres ficticios. No ejecutarlas con fixtures ni crearlas automáticamente; si ya hay un negocio de laboratorio, exportar primero su alcance autorizado.

1. Entrar con el SuperAdmin real; revisar contexto de plataforma y ausencia de llamadas Functions/Storage.
2. Crear empresa ficticia con otro Gmail; comprobar licencia, invitación y Sede Principal.
3. Entrar con ese Gmail como dueño, aceptar términos y verificar negocio/identidad.
4. Crear una categoría, dos productos con stock por sede y un contacto.
5. Seleccionar Sede Principal y abrir caja online; recargar y comprobar sesión/candado.
6. Registrar venta en efectivo de hasta dos productos; comprobar confirmación remota/receipt.
7. Registrar venta Yape y mixta, verificando importes y vuelto; sin anulación POS.
8. Comprobar stock, historial, recibo e impresión; pendientes offline identificados y sin sincronizar/cobrar de nuevo.
9. Crear contrato Spark con anticipo, nueva cuota, foto local, entrega y cancelación por dueño con devolución; comprobar ledger/recibos, sede de origen y caja abierta. Contratos históricos siguen en lectura.
10. Comparar dashboard/Excel con movimientos confirmados, cerrar caja con conciliación pendiente, descargar datos autorizados y un archivo separado cifrado de pendientes/fotos; verificar ambos localmente, sin restaurar. Probar que otra cuenta/dispositivo no obtiene las fotos.

Registrar en estos planes cualquier error real con ruta/operación/código e índice solicitado; no ampliar permisos por conveniencia. El login real, aceptación de términos contra producción, publicación, índices listos y este recorrido permanecen pendientes.

### Corrección final previa a publicación — base `011e06698907c4277921adf306017533b309b118`

Sin nueva fase; SPARK-7 conserva **IMPLEMENTADA, PENDIENTE DE PUBLICACIÓN Y ACEPTACIÓN MANUAL**. Este encargo autoriza expresamente crear el commit de corrección y subirlo a `main`; no autoriza deploy ni operaciones reales de negocio.

- CI real inspeccionada: [run 40045439332](https://github.com/saintdeyb321/Mig/actions/runs/40045439332), job `120725959049`: falló auditoría y quedaron omitidos tests/build. Se confirmó `npm ls body-parser fast-uri` en los tres árboles. Overrides por rama mayor: raíz `body-parser` **1.20.8 → 1.20.9**, **2.3.0 → 2.4.0**, `fast-uri` **3.1.8 → 3.1.9**; Functions históricas solo `body-parser` **2.3.0 → 2.4.0**. `qs` pasa a **6.16.1**, mínimo requerido por body-parser 2.4. Frontend ya tenía fast-uri 3.1.9, sin cambios de dependencias allí. Lockfiles raíz/Functions reproducidos con `npm ci`, sin scripts de instalación; no `audit fix --force`, excepciones ni omisión de auditoría. Functions conserva su código histórico y no entra al runtime ni config Spark. Fuentes de las correcciones: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [fast-uri esquema](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), [fast-uri host](https://github.com/advisories/GHSA-wjr9-j795-jxcr).
- Exportador: se reprodujo y corrigió un manifiesto que declaraba `partial: false` con colecciones inaccesibles/incompletas aunque se recalculase el checksum global. El dry-run ahora rechaza esa inconsistencia y JSON `null`; no escribe ni corrige datos originales. Se prueba página inicial accesible seguida de fallo, límites/cifrado/checksums/descarga separada y aborto durante lecturas por cambio de cuenta/negocio. El flujo existente de cancelación pasó las nuevas comprobaciones sin modificar su implementación ni IndexedDB/fotos.
- Release: `migapos` / `migapos-peru` / `(default)` conservados; sin Functions/Storage/URLs de emulador en configuración publicada. Se exige revisión explícita del conjunto activo de índices y copia manual identificada de Rules publicadas antes de sustituirlos. Git/build y captura Console tienen procedencia y rutas separadas; rollback desde solo un commit Git rechazado. Procedimiento PowerShell vigente arriba; ninguna consulta de producción, deploy ni rollback ejecutados aquí. Reglas/índices e invariantes financieros intactos.
- Validación local: `npm run audit:security` aprobado (raíz 0, Functions 0; frontend conserva 1 aviso **bajo**, GHSA-m5mm-p8h7-m29v, visible y no bloqueante según política vigente). Checks de release, lint/build/PWA/diff-check y pruebas focalizadas de exportador, parser/URI y guardas; no suites históricas masivas ni cambios de `.env`. CI remota del nuevo commit se comprobará después del push; los resultados locales no acreditan CI ni login real. Persiste aviso conocido de chunks grandes.

### SPARK-0 — implementación y límites

- `config/runtimeCapabilities.js` fija `mode: spark` y estrategia de repositorios `spark`, sin flags de usuario/URL/localStorage. Auth, Firestore, Hosting, persistencia y exportaciones locales disponibles; Functions, Storage, administración todavía no migrada, operaciones financieras remotas, sincronización y jobs deshabilitados. Que un servicio esté disponible no certifica un flujo aún pendiente.
- `core/session/context.js` centraliza contextos, módulos y pestaña válida. SuperAdmin siempre entra en `platform-admin`, incluso si el perfil contiene un tenant anterior o carece de `businessId`. No monta Tenant/Catalog providers, guards de negocio, selector de sede, notificaciones de tenant, POS, caja, categorías, agenda, contratos, reportes, personal ni ajustes. Una pestaña heredada no permite montar un módulo ajeno al contexto. Un perfil operativo con ID reservado `platform-admin` no obtiene contexto de negocio. La UI no sustituye la autorización de Rules.
- El panel SaaS muestra Spark y sus limitaciones; consulta/alta quedan explícitamente pendientes de SPARK-1. No presenta una lista vacía como prueba de ausencia de negocios. Se eliminó el callable directo de administración; no hay consultas administrativas ni polling de jobs al arrancar. La sincronización automática de ventas y la limpieza Storage quedan pausadas, conservando sus registros para migración posterior.
- `core/firebase/callable.js` delega en `sparkRepository.js`; cualquier operación aún no migrada rechaza con `capability-unavailable` antes de inicializar SDK o acceder a red. `core/firebase/storage.js` es el límite de imágenes sin SDK: upload, lectura, delete y referencias remotas fallan explícitamente. No hay `httpsCallable` ni imports de `firebase/functions`/`firebase/storage` en `frontend/src`. La configuración Web ya no requiere bucket; acepta y valida la variable existente sin utilizarla ni modificar `.env`.
- No se alteran Rules, índices, cálculos financieros, colecciones, esquema Dexie, cifrado, datos ni estados de la cola offline. Los errores de capacidades no producen receipts ni confirmaciones ficticias. Los módulos operativos muestran que la confirmación remota y la sincronización están pendientes; su dominio anterior se conserva como especificación para las siguientes fases.
- Logo e iconos PNG locales comprobados (192/512), rutas de branding y manifest PWA conservados. SW con actualización explícita y assets versionados; mensaje offline distingue interfaz disponible de operaciones confirmadas. Firestore conserva `persistentLocalCache` con múltiples pestañas. No se borra IndexedDB, cola ni caché de negocio; imágenes locales compatibles se mantienen y las referencias Storage no se eliminan.

### Inventario de operaciones aisladas en SPARK-0

| Frontera actual | Operaciones aún no disponibles en Spark |
|---|---|
| `administrationRepository` / `useSuperAdmin` | `getTenantAdministration`, `createTenant`, `extendTenantLicense`, `setTenantLicenseStatus`, `requestTenantDeletion`, `cancelTenantDeletion`, `startTenantPurge` |
| `useAdminBackup` | `getPlatformJob`, `startTenantBackup`, `retryPlatformJob`, `cancelPlatformBackup`, `startRestoreDryRun`, `getBackupDownload` |
| `cashRegisterRepository` | `reserveOfflineCashSession`, `openCashSession`, `previewCashSessionClose`, `closeCashSession`, `forceCloseCashSession`, `reconcileCashSession` |
| `saleTransactions` | `submitSale` (incluido receipt/retry), `voidSale` |
| `contractRepository` / `paymentRepository` | `createContract`, `updateContract`, `addContractPayment`, `cancelContract`, `markContractDelivered`, `getLegacyContractPayments` |
| `contractImages` → límite Storage | Subida de original/miniatura, lectura Blob, limpieza y reintentos de borrado; referencias HTTPS/metadata legacy no recuperables en Spark. Fuentes data/Blob locales compatibles no requieren Storage. |

### Validación SPARK-0

APROBADOS: `npm run lint --prefix frontend`, `npm run build --prefix frontend` con variables públicas sintéticas de Emulator solo en la sesión, `node --test tests/spark-mode.test.mjs` (7 pruebas), `node --test tests/spark-startup.browser.test.mjs` (8 checks en Chromium aislado) y `git diff --check`. Build PWA: 33 entradas, aproximadamente 2453 KiB; permanece el aviso de chunks >500 KiB. No se ejecutó la suite completa ni se conectaron emuladores a datos reales.

La comprobación del arranque usa perfiles/Auth simulados y bloquea endpoints de Functions/Storage antes de cualquier conexión. Verifica navegación desktop/móvil SaaS, cero suscripciones/callables, cambio de cuenta plataforma, logo local y conservación de un registro IndexedDB al logout. Pendiente del titular: Google login real, abrir panel SaaS y observar cero requests a `cloudfunctions.net`, sin borrar datos locales. Este es el registro histórico de SPARK-0; las capacidades migradas y su validación actual se describen a continuación.

### SPARK-1–3 — ejecución desde `4a513dff50d0b62b180e35a26687c25e41528f85`

Se conservan `migapos`/`migapos-peru`, Auth Google y Firestore. No se usan Functions, Storage, Blaze, cuentas de servicio ni datos reales. `tenantAdministration`, `tenantProvisioning`, `licenseAdministration` y `cashOpening` se habilitan para los repositorios nativos implementados; `financialOperations`, `offlineSync`, `platformJobs`, Functions y Storage permanecen deshabilitados. SPARK-4/5 no se implementan.

- **SPARK-1:** repositorio Firestore con páginas de licencias por ID y lectura acotada de tenant/propietario/invitación, compatible con negocios anteriores sin documento `tenants`. Alta de siete documentos atómicos: tenant, licencia, sede, settings, invitación, recibo `platform_operations` y reserva permanente `owner_email_claims`. IDs estables, recibos inmutables y comparación de datos en el replay; dos administradores no pueden reservar simultáneamente un correo. Rules vincula todos los documentos mediante `getAfter()` y rechaza bundles parciales, links ajenos o campos privilegiados falsos. Renovar, activar o suspender exige SuperAdmin persistido, transacción y recibo vinculado. Las consultas históricas de email se hacen como SuperAdmin antes del alta; Rules no puede consultar usuarios por email. La reserva garantiza unicidad de nuevos provisionamientos; no se inventa una garantía de indexación retrospectiva sobre usuarios históricos sin reserva. Un perfil UID existente nunca se sobrescribe ni acepta otro rol/negocio.
- **Identidad:** aceptación de invitación y creación del perfil ocurren en la misma transacción que consume la invitación. Rules exige Google, correo verificado, UID, email, tenant, rol y asignación exactos; ni el cliente ni un propietario pueden conceder SuperAdmin. SuperAdmin conserva su cuenta y necesita otro Gmail para ser dueño. Backups, borrados, purgas y sus botones siguen deshabilitados.
- **SPARK-2:** dueño administra categorías, productos, sedes, contactos, personal y datos del negocio. Lecturas operativas/escrituras exigen perfil activo y licencia/tenant habilitados; perfiles y licencias siguen legibles para resolver el acceso. La licencia se valida antes de montar providers; el cambio de identidad remonta los guards y libera listeners. Se rechazan reasignaciones de negocio/email, escalada, cantidades negativas/fraccionarias, precios/costos inválidos y stock de sedes ajenas. El stock conserva su mapa por sede; se soportan hasta **6 sedes por producto** con comprobación de cada entrada dentro de los accesos de Rules. Los datos anteriores no se migran ni borran. Los ajustes de catálogo usan transacción y detectan un editor con stock desactualizado. El índice de `notifications` (`businessId`, `userId`, `readAt`, `createdAt DESC`) y los de propietarios/invitaciones/caja ya existen en el archivo: no se añadieron índices.
- **SPARK-3, caja:** apertura online atómica de `cash_sessions` y su candado `active_cash_sessions`, con el SHA-256 histórico de `[businessId, branchId]`, UID/sede válidos, importes en centavos y `openedAt`/`syncedAt` del servidor. ID estable durante retries y comprobación remota antes de mostrar confirmación. No se puede editar sesión, fabricar ventanas offline, reemplazar candados ni duplicar aperturas concurrentes. Las nuevas sedes incluyen el marcador inmutable `sparkCashVersion: 1`; las históricas mantienen lectura y quedan sin apertura hasta verificar sesiones y pendientes. Esto evita suponer, desde Rules, que una consulta histórica no contiene cajas abiertas. No se activa ese marcador retroactivamente ni se usa como atajo de migración. Los DTO y consultas admiten Timestamps nuevos e ISO históricos. El cierre permanece pendiente de SPARK-5; una caja abierta no podrá cerrarse desde Spark todavía.
- **Puerta de ventas:** `tests/fixtures/spark-sale-prototype.rules` es exclusivamente de emulador y no aparece en la configuración de publicación. Protocolo probado: hasta **2 productos distintos**, una sede/caja, confirmación online, precios y costos canónicos, importes exactos, efectivo/vuelto, Yape y mixto, receipt inmutable y descuento atómico por producto. Comprueba manipulación, tenant/sede ajenos, stock negativo, lote parcial, reintento y carreras por últimas unidades. **BLOQUEO ARQUITECTÓNICO del POS general:** no se certifica el ticket actual sin límite ni el offline; las variantes iniciales de 3/4 productos agotaron las 1000 expresiones de Rules. Alternativa viable dentro de Spark: protocolo online acotado a 2 productos, con límite visible y composición adversarial con catálogo en SPARK-4. No se afirma que ampliar ese límite sea imposible universalmente; requiere otro diseño y pruebas. Las Rules operativas siguen prohibiendo escrituras de ventas/pagos/contratos y los hooks de POS bloquean nuevas confirmaciones/encolados. Se conserva íntegra la cola anterior.

### CI, dependencias y validación actual

Se verificó el fallo del [run SPARK-0](https://github.com/saintdeyb321/Mig/actions/runs/40015729801): raíz con 12 alertas, 1 crítica. CLI fijado en `15.34.1`; overrides dirigidos de Pub/Sub `6.3.1` (Node 22) y `uuid 11.1.1` para `gaxios 6.7.1`, también en el legado. El advisory de Zod actualizado el 23/10 se corrigió con `4.6.7` en los lockfiles raíz/frontend, dentro de sus rangos compatibles. Se probaron las APIs CommonJS usadas por el CLI sin llamadas remotas y el arranque real de Firestore Emulator. `npm audit`: **0 vulnerabilidades en raíz, frontend y functions**; política de excepciones vacía, sin advisories ocultos ni `audit fix --force`.

CI activa: checks Spark, seguridad HTML/turnos/CSP pertinente, Rules/transacciones/prototipo con **solo Firestore Emulator**, persistencia aislada, lint/build y guardas de release. El dominio servidor queda en un workflow manual identificado como legado. La configuración generada de release contiene únicamente Hosting/Firestore, y CSP excluye Functions/Storage. El `firebase.json` histórico sigue bloqueado para publicación por el guard; no se ejecutó deploy. La CI remota nueva sigue pendiente del commit/push del titular; no se declara aprobada por estos resultados locales.

Validación local aprobada: lint/build frontend, `check:build`, `check:release`, `git diff --check`; **25 pruebas de emulador** (8 administración/identidad/licencias, 5 operación/catálogo, 6 caja/fechas históricas, 6 prototipo), 10 pruebas de capacidades/tooling, 23 de seguridad UI y un escenario Chromium de 10 checks del panel/formulario SaaS. IndexedDB: 22 checks en un perfil temporal aislado. Sin ejecutar la suite histórica completa. PWA dentro del presupuesto de 3 MiB; continúa el aviso de chunks >500 KiB. No se modifican `.env`, esquema/cifrado Dexie, datos reales ni ventas pendientes.

### Verificación manual y publicación pendiente (sin ejecutar)

Las nuevas **Rules requieren publicación autorizada** para funcionar en Firebase real: provisionamiento, recibos/reservas, invitaciones/perfiles, licencias, operación por tenant y apertura/candado de caja. Los índices de `firestore.indexes.json` no cambiaron, pero debe comprobarse su publicación existente, en especial notificaciones. El frontend/headers Spark también requieren una publicación de Hosting autorizada; los archivos del prototipo nunca se publican. Nada de esto se realizó aquí.

1. Con Rules/frontend autorizados y publicados, SuperAdmin → SaaS Admin → Nuevo Cliente: `MigaPOS Laboratorio`, otro Gmail del propietario y meses. Comprobar sede principal, licencia y propietario/invitación en la lista; reintentar una falla de red con los mismos datos.
2. Cerrar sesión e ingresar con Google usando ese Gmail verificado; aceptar términos. Confirmar que aparece el contexto de negocio, manteniendo intacto el perfil SuperAdmin.
3. Categorías → crear categoría; Productos → crear producto, precio de dos decimales y stock entero en la sede; Agenda VIP → crear contacto. Confirmar aislamiento con otro negocio.
4. Seleccionar la nueva Sede Principal → Venta Rápida → Abrir caja, indicar fondo y comprobar persistencia al recargar. Ventas, cierre y offline permanecen pendientes; una sede histórica muestra su restricción y no se migra automáticamente.

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

`submitSale` y `voidSale` migraron a Functions/Admin SDK con Auth, perfil protegido y dominio puro compartido. El cliente ya no escribe ventas/stats/stock POS; Rules mantiene el inventario manual del dueño y protege `VOIDED_SALE`. El servidor fija costos/nombres del catálogo al primer commit, valida precios contra catálogo con `MONEY_TOLERANCE` y bloquea nuevas ventas de productos inactivos, también offline. Dexie v4 conserva idempotencia server-side y distingue `createdAt/queuedAt/syncedAt`; `saveCashSession` protege las ventanas y autoriza previamente aperturas offline. Operaciones antiguas sin ventana verificable conservan payload/error para revisión; receipts existentes se confirman durante retry. CatalogProvider usa ack/versiones de stock sin lecturas remotas de receipts. Fases 5/6/8 siguen pendientes; sin deploy ni datos reales.

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

## Cierre de Fase 5

Se añadieron índices de las consultas actuales, `functions/scripts/migrateLegacyContracts.mjs` (dry-run por defecto; `--apply`, `--business=`, `--limit=`, `--cursor=`), migración paginada e idempotente de pagos/imágenes y procedencia de sede (`verified-payment`, `verified-session`, `inferred-contract`). Los casos sin datos verificables conservan el origen y se reportan para revisión. Cancelados conservan `balance = 0`; las operaciones usan recibos determinísticos. La compatibilidad legacy reconstruye los movimientos faltantes por ID, incluso con ledger parcial o una marca antigua incorrecta; caja/reportes deduplican por movimiento, preservando fechas y refunds. El marcador privado `contract_migrations/{businessId}` exige tenant, prueba versión 2 y verificación final de todos los contratos antes de omitir el scan histórico; un inicio/reanudación invalida la prueba anterior. La UI invalida historial al completar entregados con deuda y limpia únicamente imágenes propias no referenciadas, con reintentos acotados; los reportes bloquean resultados incompletos.

Validación real del 19/10/2026 sobre `main` inicial `b2b178b`: arquitectura (15), ventas (28), dominio Functions/contratos/caja (20), Rules e integración con Auth/Functions/Firestore/Storage Emulator `demo-migapos` (157), IndexedDB/locks/ack (22 comprobaciones en Edge aislado), frontend lint/build y `git diff --check`: aprobados. El único fallo inicial de integración fue el cleanup de un contrato ausente: se corrigió con un get de ausencia permitido para usuarios activos, conservando el aislamiento de documentos existentes, y la suite completa volvió a pasar. Los bloqueos de autorización anteriores ya no impidieron esta ejecución. No quedan tests locales críticos bloqueados.

El timeout de IndexedDB estaba asociado al acceso del harness Vite al dominio compartido fuera de `frontend/`; se autorizó únicamente el workspace. El test detecta Chromium/Edge por plataforma/PATH o `MIGAPOS_TEST_BROWSER`, informa ausencia/errores de arranque y excepciones del navegador, conserva el límite de 60 segundos y envía el resultado después de cerrar/borrar su base sintética. DevTools cierra el navegador antes de cerrar Vite y retirar el perfil temporal; las 22 comprobaciones pasaron en unos 5 segundos. `.github/workflows/verify.yml` automatiza estas suites y lint/build en Node 22, Java 21 y Chromium de Ubuntu, sin credenciales, deploy ni migraciones reales. Su primera ejecución en GitHub queda pendiente de subir los cambios; no se afirma que CI ya haya ejecutado.

Sólo se migraron fixtures sintéticos de emuladores; no hubo migraciones reales, deploy ni acceso a Firebase de producción. El script mantiene dry-run por defecto; los casos inferidos siguen apareciendo en `manualReview` al reejecutarlo. Antes de una migración real se deben revisar el resumen y los casos pendientes, y autorizar su aplicación expresamente.

---

# FASE 6 — Caja, alertas y auditoría

## Estado

COMPLETADA: integración, Rules, navegador y verificaciones locales aprobados el 19/10/2026.

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

## Implementación validada

Las Functions de apertura/reserva/cierre/cierre forzado usan Auth/perfil, lock transaccional por negocio/sede y consultas financieras por sesión. Consultar caja no reserva ni bloquea: la reserva requiere abrir explícitamente o pulsar «Autorizar apertura offline», y vence a los 15 minutos sin prolongarse en retries. La apertura online autoriza el turno habitual de hasta 18 horas; abrir offline conserva el vencimiento previamente autorizado. Reservas ajenas vigentes bloquean otra apertura; las vencidas permiten otro turno sin reutilizar su lock. Las pruebas verifican dos cajeros, abandono, expiración y aperturas concurrentes.

El servidor calcula POS, pagos y refunds; el cliente aporta el conteo físico y las notas. Cierre, autocierre y reconciliación leen ledger y legacy dentro de la misma transacción y deduplican por ID. Ventas/anulaciones tardías incluyen refunds todavía no migrados; si los datos no son verificables, conservan los importes anteriores y marcan `totalsComplete = false`, `requiresFinancialReview` y reconciliación pendiente. Una reconciliación posterior con datos completos vuelve a calcular y es idempotente. El autocierre programado cada 15 minutos conserva conteo/diferencia desconocidos como `null`, libera únicamente su lock y genera auditoría. Las ventanas offline conservan sus IDs, admiten cierre local diferido sin afectar un turno posterior; la caché protege cierres pendientes frente a respuestas antiguas y registra la reconciliación con el ack local, esperando las ventas pendientes.

`audit_events` es inmutable para clientes. Un trigger crea `notifications` determinísticas para dueños activos y, cuando corresponde, el cajero afectado; reintentos no restablecen `readAt`. NotificationBell escucha sólo las 30 no leídas del negocio/usuario y marca lecturas individualmente. Rules, índices y pruebas cubren aislamiento, cierres concurrentes, cálculos protegidos, offline, autocierre, auditoría y lectura independiente. `alerts` conserva únicamente la compatibilidad previa de anulaciones; no se inició Fase 7 ni se ejecutó el schedule en producción.

---

# FASE 7 — Reportes, dashboard y Excel

## Estado

COMPLETADA: validada localmente el 22/10/2026, partiendo de `main` en `bb6ecc2`.

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

## Implementación validada

`reportTotals` unifica Dashboard y Excel: `daily_stats.totalRevenue/totalOrders` ya son netos de anulaciones, por lo que no se restan nuevamente. Los movimientos `advance/payment` suman y `refund` resta; se deduplican por ID y se atribuyen a la sede del movimiento. Se separan ingresos POS, contratos, neto total, efectivo/digital, tickets POS, pagos positivos de pedidos, refunds y anulados. El promedio usa únicamente ingresos/tickets POS. Las sumas monetarias reutilizan el dominio existente y se exige conciliación entre efectivo/digital e ingresos. Las fechas internas son `YYYY-MM-DD`, con calendario y presentación de `America/Lima`.

`useReports` delega agregación y ciclo de lecturas a módulos pequeños: caché de hasta 12 entradas por identidad/tenant/sede/período, TTL de 30 segundos, renovación periódica y al recuperar conexión/foco. Los snapshots POS reutilizan los payments ya leídos; no disparan una consulta del ledger por cada actualización. Los cambios de alcance descartan callbacks y datos anteriores; errores de fuentes o migraciones parciales ocultan las cifras definitivas y permiten reintentar. Las gráficas conservan refunds/ingresos negativos y usan las mismas definiciones que el resumen. No se creó `monthly_stats`.

La exportación construye workbooks puros en memoria y conserva las hojas/estilos reconocibles: Resumen_Financiero, Auditoría_Pedidos, Auditoría_Cajas, Comparativa_Sedes, Productos_Global/Productos_Sedes y detalle/resumen por sede cuando hay datos. Las filas usan esquemas canónicos; fechas y grupos se ordenan por timestamps antes de eliminar campos auxiliares. Subtotales de productos y totales de movimientos ocupan columnas separadas para conciliar sin duplicarlos. La auditoría distingue document ID de número comercial, fecha cada pago con `occurredAt` y conserva refunds negativos; el total comercial es sólo referencia. Aperturas/cierres de caja son informativos, incluidos turnos que cruzan medianoche, y sus diferencias no se suman a ingresos. Conteos físicos desconocidos se muestran pendientes.

Se eliminó la caché de workbooks. Ventas usan páginas `limit/startAfter` de 200 documentos con un máximo explícito de 10 000 y un único registro centinela para detectar exceso. Payments y agregados también tienen límites; el detalle controla cantidad de filas antes de crear hojas. Los documentos comerciales se consultan únicamente para Auditoría_Pedidos. Se añadieron sólo los índices utilizados por consultas de actividad de caja; no hubo cambios financieros, de seguridad o de idempotencia del backend de Fases 1–6.

Validación: arquitectura (15), ventas (28), dominio Functions (20), reportes/workbooks/caché/paginación (30), Rules e integración en Auth/Functions/Firestore/Storage Emulator `demo-migapos` (158): aprobados. Los tests generan y vuelven a leer XLSX en memoria, concilian detalle/resumen/sedes, cubren períodos de Lima, dataset vacío, importes no finitos, migración parcial y consultas paginadas reales con aislamiento tenant. IndexedDB aprobó sus 22 comprobaciones: se corrigió además el launcher de Edge que entrega su perfil a otro proceso, para cerrar el proceso real y evitar archivos bloqueados/procesos huérfanos, sin modificar la lógica offline de la aplicación. Frontend lint/build y `git diff --check` aprobados con Node 22/Java 21 portátiles; permanecen los avisos previos de tamaño de chunks/Browserslist.

`npm test` incorpora `test:reports`, y el workflow existente de GitHub Actions ejecuta esa suite mediante el mismo comando; no se afirma una ejecución remota de CI en esta tarea. No se hicieron deploy, migraciones reales ni cambios de datos de producción, y no se inició Fase 8.

---

# FASE 8 — Licencias, SuperAdmin, backups y borrado

## Estado

COMPLETADA. Validación local realizada el 22 de octubre de 2026.

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

## Implementación

Las acciones de SuperAdmin pasan por callables y perfiles protegidos: provisionamiento transaccional con UUID, recibos idempotentes, renovación concurrente con fin de mes, suspensión y administración paginada. Rules cierra escrituras cliente de licencias, metadata, jobs, privilegios de plataforma y system. Ventas, contratos y caja comprueban licencia vigente y estado del tenant con hora del servidor. Los tenants antiguos usan su licencia protegida sin exigir metadata nueva; una licencia ausente o inválida restringe operaciones. Firestore y Storage aplican el estado administrativo reflejado atómicamente en la licencia. Las cargas Storage consultan únicamente perfil y licencia; el backend valida la asociación de imágenes al contrato. Los pendientes offline se conservan y los rechazos por licencia quedan para revisión, incluidas cajas bloqueadas; un recibo ya aplicado puede confirmarse sin repetir la venta.

Los backups privados pausan escrituras del tenant y usan unidades reanudables, leases y recuperación programada. Incluyen las colecciones de negocio actuales, documentos maestros sin businessId, subcolecciones con padres ausentes dentro de raíces atribuibles al tenant y assets bajo contracts/{businessId}/. Conservan IDs y valores wire de Firestore, int64, bytes, referencias y precisión temporal almacenada. El manifiesto e índices tienen conteos, checksums y cadena de integridad; se verifican partes y generaciones de Storage antes de liberar la pausa. Los adaptadores de formato/paginación dependen del SDK Admin fijado en el lockfile y fallan de forma explícita si cambia su interfaz. Artefactos legacy mayores al límite admitido o datos sin procedencia verificable requieren revisión; no se certifican copias incompletas. Cada descarga entrega una parte acotada mediante el callable autenticado, sin tokens públicos ni claves de firma; la URL Blob local se revoca al minuto. El callable de restore dry-run y functions/scripts/restoreTenantDryRun.mjs reconstruyen/validan writes en memoria, sin restaurar datos; el script exige proyecto coincidente con GCLOUD_PROJECT, bucket, tenant confirmado y --authorize-read, y rechaza --apply. Auth requiere recuperación de identidad separada; no se respaldan credenciales.

La eliminación usa active → deletion_requested → deleting → deleted. Solicita confirmación exacta del tenant, prepara backup y permite cancelación antes de la purga, invalidando cualquier lease pendiente. TENANT_DELETION_RECOVERY_HOURS configura el período recuperable (168 horas por defecto; mínimo 24 fuera de emuladores). La purga vuelve a verificar el backup de esa solicitud, procesa páginas y subárboles, protege Auth de otros tenants y superadmins, elimina maestros al final y verifica el resultado. Conserva únicamente tombstone, recibos idempotentes y auditoría mínima de plataforma, además del backup privado necesario para recuperación. Se retiró deleteHelpers del navegador; la UI presenta estados, cancelación, reintentos y verificación dry-run. No se ejecutaron backups ni purgas reales.

La corrección de Fase 7 mantiene refresco de día/semana cada 30 segundos y TTL de 15 minutos para mes/año, con actualización por foco, conexión o petición, deduplicación de consultas pendientes e invalidación por identidad/sede/período.

Validación: npm test aprobado (280 pruebas: arquitectura 15, ventas/cola 29, dominio Functions 21, reportes 32 y emuladores 183). Los fallos iniciales se corrigieron y se completó otra ejecución integral; la descarga autenticada se revalidó después en las 18 pruebas de plataforma. IndexedDB aprobó 22 comprobaciones, frontend lint sin errores/warnings, build y git diff --check aprobados. Permanecen los avisos previos de tamaño de chunks/Browserslist. El workflow existente incorpora la suite de plataforma mediante npm test; no se afirma ejecución remota de CI. Solo se usó demo-migapos con Firebase Emulator Suite: no hubo deploy, migraciones ni operaciones contra producción. Fases 9–10 permanecen pendientes.

---

# FASE 9 — Branding MigaPOS y limpieza general

## Estado

COMPLETADA. Validación local del 23/10/2026 sobre `main`, base `8c193a4`.

Marca, logos, versión de términos y enlaces opcionales HTTPS centralizados. Eliminados los fallbacks comerciales y el contacto personal de renovación; los comprobantes conservan datos del tenant. Las cuatro plantillas escapan textos y atributos, conservan detalles multilínea y validan imágenes Storage, Blob y raster legacy. Impresión compartida sin scripts, con espera de imágenes, límites de carga y limpieza de ventanas, iframes y URLs al terminar, fallar o desmontar.

Turnos unificados en Lima (inicio inclusivo, fin exclusivo; horario nocturno y día completo), con un único monitor y cancelación de efectos obsoletos. CSP con orígenes explícitos, sin eval ni scripts inline; los estilos inline siguen permitidos para React/toasts e impresión. Retirados adaptador Firebase, utilidades, assets y documentos legacy sin consumidores; este Master Plan es el único Markdown versionado conservado. Sin cambios en cálculos, ledger, licencias, backups, purgas, Rules, índices ni APIs.

Validación: `npm test` aprobó 304 pruebas (15 arquitectura, 29 ventas, 21 Functions, 32 reportes, 24 UI y 183 emuladores). UI incluye 23 pruebas unitarias y 17 comprobaciones en Chromium: impresión nativa, XSS, imágenes, cierre/desmontaje, rutas Auth/Firebase simuladas, service worker y generación/descarga real de Excel. La ampliación final de UI se revalidó por separado. Offline aprobó sus 22 comprobaciones; lint, build y `git diff --check` aprobados. Persisten únicamente los avisos previos de chunks grandes y Browserslist. CI existente incorpora `test:ui` mediante `npm test`; no se afirma ejecución remota. Solo servicios simulados y `demo-migapos` con emuladores, sin deploy ni operaciones de producción. Fase 10 pendiente.

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

## Estado y alcance de esta ejecución

LISTA PARA STAGING. Código, QA local y preparación reproducible terminados sobre `main`, base `f3e558c`, el 23/10/2026. Se mantienen el proyecto real `migapos` y Hosting `migapos-peru`. Por instrucción del titular no se crean proyectos/sites adicionales ni se modifican sus `.env`. `demo-migapos` es exclusivamente el identificador local de Emulator Suite. La validación remota de un staging independiente permanece pendiente; no se certifica producción.

## Correcciones y controles implementados

- Comprobantes: `occurredAt` tiene prioridad sobre `date` legacy; Timestamp/Date/ISO se formatean en Lima. Fechas inválidas/ausentes muestran “Fecha no disponible”, nunca la fecha actual. Ledger firmado, cuotas históricas y refunds negativos; el `paidTotal` canónico evita subtotales falsos cuando el historial está limitado por sede; una cancelación reembolsada muestra neto pagado y deuda cero.
- Turnos: misma función pura en frontend/Functions. Las nuevas operaciones online de cajero usan reloj y perfil del servidor; owner/superadmin están exentos. Los receipts confirmados se reconocen antes de comprobar el horario. Nuevas ventanas offline se limitan al fin del turno; la sincronización usa la ventana previamente emitida por el servidor, vinculada a usuario/tenant/sede, y conserva grants anteriores válidos. Los timestamps del dispositivo por sí solos no autorizan nada. Lecturas de cierre y conciliaciones de recuperación siguen disponibles con sus permisos existentes.
- Auditoría: se conservan las protecciones de identidad, importes, stock, licencia, ledger, caja y administración; las nuevas regresiones cubren horario, retries y grants offline. No se rediseñan colecciones ni APIs financieras.
- Observabilidad: `firebase-functions/logger` registra operación, correlación, ID de operación opaco, resultado, código seguro, duración, App Check y contadores. Los rechazos de negocio son INFO; errores inesperados ERROR; no se serializan payloads, tokens, nombres, emails ni importes. Contadores: errores, ventas rechazadas, retries, conciliación pendiente, fallos de backup/purga y operaciones lentas (≥2 s). Los errores internos de jobs programados se distinguen del éxito completo.
- Frontend: diagnóstico local acotado/deduplicado para Functions, ventas/sync, red, licencia, Storage, impresión y reportes; boundary de errores sin borrar IndexedDB. Los estados pendiente/confirmada/rechazada/revisión conservan la cola durable. No se añade transporte remoto ni listeners de Firestore para telemetría.
- Costo/rendimiento: se revisaron scopes, liberación de suscripciones, límites/paginación y caché de las suites existentes. Excel continúa lazy y se cachea tras el primer uso; no se precarga al instalar la PWA. Precache aproximado: 3,3 MB → 2,5 MB; control automático de presupuesto de 3 MiB. No se añaden agregados ni índices. Continúa el aviso del chunk inicial grande; no se fuerzan refactors ajenos al hallazgo medido.

## Validación y CI

Comandos requeridos: `npm test`, `npm run test:offline-db`, `npm run lint --prefix frontend`, `npm run build --prefix frontend`, `git diff --check`. Controles adicionales: `npm run check:release`, `npm run check:build`, `npm run audit:security`. Las variables públicas de CI son únicamente fixtures `demo-migapos`, con `VITE_APP_ENV=emulator`, `VITE_USE_EMULATORS=true` y App Check desactivado. `scripts/emulator-guard.mjs` rechaza proyecto real y hosts distintos de los emuladores locales antes de las pruebas destructivas.

Node 22, Java 21, Chromium/Edge/Chrome y dependencias instaladas con `npm ci` en raíz, `frontend` y `functions` son requisitos operativos. Se conserva `verify.yml`: pruebas existentes + configuración/release, Chromium autenticado y auditoría. No hay deploy ni pasos críticos con `continue-on-error`. Un fallo corta CI; el artefacto `release-verification` se genera solo al final y está vinculado al commit y fingerprint del código. Debe ejecutarse el workflow remoto sobre el commit final; su configuración validada localmente no equivale a CI remota aprobada.

Cobertura integrada: invitación/login verificado, producto, caja, efectivo/mixto, IndexedDB offline/sync, retry, anulación/stock, adelanto, abono, refund, cierre, dashboard/Excel y cambio de tenant/sede se encadenan en Chromium + emuladores. Licencia suspendida, roles, aislamiento, impresión, Storage, backup y solicitud/cancelación de eliminación conservan sus suites de integración específicas, sin duplicarlas.

Resultado final: `npm test` aprobó 328 pruebas (16 release/seguridad final, 15 arquitectura, 29 ventas/cola, 21 Functions, 32 reportes, 24 UI y 191 emuladores/integración). Chromium aprobó 17 comprobaciones de impresión/CSP y 17 del flujo autenticado; IndexedDB offline aprobó sus 22 comprobaciones. Los fallos iniciales de las fixtures Chromium/restore se corrigieron; tras resolver la interrupción de PowerShell y un proceso de Emulator huérfano se completó una ejecución integral con cero fallos/omisiones. La revalidación final de fechas/totales e UI aprobó 39 pruebas. Lint, build, presupuesto PWA, configuración CI/release, build reproducible de Emulator y `git diff --check` aprobados. La política de auditoría aprobó con los avisos/excepciones visibles indicados abajo; no equivale a un audit sin vulnerabilidades. Quedan pendientes las comprobaciones reales de Console, configuración Web de producción, CI remota y staging; no hubo deploy ni cambios en producción.

## Auditoría de dependencias

Parches compatibles de Vite/transitivas y gRPC 1.13.6 (mismo major, validado con Emulator) corrigen los avisos altos del frontend. No se aplican majors ni `audit --force`. La auditoría sigue mostrando avisos reales: basic-ftp alto y OpenTelemetry moderado en tooling CLI; uuid moderado por gaxios; esbuild bajo en tooling frontend. No se declara “cero vulnerabilidades”.

`scripts/security-exceptions.json` identifica avisos, alcance, justificación y caducidad (23/11/2026): FTP y baggage no son entradas de usuarios ni dependencias del servidor financiero; gaxios utiliza UUID v4, no los generadores con buffer afectados. La auditoría los muestra expresamente y bloquea avisos nuevos moderados/altos/críticos o excepciones vencidas. Revisar el major compatible del CLI y las actualizaciones upstream antes de renovar excepciones; el aviso bajo se mantiene visible.

## Entornos, App Check y requisitos de Console

`frontend/src/config/environments.js` es la fuente de proyecto/Auth/Functions/Hosting por entorno. Producción conserva los IDs existentes; Emulator usa loopback y desactiva Analytics/App Check real; staging queda sin recursos inventados y rechaza producción como sustituto. La CSP se genera por entorno con orígenes explícitos; GAPI permanece permitido también con Auth Emulator porque el resolver popup del SDK lo carga, mientras los servicios de datos del entorno local solo admiten loopback. Los hooks `predeploy` de Hosting, Functions, Firestore y Storage bloquean el uso accidental de `firebase.json` base y requieren la configuración generada, proyecto exacto, checkout limpio, CI del mismo código y hashes del build/configuración/variables públicas.

Pendiente manual: obtener en Firebase Console la configuración Web pública correcta (API key pública, App ID, Sender ID, bucket y Auth domain), habilitar Google como proveedor y comprobar dominios autorizados del site/preview. No hay configuración Web pública de producción completa disponible en esta ejecución: `release:check --env production` falla expresamente por `VITE_FIREBASE_API_KEY` ausente. No se inventan credenciales ni se alteran archivos `.env`; usar variables por sesión o un archivo local separado no versionado.

App Check queda OFF por defecto. Para rollout futuro: registrar la app Web y una clave pública reCAPTCHA Enterprise; construir con `VITE_APP_CHECK_MODE=monitor` y `VITE_APP_CHECK_SITE_KEY` real. La CSP añade únicamente los orígenes Enterprise necesarios. Observar cobertura/errores antes de habilitar `MIGAPOS_APP_CHECK_ENFORCE` con nombres de Functions separados por coma, empezando por un grupo pequeño. Emulator/CI nunca exigen tokens reales. No activar enforcement abruptamente en Console ni romper clientes anteriores. Referencias oficiales: [cliente Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [Functions](https://firebase.google.com/docs/app-check/cloud-functions), [logging](https://firebase.google.com/docs/functions/writing-and-viewing-logs).

En Console, revisar también permisos mínimos de administración, billing/budgets, alertas de consumo y métricas basadas en los campos de Cloud Logging (`jsonPayload.event`, `operation`, `outcome`, `errorCode`, `slow`, `metrics`). Configurar alertas para errores, rechazos anómalos, retries crecientes, conciliaciones pendientes y fallos de jobs; los umbrales dependen del tráfico real. No se crearon alertas ni se cambiaron opciones de producción en esta tarea.

## Preparación de staging y checklist de release

- [ ] Si se autoriza en el futuro, configurar un proyecto/site independientes en `environments.js`, con su propia Web config, Auth, Functions y bucket. Actualmente no existen ni se crean; no copiar datos de clientes.
- [ ] Ejecutar `npm run release:check -- --env staging` y `release:build` para ese entorno; validar Google Auth, Storage, roles/licencias, financial flows, PWA, impresión y Excel con datos sintéticos. `npm run release:smoke -- --env staging --url https://SITE.web.app/` solo admite el site independiente configurado; nunca producción.
- [ ] Para una publicación futura de la infraestructura existente, completar configuración pública y ejecutar `npm run release:check -- --env production`, luego `npm run release:build -- --env production`. Los artefactos `.release/` y `firebase.production.generated.json` no se versionan ni contienen credenciales privadas.
- [ ] Confirmar un commit limpio con CI remota aprobada; descargar su `release-verification` como `.release/ci-verification.json`. Establecer explícitamente `MIGAPOS_RELEASE_ENV=production` y `MIGAPOS_ALLOW_RELEASE=migapos/migapos-peru` en la sesión operativa. Cualquier cambio de código, entorno o archivos del build invalida los hashes y obliga a reconstruir.
- [ ] Revisar `npm run release:plan -- --env production`: solo imprime comandos con proyecto/site explícitos para preview, copia de la versión live a un canal de rollback, publicación Hosting y rollback. El script nunca los ejecuta. Autorizar y validar manualmente preview/smoke antes de publicar; no se ejecutó ninguno aquí.
- [ ] Revisar compatibilidad frontend/API y clientes previos; desplegar por separado los cambios revisados de backend/Rules cuando exista autorización. No activar enforcement App Check hasta que los clientes estén preparados. No hay migraciones necesarias ni procesos destructivos automáticos nuevos.

## Backup, recuperación y rollback

La suite verifica backup completo, manifest/checksums, assets, aislamiento, cancelación, interrupción/reanudación y bloqueo de purga sin backup válido. El restore dry-run sigue sin escribir datos. Además se ejecuta una recuperación real **solo en namespaces aislados de Emulator**: reconstrucción wire de tipos Firestore (bytes/int64/nanosegundos/referencias), assets con checksums, liberación explícita del fence del backup verificado en tenant/licencia restaurados y una venta funcional; el tenant de origen y los datos ajenos se conservan. Esta prueba de recuperación utiliza las identidades Auth sintéticas existentes del emulador y no valida una importación de cuentas/credenciales Auth en otro proyecto. No se proporciona un comando automático de restauración/purga real ni se certifica recuperación en Firebase real.

Rollback Hosting usa el canal conservado por el plan antes de publicar. **No revierte Functions, Rules, índices ni esquema/datos.** Mantener APIs compatibles/aditivas, conservar los fixes de autorización/turno y preferir un fix hacia delante para backend. Un rollback de frontend requiere revisar la compatibilidad de App Check y de la cola durable con el servidor vigente; no reintroducir permisos antiguos ni borrar pendientes. Toda recuperación real necesita una ejecución aislada y revisión operacional antes de tocar clientes reales.

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


## Recuperación Spark · `fix/spark-reliability` · P0

Base `41dd809`; comparación con `da777d2`: los cuatro archivos de autenticación/licencia/repositorios eran idénticos entre ramas. Causas confirmadas: ausencia local tratada como eliminación de cuenta, licencia ausente interpretada como negocio borrado, y callbacks tardíos de settings todavía capaces de escribir caché tras cerrar la sesión.

P0 implementada: metadatos de servidor/caché y escrituras pendientes; estados separados de perfil, invitación, licencia, tenant, permisos, conexión, suspensión y horario; reintento sin cerrar la sesión Google por errores transitorios. Lectura de invitación confirmada en servidor y aceptación explícita, sin recreación automática. Licencia y tenant se observan por identidad; tenant histórico ausente se trata conforme a `tenantEnabled` actual, sin inventar documentos ni permisos. Callbacks de sesión cerrada quedan inertes, incluida la actualización de settings locales.

Verificación focalizada: 4 casos de recuperación/aislamiento aprobados; lint, build/PWA y diff-check. No se consultaron ni modificaron perfiles, licencias, tenants o Rules de Firebase real; el diagnóstico de los datos/reglas efectivamente publicados y la aceptación con cuentas reales permanecen pendientes del propietario. No hubo deploy ni cambios de roles.


### Recuperación Spark P1 — recursos de sesión y consumo (rama fix/spark-reliability)
- Recursos en memoria aislados por UID/tenant/rol/sede: solo se inician los módulos visitados; listeners reutilizados hasta 2 minutos sin consumidores, cierre al salir y límite de listeners ociosos. Filtros, búsqueda, orden, scroll y páginas de contratos/historial sobreviven a la navegación. No se mantienen todas las páginas montadas ni se borra IndexedDB.
- Contratos activos/historial consultan la sede seleccionada, páginas de 25 y agenda de 100 con alcance visible. Historial expira al reingresar tras 2 minutos; operaciones invalidan sus páginas. Dos índices compuestos nuevos, aditivos, requieren revisión/publicación autorizada: no se ha comprobado su existencia en producción.
- Reportes y Excel comparten consultas e inflight por sesión/sede/período, TTL diario/semanal 30 s y amplio 15 min; cobros POS/contratos invalidan el caché. Logout cancela páginas posteriores; una petición SDK ya enviada puede finalizar, pero no se publica en otra sesión. Mutaciones financieras siguen validándose en transacciones, nunca desde caché.
- Excel por defecto diario, detalle diario/semanal bajo demanda y consentimiento de lecturas; mes/año solicitan confirmación en reportes. Los resúmenes Spark siguen leyendo tickets: no se afirma ahorro de lecturas por agregar filas. Límites 10000 movimientos y 500 contratos históricos; exceso produce error, no informe parcial definitivo.
- Diagnóstico de desarrollo en Reportes: documentos observados por consultas y entregas caché/servidor, altas/bajas y reutilización de listeners, sin PII. No equivale a facturación ni incluye lecturas de Rules/índices. Verificación determinista: volver al mismo recurso dentro de vigencia crea 1 listener total; 2 consumidores de una consulta pendiente producen 1 lectura. Medición con cuenta real queda para aceptación autorizada.
- Catálogo, sedes y configuración ya permanecían montados; se estabilizó la identidad usada por Dexie/catálogo para evitar resuscripciones por objetos de perfil equivalentes. Caja y permisos conservan validación reciente; no se cachean como autorización.
- Validación focalizada: 7 controles de identidad/ciclo de vida y 8 de caché/paginación/reportes aprobados; lint y build/PWA aprobados (aviso previo de tamaño de chunks). El mock histórico de paginación se alineó con getDocsFromServer/Timestamp y el lector limita cada página al presupuesto restante + 1.
