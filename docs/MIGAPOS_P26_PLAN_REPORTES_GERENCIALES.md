# MigaPOS · P26 — Reportes gerenciales legibles, precisos y auditables

**Fecha del diagnóstico:** 16/11/2026  
**Repositorio:** `saintdeyb321/Mig`  
**Rama objetivo:** `fix/migapos-production-readiness`  
**HEAD remoto observado:** `07e56ccf9c2bd18fd7674d1c55e5f4b52a105a96` — `aplicacion de bordes de celdas`.  
**Referencia visual y de organización:** `Reporte_Semanal_Detallado_2026-11-09 (2).xlsx` (reporte antiguo Kcprichitos). El archivo de referencia es EXCLUSIVAMENTE inspiración para estructura/estilos; no es fuente de verdad contable ni se debe copiar su lógica a ciegas.

## 1. Diagnóstico verificado

### 1.1 Referencia antigua: inspección de siete hojas

| Hoja antigua | Rango con contenido | Estructura y rasgo aprovechable |
|---|---|---|
| `Resumen_Financiero` | A1:B21 | Dos columnas; conceptos a la izquierda y cifras a la derecha; metadatos A1:B4; filas en blanco 5, 7, 11, 15, 18 y 21; ingresos/mostrador/pedidos/caja/tickets diferenciados; A ~55.83 y B ~25.83 unidades de ancho XLSX. |
| `Auditoría_Cajas` | A1:I6 | Nueve columnas; encabezados coloreados; sede, cajero, turnos, contado, diferencia, estado y justificación; fila 3 separadora. Anchura I ~45.83 para justificaciones. |
| `Comparativa_Sedes` | A1:E3 | Cinco columnas: sucursal, tickets, ventas sistema, diferencia y supuesto ingreso real; advertencia: la métrica histórica suma sobrantes a ventas y NO debe reutilizarse. |
| `Productos_Global` | A1:C6 | Producto, cantidad, ingreso, títulos legibles y ancho de producto ~35.83. |
| `Productos_Sedes` | A1:D10 | Dos grupos de sucursal con fila vacía 6; primera columna producto ~35.83; bloques fáciles de rastrear. |
| `Detalle_sede concepcion` | A1:J13 | Tres tickets: la primera fila identifica ticket y datos generales; filas posteriores muestran sólo productos; fila de total por ticket; fila vacía entre tickets. |
| `Detalle_Taller` | A1:J27 | Seis tickets, algunos pagos mixtos con importes separados; patrón repetido de bloques de ticket, total y separador. |

**Comprobación numérica puntual del ejemplo:** 9 tickets completados, S/ 225 de ventas de mostrador, S/ 134 en efectivo y S/ 91 por Yape/Plin; 6 tickets en Taller (S/ 157) y 3 en Concepción (S/ 68). Sobrante observado: S/ 10. El antiguo `Comparativa_Sedes` muestra S/ 167 para Taller al incorporar ese sobrante, y S/ 235 entre sedes. **No reproducir esa suma como ingreso por ventas**: sobrante de caja no demuestra una venta.

**Detalles de formato inspeccionados a nivel XLSX:** 41 registros de estilo, 37 rellenos, 40 registros de borde; la inmensa mayoría de las celdas de tabla con datos usa cuatro bordes `thin` oscuros; las columnas tienen anchuras explícitas según uso (detalle: A 15.83, B 10.83, C 18.83, D 14.83, E 15.83, F 35.83, G-I 15.83, J 35.83). Los separadores están formados por filas sin celdas de datos. El archivo no establece alturas de fila explícitas ni presenta combinaciones de celdas. **No copiar automáticamente anchos enormes, colores fuertes, fechas como texto ni ausencia de cabeceras contextuales.**

### 1.2 Estado del sistema moderno en el HEAD remoto

