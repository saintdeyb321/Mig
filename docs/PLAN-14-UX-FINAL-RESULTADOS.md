# MigaPOS · Plan 14 UX final

## Impresión y panel

El código anterior preparaba un iframe oculto y mantenía el diálogo ocupado hasta recibir `afterprint` o agotar 60 segundos. En Chromium, la regresión con el retorno de `print()` sin ese evento dejó deshabilitado el botón durante toda la comprobación. La prueba anterior enviaba el evento sintéticamente y omitía este caso. La reproducción está en `.release/qa-plan14-ux/print-before.log`. Falta una captura del navegador del propietario para atribuir con certeza su caso a la misma secuencia.

El informe ahora prepara un único documento aislado y lo imprime desde la vista previa cargada, directamente con el clic del operador. El botón se recupera cuando retorna la llamada, incluso si falta `afterprint`. Un fallo mantiene la vista previa disponible para reintentar. El iframe vive hasta cerrar la vista. Si caducan los datos, se bloquea una nueva impresión sin retirar el documento que pudiera estar utilizando un trabajo nativo. El mensaje indica que se solicitó la impresión. El cuadro nativo permite elegir **Guardar como PDF** y desactivar los encabezados y pies del navegador. El ciclo de impresión de tickets conserva su implementación. [Comportamiento de window.print()](https://developer.mozilla.org/en-US/docs/Web/API/Window/print) · [Impresión CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Printing)

El panel **Informes del negocio** está en el historial. Tiene un período, un formato con PDF como opción inicial y una acción principal centrada. Montar el panel, alternar los controles y desplegar detalles hacen cero lecturas. Preparar el primer informe es una acción explícita. La vista previa, su cierre, la reimpresión y la reapertura de un informe preparado tampoco añaden consultas.

## Datos, nombres y documentos

El agregado financiero existente alimenta Dashboard, PDF y Excel. La caché de los informes se limita a cuatro períodos en el panel y usa memoria de sesión por cuenta, negocio, sede, rango y revisión. El vencimiento se mide desde la fuente más antigua del conjunto, con 2 minutos para día y semana y 15 minutos para mes y año. Las operaciones confirmadas usan la invalidación existente, que ahora también retira los artefactos de ese negocio. Los cambios de alcance descartan los resultados en tránsito. Las llamadas ya enviadas por el lector compartido pueden terminar dentro de su tope.

Se reutilizan el HTML preparado y el mismo Blob XLSX. Cada solicitud de descarga tiene una URL temporal que se revoca. PDF usa la evidencia base sin buscar fichas históricas adicionales. Excel las pide solo para los pedidos ausentes del conjunto base y conserva el límite de 500 referencias. Un fallo de impresión o de descarga permite reintentar con el artefacto válido. Una lectura incompleta o inconsistente impide una salida definitiva. El caso histórico reconocido conserva el aviso de neto provisional y el artefacto provisional queda fuera de la caché de éxitos.

Se usan los nombres guardados con el movimiento o los perfiles del negocio ya cargados con confirmación del servidor. La falta de nombre se muestra como «Empleado no identificado». No se añaden lecturas de personal. Los documentos visibles omiten UIDs, IDs de movimiento y documentos de pedido. Una referencia comercial ausente se indica como tal. Los identificadores siguen disponibles para las comprobaciones y vínculos internos del dominio.

El PDF A4 combina cuatro indicadores, barras con signo, canales, sedes, productos, pedidos y alertas según el contenido. La hoja de detalle Excel incluye título y período de Lima, fecha numérica de calendario sin conversión de zona horaria, autofiltro y dos filas inmovilizadas. La biblioteca instalada ignoraba `!freeze`. La salida usa su API ZIP existente para aplicar la inmovilización exclusivamente a la vista de las hojas de detalle. Los números negativos y los importes en soles siguen siendo numéricos y el texto de negocio sigue siendo texto de Excel.

### Evidencia financiera

| Escenario aislado | Neto | Efectivo | Yape/Plin | Páginas A4 |
| --- | ---: | ---: | ---: | ---: |
| Una sede · hoy | S/ 85.00 | S/ 28.00 | S/ 57.00 | 1 |
| Dos sedes · semana | S/ 67.00 | S/ 40.00 | S/ 27.00 | 1 |
| Vacío confirmado | S/ 0.00 | S/ 0.00 | S/ 0.00 | 1 |
| Compensación digital de otro período | S/ -30.00 | S/ 0.00 | S/ -30.00 | 1 |
| 108 tickets, seis sedes y nombres largos | S/ 1,080.00 | S/ 1,080.00 | S/ 0.00 | 2 |

El caso mixto de precisión coteja el agregado, el PDF y el XLSX reimportado en céntimos. Neto 1005, efectivo 1 y Yape/Plin 1004. Las pruebas también comprueban filtros hoy, semana, mes y año, celdas de texto sin fórmula, nombres conocidos y ausentes, y vencimiento sin efectivo declarado.

El árbol de hojas conserva `Resumen_Financiero`, `Auditoría_Pedidos`, `Auditoría_Cajas` en detalle cuando aplica, `Estado_Pedidos` si hay pedidos creados, `Comparativa_Sedes`, `Productos_Global`, `Productos_Sedes` y `Detalle_<sede>` o `Resum_<sede>`. Un año vacío confirmado contiene solo el resumen. Los artefactos sintéticos están en `.release/qa-plan14-ux/` para PDF y `.release/qa-excel-ux/` para XLSX.

## Lecturas y escala Spark

En la prueba de navegador, el primer clic PDF hizo cuatro lecturas simuladas de fuente. Tres envíos consecutivos del formulario usaron ese mismo conjunto. Cerrar, reabrir, reimprimir y cambiar formato sumaron cero. Generar Excel a continuación añadió una única consulta de referencia histórica y reutilizó las cuatro fuentes previas. En el diseño P14 anterior esa consulta adicional se iniciaba también para PDF. Volver a solicitar el XLSX listo reutilizó el mismo Blob.

El benchmark usa los lectores paginados con un SDK simulado y 20 negocios independientes, cada uno con dos sedes y 100 ventas por sede al día. Las filas de caja representan un turno cerrado por sede y día. La carga no incluye abonos, compensaciones ni búsquedas adicionales de fichas. Los documentos recibidos incluyen el doble recorrido de ventas Spark por las consultas de compatibilidad de fechas. Las solicitudes y bytes se cuentan en el cliente de prueba, separados de la facturación real.

| Período de dos sedes | Tickets únicos por negocio | Solicitudes frías | Documentos recibidos | Bytes JSON | Solicitudes con caché | ms locales frío / caché |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hoy | 200 | 280 | 8.080 | 3.382.328 | 0 | 171 / 1,21 |
| Semana | 1.400 | 520 | 56.560 | 23.676.296 | 0 | 815 / 1,55 |
| Mes de 30 días | 6.000 | 1.440 | 242.400 | 101.469.840 | 0 | 4.453 / 1,18 |
| Año | 73.000 | 1.020 | 200.020 | 83.438.333 | 0 | 3.800 / 0,94 |

El contador del recurso registró 180 reutilizaciones por escenario de día, semana y mes y 20 para el rechazo anual. Los tiempos acumulan la ejecución del lector simulado y no representan latencia de red.

En el año, la ejecución se detiene al leer el ticket 10.001 de cada negocio y comparte temporalmente el rechazo. No se emite un total parcial. La semana y el mes en frío superan los 50.000 documentos por día de la cuota gratuita de la base. A la facturación pueden añadirse lecturas mínimas de consultas vacías, documentos evaluados por Rules e índices. El piloto de 20 negocios requiere medir esas partidas y el uso concurrente real. Un resumen diario verificable, con trazabilidad de compensaciones, sigue siendo un cambio independiente. [Cuotas Firestore](https://firebase.google.com/docs/firestore/quotas) · [Facturación de lecturas](https://firebase.google.com/docs/firestore/pricing)

## Verificación y pendientes

| Control | Estado |
| --- | --- |
| Regresiones de exportación, conciliación y métricas Node | **PASS 93/93**, `node-final.log`. |
| Chromium dev, preview/PWA y PDF | **PASS 3/3**, `export-final.log`. Incluye dos reintentos de importación, rechazos de lectura, cancelación del resultado al cambiar el alcance, retorno sin `afterprint` y cinco PDF A4 inspeccionados. |
| Chromium de comprobantes, caja, P09 y P10-06 | **PASS**. Conservan los controles de CSP, precisión monetaria, teclado y diseño en el build local. |
| Suite Chromium P10 histórica, fuera del workflow actual | **FAIL** en la aserción de arqueo «keyboard reveals detail without inventing expenses». Busca el literal «no registrados no forman parte». El módulo de caja usa «no registrados quedan fuera de esta referencia». El ensayo se detuvo antes de la sección de exportación. El flujo de exportación sí pasó en su suite Chromium dedicada. |
| Spark local | **PASS 77/77**, `spark.log`. |
| Lint y build/PWA | **PASS**. Precache de 45 archivos únicos, 2,89 MiB. Excel conserva su carga diferida. Vite mantiene el aviso de chunks superiores a 500 kB. |
| Conciliación histórica de períodos separados P13-04 | **FAIL** conocido. El ticket histórico de S/30 y su compensación en otro día requieren la evidencia pendiente. La UX conserva el aviso. |
| Rules y recuperación de caja en `demo-migapos` | **BLOCKED** sin Java en el entorno actual. |
| Workflow Linux | **MANUAL**. La regresión quedó en `.github/workflows/verify.yml` para la próxima ejecución del propietario. |
| Diálogo nativo y dispositivo del propietario | **MANUAL**. Chromium aislado verificó el retorno sin evento y generó PDFs con CDP. La selección de destino, guardado del sistema y aceptación visual final quedan en el dispositivo del propietario. |

Archivos principales: `ExportSales.jsx`, `useExportSales.js`, `printDocument.js`, `sessionReportReads.js`, `reportResource.js`, `reportExportCache.js`, `reportViewModel.js`, `reportNames.js`, `managementReportHtml.js`, `salesWorkbook.js`, `cashAuditRows.js`, `contractLedgerReport.js`, `salesDataProcessor.js` y `excelHelpers.js`. Las pruebas de exportación y el inventario cerrado de Markdown se actualizaron por rutas exactas.

El piloto sigue condicionado a Rules, conciliación histórica y aceptación del propietario. Todos los cambios y comprobaciones se realizaron en local con datos de ensayo.
