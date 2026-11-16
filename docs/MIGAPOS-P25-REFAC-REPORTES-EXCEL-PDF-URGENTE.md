# MigaPOS P25 — Refactorización urgente de informes Excel y PDF

**Rama objetivo:** `fix/migapos-production-readiness`. **Base remota revisada:** `ecfd410a1f918656e1a9f5d07659cb9c8153fa31` (CI Success en GitHub Actions run 43780693881). **Fecha de planificación:** 15/11/2026, hora de Lima.

## 0. Propósito y decisión de producto

El propietario de una pastelería debe abrir el informe y responder de inmediato: **¿cuánto ingresó?, ¿cómo pagaron?, ¿qué se vendió?, ¿cuánto vino de pedidos?, ¿qué caja requiere revisión?** Un Excel vistoso pero incomprensible, un PDF que no se genera o cifras financieramente incorrectas NO cumplen el objetivo.

El usuario suministró capturas de un **diseño antiguo de referencia** (resumen de colores por secciones, tickets agrupados con totales, caja legible) y capturas del **Excel actual** (lista larga «Concepto / Valor», renglones de productos y movimientos mezclados) y del **error PDF** «El informe tardó demasiado · Etapa integrity». Las imágenes son referencia de UX, **no una base de datos auditable** ni prueba de que un período/sede tenga los mismos totales que otro. En concreto, el Excel actual de **sede secundaria** muestra **S/ 28.00 = S/ 17.00 POS + S/ 11.00 pedidos**, mientras el ejemplo antiguo de **todas las sedes** muestra **S/ 68.00**. No equiparar estos alcances.

**Entrega única de Codex:** reparar la generación PDF; rediseñar el XLSX completo desde la perspectiva del dueño; mantener invariantes financieros y buena velocidad; actualizar pruebas y generar muestras visuales reales. No redactar marketing, no cambiar POS/caja/Roles/Rules ni tocar catálogos.

## 1. Evidencia concreta en el código actual

- `frontend/src/features/reports/application/salesWorkbook.js`: `summaryRows` produce una lista de 25+ renglones «Concepto / Valor» con explicación y desgloses profundos en primera hoja. `append(...)` utiliza la misma función genérica `createSheet` para todas las vistas, sin composición de resumen visual. `Detalle_<sede>` usa filas mezcladas.
- `frontend/src/utils/salesDataProcessor.js`: `processSales` coloca `Importe movimiento` solo en la primera línea del ticket y filas `DETALLE TICKET` para los artículos. Un usuario puede confundir `Subtotal producto` con otro cobro; aunque existe una nota, obliga a leerla.
- `frontend/src/utils/excelHelpers.js`: `createSheet` unifica fondo, encabezado, alto, bordes, filtros y estilos para tablas de propósitos distintos. Los tonos ya existen (morado, celeste, verde, lavanda, amarillo, rojo), pero no están aplicados a una jerarquía clara entre secciones/tickets.
- `frontend/src/features/reports/hooks/useExportSales.js`: `REQUEST_TIMEOUT = 30000` cubre la carga de módulo, lecturas, controles, dos `requestAnimationFrame`, HTML/PDF/XLSX. El estado `integrity` engloba operaciones distintas. `waitForPaint()` puede retrasarse si la pestaña está oculta/limitada. `reportTTL` y `loadedAt` también pueden provocar caducidad durante el cálculo. No atribuir automáticamente el error a datos corruptos.
- `frontend/src/modules/ExportSales.jsx`: se muestra mensaje genérico y «Etapa integrity», sin la subetapa ni acción diferenciada; el usuario desconoce si falló la red, un ticket, el render o el tiempo.
- `frontend/src/features/reports/infrastructure/sessionReportReads.js`: para exportar se consultan ventas, cobros de pedidos, contratos, anulaciones y cajas, con límites y caché por alcance. No duplicar consultas para hacer un Excel más bonito.
- `frontend/src/features/reports/domain/reportTotals.js`: `aggregateReport`, `assertPosReportDetail`, `posAmounts`, `reconcilePosRows` mantienen conciliación, identidad, dinero y signos; **conservar su lógica**.
- `frontend/src/features/reports/application/managementReportHtml.js`: el PDF ya posee algunas tarjetas visuales, pero falla en la ruta de exportación reportada. Conservar seguridad HTML, sanitización y formato A4.
- `frontend/src/features/reports/application/reportResource.js`, `reportExportCache.js`, `excelModule.js`: TTL, cachés y carga diferida de Excel. Respetarlas y medir; no agregar consultas por estética.
- `tests/reports.test.mjs`, `tests/plan13.test.mjs`, `tests/plan14.test.mjs`, `tests/excel-export.browser.test.mjs`, `tests/excel-export.fixture.jsx` son contratos y regresiones relevantes.