- `frontend/src/features/reports/application/salesWorkbook.js`: crea `Resumen_Financiero`, `Auditoría_Cajas`, `Comparativa_Sedes`, `Productos_Global`, `Productos_Sedes`, detalle diario/semanal por sede, `Estado_Pedidos` y `Auditoría_Pedidos` cuando corresponde. Usa `processSales` / `processDailyStats`, `reportViewModel`, `cashAuditRows`, `buildContractLedgerReport`, `groupedTicketRows`; protección contra límite `MAX_EXPORT_ROWS = 10000`.
- `frontend/src/utils/excelHelpers.js`: centraliza estilos y funciones `createOverviewSheet`, `createSheet`, anchos, rellenos y bordes; usa `xlsx-js-style`. Tiene `grid` `#8E8596`, `headerGrid` `#6C5B80`, `spacerGrid` `#C8C2D0`, cabeceras morado `#3E2C63`, tonos suaves por semántica. Crea celdas vacías del rectángulo usado, estilos de merges, ajuste de altura y rangos de filtro/congelación.
- `writeSalesWorkbook` serializa XLSX y modifica XML de cada hoja para persistir encabezado congelado y `showGridLines="1"`.
- **Último commit `07e56cc`:** activa cuadrícula por defecto (`showGridLines=1`), oscurece bordes reales y actualiza `tests/helpers/reportWorkbook.mjs` para exigir el valor nuevo. **Preservar ambas cosas: cuadrícula fuera de las tablas y bordes reales completos dentro del rango lógico de cada hoja.**
- `frontend/src/features/reports/application/managementReportHtml.js` genera informe gerencial para impresión/PDF HTML: resumen financiero, canales, comparación de sedes, productos, pedidos e incidencias de caja. Diseño existente compacto, preparado para A4; debe permanecer semánticamente consistente con XLSX.
- `frontend/src/features/reports/hooks/useExportSales.js` gestiona obtención de datos, integridad, tiempos de espera, exportación y descargas; no aumentar lecturas remotas innecesariamente ni introducir operaciones costosas.
- Existen especificaciones previas P25-V2/P25-V3 y tests `tests/reports.test.mjs`, `tests/excel-export.browser.test.mjs`, `tests/helpers/reportWorkbook.mjs`. P26 amplía experiencia gerencial sin deshacer garantías previas.

### 1.3 Problemas por evitar

1. Confundir fondo inicial, sobrante, faltante, efectivo declarado, neto contable, venta de mostrador y pago de pedido.
2. Volver a eliminar cuadrícula de Excel o un lado de borde en una celda, incluidas vacías y combinadas en el área utilizada.
3. Anchos fijos que truncan encabezados/observaciones o desbordan pantallas y la impresión.
4. Filtros sobre tickets agrupados que separen artículos del total de un ticket.
5. Grupos de tickets sin total evidente, o metadatos idénticos repetidos inútilmente en cada artículo.
6. Resúmenes voluminosos con avisos técnicos visibles antes de los KPIs principales.
7. Agregar gráficos/totales inventados, cambiar reglas financieras o duplicar pagos al sumar productos y movimientos.

## 2. Diseño objetivo: primero decisiones, luego auditoría

### 2.1 Principios

- El dueño debe identificar en menos de 15 segundos: **cuánto cobró neto el negocio, cómo se distribuyeron los cobros, qué vendió más, qué sede aportó más, si hay diferencias de caja y qué pedidos requieren seguimiento**.
- Mostrar primero cifras verificadas del período y sede seleccionados; abajo detalles y conciliación. Visibilizar advertencias sin mezclar datos provisionales con confirmados.
- La palabra **ingreso neto registrado** refiere a cobros menos ajustes contables según los contratos actuales del dominio; **NO** llamarlo ganancia/utilidad, flujo de caja físico o dinero existente en caja.
- Diseño morado galaxia MigaPOS reservado para cabeceras, superficies pastel para datos y alertas; no pintar cada celda con color intenso.
- Usar los nombres de métricas ya probados. Si se renombra una etiqueta pública, actualizar lectores/exportaciones/tests correspondientes sin tocar el modelo financiero.

### 2.2 Contrato visual obligatorio XLSX

| Elemento | Diseño P26 |
|---|---|
| Vista de Excel | `showGridLines="1"` en todas las hojas; el resto de la cuadrícula de Excel sigue natural. |
| Tablas | Cuatro bordes `thin` visibles por celda del rectángulo lógico de la tabla, incluso vacías; no aplicar estilos a millones de celdas fuera del rango. |
| Títulos y encabezados | Morado `#3E2C63`, texto blanco, negrita; encabezado 30–34 pt; título 30–36 pt, contexto y fecha separados. |
| Datos | Alternancia blanco/marfil muy suave, bordes gris medio; color sólo en celdas con relevancia semántica. |
| Venta cobrada/total | Verde pastel `#C7F2D6` y cifra oscura. |
| Yape/Plin | Lila pastel `#E9DEF8`. |
| Mixto o identificación | Celeste pastel `#CDEBFA` / `#BDE7F5`. |
| Producto | Amarillo crema `#FFF5C2`, sin colorear filas enteras innecesariamente. |
| Revisión/caja pendiente | Ámbar claro `#FFF0BF`. |
| Faltante confirmado | Rojo pastel `#FBDADA`; cero, faltante y dato desconocido visualmente diferentes. |
| Anulado/ajuste | Gris tenue o rojo cuando corresponda; nunca desaparecer de auditoría. |
| Filas separadoras | Una fila por bloque, ~8–10 pt, blanca y con bordes discretos dentro del área lógica; fuera de ella no pintar blanco para tapar cuadrícula. |
| Columnas | Definir por significado: fecha ~12–15; hora ~9–11; ticket ~14–20; estado ~15–23; medio pago ~17–27; producto ~30–36; observaciones ~32–44; importe ~14–20. Ajustar después de probar títulos reales, no usar `autofit` sin límites. |
| Filas | Datos 22–26 pt; `wrapText` para títulos/observaciones; alturas calculadas sin clipping ni filas de cientos de puntos; texto alineado verticalmente. |
| Números | Moneda como número Excel S/ 0.00; cantidades enteras; números alineados derecha; fecha/hora interpretables según zona Lima y contratos actuales. |
| Encabezados fijos/filtros | Congelar encabezados de listas planas; filtros sólo en hojas tabulares seguras, jamás en detalle de tickets agrupados. |
| Combinaciones | Sólo para notas/títulos con propósito, sin divisiones internas y con contorno completo. |
| Imprimir | Área de impresión y repetición de cabeceras sólo si la librería permite exportarlas de forma verificable; no degradar XLSX por una función no compatible. |

