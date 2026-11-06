# MigaPOS · P13-04 · Diagnóstico de conciliación y aceptación

**2026-11-06 · America/Lima · Preventa NO-GO**

## CI #37 y compacidad del historial

La auditoría entregada por el propietario atribuye a `70512124` el PASS de Spark/Rules, IndexedDB, lint/build, Reportes/P13 y P09. P10-06 falló en la condición conjunta de fondo y altura. La atestación y el artefacto `release-verification` quedaron sin generarse. Esta fase usa esa evidencia local y deja pendiente el resultado remoto del nuevo SHA.

Se conservó el límite estricto **altura < 310 px**. P10-06 registra cada medida por separado y guarda JSON aunque falle. Además de altura, ancho, viewport, fondo y color de referencia, mide tipografía solicitada y efectiva, cabecera, pie, texto, contraste y franja superior. El fondo se comprueba contra el token claro `--color-panel` en sRGB con opacidad completa y contraste de texto ≥ 4.5:1. La franja del ticket de efectivo debe coincidir con el token de éxito y el botón de anulación debe seguir accesible y habilitado.

Ubuntu WSL 26.04 tenía DejaVu Sans disponible como fuente de `system-ui`. No había un binario Chromium Linux disponible en el entorno inspeccionado. Se usó Chrome Windows con la fuente original y se repitió con DejaVu Sans regular y negrita de WSL inyectadas solo en una copia de la hoja CSS de ensayo. El navegador confirmó Segoe UI y DejaVu Sans respectivamente. Esto reproduce el mecanismo tipográfico, aunque el runner Ubuntu 24.04 y el operando exacto de #37 siguen pendientes de confirmación remota.

| Chrome Windows, antes del ajuste | Casos de historial | Fondo | Cabecera | Alto máximo |
| --- | --- | --- | ---: | ---: |
| Segoe UI | 12 | `rgb(255, 254, 252)` | 38 px | 279 px |
| DejaVu Sans de WSL | 12, 5 excedieron el límite | `rgb(255, 254, 252)` | 71.5 px al envolver | 312.5 px |

Con DejaVu, a 1024 × 768 y con tres o diez tickets, la tarjeta de 345 px subió a 312.5 px. A 320 × 560, la de 294 px subió a 311.5 px. En ambos casos el fondo conservó el RGB y el pie mantuvo su altura. El `flex-wrap` de la cabecera enviaba el distintivo de estado a otra fila. El ajuste local reserva una columna para fecha y sede y otra para el distintivo. Ambas pueden envolver texto dentro de su espacio. Se conservaron las acciones y la información de venta.

Tras el ajuste, las 12 tarjetas de cada variante pasaron. Con DejaVu, la cabecera quedó en 47 px a 1024 × 768 y en 58 px a 320 × 560. Las tarjetas que fallaban bajaron a 288 y 298 px respectivamente. El máximo con Segoe UI siguió en 279 px. En ambas variantes, el fondo conservó `rgb(255, 254, 252)` y el contraste de la fecha fue de 16.53:1. Las mediciones de Chrome 157 están en `{windows,dejavu,windows-final,dejavu-final}/p10-06-visual/history-card-diagnostics.json` dentro de los artefactos de esta fase.

## Lectores y reproducción financiera

`sessionReportReads` comparte las cargas acotadas entre Dashboard y Excel. Ventas consulta tres formas de fecha, `confirmedAt` para Spark y `createdAt` como Timestamp o cadena para históricos. Compensaciones consulta `occurredAt`. Ambos lectores llevan filtros de negocio y, cuando corresponde, sede. Dashboard usa `createReportResource → aggregateReport`. Excel pasa por `buildSalesWorkbook → processSales/processDailyStats → aggregateReport`. La fábrica de lecturas se separó de la inicialización Firebase para probar la misma composición con SDK simulado. Conserva consultas, límites, caché y cancelación. [Composición](../frontend/src/features/reports/application/sessionReportReads.js) · [Ventas](../frontend/src/features/sales/infrastructure/salesQueryRepository.js) · [Compensaciones](../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js) · [Proyección](../frontend/src/features/reports/domain/reportTotals.js)

La fixture vende por Yape S/ 30 el **5 de noviembre de 2026 a las 23:59:59.999** en Lima y registra la compensación el **6 a las 00:00:00**, en el turno siguiente. Cada consulta carga su propio rango. Se serializa y reimporta el XLSX de cada consulta. Columnas monetarias en soles.

