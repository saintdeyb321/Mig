# MigaPOS · Plan 13 Fase 02 · Resultados de QA automatizada

**2026-11-06 · America/Lima · Salida de preventa NO-GO**

## Entorno

- Windows, Node 24.18.1, npm 11.16.0, Vite 7.3.7 y Chrome instalado localmente. Se usaron las dependencias existentes. El propietario debe anotar aquí el SHA exacto y el job equivalente. El SHA de referencia del plan identifica la auditoría anterior.
- Build y navegador con variables de proceso para `demo-migapos`, `VITE_USE_EMULATORS=true` y App Check desactivado. Auth y Firestore configurados para `127.0.0.1:9099` y `127.0.0.1:8080`. Storage no forma parte de Spark. Vite ignoró los archivos de entorno en las fixtures y Chromium usó perfiles temporales, mocks y un proxy de denegación en loopback.
- Firebase CLI 15.34.1 y JAR Firestore v1.22.0 en caché. No se encontró Java en PATH ni en las ubicaciones locales revisadas. No se arrancaron emuladores. Los repositorios ejercitados con SDK en memoria verifican el flujo cliente y sus invariantes. La evaluación de Rules, los índices y la concurrencia real de Firestore quedan pendientes.
- El primer intento bajo sandbox produjo `EACCES` en loopback y salida de Crashpad. La repetición con autorización para el entorno local ejecutó las suites de Chromium y Spark. No hubo acceso a producción, instalaciones, cambios de `.env`, operaciones de Git/GitHub ni despliegues.

## Ejecuciones y evidencias

Los logs y los artefactos locales están en `.release/qa-plan13/`. Los totales de las suites se muestran por comando, con casos reutilizados entre comandos.

| Comando local | Estado | Evidencia |
| --- | --- | --- |
| `npm run test:spark` | PASS | 77/77. Incluye el inventario Markdown, arranque SuperAdmin, backup cifrado descargable y cola cifrada. `13-spark-final.log`. |
| `node --test tests/ui-security.test.mjs` | PASS | 25/25 con el informe final presente en el inventario. `19-seguridad-documentos-final.log`. |
| `npm run test:offline-db` | PASS | 1/1 suite y 22 comprobaciones de IndexedDB real en perfil aislado. `14-indexeddb-final.log`. |
| `node --test --test-concurrency=1 tests/sales.test.mjs tests/architecture.test.mjs tests/session-recovery.test.mjs tests/cash.domain.test.mjs tests/contracts.domain.test.mjs tests/plan07.test.mjs tests/plan08.test.mjs tests/plan09.test.mjs` | PASS | 115/115. Una fixture de caché omitía la metadata obligatoria para simular un snapshot del servidor. Se corrigió con `fromCache: false` y `hasPendingWrites: false`. `16-dominio-sesion-final.log`. |
| `node --test --test-concurrency=1 tests/reports.test.mjs tests/plan13.test.mjs tests/plan08.test.mjs` | FAIL | 63/64. La regresión de anulación histórica es el único fallo. `17-finanzas-ampliadas.log`. |
| `node --test --test-concurrency=1 tests/plan07.browser.test.mjs tests/plan08.browser.test.mjs tests/plan09.browser.test.mjs tests/plan10-correction.browser.test.mjs tests/cash-amount.browser.test.mjs tests/ui-security.browser.test.mjs` | FAIL | 5/7. P09 y P10-06 fallaron en la posición del cobro. P08 cubrió 11 controles de anulación y 16 de POS/caja. Seguridad de impresión, CSP y descarga XLSX pasó 17 controles. `12-chromium-final.log`. |
| `node --test tests/cash-amount.browser.test.mjs` | PASS | 1/1 con 48 controles, incluido doble envío, apertura sin confirmación y cierre del diálogo al confirmarse. `18-modal-caja.log`. |
| `npm run lint --prefix frontend` | FAIL | Seis diagnósticos `no-unused-vars` por bindings `Icon` en `BottomNav.jsx` (19, 39), `PaymentParts.jsx` (25) y `ReportParts.jsx` (28, 75, 97). `04-lint.log`. |
| `npm run build --prefix frontend -- --outDir ../.release/qa-plan13/build` | PASS | Build emulador con advertencia de tamaño de chunks. Comprobación de `scripts/check-build.mjs` ejecutada por stdin apuntando a ese build. PWA: 44 archivos locales, 2.86 MiB, scripts externos y caché diferida de Excel. `05-build.log`, `09-pwa.log`. |
| `npm run test:spark:rules` y workflow completo | BLOCKED | Rules requiere Java local. El workflow y su atestación quedan pendientes para el SHA exacto. |

