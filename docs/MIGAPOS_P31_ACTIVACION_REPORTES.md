# Activación manual de reportes consolidados en Firebase Spark

## Alcance y estado

El único gate web `VITE_REPORT_EXPORT_SUMMARIES_ENABLED` habilita Dashboard y exportaciones de mes/año. Queda OFF por defecto. El Dashboard respeta la sede activa y Excel/PDF consultan el alcance global autorizado. Hoy/semana conservan sus lectores y auditorías detalladas.

El escritor es `functions/scripts/report-backfill.mjs`, ejecutado manualmente por un operador autorizado. `REPORT_SUMMARIES_ENABLED` permanece OFF y `firebase.json` carece de configuración de Functions. El CLI reutiliza el motor P31 local con Admin SDK. Sus credenciales administrativas se gestionan fuera del repositorio y del navegador.

Mes/año muestran «Resumen no disponible» si el gate está apagado o falta cobertura, vigencia o revisión compatible. El catálogo anual requiere todos los meses transcurridos, incluidos los vacíos. Un mes ausente requiere consolidación y no equivale a cero. Los lectores no disponen de una ruta alternativa de movimientos.

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

Solo después de comprobar cobertura, accesos, presupuesto y CI, el propietario podrá configurar `VITE_REPORT_EXPORT_SUMMARIES_ENABLED=true` y autorizar build y publicación manual. `REPORT_SUMMARIES_ENABLED` continúa OFF. Hosting no publica automáticamente Rules ni índices. La web debe apuntar a `migapos`, Hosting `migapos-peru`, sin emuladores ni credenciales administrativas.

## Rutina operativa, caducidad y recuperación

- Asignar un operador antes de habilitar el gate. Regenerar el mes activo antes de la jornada de consulta y después de los cambios que deban aparecer en el corte. Regenerar el catálogo anual cuando cambie una revisión mensual. La vigencia manual es de 24 horas para mes abierto y 7 días para mes cerrado. El cliente también limita la vigencia de su caché y revalida al volver a la vista o cambiar de período.
- Priorizar meses afectados por pagos, reembolsos y anulaciones tardíos, además de la cohorte original de un pedido cuyo estado cambió. Una caja puede afectar meses de apertura, cierre y vencimiento distintos. Reconstruir todos los períodos comprometidos y después el catálogo anual.
- Spark manual refleja el último corte administrativo. Su disponibilidad depende de que un operador sostenga la rutina. Una venta no actualiza instantáneamente el mes. Si el costo o la intervención manual resultan insostenibles, mantener gate OFF y períodos pendientes.
- Ante errores, conservar fuentes originales, revisar el código del fallo y reanudar el comando idempotente. Un token vencido requiere nueva ejecución. Una cuarentena requiere revisión administrativa y reconstrucción de todos los meses afectados antes de liberarla.
- La reversión consiste en deshabilitar el gate y publicar ese build tras autorización. Mes/año quedarán como «Resumen no disponible»; hoy/semana conservan su ruta documental. Preservar fuentes, proyecciones y denegación de escrituras de cliente.

## Medición y límites

El Dashboard mensual suele requerir un snapshot de su scope. El anual utiliza hasta doce snapshots y una página de catálogo para el ranking exacto. Excel/PDF añaden las páginas de productos globales, hasta 24 de 250 filas. Ambos formatos reutilizan el mismo corte vigente. Un fallo nunca dispara consultas de movimientos.

`dailyStatsRepository.getDailyStats()` descarga tickets con `getSalesInPeriod()` y luego los agrupa. Sus filas diarias no acreditan una lectura Firestore por día. El benchmark documental local conserva ese motor únicamente como oráculo. Las métricas de fixtures/emulador separan consultas, documentos retornados, lecturas puntuales, escrituras y reintentos. Rules e índices pueden generar cargos adicionales; estos números no son facturación del proyecto.

El backfill verifica el corte completo de fuentes, incluidos contratos legacy. Repetir un lote consume nuevas lecturas de verificación aunque sus contribuciones sean idempotentes. Medir el presupuesto compartido de Spark antes de cada ejecución. El código, un build o un gate habilitado no crean snapshots.

## Evidencia local de esta implementación

- Node: 150 comprobaciones focalizadas aprobadas. Chromium: 10 regresiones aprobadas, con descarga y reimportación de XLSX y generación de PDF en el navegador. Rules P31: 6 casos aprobados en `demo-migapos`, incluido el CLI real y accesos global/sede. La auditoría npm sigue bloqueada por `GHSA-fc5q-39xc-vjpf` en raíz/frontend. Los avisos bajos quedan visibles.
- Fixtures web de noviembre: Dashboard mes 1 documento de snapshot de sede; Excel/PDF mes 2 documentos globales, incluidos productos; Dashboard año 12 documentos y Excel/PDF año 12, para once meses más catálogo. Alternar PDF/Excel reutiliza datos. Los espías comprobaron cero llamadas a lectores originales, también con gate OFF, ausencia, caducidad, cobertura incompleta, permiso denegado y catálogo ausente.
- CLI dry-run: 16 operaciones de verificación, 5 documentos retornados y 3 intentos puntuales, con 0 escrituras. Primer apply limitado a una fuente: 5 escrituras y estado `paused`. La reanudación publica doce meses, dos sedes y el global, incluidos meses vacíos. Las fuentes originales conservan contenido y fecha de actualización.
- Las doce reanudaciones del fixture registraron 398 operaciones de escaneo, 99 documentos retornados y 86 intentos puntuales. Las transacciones observadas del proceso padre, incluida una repetición idempotente, escribieron 7 marcadores, 7 buckets, 45 checkpoints, 36 snapshots y 36 páginas de productos. Se contabilizan aparte las 5 escrituras iniciales del CLI y las 4 del catálogo anual; repetir el catálogo escribió 0. Estos contadores de escaneo no incluyen todas las lecturas de las transacciones de contribución ni las lecturas del propio test para comprobar resultados.
- Evidencia: `.release/reportes-spark-node.log`, `.release/reportes-spark-browser.log`, `.release/reportes-spark-rules.log` y `.release/reportes-spark-manual-metrics.json`. Los XLSX y PDF reales están en `.release/qa-p29/p31-*`. Lint, build/PWA, `check:build`, inventario y diff-check se validan localmente. La aceptación remota y la activación administrativa siguen pendientes.
