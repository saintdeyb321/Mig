# Plan 14 · Resultados de caja e informes

## Recuperación y trazabilidad

La causa del bloqueo era un candado de sede que seguía apuntando a una caja `open` después de vencer. Las diez horas se cuentan desde `openedAt`, incluso si hubo ventas durante todo el turno. Una cuenta autorizada inicia la recuperación con un fondo nuevo y Firestore compara la hora de vencimiento con `request.time`. La recuperación se materializa cuando el operador la confirma.

| Estado o registro | Evidencia |
| --- | --- |
| Turno anterior `expired_unreconciled` | Conserva su apertura, fondo, responsable y movimientos. Registra `expiredAt`, `recoveredAt`, `recoveredBy`, motivo y enlace al nuevo turno. Contado y diferencia quedan nulos. |
| Turno nuevo `open` | ID y hora de servidor independientes, fondo introducido por el operador y candado canónico de la sede. |
| Cierre manual | Mantiene la declaración explícita y la referencia provisional existentes. La transición compite por el mismo candado y no puede sobrescribir una expiración ya confirmada. |

`sparkCashRepository.open` lee sede, perfil, candado y turno exacto. La transacción cambia la caja anterior, crea la nueva y reemplaza el candado. `cashExpiryRecovery` y `cashRecoveryLock` enlazan los tres documentos mediante `getAfter`; `cashOpening`, `newCashLock` y `cashActor` mantienen el control de actor, sede, horario y licencia. Ante una respuesta incierta, se comprueban por ID la nueva apertura, el recibo del turno anterior y el candado. Una caja sin protocolo verificable queda para revisión. POS y Contratos presentan el vencimiento, requieren confirmación y esperan evidencia del servidor para habilitar cobros. Los pendientes locales siguen ligados a su operación original.

## Evidencia de aceptación

| Caso | Estado | Resultado |
| --- | --- | --- |
| C01–C02 | BLOCKED | Casos de Rules preparados para 9 h 59 min y una recuperación después del instante de 10 h, anclado a un timestamp del emulador. |
| C03–C04 | PASS local · BLOCKED Rules | El repositorio ejercitado con un almacén transaccional simulado escribe los tres documentos una sola vez, conserva el fondo original y rechaza el competidor. Falta ejecutar la carrera con dos clientes y Rules reales del emulador. |
| C05–C06 | BLOCKED | Casos de Rules preparados para sede ajena, usuario suspendido, negocio distinto, SuperAdmin, vista global, licencia vencida, lotes parciales y campos falsificados. |
| C07–C08 | PASS local · BLOCKED Rules | Una caja histórica sin timestamp válido no cambia. La pérdida de respuesta y la reconexión permiten comprobar el mismo ID, sin repetir escrituras. Falta ejecución con Rules. |
| C09–C10 / R01–R02 | PASS local | XLSX reimportado. Apertura anterior S/100, vencimiento al día siguiente a las 06:00 de Lima sin arqueo, recuperación posterior con fondo S/50 y cierre con referencia y conteo S/70. El reporte separa los cuatro eventos y los campos nulos. |
| C11 | PASS local · BLOCKED Rules | Las pruebas del dominio preservan la atribución de compensaciones por sesión y no reescriben el cierre anterior. Está preparada la prueba integrada de rechazo al vender con el turno vencido y aceptación con la nueva caja. |
| R03–R05 / R08 | PASS local | Dashboard, PDF y XLSX usan la misma agregación. Conciliación en céntimos por canal, saldo firmado negativo permitido, hojas por sede reimportadas, sin fórmulas en textos externos ni doble suma de importes. |
| R06 | PASS aviso · FAIL conciliación histórica | El original legado `voided` sin recibo enlazable dentro de la lectura produce una advertencia provisional. La aceptación histórica separada sigue fallando para la venta de S/30 del 5/11 con recibo del 6/11. La unión cuadra y el día de la venta aislado sigue incompleto. |
| R07 | PASS local · MANUAL dispositivo | Chromium generó dos PDF A4 de dos páginas, con una y dos sedes. Se revisaron en escala de grises las tablas, cifras y alertas de caja. El flujo conservó la vista previa y permitió reintentar ante un fallo de impresión simulado. Queda la aceptación en el dispositivo del propietario. |
| R09 | PASS local | No se genera un archivo tras un 403, desconexión, inconsistencia o exceso del límite. Un período vacío confirmado en línea genera totales de cero. |
| R10–R11 | PASS sintético | Lectores reales contra SDK simulado. La segunda salida con el mismo snapshot hizo cero solicitudes. |