| Caso | Día 5 | Día 6 | Suma de días | Rango conjunto |
| --- | ---: | ---: | ---: | ---: |
| POS moderno, neto total y digital | +30 | −30 | 0 | 0 |
| POS moderno, unidades e ingreso por producto | +1 / +30 | −1 / −30 | 0 / 0 | 0 / 0 |
| Histórico `voided:true`, neto total y digital | 0 | −30 | **−30** | 0 |
| Histórico, unidades e ingreso por producto | 0 / 0 | −1 / −30 | **−1 / −30** | 0 / 0 |
| Histórico, cantidad de anulaciones | 1 | 1 | **2** | 1 |

El día 5 trae la marca histórica pero cero recibos. El día 6 trae el recibo y carece del ticket original. El rango conjunto trae ambos y concilia. La compensación del día 6 permanece negativa porque ese día contiene el movimiento firmado. Para el histórico sin recibo, Excel conserva el estado «ANULADA» y no fabrica una compensación. No se cambió la proyección ni se introdujeron lecturas puntuales.

| Cobertura de aceptación | Resultado |
| --- | --- |
| A1 / A10 moderno | PASS con lectores acotados, dos días y unión en Dashboard y XLSX. |
| A2 / A10 histórico | PASS en la unión. **FAIL** en los días separados. La aceptación estricta produce salida 1. |
| A3 / A4 | PASS. Duplicado idéntico el mismo día y compatibilidad de histórico sin recibo, incluso con Plin. |
| A5 / A6 | PASS para modernos en medianoche Lima, cambios de semana, mes, año y turno, efectivo y mixto S/ 8 + S/ 12. En históricos se reproduce la brecha al separar los rangos de cada frontera. |
| A7 / A9 | PASS con SDK simulado. Aislamiento por negocio y sede, suma de sedes igual a global y rechazo de identidad, importe o líneas incompatibles dentro del alcance. |
| A8 | PASS para errores en los lectores vigentes simulados. Denegación elimina cifras, un error transitorio conserva solo el último modelo de la misma identidad con error visible, y la exportación falla ante la lectura rechazada. El acceso puntual propuesto sigue pendiente de Rules. |

La prueba que caracteriza la brecha forma parte de `tests/plan13.test.mjs`. La aceptación matemática está en `tests/plan13-historical.acceptance.mjs` y se ejecuta de forma explícita. Es un requisito de preventa, separado de los controles del workflow actual para la reparación de P10-06. El PASS de la prueba de caracterización acredita la reproducción, mientras la aceptación comercial continúa en FAIL.

## Alternativas y coste incremental en Spark

| Opción | Ventaja | Límite y decisión |
| --- | --- | --- |
| 1. Buscar `pos_voids/{saleId}` por ID | Puede confirmar el cobro del período de origen sin mover la compensación. Reutiliza el reconciliador actual. | Añade peticiones. Solo sobre IDs de históricos marcados y obtenidos por el lector autorizado. Recomendada tras aprobación y validación bajo Rules. |
| 2. Evidencia histórica auditada y precalculada | Permite verificar conjuntos grandes sin repetir búsquedas cliente. | Requiere proceso administrativo, persistencia derivada y revisión de autorización, idempotencia y coste. Fuera de esta fase. |
| 3. Bloqueo por evidencia insuficiente | Puede impedir una publicación definitiva sin lecturas nuevas. Mantiene el histórico disponible para revisión. | El origen marcado sin evidencia compartida se informa como «requiere conciliación histórica» y se bloquean neto consolidado y Excel financiero. Afecta también históricos genuinamente sin recibo hasta verificar su ausencia. Opción provisional para aprobación. |