Las pruebas de layout usaron `MIGAPOS_TEST_BUILD_DIR=.release/qa-plan13/build` y `MIGAPOS_TEST_ARTIFACT_DIR=.release/qa-plan13`. El SHA-256 del `index.html` de ese build es `ba761e5b7b99cd9d55954e7e8771b597d4892b8301a36c0dfb0f77e94b34adc6`.

## Conciliación numérica

| Escenario | POS neto | Pedidos netos | Efectivo neto | Yape/Plin neto | Neto general | Referencia de efectivo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A, fondo S/ 100, antes de compensar | 70.00 | 15.00 | 28.00 | 57.00 | 85.00 | 128.00 |
| A, después de compensar S/ 30 en Yape | 40.00 | 15.00 | 28.00 | 27.00 | 55.00 | 128.00, provisional |
| Solo compensación digital de una venta del día anterior | −30.00 | 0.00 | 0.00 | −30.00 | −30.00 | Según el turno |

Dashboard se ejercitó a través de `createReportResource` con lectores simulados. Excel se serializó y reimportó. Los ocho importes por canal, los netos, las sedes, el detalle y la suma del período conciliaron en céntimos para estas entradas. El fondo inicial pertenece a caja. Los contramovimientos contables se mantienen con su signo y sin certificar desembolsos.

## Defectos y decisiones pendientes

- **Crítico, anulación histórica duplicada.** Ejecutar `node --test --test-name-pattern "historical void" tests/plan13.test.mjs`. El caso usa una venta Yape de S/ 30 marcada `voided: true` y un `pos_voids` válido del mismo ticket y día, repetido en la entrada para ejercitar su deduplicación. Dashboard y Excel cuentan **2** anulaciones, neto **−S/ 30**, cantidad de producto **−1** e ingreso del producto **−S/ 30**. Se espera **1**, neto **S/ 0**, cantidad **0** e ingreso **S/ 0**. `salesToDailyStats` y el detalle excluyen la venta histórica, y `aggregateReport` vuelve a descontar y contar el recibo. Esto reproduce una doble proyección contable. Las pruebas separadas de repositorio verificaron una sola escritura de compensación y reposición.
- **Corrección de dominio propuesta, pendiente de aprobación.** Unificar el reconocimiento del original y la compensación por ID, negocio y sede antes de agrupar, con la validación de recibo vigente. Para pares verificados, conservar el cobro original en su fecha y contabilizar el recibo una vez en la fecha de compensación. Conservar la exclusión histórica cuando falta recibo. Aplicar el mismo criterio en estadísticas y detalle, incluyendo cruces de período y casos en que solo se consulta la compensación. Revisar si las fuentes acotadas aportan las referencias necesarias antes de autorizar lecturas extra. Mantener las fuentes originales y repetir P0.4 con esta regresión todavía activa.
- **Regresión responsive.** P09 falla a 1280 × 800 antes del primer desplazamiento. P10-06 midió el botón de cobro en `bottom=919` y el panel en `bottom=920` para un viewport de 900 px. El foco llega al importe, pero el CTA queda fuera de la vista. La corrección debe preservar el área desplazable del carrito y la aserción de foco/cobro. No se cambiaron los umbrales.
- **Lint.** Corregir en una tarea de frontend los seis bindings `Icon` reportados por la configuración actual, sin relajar ESLint.
- **Inventario devuelto.** La anulación repone unidades automáticamente. Para perecederos, falta definir la inspección, merma y trazabilidad antes de volver a ofrecer el producto. Queda pendiente también el flujo verificable de devolución física/digital y una restauración aislada aprobada.

## Matriz de aceptación

