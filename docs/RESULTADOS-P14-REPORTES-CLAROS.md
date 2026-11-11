# MigaPOS · P14-RC+ · Reportes claros y Galaxy Nebula Cream

Trabajo local en `C:\Proyectos\MigaPOS`, sobre el árbol seleccionado por el propietario para `marketing/video-promo-migapos`.

## Reportes, PDF y Excel

El informe gerencial muestra **Cajas que requieren revisión** cuando el período contiene incidencias. Cada fila identifica sede, turno, responsable, registro y revisión sugerida. El vencimiento sin arqueo muestra «No declarado». Un cierre provisional identifica el efectivo declarado cuando existe y explica cómo revisar la referencia. El sobrante y el faltante solo muestran la diferencia registrada cuando el evento tiene datos de conteo y la diferencia carece de marca provisional.

La sección muestra las seis incidencias más recientes y el total detectado cuando hay más. La proyección usa `cashEvents`, conserva todos los eventos para `Auditoría_Cajas` y escapa los nombres y los datos visibles. La nota sobre compensaciones contables se presenta junto al resto del informe cuando corresponde.

La prueba de impresión detectó una segunda página ocupada por una sola fila y, después, por la nota al pie. Se compactaron los espacios de impresión y se incorporó el contexto contable junto al período. Los casos de 0, 1, 6 y 8 incidencias imprimieron una página A4. El caso de 8 muestra seis incidencias y conserva los 16 eventos de apertura y cierre/vencimiento en Excel. El escenario gerencial denso mantiene sus dos páginas con contenido.

`Resumen_Financiero`, `Comparativa_Sedes` y `Resum_<sede>` usan las mismas etiquetas para las métricas compartidas. Las fechas, montos y conteos reimportan como números con sus formatos semánticos. El encabezado inmovilizado y el filtro de cada resumen diario empiezan en la fila 3, debajo del título y la nota contable. `Productos_Global` y `Productos_Sedes` identifican el importe como neto de productos POS. `Auditoría_Cajas` distingue el efectivo declarado del fondo inicial y conserva los estados de importes ausentes.

| Día de prueba | Total neto | Neto efectivo | Neto Yape/Plin | Neto mostrador | Neto pedidos | Pagos de pedidos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 24/10/2026 | S/ 6,00 | S/ 5,50 | S/ 0,50 | S/ 6,00 | S/ 0,00 | 0 |
| 27/10/2026 | S/ 222,00 | S/ 100,00 | S/ 122,00 | S/ 17,00 | S/ 205,00 | 3 |

Los importes conciliaron entre el modelo del Dashboard, el HTML imprimible y el XLSX reimportado. La comparativa de dos sedes sumó S/ 228,00. Las regresiones incluyen netos negativos, anulaciones, reembolsos y el límite de 10.000 líneas.

## Ajuste global de identidad visual crema-nebulosa

Los tokens modificados en `theme.css` son `canvas` (`#FFF9F1`), `subtle` (`#FFF3E9`), `line` (`#E8DCD4`), `ink` (`#261B3D`), `muted` (`#60596C`), `control` (`#776882`), `sidebar` (`#301B50`), `sidebar-end` (`#512D91`), `sidebar-muted` (`#E0D3F4`) y `sidebar-glow` (`#F0DDFF`). Se añadieron `sidebar-active` (`#3F4BC4`) y `sidebar-active-line` (`#AEACFF`). Todos usan el prefijo existente `--color-`. El panel marfil existente usa `#FFFEFC`. `index.css` aplica el color al cuerpo y acota el gradiente y la selección al sidebar existente. La apariencia global requirió dos archivos CSS.

Chromium verificó 10 vistas con datos simulados a 375×667, 768×1024, 1280×560 y 1440×900. El ancho desplazable del documento quedó dentro del viewport. Caja se comprobó con el modal real de conteo y con la auditoría del informe. La navegación móvil y los controles se verificaron en el shell de la aplicación.

