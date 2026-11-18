# Reportes consolidados en Firebase Spark: disponibilidad y cobertura

## Alcance y estado

Dashboard y exportaciones de mes/año ya no requieren `VITE_REPORT_EXPORT_SUMMARIES_ENABLED`. La variable antigua no tiene efecto, incluso si un entorno conserva su valor `false`. El Dashboard respeta la sede activa y Excel/PDF consultan el alcance global autorizado. Hoy/semana conservan sus lectores y auditorías detalladas.

La eliminación del gate no crea un escritor. El protocolo actual P31 sigue teniendo un escritor confiable en `functions/scripts/report-backfill.mjs`, útil para reconstrucción histórica autorizada, y no tiene actualización incremental certificada desde el navegador. `REPORT_SUMMARIES_ENABLED` permanece OFF y `firebase.json` carece de configuración de Functions. No se han activado Functions, Blaze ni credenciales administrativas en el cliente.

Mes/año muestran «Resumen no disponible» si falta cobertura, vigencia o revisión compatible. El catálogo anual requiere todos los meses transcurridos, incluidos los vacíos, sin exigir meses futuros. El gráfico y la evolución anual conservan los doce meses; las posiciones futuras no tienen operaciones ni certificación de cobertura futura. Un mes transcurrido ausente no equivale a cero. Los lectores no disponen de una ruta alternativa de movimientos. Un snapshot sigue siendo un corte fechado, no datos en tiempo real.

## Actualización automática e históricos: bloqueo comprobable

**BLOCKED: no se ha implementado ni habilitado un escritor incremental financiero desde React.** Quitar el gate no resuelve la certificación inicial. Mantener este bloqueo evita presentar como completa una proyección parcial o permitir escrituras arbitrarias.