**Decisión clave:** no cambiar `showGridLines` a 0 aunque el antiguo se vea bien: fue el motivo de la regresión anterior y la cuadrícula global visible es un requisito explícito de MigaPOS.

### 2.3 Organización de hojas

1. **`Resumen_Financiero`:** negocio, sede, fecha y periodo; total neto registrado; desglose mostrador, pedidos, efectivo/Yape/Plin, tickets y anulaciones; abajo sección separada de caja con incidentes, faltantes y sobrantes **confirmados**; nota breve de qué NO entra en ventas. No mezclar dinero contado con ventas. No introducir balances sin fuente.
2. **`Auditoría_Cajas`:** fecha, sede, responsable, turno, fondo, esperado, contado (o no declarado), diferencia confirmada/provisional, estado, motivo. Resaltar sólo incidencias que requieren revisión. Mantener turnos abiertos/vencidos sin declarar como estados, no como `S/ 0`.
3. **`Comparativa_Sedes`:** nombre, tickets, ventas POS netas, pagos de pedidos netos, neto registrado; diferencias de caja en columna separada, no agregarlas a ventas. Total general verificable sin doble conteo; ordenar por total cuando ayude y establecer desempate estable.
4. **`Productos_Global`:** unidades vendidas y valor neto por producto, ordenado por cantidad (actual), fácil de leer. Top de productos si el resumen lo admite sin perder detalle completo; no crear ventas por producto de pedidos a falta de datos/contrato.
5. **`Productos_Sedes`:** agrupación por sede y separador real; nombre de sede evidente en cabecera de bloque o primera fila; subtotal por sede **sólo si está sustentado y sin duplicar un total global**. Para 1 sede, no forzar hoja comparativa vacía.
6. **`Detalle_<sede>`:** bloque de ticket: primera fila con fecha, hora, referencia, estado y pago; siguientes filas sólo productos; `TOTAL TICKET` claramente visible; una fila separadora; montos por movimiento y subtotales de producto nunca sumados como si fueran dos ingresos. Anulados y pagos mixtos exactos; preservación del texto literal al exportar.
7. **`Estado_Pedidos`:** visibilidad de saldo, pagado, estado y sede; órdenes pendientes y con saldo destacadas sin afirmar que son ingresos nuevos.
8. **`Auditoría_Pedidos`:** pagos/abonos/adelantos/ajustes con responsable y sede de movimiento; conservar trazabilidad de contrapartidas y advertencias de reembolso contable.
9. **HTML/PDF gerencial:** armonizar copy/semántica/colores con XLSX, sin intentar reproducir el libro entero en A4. Priorizar 1–2 páginas legibles cuando los datos lo permitan, cortes de página controlados, sin recorte de tablas ni cards; conservar el detalle íntegro en XLSX.

## 3. Implementación recomendada para Codex

**Fase 0 — Baseline y alcance:** `git status --short`, `git branch --show-current`, `git log -1 --oneline`; trabajar desde el HEAD local real, sin borrar trabajo no confirmado. Revisar P25-V2/V3 y tests actuales. Crear rama específica opcional `refactor/reportes-gerenciales-p26` sólo si no interfiere con trabajo local; **no push/merge/deploy**.

**Fase 1 — Contratos semánticos:** enumerar métricas de `reportTotals.js`, `reportViewModel.js`, `salesDataProcessor.js` y ver qué representa exactamente cada número. Producir tabla de reconciliación entre resumen, sedes, movimientos y caja. Evitar cambiar cálculos si el objetivo es UX; si se detecta bug financiero, documentarlo y corregir con prueba dirigida y evidencia.

