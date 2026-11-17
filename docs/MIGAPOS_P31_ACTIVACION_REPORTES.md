# Activación y reversión de reportes consolidados P31

## Estado local

- `REPORT_SUMMARIES_ENABLED` en el servidor y `VITE_REPORT_SUMMARIES_ENABLED` en el frontend quedan deshabilitados por defecto. Día y semana conservan la ruta documental. Con la función deshabilitada, mes y año solo consultan el historial tras una acción explícita con aviso de costo.
- Con la función habilitada, el dashboard lee el alcance permitido y PDF/XLSX leen todas las sedes. Un resumen sin cobertura, vencido o de revisión incompatible muestra «Resumen no disponible». Auditorías consulta hasta 50 documentos por página, y la exportación requiere consentimiento para un máximo de cuatro páginas. Los archivos indican si quedan páginas.
- V2 se guarda en colecciones nuevas con sufijo `_v1` y conserva V1 como oráculo SHADOW. El flujo automático necesita Blaze y despliegue explícito de las funciones de reportes. Spark admite publicación manual mediante un operador con acceso administrativo autorizado. [Eventos Firestore](https://firebase.google.com/docs/functions/firestore-events) · [Cuotas de Functions](https://firebase.google.com/docs/functions/quotas).

## Publicación manual bajo autorización del propietario

1. Revisar presupuesto, permisos IAM mínimos del operador y servicio, CI del cambio, y catálogo de índices de la base `(default)`. Conservar copia de las Rules publicadas. Publicar los cambios de Rules y crear estos compuestos de ámbito **COLLECTION**. Confirmar estado **Habilitado** antes de habilitar la lectura.

   | Colección | Campos en orden |
   | --- | --- |
   | `cash_sessions` | `businessId ASC, expiredAt ASC, __name__ ASC` |
   | `cash_sessions` | `businessId ASC, branchId ASC, expiredAt ASC, __name__ ASC` |
   | `payments` | `businessId ASC, type ASC, occurredAt ASC, __name__ ASC` |
   | `payments` | `businessId ASC, branchId ASC, type ASC, occurredAt ASC, __name__ ASC` |
   | `report_source_contributions_v1` | `businessId ASC, months CONTAINS, __name__ ASC` |
   | `report_projection_state_v1` | `kind ASC, mode ASC, nextCheckAt ASC, __name__ ASC` |

   Aplicar las exenciones adicionales que figuran en `firestore.indexes.json` para cuerpos de buckets, contribuciones, snapshots y páginas de productos. Las Rules nuevas permiten puntos de lectura únicamente a cuentas activas con licencia y alcance autorizado. Checkpoints, marcadores y buckets son privados. Las cinco colecciones carecen de escritura de cliente.

2. Ejecutar el generador administrativo primero en ensayo. El CLI `functions/scripts/report-backfill.mjs` valida proyecto, negocio, un mes o año y los límites explícitos. Para acceso autorizado fuera de localhost requiere `--authorize-project` con el mismo identificador y credenciales externas del operador. El modo por defecto es dry-run. `--apply` requiere presupuesto de escrituras para cada ejecución mensual. Procesar cada mes transcurrido, incluidos los vacíos, y reanudar hasta `verified`. Solo después publicar el catálogo consolidado del año con `--year YYYY --apply`. La proyección falla si excede el límite, cambia el corte o falta evidencia histórica.

   Ejemplo de ensayo local con el emulador existente y `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`:

   ```powershell
   node functions/scripts/report-backfill.mjs --project demo-migapos --business negocio-ensayo --month 2026-10 --documents 1000
   ```

3. Para automatizar tras aprobar Blaze, configurar `REPORT_SUMMARIES_ENABLED=true` y `REPORT_MAX_SOURCE_DOCUMENTS` como presupuesto por escaneo. Seleccionar solamente estas funciones: `reportSalesProjection`, `reportPaymentProjection`, `reportVoidProjection`, `reportContractProjection`, `reportCashProjection` y `reconcileReportProjection`. Registrar los meses históricos y vacíos en la cola programada con `--automatic --apply` en modo autorizado, incluidos los publicados previamente en modo manual. Verificar revisiones mensuales, meses transcurridos y catálogos exactos en un piloto. Habilitar el gate web únicamente tras validar sus cifras y accesos. Con publicación manual, el corte visible corresponde al último trabajo del operador.
4. Si el escritor detecta datos incompatibles, la revisión queda incompleta o se activa la cuarentena del negocio. Investigar la fuente original con acceso administrativo autorizado. Una cuarentena se libera manualmente solo después de revisar los movimientos afectados y mantener los lectores deshabilitados hasta reconstruir cada período comprometido.

## Presupuesto y reversión

- Visualización de fixtures: dashboard mensual 1 documento, exportación mensual 1 + páginas de productos, año hasta 12 + páginas consolidadas. La página inicial de productos ubica el Top 5 anual. No se emiten queries de movimientos en el camino consolidado. PDF y XLSX comparten preparación dentro de su sesión y corte.
- Escritor local: la prueba de 100 tickets contabilizó 300 escrituras adicionales de contribución, 406 intentos de lectura puntual entre 102 intentos transaccionales (incluye un evento duplicado y un reintento), y 7 escrituras para publicar el negocio y dos sedes. La verificación de ese corte ejecutó 117 operaciones, con 204 retornos de queries y 102 intentos de lectura puntual. Se presupuestan reintentos, ejecuciones y escaneos periódicos por separado.
- Los lectores recorren hasta 24 páginas de productos publicados por alcance, de 250 filas cada una. La consolidación anual admite hasta 72 páginas fuente en total. Si el presupuesto de escaneo, un documento o el límite de publicación se exceden, el período queda pendiente de verificación.
- Las cifras del emulador no son facturación ni una medición de producción. Verificar contención del estado mensual y buckets con distribución real autorizada, así como recurrencia de lecturas antes de activar. Las alertas presupuestarias requieren seguimiento del operador. [Precios Firestore](https://firebase.google.com/docs/firestore/pricing).
- Reversión: volver a deshabilitar el gate web y suspender la programación y los triggers de reportes en el backend autorizado. Conservar fuentes, Rules de bloqueo de escrituras y documentos de proyección para diagnóstico. El historial detallado bajo demanda sigue disponible.