- `createProjectionStore()` y `createConsolidation()` usan Admin SDK: leen marcadores, buckets y checkpoints privados, sustituyen contribuciones previas, comparan el inventario completo y publican cobertura. Las Rules actuales deniegan estas escrituras al dueño y al cajero. El emulador comprueba la denegación incluso con cuerpos completos y válidos copiados de una consolidación real, y ante una transacción que lee un contrato autorizado e intenta publicar su snapshot.
- Una cohorte legacy puede incluir hasta 80 pagos incrustados y afectar varias fechas y meses. El caso local de 21 pagos requiere 47 lecturas puntuales y 25 escrituras del motor confiable; repetirlo conserva las cifras y escribe cero. Son operaciones del SDK, **no** un recuento de accesos de Rules ni facturación. Portar este motor sin cambiar su protocolo no es un escritor cliente seguro.
- Rules permiten validar deltas puntuales mediante `getAfter()`, pero no ejecutar consultas sobre todas las fuentes para comprobar que un cliente no omitió movimientos históricos. Un hash y una bandera `verified` suministrados por ese mismo cliente no demuestran cobertura. La ausencia de una base acreditada impide certificar el total histórico mediante un simple incremento. No se han abierto permisos para subsanar esta falta de prueba.
- Una implementación cliente completa necesitaría una base inicial certificada por negocio/sede/corte y un protocolo obligatorio en **todas** las escrituras de origen: venta, compensación, creación y edición de pedido con/sin anticipo, abono, devolución por cada canal, entrega, cierre y vencimiento de caja. Cada fuente y su contribución tendrían que quedar enlazadas atómicamente, con versión anterior/nueva, ID idempotente y deltas exactos de dinero, estados, productos y meses afectados. No bastaría un callback posterior al cobro: pérdida de conexión, pestañas antiguas o escritura directa podrían omitirlo.
- Antes de habilitar ese protocolo habría que demostrar sus límites de expresiones, tamaño y accesos para ocho productos, devoluciones multicanal, contratos legacy y sedes distintas. Firestore limita los accesos de Rules a 10 por operación y 20 por transacción, con excepciones de caché; las lecturas del SDK no deben confundirse con estos accesos. [Límites y validación atómica oficiales](https://firebase.google.com/docs/firestore/security/rules-conditions#access_call_limits).

Spark admite agregaciones cliente con un protocolo acotado y probado; no se afirma una imposibilidad general. **El protocolo P31 existente no aporta todavía esa prueba ni la base histórica certificable por permisos normales.** No se ha sustituido por un contador parcial, no se ha marcado cobertura ficticia y no se han alterado las transacciones originales. La dependencia administrativa para actualizar movimientos nuevos sigue siendo un bloqueo del objetivo, no una funcionalidad terminada. La reconstrucción histórica reanudable y presupuestada existente se conserva únicamente como herramienta de un operador autorizado; no se ejecutó contra producción.

## Revisión y publicación manual de configuración

1. Revisar pruebas locales y CI del cambio. Sigue pendiente el bloqueo preexistente de `picomatch`, `GHSA-fc5q-39xc-vjpf`. La auditoría sigue siendo obligatoria. Un resultado local no acredita CI remota ni configuración publicada.
2. En Firebase Console, abrir el proyecto `migapos`, Firestore `(default)`. Guardar las Rules realmente publicadas, con fecha y procedencia comprobadas. Publicar la política local solo después de autorización del propietario y verificar accesos por negocio y sede.
3. Comparar el conjunto activo de índices antes de publicar. Conservar los índices históricos. Estos seis compuestos P31 de ámbito **COLLECTION** continúan declarados:

   | Colección | Campos en orden |
   | --- | --- |
   | `cash_sessions` | `businessId ASC, expiredAt ASC, __name__ ASC` |
   | `cash_sessions` | `businessId ASC, branchId ASC, expiredAt ASC, __name__ ASC` |
   | `payments` | `businessId ASC, type ASC, occurredAt ASC, __name__ ASC` |
   | `payments` | `businessId ASC, branchId ASC, type ASC, occurredAt ASC, __name__ ASC` |
   | `report_source_contributions_v1` | `businessId ASC, months CONTAINS, __name__ ASC` |
   | `report_projection_state_v1` | `kind ASC, mode ASC, nextCheckAt ASC, __name__ ASC` |

   El compuesto de contribuciones respalda el backfill. El de cola automática queda archivado, sin programación en esta operación Spark. Los cuatro de caja/pagos se conservan para compatibilidad del conjunto existente. Los lectores por ID carecen de necesidad de índices nuevos. El índice P29 de `contracts` ya declara `businessId ASC, status ASC, voidedAt DESC, __name__ DESC`, de ámbito COLLECTION. Revisar su estado remoto. Esperar **Habilitado** para los índices necesarios en cada consulta administrativa.
4. Verificar las siete exenciones P31 del archivo local para cuerpos de buckets, contribuciones, snapshots y páginas de productos. Las cinco colecciones deniegan escritura de cliente. El dueño del mismo negocio puede leer el global; la cuenta autorizada de sede solo puede leer su sede. Marcadores, buckets y checkpoints permanecen privados.

## Ensayo en el emulador existente

Usar `demo-migapos`, sin credenciales reales, con el emulador local ya instalado:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:GCLOUD_PROJECT = 'demo-migapos'
node scripts/spark-emulator-guard.mjs
node functions/scripts/report-backfill.mjs --project demo-migapos --business negocio-ensayo --month 2026-10 --documents 1000
node functions/scripts/report-backfill.mjs --project demo-migapos --business negocio-ensayo --month 2026-10 --documents 1000 --writes 1500 --limit 100 --apply
```

El primer comando administrativo es dry-run y escribe cero documentos. `--documents` limita cada escaneo a entre 1 y 40.000 intentos/retornos según el contador del generador. `--writes` limita cada lote aplicado a entre 402 y 200.000 escrituras; se reserva margen para publicar antes de empezar una fuente. `--limit` admite de 1 a 500 fuentes por ejecución. Repetir una respuesta `paused` con los mismos argumentos hasta `verified`. Presupuestar todos los escaneos y reintentos de esos lotes.

Las pruebas ejecutan CLI y motor en el emulador para comprobar dry-run, presupuesto, reanudación, idempotencia, publicación global/sede, mes vacío, pagos legacy, anulación entre meses, catálogo anual y caducidad. La evidencia de operaciones y documentos por colección se guarda en `.release/`.

## Producción, solo después de aprobación expresa

Estos ejemplos son instrucciones para el operador. Requieren respaldo, identidad administrativa de mínimo privilegio, credenciales externas y un entorno controlado. Usar una sesión distinta de la del ensayo, con `FIRESTORE_EMULATOR_HOST` ausente y el proyecto `migapos` verificado. Sustituir los marcadores por el negocio y presupuestos medidos. Proyecto y `--authorize-project` deben coincidir. Iniciar con dry-run:

```powershell
node functions/scripts/report-backfill.mjs --project migapos --business '<ID_REAL>' --month YYYY-MM --documents N --authorize-project migapos
```

Revisar las fuentes y lecturas del resultado antes de autorizar escritura:

```powershell
node functions/scripts/report-backfill.mjs --project migapos --business '<ID_REAL>' --month YYYY-MM --documents N --writes N --limit 100 --authorize-project migapos --apply
```

Procesar cada mes desde enero hasta el mes actual para el año solicitado, incluidos los vacíos. Para un año cerrado se necesitan doce meses. Repetir lotes pausados hasta certificar cada mes. Solo entonces publicar el catálogo anual exacto global y de sedes:

```powershell
node functions/scripts/report-backfill.mjs --project migapos --business '<ID_REAL>' --year YYYY --authorize-project migapos --apply
```

Comprobar por ID los snapshots globales y de sede, `coverage`, `sourceProof`, `revision`, `calculatedThrough`, `evidenceThrough`, `validUntil`, cantidades, canales y productos. Validar una venta/anulación intermes, un contrato antiguo con pago legacy, pago mixto, reembolso y caja vencida sin conteo. El catálogo anual debe conciliar con todas las revisiones mensuales.

Después de comprobar cobertura, accesos, presupuesto y CI, el propietario podrá autorizar build y publicación manual. No hay un gate de consultas que activar. `REPORT_SUMMARIES_ENABLED` continúa OFF. Hosting no publica automáticamente Rules ni índices. La web debe apuntar a `migapos`, Hosting `migapos-peru`, sin emuladores ni credenciales administrativas. Publicar el frontend no elimina el bloqueo del escritor descrito arriba.

## Rutina operativa, caducidad y recuperación

- Mientras persista el bloqueo incremental, un corte P31 solo se actualiza por el escritor confiable existente. Regenerar el catálogo anual cuando cambie una revisión mensual. La vigencia manual es de 24 horas para mes abierto y 7 días para mes cerrado. El cliente también limita la vigencia de su caché y revalida al volver a la vista o cambiar de período.
- Priorizar meses afectados por pagos, reembolsos y anulaciones tardíos, además de la cohorte original de un pedido cuyo estado cambió. Una caja puede afectar meses de apertura, cierre y vencimiento distintos. Reconstruir todos los períodos comprometidos y después el catálogo anual.
- El protocolo actual refleja el último corte administrativo. Su disponibilidad depende de que un operador sostenga la rutina. Una venta no actualiza instantáneamente el mes. Si el corte vence, el período queda no disponible; no se descarga automáticamente el historial.
- Ante errores, conservar fuentes originales, revisar el código del fallo y reanudar el comando idempotente. Un token vencido requiere nueva ejecución. Una cuarentena requiere revisión administrativa y reconstrucción de todos los meses afectados antes de liberarla.
- No usar la variable antigua como mecanismo de reversión: dejó de controlar las consultas. Preservar fuentes, proyecciones y denegación de escrituras de cliente. Un corte incompleto, revocado o vencido queda no disponible; hoy/semana conservan su ruta documental.

## Medición y límites

El Dashboard mensual suele requerir un snapshot de su scope. El anual utiliza hasta doce snapshots y una página de catálogo para el ranking exacto. Excel/PDF añaden las páginas de productos globales, hasta 24 de 250 filas. Ambos formatos reutilizan el mismo corte vigente. Un fallo nunca dispara consultas de movimientos.

`dailyStatsRepository.getDailyStats()` descarga tickets con `getSalesInPeriod()` y luego los agrupa. Sus filas diarias no acreditan una lectura Firestore por día. El benchmark documental local conserva ese motor únicamente como oráculo. Las métricas de fixtures/emulador separan consultas, documentos retornados, lecturas puntuales, escrituras y reintentos. Rules e índices pueden generar cargos adicionales; estos números no son facturación del proyecto.

El backfill verifica el corte completo de fuentes, incluidos contratos legacy. Repetir un lote consume nuevas lecturas de verificación aunque sus contribuciones sean idempotentes. Medir el presupuesto compartido de Spark antes de cada ejecución. El código, un build o un gate habilitado no crean snapshots.

## Evidencia local de esta implementación

- Corrección del calendario y gate: 135 comprobaciones Node aprobadas, incluidas noviembre de 30 días, meses de 31, febrero bisiesto/no bisiesto, diciembre, cambio de año a medianoche Lima y paridad financiera. Chromium: 10 regresiones aprobadas, con descarga y reimportación de XLSX y generación de PDF en el navegador. El ensayo positivo utiliza explícitamente la variable antigua en `false` y aun así consulta los snapshots verificados. Se conservan autenticación, aislamiento, límites y rechazo de cobertura incompleta.
- Emulador `demo-migapos`: 52 pruebas P31/financieras aprobadas, incluidas ventas de ocho productos, anulación única, pagos mixtos, anticipos/abonos/reembolsos, cruces de meses, catálogo anual, caja y fotos P18. El nuevo caso de permisos normales midió 47 lecturas/25 escrituras del escritor confiable y 23 lecturas/0 escrituras al repetir; los intentos cliente de escribir proyecciones se rechazaron. El primer arranque restringido no pudo ejecutar sockets/CDP; la repetición local autorizada pasó. El emulador requirió `-Duser.language=en -Duser.country=US` para evitar el fallo de recursos de idioma `es_MX` del JAR instalado, sin cambiar Rules.
- Fixtures web de noviembre: Dashboard mes 1 documento de snapshot de sede; Excel/PDF mes 2 documentos globales, incluidos productos; Dashboard año 12 documentos y Excel/PDF año 12, para once meses más catálogo. Diciembre aparece sin operaciones, sin solicitar su snapshot. Alternar PDF/Excel reutiliza datos. Los espías comprobaron cero llamadas a lectores originales, también ante ausencia, caducidad, cobertura incompleta, permiso denegado y catálogo ausente.
- CLI dry-run: 16 operaciones de verificación, 5 documentos retornados y 3 intentos puntuales, con 0 escrituras. Primer apply limitado a una fuente: 5 escrituras y estado `paused`. La reanudación publica doce meses, dos sedes y el global, incluidos meses vacíos. Las fuentes originales conservan contenido y fecha de actualización.
- Las doce reanudaciones del fixture registraron 398 operaciones de escaneo, 99 documentos retornados y 86 intentos puntuales. Las transacciones observadas del proceso padre, incluida una repetición idempotente, escribieron 7 marcadores, 7 buckets, 45 checkpoints, 36 snapshots y 36 páginas de productos. Se contabilizan aparte las 5 escrituras iniciales del CLI y las 4 del catálogo anual; repetir el catálogo escribió 0. Estos contadores de escaneo no incluyen todas las lecturas de las transacciones de contribución ni las lecturas del propio test para comprobar resultados.
- Evidencia del protocolo previo: `.release/reportes-spark-rules.log` y `.release/reportes-spark-manual-metrics.json`. Evidencia de esta corrección: `.release/reportes-calendario-node.log`, `.release/reportes-calendario-browser.log`, `.release/reportes-calendario-rules.log` y `.release/reportes-calendario-build.log`. Los XLSX y PDF reales están en `.release/qa-p29/p31-*`. Lint, build/PWA, `check:build` y diff-check se validan localmente. La aceptación remota, la auditoría de dependencias y el protocolo incremental completo siguen pendientes; no se ha declarado producción preparada.
