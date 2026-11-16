# MigaPOS P26 — ejecución UX de reportes (especificación cerrada)

**Base auditada por ChatGPT:** `saintdeyb321/Mig`, rama `fix/migapos-production-readiness`, commit `07e56cc` (16/11/2026). **Objetivo:** mejorar la lectura del Excel para dueños de pastelerías **sin rehacer el generador ni los cálculos**. No hace falta el Excel antiguo en el entorno Codex.

## 1. Hechos ya verificados: no volver a investigarlos

| Archivo / función | Qué ya funciona y debe conservarse |
|---|---|
| `frontend/src/utils/excelHelpers.js`: `createOverviewSheet`, `createSheet` | Paleta morada y pastel, anchos por esquema, alturas, filas blancas, cuatro bordes por celda lógica, celdas vacías materializadas, celdas combinadas y filtros selectivos. |
| `frontend/src/features/reports/application/salesWorkbook.js`: `buildSalesWorkbook`, `writeSalesWorkbook` | Resumen, caja, sedes, productos, detalle por sede y pedidos; metadatos claros. `writeSalesWorkbook` fija encabezados y **`showGridLines="1"`**. |
| `frontend/src/utils/salesDataProcessor.js`: `groupedTicketRows` | Tickets agrupados, artículos sin repetir metadatos, `TOTAL TICKET` y una separación; conservar. |
| `frontend/src/features/reports/application/managementReportHtml.js` | PDF/HTML A4 con tarjetas, tablas, incidencias y estilos para impresión; no tocar salvo defecto reproducible. |
| `tests/helpers/reportWorkbook.mjs`, `tests/reports.test.mjs`, `tests/excel-export.browser.test.mjs` | Ya comprueban bordes/XML, importes y agrupación. **Extender, no sustituir**. |

**Referencia antigua verificada:** 7 hojas: `Resumen_Financiero`, `Auditoría_Cajas`, `Comparativa_Sedes`, `Productos_Global`, `Productos_Sedes`, `Detalle_sede concepcion`, `Detalle_Taller`. Uso visual valioso: títulos claros, columna Producto ~36 caracteres, identificación de ticket en primera fila, total destacado y una fila de separación. Las hojas antiguas no fusionan celdas; el diseño moderno puede conservar sus títulos fusionados. **No copiar el cálculo histórico:** 9 tickets = S/225 (Taller S/157 + Concepción S/68; efectivo S/134 + digital S/91); sobrante S/10 no equivale a S/10 de ventas ni debe transformar S/225 en S/235.

## 2. Cambios exactos (ordenados por prioridad)

**A. `Productos_Sedes`: agrupación visual más evidente (mejora principal).** En `salesWorkbook.js`, cuando se construyen las filas de productos por sede, marcar únicamente la primera fila de cada grupo con metadato interno `_groupStart: true` (no se serializa como columna). En `createSheet` de `excelHelpers.js`, usar ese indicador para dibujar **borde superior `thin` de mayor contraste** en toda esa fila y **resaltar únicamente la celda `Sucursal`**, dejando `Producto`, cantidad e importes legibles con sus tonos semánticos. Mantener la fila separadora blanca de 8–10 pt entre sedes. No agregar cabeceras falsas que entren en la lectura tabular; no repetir la sucursal en cada línea ni modificar cifras o columnas.

**B. `Comparativa_Sedes`: lectura gerencial.** Ordenar las filas de sedes por `Ingreso neto (S/)` descendente, con desempate estable por nombre e identificador. Mantener **TOTAL NEGOCIO** al final y la diferencia de caja en columna separada, sin sumarla al ingreso. No cambiar orden de hojas, orden de detalles ni totales de dominio.

**C. Tabla y encabezados: corrección acotada, no rediseño.** En `excelHelpers.js`, mantener los cuatro bordes `thin`; distinguir el inicio de grupo cambiando solo el **color** del borde superior (no su grosor), para conservar los tests existentes. Verificar que las etiquetas y observaciones actuales no queden cortadas con anchos establecidos en `columnOptions` de `salesWorkbook.js`; ajustar **solo columnas identificadas en pruebas** (Producto objetivo ~33–36; Sucursal 18–22; Observaciones hasta ~40–44), sin autofit sin límite ni ensanchar todas las hojas. Conservar títulos morado `#3E2C63`, productos amarillo `#FFF5C2`, pagos digital lila `#E9DEF8`, totales verde `#C7F2D6`, incidencias ámbar/rojo pastel; color por significado, no fondos intensos en toda la tabla.