## 2. Prioridades y flujo de implementación

### P0 — Reproducir y reparar el PDF antes de cualquier rediseño

1. Capturar una reproducción controlada del mismo alcance **semana, sede secundaria, PDF** usando datos de fixture equivalentes y, si es posible, una **prueba manual local con el usuario autorizado**. No extraer datos privados ni volcar tickets al log.
2. Introducir instrumentación **solo desarrollo/pruebas** por etapas y monotónica (`performance.now()`): carga de dependencias, lectura de cada fuente (número de documentos), `aggregateReport`, conciliación POS, `reportViewModel`, `prepareReportPrint`, entrega de preview. Identificar exactamente qué consume 30 s. No contar snapshots como lecturas facturables.
3. **Evitar esperar dos `requestAnimationFrame` como requisito funcional de integridad**. Usar concesión a event loop acotada o renders no bloqueantes solo cuando sean necesarios. Debe funcionar también con pestaña oculta o CPU lento.
4. No resolver únicamente elevando `REQUEST_TIMEOUT`. Separar timeout de red/carga de módulo de generación local; aplicar cancelación/invalidación por identidad y período, limpiar timers y conservar protección contra clic doble y cambio de sede.
5. Si una validación financiera falla, explicar en UI `«Hay movimientos de este período que requieren revisión; no se generó un informe parcial»` con código técnico seguro, sin datos personales. Si hay timeout, avisar `«No se pudo completar la consulta»` o `«No se pudo generar el documento»` según etapa real. Nunca mostrar `«Los movimientos no concilian»` para cualquier error ocurrido durante `integrity`.
6. Cuando la lectura ya está confirmada y en caché, PDF y Excel deben reutilizar el mismo snapshot autorizado durante su TTL; no iniciar otra lectura integral innecesaria al cambiar solo el formato. El auditoría adicional de pedidos para Excel solo si realmente se requiere.
7. Conservar `prepareReportPrint`, CSP/sanitización, A4, escape HTML y `reportReport...` de seguridad. No cargar `xlsx-js-style` cuando solo se prepara PDF.

### P0 — Rediseñar XLSX con enfoque gerencial y jerarquía clara

**Paleta obligatoria** (similar al ejemplo antiguo, profesional y legible): morado oscuro `#3E2C63` para encabezados; celeste suave `#DDF2FC` para secciones; verde menta `#DFF5E7` para ingresos y dinero confirmado; lila `#EEE6F9` para Yape/Plin; amarillo pálido `#FFF5CB` para advertencias/revisión; rojo pálido `#FCE8E8` para pérdidas/compensaciones; blanco/marfil para datos; texto `#261B3D`. Colores semánticos, sin bordes negros gruesos alrededor de cada celda. Respetar contraste y legibilidad al imprimir.

**Primera hoja (`Resumen_Financiero`, conservar nombre por compatibilidad):**
- Título **INFORME DE MI NEGOCIO**, período, sede(s) y hora de actualización Lima; separadores y aire visual.
- Cuatro cifras claramente diferenciadas en bloque superior: **Total neto registrado**, **Ventas mostrador**, **Pagos de pedidos**, **Tickets válidos**. Una línea de contexto: *«Ingresos registrados, no utilidad ni dinero físico en caja»*.
- Zona **¿Cómo ingresó el dinero?**: **Efectivo** y **Yape / Plin** en filas separadas, importes y etiqueta. Importes negativos claramente identificados; no ocultarlos.
- Zona **Movimientos que descuentan**: compensaciones POS y reembolsos contables. No atribuir desembolsos reales que no están verificados.
- Zona **Operación**: tickets válidos, anulados, pagos de pedidos; solo 3–4 KPIs.
- Zona **Atención / cajas**: «Sin incidencias» o hasta 3 indicadores de caja pendiente/vencida, con acceso a hoja `Auditoría_Cajas`; **sin inventar conteos**.
- Información técnica y notas extensas al final en un recuadro acotado o hoja auxiliar `Notas`, nunca desplazando los números importantes.
- Filas de separación entre bloques; NO situar el primer subtotal importante en la fila 20.