| Comprobación de contraste | Relación |
| --- | ---: |
| Texto principal sobre crema | 15,36:1 |
| Texto secundario sobre marfil | 6,63:1 |
| Texto secundario sobre el fondo suave | 6,12:1 |
| Borde de control sobre panel | 5,10:1 |
| Foco sobre panel | 5,79:1 |
| Texto secundario sobre el límite luminoso del sidebar | 5,85:1 |
| Blanco sobre la navegación seleccionada | 6,97:1 |
| Borde de selección sobre el límite luminoso del sidebar | 4,01:1 |

A 1280×560, el ticket de ocho artículos conservó total y Cobrar dentro de la ventana con fondo del botón en 539 px y desplazamiento de página 0. El campo enfocado quedó dentro del bloque de pago y la acción se habilitó al ingresar el importe exacto. En móvil 375×667, el botón quedó en 653 px. Escape cerró el carrito y devolvió el foco al lanzador. Se comprobó también la preferencia de movimiento reducido.

Capturas y mediciones en `.release/qa-p14-rc/before/` y `.release/qa-p14-rc/after/`. Ambas carpetas contienen Dashboard (`reports`), exportación (`export`), POS, Historial, Contratos, Caja, Personal, Ajustes, Productos y Categorías en escritorio y móvil. `pos-1280x560.png` y `pos-drawer-375.png` muestran el área de cobro.

| Vista | Antes | Después |
| --- | --- | --- |
| Dashboard | [Captura](../.release/qa-p14-rc/before/reports-1440.png) | [Captura](../.release/qa-p14-rc/after/reports-1440.png) |
| POS 1280×560 | [Captura](../.release/qa-p14-rc/before/pos-1280x560.png) | [Captura](../.release/qa-p14-rc/after/pos-1280x560.png) |
| Caja móvil | [Captura](../.release/qa-p14-rc/before/cash-close-375.png) | [Captura](../.release/qa-p14-rc/after/cash-close-375.png) |
| Personal | [Captura](../.release/qa-p14-rc/before/users-1440.png) | [Captura](../.release/qa-p14-rc/after/users-1440.png) |

Muestras A4 en `.release/qa-p14-rc/informe-caja-0.pdf`, `informe-caja-1.pdf`, `informe-caja-6.pdf` e `informe-caja-8.pdf`. Poppler comprobó tamaño y páginas. Los XLSX descargados y reimportados están en `.release/qa-excel-ux/`.

## Lecturas

**Cero lecturas añadidas.** En Chromium se observaron cuatro llamadas simuladas al preparar el PDF en frío, cero al reabrirlo con el mismo alcance y una llamada de auditoría histórica que el exportador ya empleaba al preparar Excel. El recorte de incidencias ocurre después de la lectura del período.

La prueba de lectores paginados simuló 20 negocios, dos sedes por negocio y 100 ventas diarias por sede. Los totales son llamadas y documentos devueltos por el SDK simulado, incluidos los recorridos en frío de la prueba.

| Período | Una sede, llamadas / documentos | Global, llamadas / documentos |
| --- | ---: | ---: |
| Día | 240 / 4.040 | 280 / 8.080 |
| Semana | 360 / 28.280 | 520 / 56.560 |
| Mes | 840 / 121.200 | 1.440 / 242.400 |
| Año bloqueado por límite | 1.020 / 200.020 | 1.020 / 200.020 |

Con caché vigente hubo cero llamadas adicionales en todos los casos. Un resumen diario persistente por sede requeriría validar la proyección, sus actualizaciones y Rules antes de usarlo como fuente de cifras.

## Validación original de P14-RC+

| Control | Resultado |
| --- | --- |
| Node `reports`, `plan13`, `plan14` | **PASS 71/71**. Incluye reimportación, fechas, signos, caja y reconciliación. |
| Node `plan14-read-cost` | **PASS 1/1**. Simulación con caché y límite anual. |
| Chromium P14-RC, P09 y P10-06 | **PASS 3/3** con la paleta final. P09 realizó 199 comprobaciones y P10-06, 480. |
| Chromium PDF/XLSX | **PASS 4/4**. Descargas reales en dev y preview/PWA, caché por alcance y cuatro casos A4. |
| Lint y build/PWA | **PASS**. Precaché de 2,90 MiB y Excel diferido. Vite avisó de chunks superiores a 500 kB. |
| Aceptación histórica estricta P13-04 | **FAIL 0/1**. El ticket antiguo sin comprobante en el período original conserva S/ 0 provisional. La aceptación espera S/ 30 en ese día. Dashboard y Excel coinciden en la cifra provisional. |
| Inventario Markdown | **FAIL 24/25**. La lista incorpora exclusivamente la ruta del resultado solicitada por el prompt. El control sigue detectando los tres documentos de entrada de P14-RC+ y cinco documentos de marketing adicionales en el árbol local. Rutas exactas en `inventory.log`. |
| Firestore Rules local | **BLOCKED**. Java no está disponible en PATH de PowerShell. |