**73 casos. 35 PASS · 4 FAIL · 26 BLOCKED · 8 MANUAL.** Un PASS de fixture se limita al modelo, repositorio simulado o navegador descrito en la fila. Rules y aceptación de la instancia se controlan aparte.

| ID | Estado | Evidencia o cobertura pendiente |
| --- | --- | --- |
| P0.1 | BLOCKED | Anotar el SHA exacto del código probado y del job. La referencia auditada del plan no identifica este directorio. |
| P0.2 | PASS | Inventario Markdown por ruta exacta y suite Spark 77/77. Continúa rechazando documentos ajenos. |
| P0.3 | BLOCKED | Workflow completo y atestación del SHA a cargo del propietario. Lint y regresiones locales siguen en FAIL. |
| P0.4 | FAIL | Ticket histórico + recibo inmutable cuenta 2 anulaciones, −S/ 30 y −1 unidad en Reportes y Excel. |
| P0.5 | BLOCKED | Exportación cifrada, integridad, alcance y descarga aprobados. Falta recuperar datos de prueba con un procedimiento autorizado. |
| P0.6 | BLOCKED | Revisión estática y tests Spark locales. Falta ejecutar Rules/índices y contrastar la configuración de la instancia de ensayo. |
| A1 | BLOCKED | `session-recovery` y arranque SuperAdmin pasan con mocks. Pendiente iniciar sesión en emuladores como dueño, cajero e inhabilitado. |
| A2 | BLOCKED | Node verifica stock y reportes por sede y descarta operaciones tras cambios. Falta el recorrido con los módulos conectados. |
| A3 | BLOCKED | Spark rechaza apertura global antes de llamar al SDK. Falta probar los permisos globales de venta/caja y el recorrido en la aplicación aislada. |
| A4 | BLOCKED | Falta ejecutar `spark-financial.rules` para cajero de otra sede y revisar denegación en interfaz con ese rol. |
| A5 | BLOCKED | Arquitectura, caché, reportes y Excel filtran registros ajenos con fixtures. Falta comprobar aislamiento de dos negocios bajo Rules. |
| A6 | BLOCKED | `session-recovery` cancela callbacks de identidad anterior. Falta reproducir atrás/F5 con dos sesiones completas. |
| I1 | BLOCKED | Stock de 5 y 2 inicializado en el harness. Falta crear y leer el producto en Firestore emulado. |
| I2 | PASS | Repositorio con SDK simulado: A baja 5 → 3, B conserva 2 y la versión A sube una vez pese al reintento. |
| I3 | PASS | Repositorio rechaza cantidad 6 con stock 5 y cero escrituras. P08 verifica carreras de última unidad. |
| I4 | MANUAL | Cargar foto local, omitir foto y usar nombres largos en catálogo/carrito. La suite responsive falla antes del recorrido completo. |
| I5 | BLOCKED | El repositorio vuelve a sumar unidades al anular. Falta política auditada de inspección y merma. |
| V1 | BLOCKED | Node confirma fondo S/ 100 y una caja activa. Chromium confirma que el diálogo ignora caché, evita doble clic y cierra con confirmación. Falta F5 con sesión emulada. |
| V2 | PASS | Validador y escenario A: S/ 50 recibidos, S/ 30 de vuelto, S/ 20 de efectivo neto. |
| V3 | PASS | El selector POS usa un canal Yape/Plin. Ticket digital S/ 30 y filas Yape/Plin históricas dejan intacta la referencia de efectivo. |
| V4 | PASS | S/ 8 + S/ 12 = S/ 20. Se aceptan céntimos válidos y se rechazan partes negativas, no finitas o de precisión excesiva. |
| V5 | BLOCKED | El anticipo Yape S/ 15 se agrega una vez en Reportes/Excel sin ticket POS. Falta la transacción de creación de pedido y su recibo bajo Rules. |
| V6 | PASS | Dashboard con lectores inyectados: POS S/ 70, pedidos S/ 15, neto S/ 85, efectivo S/ 28, digital S/ 57. |
| V7 | MANUAL | Referencia simulada S/ 128 y diferencia cero al declarar S/ 128. El conteo de billetes y monedas es presencial. |
| V8 | PASS | Repositorio simulado cierra una vez, conserva el cierre anterior y abre otro ID con fondo independiente. |
| N1 | PASS | SDK simulado y P08 Chromium: un recibo, una reposición, modal cerrado tras confirmación y motivo conservado en historial. |
| N2 | PASS | Escenario A y XLSX: efectivo S/ 28, cobro digital S/ 57, compensación digital −S/ 30, digital neto S/ 27 y total S/ 55. |
| N3 | FAIL | El flujo Spark normal cuenta una vez. La coexistencia de marcas histórica y Spark duplica el ajuste en la proyección. |
| N4 | PASS | P08 y P13 simulan doble clic/reintento. Un `pos_voids` y una versión de reposición. |
| N5 | PASS | P07/P08 simulan pérdida de respuesta, resultado incierto y recuperación de solo lectura por ID. Falta prueba de red con emulador. |
| N6 | PASS | Compensación en efectivo baja la referencia contable. Requiere revisión y no acredita dinero entregado. |
| N7 | PASS | Fixtures Lima de dos días. La compensación actual arroja −S/ 30 digital y el XLSX explica el período anterior. |
| N8 | BLOCKED | SDK simulado rechaza anular sin caja y conserva escrituras en cero. Falta ejecutar casos de permisos, caja expirada y ticket histórico bajo Rules. |
| N9 | PASS | Mixto S/ 8 y S/ 12 produce compensaciones −S/ 8 y −S/ 12 y netos cero. |
| N10 | BLOCKED | Stock vuelve al disponible sin inspección. Falta definir el tratamiento auditado de producto dañado, entregado o consumido. |
| C1 | PASS | Modelo comercial valida subtotal S/ 100 + delivery S/ 5 = S/ 105 con datos aislados. |
| C2 | BLOCKED | Modelo valida adelanto S/ 20 y saldo S/ 85. Pendiente comprobar recibo, persistencia y F5. |
| C3 | PASS | La proyección con dos movimientos de S/ 20 y S/ 85 queda abonada en S/ 105 y saldo cero. La persistencia emulada sigue pendiente. |
| C4 | BLOCKED | Proyección devuelve «entregado». Falta confirmar cambios de agenda, detalle e historial con los lectores emulados. |
| C5 | MANUAL | El límite de cuatro nuevas referencias y rechazo de la quinta pasan en Node. Falta seleccionar, comprimir y verificar el aviso en el formulario. |
| C6 | PASS | Reembolso contable Yape −S/ 15 firmado en Dashboard/Excel. La liquidación bancaria requiere evidencia aparte. |
| C7 | MANUAL | `contracts.domain` y P13 cubren estados y saldo. Falta recorrer las cuatro variantes y revisar los mensajes del módulo. |
| C8 | BLOCKED | Pendiente política y registro verificable de entrega del reembolso. El contramovimiento contable no acredita el pago. |
| R1 | PASS | Se cotejan Hoy, Semana, Mes y Año por sede y global con límites de medianoche Lima y un registro de otro tenant. |
| R2 | PASS | `Resumen_Financiero` reimportado coincide con POS S/ 70, pedidos S/ 15, efectivo S/ 28, digital S/ 57 y neto S/ 85. |
| R3 | PASS | Después de compensar, resumen y Dashboard coinciden en −S/ 30 de compensación digital, S/ 27 digital y S/ 55 general. |
| R4 | FAIL | Flujo Spark normal: detalle enlaza ID de ticket y compensación una vez. El ticket histórico coexistente vuelve a descontar el movimiento. |
| R5 | PASS | `Auditoría_Pedidos` coteja fechas y signos de adelanto, abono y reembolso tras serializar/reimportar. |
| R6 | PASS | Se comparan en céntimos los canales, la suma de sedes y el total de detalle/resumen del período. |
| R7 | PASS | Neto digital −S/ 30 por compensación de una venta previa, conservado y explicado en ambos modelos de reporte. |
| R8 | PASS | La venta y la compensación mixta concilian por canal y movimiento firmado. |
| R9 | MANUAL | El XLSX reimportado mantiene `=`, `+`, `-` y `@` como texto, sin fórmulas ni enlaces. Falta abrir el archivo en Excel de escritorio. |
| R10 | PASS | Exportación superior a 10 000 filas de detalle falla explícitamente. Lectores existentes prueban el límite de documentos/paginación. |
| R11 | PASS | El modelo usa neto contable. Resumen y ayudas comparten las notas de alcance, incluido desembolso sin verificar. |
| K1 | PASS | Repositorio con SDK simulado declara S/ 128, guarda un cierre y libera su candado una sola vez. |
| K2 | PASS | Con S/ 126 contado para referencia S/ 128, diferencia −S/ 2, observación obligatoria y cierre con discrepancia. |
| K3 | PASS | Con S/ 133 contado, diferencia +S/ 5, motivo obligatorio y actor de cierre registrado en la simulación. |
| K4 | PASS | En el SDK simulado, la compensación pertenece al nuevo turno. El cierre previo conserva los importes y la nueva referencia queda provisional. |
| K5 | PASS | Dos aperturas de la misma sede con IDs distintos y dos cierres equivalentes en paralelo. SDK simulado, una caja activa y una declaración. |
| K6 | PASS | Excel reimportado conserva el monto declarado de los cierres Spark y marca diferencia «Pendiente». La suite existente cubre cierres nocturnos. |
| O1 | MANUAL | IndexedDB y arranque aislado aprobados. Falta F5 en POS con cinco productos y sesión autenticada de ensayo. |
| O2 | PASS | P07/P08 ejercitan la pérdida de respuesta, preservan el cifrado y recuperan el recibo existente sin reenvío ni débito duplicado. |
| O3 | BLOCKED | Recursos y leases deduplican en Node. Falta probar dos pestañas autenticadas y observar listeners del emulador durante navegación. |
| O4 | PASS | Permiso denegado simulado invalida cifras cacheadas y las verificaciones de sesión impiden reusar otra identidad. |
| O5 | FAIL | P09/P10-06 fallan en visibilidad de Cobrar en escritorio. Resto de tamaños y recorrido completo de teclado quedan pendientes. |
| O6 | MANUAL | Chromium cubre impresión en sandbox y limpieza. Pendiente papel/PDF, montos, fecha, sede y corte con equipo real. |
| O7 | BLOCKED | Backup cifrado y validación local aprobados. Falta la restauración autorizada en un entorno aislado. |
| O8 | BLOCKED | Sin Firestore emulado operativo ni medición real autorizada. No hay cifras verificadas de cuota con dos usuarios. |
| E1 | BLOCKED | Hay fixtures de dos negocios y sedes para modelos. Falta alta representativa en emuladores. |
| E2 | BLOCKED | Separación de scopes comprobada en Node. Falta carga simultánea autenticada y medición de latencia. |
| E3 | BLOCKED | Paginación y reutilización de lecturas verificadas con spies. No se midieron lecturas facturables ni volumen real. |
| E4 | BLOCKED | El dimensionamiento para 10 y 20 negocios requiere primero la medición de E3. |
| E5 | MANUAL | Revisar límites, monitoreo, atención de incidentes y recuperación con el propietario antes del piloto. |

## Archivos de QA

- `tests/ui-security.test.mjs` conserva el inventario cerrado de documentación. `tests/architecture.test.mjs` usa metadata realista en la carrera de proyecciones.
- `tests/plan13.test.mjs` automatiza conciliación, precisión, pedidos, caja, stock y la regresión histórica. `tests/helpers/plan08FinancialHarness.mjs` permite simular el borrado transaccional del candado de caja.
- `tests/helpers/browserHarness.mjs` aísla el tráfico y permite leer CSS del build de ensayo. `tests/plan07.browser.html` usa los textos vigentes y sigue exigiendo el límite de ocho. `tests/plan09.browser.test.mjs` y `tests/plan10-correction.browser.test.mjs` usan el build y las rutas de artefactos de esta fase.
- `tests/cash-amount.browser.html` y `tests/cash-amount.browser.test.mjs` prueban la carrera de confirmación de apertura. `tests/ui-security.browser.mjs` conserva la CSP Spark, exige bloquear Storage/Functions y simula el timeout de impresión con una imagen local.