**Detalle de ventas:** no mezclar importes cobrados con subtotales de ítems.
- La hoja actual `Detalle_<sede>` debe pasar a presentar **una fila principal por movimiento**, con fecha, hora, código/ticket amigable, tipo, medio de pago, importe confirmado (una vez), cajero y estado; color de tipo y bandas suaves alternadas por movimiento.
- Si la salida requiere desglose de ítems, **crear hoja `Productos_por_Ticket`** con número de ticket, artículo, cantidad, precio unitario y subtotal **informativo**. Agrupar por ticket con un borde inferior o una fila de separación visual que no rompa filtros; no repetir importes financieros como si fuesen ingresos nuevos.
- Pedidos: pagos y adelantos como movimientos distintos con referencia a pedido, método, importe y responsable. Productos de pedido no deben aparecer como ventas POS sin evidencia. Mostrar reembolsos negativos.
- Tabla filtrable de movimientos y otra filtrable de productos; congelar encabezados; importes a la derecha; fechas reales de Excel, no cadenas desordenadas; ancho acotado, texto ajustado, `S/ #,##0.00`; no columnas vacías gigantes.
- El total del ticket debe ser fácil de identificar, parecido al diseño antiguo con banda verde; si hay una fila total por grupo, **no incluirla en un rango filtrable ni sumarla como movimiento adicional**.

**Mantener/refinar las hojas existentes cuando tengan datos:**
- `Estado_Pedidos`: cliente, pedido, estado, total comercial de referencia, abonado y saldo; subtítulos claros.
- `Auditoría_Pedidos`: operaciones de abono/adelanto/reembolso, suma solo por operación; no contar dos veces.
- `Auditoría_Cajas`: apertura, cierre o vencimiento, sede, responsable, fondo, referencia calculada, efectivo declarado (o «No declarado»), diferencia (o «No calculable»), estado y observación. **Fondo no es ingreso**. Destacar lo pendiente de arqueo.
- `Comparativa_Sedes`: ingresos netos y volúmenes por sede solo para vista global.
- `Productos_Global`/`Productos_Sedes`: mejores productos por unidades e importe neto, claros y no exagerar cifras.
- No crear hojas vacías, no duplicar hojas por sede innecesariamente, no poner más de 2–3 niveles jerárquicos. Preferir nombres y etiquetas que entendería un dueño; si se cambia nombre de hoja existente, actualizar todas las pruebas que lo referencian y documentar el cambio.

**Compatibilidad del XLSX:** conservar biblioteca `xlsx-js-style`, seguridad contra fórmulas que empiezan por `= + - @`, filtro/freeze de encabezados, esquema de tipos numéricos y seriales Lima; `writeSalesWorkbook()` y validación de ZIP; NO añadir librerías ni construir XLSX mediante HTML exportado.

### P1 — PDF ejecutivo: 1–2 páginas A4 útiles y fiable

- Portada compacta con nombre de negocio, sede, período, y fecha/hora de consulta.
- Bloque superior de total neto + POS + Pedidos + efectivo/digital; tipografía generosa y colores semánticos.
- Gráfico sencillo por canal o por día solo cuando aporte valor, **no sustituir números por gráficos**.
- Top productos y alertas de caja: los puntos que realmente requieren acción.
- Para operaciones sin actividad: vista «Sin movimientos confirmados» sin módulos vacíos.
- Información prudente sobre ventas anuladas, conciliación pendiente y reporte no equivalente a arqueo/utilidad, con letras legibles, sin notas kilométricas.
- Evitar página aislada con una única fila; cabeceras que no se separen de su sección; `print-color-adjust` y colores legibles en impresoras monocromas.
- Sin descarga ni generador PDF externo: conservar vista previa HTML segura y «Imprimir / Guardar como PDF» del navegador.

### P1 — UI del exportador

- En `ExportSales.jsx`, cambiar copy a dos caminos claros: **«Ver resumen PDF»** y **«Descargar Excel»**; texto breve para periodo/alcance.
- Mensajes de progreso concretos y etapa diferenciada; mostrar estado de datos verificados y última lectura sin términos técnicos en el mensaje normal.
- Si falla, ofrecer **Reintentar** y explicar acción posible sin exponer datos privados. Para diagnóstico técnico, `details` accesible opcional.
- No forzar una pantalla completa ocupada por error. Control de doble clic, accesibilidad y responsive.

## 3. Invariantes no negociables