| Validación | Resultado |
| --- | --- |
| Node · Plan 14, Plan 13, Reportes y seguridad UI | PASS 91/91. La aceptación histórica separada dio FAIL 0/1. |
| Spark local · `npm run test:spark` | PASS 77/77. |
| Chromium · Caja, Excel dev/preview, PDF, P09 y P10-06 | PASS 6/6. La comprobación PDF final incluyó un vencimiento sin arqueo y volvió a pasar. |
| Lint y build/PWA | PASS. Precache de 45 archivos únicos y 2,88 MiB. Excel permanece bajo carga diferida. Vite advierte que hay chunks superiores a 500 kB. |
| `npm run test:spark:rules` | BLOCKED. El JAR Firestore v1.22.0 está en caché y no se encontró Java en Windows ni en Ubuntu WSL. Los dos archivos de pruebas pasan la comprobación de sintaxis Node. Falta la compilación de Rules y su validación funcional y de accesos en `demo-migapos`. |

Evidencia PDF/Excel con datos de prueba: una sede produjo neto S/85, efectivo S/28 y Yape/Plin S/57. Dos sedes produjeron S/67, S/40 y S/27, respectivamente. Los PDF se guardaron como `.release/qa-plan14/informe-una-sede.pdf` e `.release/qa-plan14/informe-dos-sedes.pdf`.

Archivos principales: `firestore.rules`, `features/cash-register/infrastructure/sparkCashRepository.js` y `cashQueryRepository.js` para transacción y consultas. `useCashRegister.js`, `CashRecoveryStatus.jsx`, `CashRegisterModals.jsx`, `POS.jsx` y `ContractManager.jsx` para apertura y recuperación. `sessionReportReads.js`, `reportViewModel.js`, `cashAuditRows.js`, `salesWorkbook.js` y `managementReportHtml.js` para el modelo y las salidas. Pruebas nuevas en `tests/plan14.test.mjs` y `tests/plan14-read-cost.test.mjs`; casos de Rules en `tests/spark.rules.test.mjs` y `tests/spark-financial.rules.test.mjs`.

## Informe y coste de lecturas

`sessionReportReads` comparte ventas confirmadas, compensaciones, pagos y pedidos entre Dashboard y exportaciones. La primera exportación completa la lectura con cajas y referencias históricas de pedidos cuando corresponde. Excel y la vista imprimible reutilizan esas entradas dentro de la misma cuenta, negocio, sede y período. Una operación confirmada invalida el alcance. Un cambio de alcance retira la salida anterior y detiene las lecturas suplementarias que aún no se hayan solicitado. Las páginas ya enviadas al SDK pueden terminar.

El informe gerencial se imprime en A4 desde un iframe aislado, con la opción nativa de guardar como PDF. Excel conserva resumen, comparativas, productos, detalle por sede y hojas de auditoría según el filtro. En caja, la fecha de vencimiento se atribuye al límite de diez horas y la observación conserva cuándo se formalizó. La consulta mira como máximo diez horas atrás en el índice existente de apertura para incluir vencimientos que cruzan medianoche. El informe muestra movimientos del período, no un inventario de todas las cajas pendientes.

Medición local con 20 negocios, 100 ventas por sede y día, una caja cerrada por sede y día y sin pagos ni compensaciones sintéticas en la carga. Se contabilizaron páginas enviadas al SDK simulado, documentos recibidos, consultas vacías y bytes JSON. Los tiempos son de ejecución local acumulada de las lecturas frías, no latencia de red.