Los registros y muestras se guardaron en `.release/qa-p14-rc/`. El árbol de marketing y los archivos audiovisuales quedaron fuera del trabajo. La ejecución fue local, sin Git, GitHub ni despliegues.

## Archivos modificados

- `frontend/src/features/reports/application/managementReportHtml.js`, `cashAuditRows.js`, `salesWorkbook.js`
- `frontend/src/utils/salesDataProcessor.js`
- `frontend/src/modules/reports/ReportParts.jsx`
- `frontend/src/shared/styles/theme.css`, `frontend/src/index.css`
- `tests/reports.test.mjs`, `tests/plan13.test.mjs`, `tests/plan13-historical.acceptance.mjs`, `tests/plan14.test.mjs`
- `tests/excel-export.browser.test.mjs`, `tests/excel-export.fixture.jsx`, `tests/plan09.browser.test.mjs`
- `tests/ui-security.test.mjs`, `docs/RESULTADOS-P14-REPORTES-CLAROS.md`

## Reparación en `fix/migapos-production-readiness`

Git tenía preparados marcadores de conflicto en `salesWorkbook.js`, `salesDataProcessor.js`, `excel-export.browser.test.mjs`, `plan13.test.mjs`, `reports.test.mjs` y `ui-security.test.mjs`. El índice tenía una sola versión por archivo y no había una operación de integración activa. Se respaldaron los 20 archivos preparados y se integraron por separado el esquema anterior de Excel, sus pruebas y las etiquetas de P14-RC+. Se recuperaron `excelHelpers.js`, `contractLedgerReport.js` y la comprobación del importe XLSX de compensación en la suite financiera de Rules. El ajuste local de opacidad de `CatalogParts.jsx` se conservó fuera del commit. Se restituyó el fondo crema `#FFF9F1` que comprueba la regresión P14-RC+.

Los tres documentos de producto están presentes en `docs/` de la rama de destino y tienen rutas exactas en el inventario:

- `docs/PLAN-P14-REPORTES-CLAROS-AVISOS-CAJA.md`
- `docs/PROMPT-CODEX-P14-REPORTES-CLAROS.md`
- `docs/PROMPT-INICIO-CODEX-P14-REPORTES-CLAROS.md`

Las otras cinco rutas se verificaron en `docs/` de `marketing/video-promo-migapos`. La clasificación identificó cinco documentos promocionales y cero temporales entre las ocho rutas originales.

- `docs/PLAN-CIERRE-VIDEO-PROMOCIONAL-MIGAPOS.md`
- `docs/PLAN-MIGAPOS-VIDEO-V2-BRAG-MOVIL.md`
- `docs/PROMPT-CODEX-CONTINUAR-VIDEO-MIGAPOS.md`
- `docs/PROMPT-CODEX-MIGAPOS-BRAG-V2.md`
- `docs/PROTOCOLO-COLABORACION-VIDEO-MIGAPOS.md`

La revalidación en la rama de destino aprobó 97 pruebas Node, incluidas las 25 de seguridad UI e inventario, las cuatro pruebas Chromium de exportación PDF/XLSX y las cinco comprobaciones de la suite UX P09/P10/P14. El POS conservó el foco, el total y Cobrar visibles a 1280×560. ESLint y build/PWA aprobaron con `demo-migapos`. La prueba histórica estricta sigue pendiente por la falta de un comprobante vinculado al ticket antiguo `voided` en el período original. El neto de ese día sigue siendo provisional. Los registros de esta revalidación están en `.release/qa-reparacion/`.