1. Nunca modificar `firestore.rules`, `firestore.indexes.json`, licencias, caja, POS, contratos, usuarios ni lógica de suscripciones para solucionar estilo.
2. Respetar monto en céntimos y signo: `netRevenue = posRevenue + contractRevenue`; y `cashRevenue + digitalRevenue = netRevenue` cuando corresponde. `Cobros registrados + ajustes contables` = neto según dominio. No interpretar neto como utilidad.
3. Contabilizar cada ticket/abono/compensación **una sola vez**. Detalle de artículo y fondo inicial no se suman al neto.
4. Diferenciar `0` de `No declarado`, `No calculable`, `Sin verificar`; no sustituir datos ausentes con cero.
5. No convertir una venta `voided` histórica sin comprobante vinculado en una compensación confirmada; conservar advertencia de conciliación o bloquear resumen definitivo cuando lo exija el dominio. No eliminar `assertPosReportDetail`, `reconcilePosRows`, controles de autoridad ni pruebas para acelerar.
6. Cifrado, tenant/branch scoping, identidades, fechas Lima y permisos intactos. No telemetría externa, ni contenido de pagos o clientes en logs.
7. No ampliar lecturas Firestore por estética. Conservar `sessionReportReads`, `SessionResources`, deduplicación, TTL, límites `10000`/`500` y cancelación. Si mejora el PDF vía snapshot resumido, demostrar coherencia matemática y fechas, sin alterar autorización.

## 4. Casos de prueba / aprobación obligatoria

**Datos:** usar fixture pequeño de referencia (ejemplo visual, no producción) con 3 tickets POS S/36, S/29 y S/3 = S/68; Efectivo S/39, Yape S/29; otra sede S/17 POS + S/11 anticipo = S/28; alcance y días distintos NO se comparan indebidamente. Añadir: ticket de múltiples artículos, un ticket mixto, compensación POS, pago de pedido, reembolso, caja vencida sin arqueo, movimiento negativo, sin actividad, dos sedes, IDs/nombres largos, nombre de producto con `=1+1`, ticket histórico inconsistente.

**Pruebas de exportación:**
- PDF con semana/sede secundaria y pocos movimientos: preview renderizada sin `report-timeout`, incluso cuando la pestaña se oculta temporalmente. Verificar `main`, KPIs y tabla. No atribuir una mejora sin reproducir el fallo.
- PDF de período con 0, 1, 6 y >6 incidencias de caja: A4 legible y sin página huérfana.
- Excel real descargado e **importado de nuevo**: totales concilian con Dashboard/PDF, fecha Excel, moneda Excel, congelación, filtros, colores de celdas, las hojas esperadas, datos íntegros. Revisar ZIP Excel válido.
- Test perceptivo: **abrir el XLSX en Excel/LibreOffice/visor compatible y generar capturas reales** de `Resumen_Financiero`, movimientos, productos y caja; no basta inspeccionar el JSON de celdas. Comparar con capturas de referencia del usuario; sin celdas truncadas, alturas excesivas, casi todo blanco o bloques de jerga.
- Al cambiar sede/período a mitad de exportación no se descarga ningún archivo de alcance anterior; un doble clic no duplica lecturas; cambio de formato con snapshot vigente no relee las cuatro colecciones completas.
- Verificar escenarios límites (muchos tickets y archivos móviles), medir tiempos por fase con red simulada y caché caliente/fría. No aumentar umbrales sin demostrar causa; si se exceden 10k, error explícito sin PDF parcial.
- Contra datos inconsistentes, nunca producir una cifra falsa para que pase la prueba.

**Comandos mínimos sugeridos (ajustar a los nombres de la rama):**
```bash
node --test tests/reports.test.mjs tests/plan13.test.mjs tests/plan14.test.mjs
node --test tests/excel-export.browser.test.mjs
node --test tests/plan14-read-cost.test.mjs
npm run lint --prefix frontend
npm run release:build -- --env production
npm run check:build
git diff --check
```
Revisar el resto de regresiones financieras/PWA exigidas por CI, sin ejecutar pruebas completas repetidas si los cambios no lo requieren. CI del commit final es el criterio de salida.

## 5. Archivos objetivo

**Editar preferentemente:**
- `frontend/src/features/reports/hooks/useExportSales.js` — diagnóstico, timing, reutilización, cancelación, timeout, preview.
- `frontend/src/modules/ExportSales.jsx` — mensajes UX.
- `frontend/src/features/reports/application/salesWorkbook.js` — estructura y presentación workbook.
- `frontend/src/utils/excelHelpers.js` — estilos reutilizables por tipo de hoja y formato.
- `frontend/src/utils/salesDataProcessor.js` — separar *movimiento financiero* del *desglose de productos* (sin tocar los importes).
- `frontend/src/features/reports/application/managementReportHtml.js` — composición visual PDF, A4.
- `frontend/src/features/reports/application/reportViewModel.js` — solo proyecciones de presentación puras imprescindibles.
- `tests/reports.test.mjs`, `tests/plan13.test.mjs`, `tests/plan14.test.mjs`, `tests/excel-export.browser.test.mjs`, `tests/excel-export.fixture.jsx` — pruebas contractuales, visuales y timeout.