**D. Límite de exportación.** La comprobación previa `MAX_EXPORT_ROWS=10000` cuenta movimientos/artículos antes de agregar todos los totales y separadores. Añadir en el punto mínimo de creación del detalle una **validación del tamaño efectivo** de las filas emitidas; si supera el límite, mostrar error comprensible y recomendar un período menor. Nunca cortar tickets, omitir totales o esconder filas para cumplir el límite. Mantener la comprobación previa y evitar cálculos/copias extras pesadas.

**E. PDF:** sin cambios por defecto. Solo corregir `managementReportHtml.js` si una prueba/captura reproducible demuestra texto cortado o paginación defectuosa; no abrir un segundo frente de refactorización.

## 3. Invariantes que no se negocian

- `showGridLines="1"` en **todas** las hojas; cuadrícula normal fuera de tablas; cuatro bordes reales dentro del rango lógico, incluso vacías. No rellenar de blanco el fondo exterior. Celdas fusionadas con perímetro correcto.
- Importes numéricos Excel `S/`, fechas/horas Lima, textos `= + - @` sin fórmula, ceros distintos de datos ausentes, congelación/filtros existentes; **no filtrar tickets agrupados**.
- Neto registrado ≠ dinero contado ni fondo inicial; sobrantes/faltantes confirmados o provisionales van aparte. Resumen = suma de sedes donde el modelo lo garantiza; pagos de pedidos y subtotales de artículos no se suman dos veces.
- Sin nuevas consultas Firestore, dependencias, cambios en `reportTotals.js`, auth, reglas/índices, POS, caja, contratos, rutas o infraestructura salvo error demostrado. No crear un nuevo framework de estilos ni reescribir tests completos.

## 4. QA mínimo y comprobable

**Inspeccionar/editar solamente:** `salesWorkbook.js` y `excelHelpers.js`; en pruebas, `tests/reports.test.mjs` y/o `tests/excel-export.browser.test.mjs` y el helper de bordes **solo si una regresión real lo exige**. Abrir `salesDataProcessor.js` **solo si** el tamaño de detalle exige verificar el contrato de `groupedTicketRows`. No leer planes P25, otros docs ni todo el repo: los hechos necesarios están arriba.

**Pruebas añadidas focalizadas:** (1) dos sedes con productos: inicio de grupo reconocible, separador, misma cantidad e importe y cero columnas `_`; (2) sedes ordenadas por neto sin que sobrante cambie ingresos; (3) límite real del detalle con totales/separadores: rechazo explícito, sin truncamiento. **Reutilizar** pruebas existentes de XML (`showGridLines=1`, bordes), tickets, pagos mixtos, anulaciones, texto literal y sumas.

**Ejecutar primero** `node --test tests/reports.test.mjs`; **solo si el entorno permite Chromium y se modifican estilos XLSX**, ejecutar el test navegador existente. Terminar con `git diff --check` y el build/lint disponibles **si los archivos modificados lo justifican y están configurados**. No introducir herramientas nuevas ni instalación automática. Informar comandos y resultados reales, sin simular QA.

**Entregar:** diff mínimo; resumen de 5–10 líneas con archivos, mejoras, pruebas y límites. No redactar un informe largo nuevo. **Sin push, merge, deploy, cambio de rama ni commit automático.** Respetar cambios locales; revisar `git status --short`, `git branch --show-current`, `git log -1 --oneline` y actuar sobre el HEAD local real.

**Aceptación:** se distinguen claramente las sedes en `Productos_Sedes`, la comparativa muestra las sedes más vendedoras primero, ningún reporte pierde bordes/cuadrícula y ninguna cifra contable ni ticket cambia. Si algo ya cumple, **no tocarlo**.