| Rango | Sedes por negocio | Ventas únicas por negocio | Consultas frías | Documentos recibidos | Consultas vacías | MiB JSON | ms fríos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Día | 1 | 100 | 240 | 4.040 | 160 | 1,61 | 71 |
| Día | 2 | 200 | 280 | 8.080 | 200 | 3,23 | 117 |
| Semana | 1 | 700 | 360 | 28.280 | 160 | 11,29 | 263 |
| Semana | 2 | 1.400 | 520 | 56.560 | 200 | 22,58 | 437 |
| Mes de 30 días | 1 | 3.000 | 840 | 121.200 | 200 | 48,38 | 838 |
| Mes de 30 días | 2 | 6.000 | 1.440 | 242.400 | 200 | 96,77 | 1.396 |
| Año | 1 | 36.500 | 1.020 | 200.020 | 0 | 79,61 | 1.111 |
| Año | 2 | 73.000 | 1.020 | 200.020 | 0 | 79,57 | 1.104 |

El año queda **BLOCKED por volumen** en ambos alcances. El lector rechaza al documento 10.001 por negocio antes de leer fuentes suplementarias. La caché comparte ese rechazo temporalmente para evitar el mismo barrido al cambiar de formato. Para día, semana y mes, el primer informe después del Dashboard hizo 80 consultas de caja entre los 20 negocios. El formato siguiente hizo 0 consultas y obtuvo las mismas referencias en memoria, con 180 aciertos acumulados al reutilizar las lecturas entre vistas por escenario.

La lectura de compatibilidad por `createdAt` recibe de nuevo tickets Spark cuyo `confirmedAt` ya se leyó. El lector deduplica los tickets en memoria, pero Firestore cobra las lecturas efectuadas. El mes global devuelve 240.000 documentos de ventas sobre 120.000 tickets únicos y la semana global ya supera 50.000. La facturación real también puede incluir mínimos por consultas vacías, documentos evaluados por Rules y entradas de índice. No se midieron esas partidas ni la latencia real. [Precios de Firestore](https://firebase.google.com/docs/firestore/pricing) · [Cuotas de Firestore](https://firebase.google.com/docs/firestore/quotas)

Optimizaciones aplicadas: caché por alcance, tope sin truncamiento, abandono de consultas suplementarias ante exceso o cambio de alcance, y búsqueda de documentos de pedido solo para referencias ausentes. Antes de retirar una lectura histórica se requiere evidencia verificable de cobertura y compatibilidad. Un resumen diario persistente necesita un diseño independiente con idempotencia por recibo, atribución de compensaciones en la fecha correcta, reconciliación de históricos, reglas de actualización y pruebas de concurrencia. `daily_stats` sigue fuera de la autoridad de Spark.

## Condiciones para el piloto

| Paso | Estado |
| --- | --- |
| Ejecutar Rules locales en `demo-migapos` con Java ya disponible | BLOCKED. Deben pasar ambas suites, incluidas C01–C08 y la venta posterior a la recuperación. |
| Validar una caja vencida con dueño y cajero autorizado, operar la nueva y arquearla | MANUAL, después de validar Rules en el emulador. |
| Revisar A4, guardado PDF y Excel desde el navegador del propietario | MANUAL. |
| Conciliación histórica por días y capacidad para 20 negocios | FAIL histórico y límite anual. Revisar la evidencia de recibos históricos y acordar períodos operativos dentro del presupuesto medido. |
| Autorizar publicación | NO-GO hasta resolver los controles bloqueantes y completar la aceptación manual. El propietario debe revisar `firestore.rules` para `migapos/(default)`, incluidos `cashExpiryRecovery`, `cashRecoveryLock` y los permisos de actualización de `cash_sessions` y `active_cash_sessions`. Los índices existentes se reutilizan. |