**Solo leer/modificar si demuestra una causa:**
- `frontend/src/features/reports/infrastructure/sessionReportReads.js`
- `frontend/src/features/reports/application/reportResource.js`
- `frontend/src/features/reports/application/reportExportCache.js`
- `frontend/src/features/reports/application/excelModule.js`
- `frontend/src/features/reports/domain/reportTotals.js`
- `frontend/src/shared/printing/printDocument.js`
- `frontend/src/modules/Reports.jsx`

**No tocar:** `firestore.rules`, `firestore.indexes.json`, PWA, notificaciones, caja, POS, Auth, documentos legales, manifiestos o imágenes comerciales.

## 6. Criterio de salida y despliegue

- P0: PDF semanal funciona en Chromium y en el dispositivo real del usuario, error clasificado si hay datos inconsistentes; tiempos por etapa documentados.
- P0: XLSX con resumen intuitivo y detalle que NO confunde filas de producto con movimientos; colores y tipografía comprobados visualmente en el archivo real, no solo dentro del código.
- P1: PDF una o dos páginas legibles y Excel reimportado con conciliación exacta; tests y lint sin regresiones, `check:build` en verde.
- No hacer commit, push ni deploy desde Codex salvo autorización posterior; entregar capturas/muestras en `.release/qa-p25/` ignorada por Git, sin datos privados.
- Luego: nueva ejecución GitHub Actions **Success** del SHA exacto, desplegar **solo Hosting**. No redeploy Rules ni índices por cambios visuales.

**Respuesta de Codex:** máximo 12 líneas; 1 línea causa real de «Etapa integrity» con evidencia, 1 de arquitectura Excel, pruebas PASS/FAIL, archivos modificados y pendientes. No copiar logs extensos.

## Resultado local P25

- La reproducción de referencia en Chromium completó las cuatro llamadas simuladas del exportador y registró una espera en `waitForPaint()`. Al suspender los fotogramas, venció el temporizador y apareció «El informe tardó demasiado · Etapa integrity». La prueba aceleró solo el temporizador del fallo. La preparación del documento ya funciona con esa suspensión y distingue consulta, validación, generación y entrega.
- PDF y Excel reutilizan la misma lectura autorizada vigente. La prueba semanal simula 40 ms de latencia por fuente y cuenta cinco llamadas al iniciar, incluida la lectura de pedidos creados. Reabrir el PDF y preparar Excel con un pedido conocido añaden cero llamadas. El escenario de un pedido histórico faltante consulta solo esa referencia. Los tiempos y filas observadas se guardan en `.release/qa-p25/tiempos-semanal.json`.
- `Resumen_Financiero` destaca el neto, mostrador, pedidos, tickets, canales y cajas. `Detalle_<sede>` registra una fila financiera por operación. `Productos_por_Ticket` agrupa artículos sin importes de cobro. Las hojas auxiliares conservan referencias comerciales, saldos, reembolsos con signo y arqueos pendientes. La auditoría de cajas también aparece en períodos resumidos cuando hay datos.
- Las muestras sintéticas se guardaron en `.release/qa-p25/`. Taller semanal concilia S/28.00, con S/17.00 de mostrador y S/11.00 en pedidos. La muestra diaria global concilia S/68.00, con S/39.00 en efectivo y S/29.00 por Yape. Excel 16 abrió el XLSX y renderizó resumen, movimientos, productos y caja. Chromium generó los PDF reales y se inspeccionaron las páginas A4 con Poppler.
- La vista previa de Taller tardó 204 ms en frío y 57 ms desde caché. Lectura 101 ms, agregación y validación POS 8.5 ms, proyección 3.2 ms, HTML y sanitización 7.9 ms. Con la misma lectura, Excel tardó 279 ms en cargar su módulo, 17 ms en componer el libro y 75 ms en serializarlo. Los números corresponden a la simulación local con latencia inyectada.
- PASS en 104 pruebas Node, seis Chromium y 86 Spark Rules en `demo-migapos`, lint, build de producción, `check:build` y `git diff --check`. El PDF mantuvo una página con 0, 1, 6 y 8 incidencias y dos en el caso denso. La hoja de auditoría conservó las ocho incidencias. Excel 16 confirmó filtros nativos, encabezados congelados y texto parecido a fórmula sin ejecución. La prueba de volumen reimportó 10 000 artículos de 1 250 tickets en un archivo de 778 188 bytes.
- Los cambios se limitan al exportador y su interfaz, las proyecciones y estilos de Excel, el HTML gerencial, el formateador horario de Reportes y sus regresiones. Quedan pendientes la aceptación en el dispositivo del propietario y CI del SHA que se publique.