La opción 1 usaría `getDocFromServer`. Se descartan IDs ya cubiertos por recibos verificados, incluso si se obtuvieron en otro rango durante la misma sesión autorizada. El recibo positivo conserva su `occurredAt`. Una ausencia confirmada permite conservar la clasificación histórica durante un TTL corto. Un 403, error de red, metadatos no confirmados o discrepancia no equivalen a ausencia. Las Rules locales permiten obtener un documento existente con alcance financiero y uno ausente con perfil activo. No se consultarán IDs arbitrarios ni se ampliará `list`. No se presupone que una consulta `in` tenga el mismo comportamiento de autorización. [Rules locales](../firestore.rules) · [SDK Firestore](https://firebase.google.com/docs/reference/js/firestore#getdocfromserver) · [Condiciones de Rules](https://firebase.google.com/docs/firestore/security/rules-conditions)

El stub midió **12 peticiones** para tres rangos con hasta un ticket y un recibo, desglosadas en nueve de ventas y tres de recibos. Cada Dashboard y su XLSX reutilizaron la carga de su sesión. Contratos y pagos se simularon vacíos y no están en el conteo. El presupuesto futuro estima **hasta dos lecturas por ID frío** para dueño/cajero, reservando una para el documento y una para el perfil dependiente de Rules. Es una estimación conservadora por intento, incluso para ausencias y denegaciones. No es una factura. La cuota sin coste de la base elegible es de 50 000 lecturas diarias por proyecto. [Cuotas y facturación de Firestore](https://firebase.google.com/docs/firestore/pricing)

| Filtro | Ejemplo de IDs fríos por sesión | Lecturas extra del ejemplo | Tope propuesto por consulta | Lecturas extra en el tope |
| --- | ---: | ---: | ---: | ---: |
| Hoy | 1 | 2 | 10 | 20 |
| Semana | 4 | 8 | 25 | 50 |
| Mes | 12 | 24 | 50 | 100 |
| Año (`todo`) | 40 | 80 | 100 | 200 |

Propuesta para aprobación. Máximo 100 intentos fríos por sesión autenticada, cuatro en paralelo, sin paginación de búsquedas puntuales ni reintentos automáticos. El límite se evalúa antes de enviar peticiones. Caché exclusivamente en memoria por identidad, alcance vigente, negocio, sede física e ID. Deduplicar promesas pendientes. TTL positivo de hasta 15 minutos, TTL de ausencia de hasta 2 minutos. Invalidar al cambiar de contexto o al confirmar una anulación. Cancelar el trabajo pendiente y descartar respuestas de generaciones antiguas. Una lectura ya enviada puede consumir cuota. Sobrepasar el límite o recibir un error bloquea resultados financieros definitivos del rango afectado y conserva la causa explícita.

Ejemplo de capacidad. Para una consulta mensual fría al tope por sesión y dos sesiones diarias en cada negocio, 10 negocios añadirían unas 2 000 lecturas y 20 añadirían unas 4 000 al día. No incluye tráfico habitual, otras sesiones, índices ni casos extraordinarios. Medir solicitudes, documentos, ausencias, 403, aciertos de caché, concurrencia y cuota real antes de decidir capacidad.

## Validación local y próxima decisión

Artefactos en `.release/qa-plan13-04/`. Las pruebas usan datos sintéticos, SDK simulado y build de emulador `demo-migapos`. Chromium se ejecutó con perfil aislado y tráfico externo bloqueado.

| Comprobación | Evidencia |
| --- | --- |
| P10-06 antes del ajuste | Windows PASS. DejaVu FAIL de altura en 5/12 tarjetas, fondo correcto en 12/12. `02-windows.log`, `03-dejavu.log`. |
| Reportes, P13, P09 y P10-06 juntos | PASS **64/64** con Chrome Windows. P09 verificó 199 controles y P10-06 verificó 480. `08-windows-final.log`. |
| P10-06 con fuentes DejaVu tras el ajuste | PASS **1/1**, 480 controles. `09-dejavu-final.log`. |
| Reportes, P13 e inventario Markdown | PASS **85/85**. `node --test --test-concurrency=1 tests/reports.test.mjs tests/plan13.test.mjs tests/ui-security.test.mjs`. `10-node-final.log`. |
| Aceptación histórica estricta | **FAIL 0/1**. `node --test tests/plan13-historical.acceptance.mjs`. `05-aceptacion-historica.log`. |
| Build, PWA y lint | PASS. `npm run build --prefix frontend -- --outDir ../.release/qa-plan13-04/build-final`, comprobación PWA sobre ese directorio (44 archivos, 2.86 MiB) y `npm run lint --prefix frontend`. `06-build-final.log`, `07-lint.log`, `11-pwa.log`. |
| Firestore Rules, Linux nativo y CI nuevo | BLOCKED en local. El host carece de Java disponible y de Chromium Linux instalado. El propietario debe verificar el nuevo SHA y artefacto en el runner. |

Recomendación. Autorizar primero el prototipo de opción 1 en emulador, con los límites anteriores y la opción 3 como salida ante evidencia incompleta. Exigir que la aceptación estricta pase en los dos días y sus uniones, que 403 y exceso de presupuesto bloqueen la publicación, y que el runner pruebe la tarjeta con altura inferior a 310 px. Hasta entonces, los reportes de históricos disjuntos requieren revisión y la preventa continúa bloqueada.

También quedan pendientes el registro de devolución física o digital verificable, la política de merma/stock perecedero, restauración aislada, simulaciones con dos negocios y roles, medición real de cuota y aceptación manual del propietario.
