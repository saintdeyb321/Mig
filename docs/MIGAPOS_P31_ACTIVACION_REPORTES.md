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

El dry-run de frontend pasó en un árbol limpio con Node 22 y npm 11. Regenerar su lockfile produjo el mismo SHA-256. El simulador local de resolución anterior reprodujo `Missing: glob@10.5.0` en Functions. Allí el override por rango alternaba entre dos grafos incompatibles al regenerar el lockfile. Acotar el override al consumidor `rimraf` conservó `glob@14.0.3` y el lockfile exacto. La validación de CI exige el SDK de Admin para las pruebas y comprueba que Spark carece de Functions publicables en `firebase.json`. El aviso de `uuid@9.0.1` no se reprodujo localmente. Validar la instalación completa en CI antes de habilitar. La auditoría local detectó un bloqueo separado de `picomatch` en raíz y frontend (`GHSA-fc5q-39xc-vjpf`).

## Presupuesto y reversión

- Cada contribución actualiza día, marcador y `epoch` en la misma transacción. Un cambio deja el mes `dirty` sin adelantar la verificación ni renovar `validUntil`. La entrega de eventos y los pagos embebidos carecen de un cursor global que permita demostrar que llegaron todos los cambios. Hasta comprobar cobertura exhaustiva, el lector muestra «Resumen no disponible».
- El scheduler revisa la cola cada 5 minutos. Un checkpoint privado reserva como máximo un intento de escaneo exhaustivo por negocio cada 24 horas, aunque estén pendientes varios meses. El próximo control vence a las 24 horas para un mes abierto o 14 días para uno cerrado automático. El modo manual conserva su vigencia de 1 o 7 días. Los períodos en espera caducan por hora de servidor. Una revalidación con los mismos datos conserva la revisión y registra el nuevo corte.
- El control paginado reutiliza las lecturas de origen de su corte, incluidas las de contratos históricos. Si detecta movimientos omitidos, corrige hasta 14 contribuciones divergentes y exige otro control exhaustivo antes de publicar. Si el origen excede el presupuesto, la cobertura se pierde. Para volúmenes que excedan la capacidad de la cola, usar backfill administrativo con presupuesto explícito o mantener los períodos pendientes.
- Visualización de fixtures: dashboard mensual 1 documento, exportación mensual 1 + páginas de productos, año hasta 12 + páginas consolidadas. La página inicial de productos ubica el Top 5 anual. No se emiten queries de movimientos en el camino consolidado. PDF y XLSX comparten preparación dentro de su sesión y corte.
- Emulador, 100 tickets: 300 escrituras de contribución y 7 para publicar el negocio y dos sedes. Una ejecución observó 410 intentos de lectura puntual en 103 intentos transaccionales, incluido un evento duplicado. La prueba de origen pasó de 117 operaciones y 102 intentos puntuales en P31 a 17 operaciones y 2 intentos puntuales. Ambos cortes devolvieron 100 ventas, 100 marcadores, 2 buckets y 2 sedes.
- Emulador, 24 horas simuladas con 500 contratos y sin movimientos: 288 consultas vacías de cola, 0 documentos de origen, 0 escrituras. Al vencer, una verificación leyó 500 contratos y 1 sede, más accesos de checkpoint, frente a los ~48.000 retornos de contratos diarios estimados con el calendario anterior. La reserva y publicación de ese corte escribieron 6 documentos.
- Las Rules de un punto de lectura pueden consultar el perfil, la licencia, el negocio, el checkpoint y la cuarentena, además de la sede asignada para un cajero. Las consultas de cola sin resultados y las evaluaciones de reglas pueden tener cargos. Los recuentos del emulador separan operaciones y documentos, sin medir esos cargos.
- Los lectores recorren hasta 24 páginas de productos publicados por alcance, de 250 filas cada una. La consolidación anual admite hasta 72 páginas fuente en total. Si el presupuesto de escaneo, un documento o el límite de publicación se exceden, el período queda pendiente de verificación.
- Las cifras del emulador no son facturación ni una medición de producción. Verificar contención del estado mensual y buckets con distribución real autorizada, así como recurrencia de lecturas antes de activar. Las alertas presupuestarias requieren seguimiento del operador. [Precios Firestore](https://firebase.google.com/docs/firestore/pricing).
- Reversión: volver a deshabilitar el gate web y suspender la programación y los triggers de reportes en el backend autorizado. Conservar fuentes, Rules de bloqueo de escrituras y documentos de proyección para diagnóstico. El historial detallado bajo demanda sigue disponible.