**Fase 2 — Presentación reutilizable:** abstraer en `excelHelpers.js` sólo constantes/tokens y primitives útiles (`sheet meta`, `section header`, `ticket total`, `spacer`, `cell`), evitando un framework nuevo o enormes condicionales. Conservar `cleanExcelRows`, seriales Lima, inyección segura, merges y `writeSalesWorkbook`.

**Fase 3 — Reportes:** ajustar `salesWorkbook.js` con las ocho hojas pertinentes, usando referencias del antiguo como patrón de lectura, no como fuente de cuentas. Escribir mensajes en español llano; mostrar alertas confirmadas y provisionales distintas. Evitar más consultas Firestore si los datos están disponibles en el modelo.

**Fase 4 — Informe PDF/impresión:** intervención acotada en `managementReportHtml.js` exclusivamente si existe desalineación UX/legibilidad; no tocar pipeline de impresiones ni timeout sin evidencia. Revisar paginación, tablas extensas y móvil/impresión.

**Fase 5 — QA y aceptación:** fixtures actuales y nuevas pruebas de estilo XLSX a nivel ZIP/XML con límites eficientes, snapshots/HTML cuando aporte y caso de estrés de `MAX_EXPORT_ROWS`.

## 4. Pruebas exigidas

- Reabrir libro XLSX **real** generado y verificar todas las hojas con datos: colores con contraste, metadatos, columnas/filas con límites, rangos, filtros, freezes y combinaciones.
- Verificar `showGridLines="1"` en XML en **cada** hoja; bordes `top/bottom/left/right` de las celdas del rango lógico, incluidas vacías. Comprobar contornos de merges y separadores. Verificar que la hoja sin tablas grandes todavía conserve cuadrícula.
- Dataset base estilo Kcprichitos: 9 tickets, S/ 225 en total, S/ 134 efectivo, S/ 91 digital, Taller S/ 157, Concepción S/ 68, sobrante de caja S/ 10 **sin aumentar ingresos a S/ 235**; construir fixture propio equivalente si no existe acceso al archivo antiguo en el entorno Codex.
- Tickets: uno con un producto, varios productos, pago mixto, anulados y ajustes, muchas sedes, nombres largos y caracteres de fórmula `=`, `+`, `-`, `@`.
- Pedidos: abonos, adelantos, saldo, cancelados y reembolsos contables; no doble conteo.
- Cajas: abierta, cerrada cuadrada, faltante, sobrante, vencida sin arqueo, referencia estimada y datos parciales. No convertir ausencia de declaración en cero.
- Casos: 0 datos, 1 sede, 2+ sedes, períodos hoy/semana/mes/año, miles de movimientos, límite 10 000 filas (probar tiempo y memoria razonables con harness actual).
- Mantener las invariantes contables y de seguridad; no reescribir expectativas para ocultar regresiones.
- Ejecutar scripts **existentes** del `package.json`: tests focalizados de reportes/Excel, test navegador de exportación, lint y build de producción, `git diff --check`. Si un comando no existe, indicar y elegir equivalente documentado.
- Adjuntar resumen del QA: lista de archivos, razones, tests y resultados, limitaciones, rutas de muestras locales (sin commitear archivos generados) y checklist de aceptación.

## 5. Límites explícitos

**NO:** modificar Firestore rules/índices, auth, PWA, repositorios de ventas/caja, rutas, API, negocio ajeno a reportes; agregar dependencias grandes; generar informes con datos fabricados; meter imágenes/base64; reescribir toda la UX; ocultar diferencias de caja; renombrar columnas sin migrar lectores/tests; push, merge o deploy sin autorización.

**SÍ:** conservar compatibilidad de navegación y nombres de hojas/columnas donde son contratos; cambios mínimos y documentados; mantener cuadrícula y bordes funcionales; optimizar materialización de celdas dentro del rango realmente utilizado; mantener el modelo exacto y consistente.

## 6. Entregables y definición de terminado

- Reportes XLSX reales fáciles de comprender y visualmente consistentes en todas sus hojas; PDF gerencial sin recortes cuando se imprima.
- Conjunto de pruebas nuevas/de regresión que detecten pérdida de bordes, cuadrícula, agrupación y errores contables.
- `docs/RESULTADOS-P26-REPORTES-GERENCIALES.md` con evidencia de antes/después, reconciliación de cifras, QA ejecutado, limitaciones y guía breve para el dueño.
- No dar por terminado hasta demostrar un XLSX real con encabezados legibles, celdas visibles, separadores claros, totales de tickets correctos y sobrante de caja fuera del ingreso neto.
