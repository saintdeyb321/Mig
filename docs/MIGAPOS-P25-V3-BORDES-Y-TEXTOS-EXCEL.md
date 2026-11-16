# MigaPOS · P25-V3 — Bordes completos y lenguaje claro en Excel

**Alcance:** ajuste puntual de presentación sobre P25-V2. **No** es otra refactorización de las cifras. Basarse en el código local de `fix/migapos-production-readiness`; conservar modificaciones no confirmadas.

## 1. Problemas comprobados en el código de P25-V2

- `frontend/src/utils/excelHelpers.js`: `createOverviewSheet()` asigna relleno, letra y alineación **sin `border`**. Por eso `Resumen_Financiero` parece un conjunto de bandas sin celdas.
- En `createSheet()`, `edge()` crea **solo borde inferior**. El algoritmo excluye los bordes de las celdas `plain` y además `return undefined` genera celdas no materializadas en los informes visuales. Por eso los productos parecen bloques y no una tabla.
- Las primeras filas de las hojas incluyen textos técnicos y largos: «Todas las sedes · 09/11/2026 a 15/11/2026 · Generado … (hora de Lima)» y «Unidades e importes netos después de las anulaciones». Su interpretación no es inmediata.
- En `salesWorkbook.js`, los metadatos y notas se escriben desde `append()`, `summarySheet()` y cada llamada a `append()`. No resolverlo con un reemplazo ciego de palabras: distinguir resumen, detalle, productos, caja y auditoría.

## 2. Resultado visual exigido

**Todas las hojas del XLSX** deben tener celdas claramente delimitadas, como una hoja profesional de Excel, manteniendo los colores pastel semánticos del P25-V2:

| Uso | Relleno | Bordes |
|---|---|---|
| Encabezados | Morado oscuro `#3E2C63`, blanco y negrita | Cuadrícula completa con contraste perceptible |
| Metadatos | Celeste suave `#BDE7F5` | Cuadrícula completa, fina |
| Efectivo / confirmado | Verde suave `#C7F2D6` | Cuadrícula completa, fina |
| Yape / Plin | Lila suave `#E9DEF8` | Cuadrícula completa, fina |
| Mixto / informativo | Celeste claro `#CDEBFA` | Cuadrícula completa, fina |
| Producto | Amarillo suave `#FFF5C2` | Cuadrícula completa, fina |
| Advertencia | Amarillo pálido `#FFF0BF` | Cuadrícula completa, fina |
| Diferencia negativa | Rosado suave `#FBDADA` | Cuadrícula completa, fina |
| Filas normales | Blanco / marfil | Cuadrícula completa `thin`, gris medio-suave |
| Separadores entre tickets / secciones | Blanco, altura discreta | Mantener delimitación tenue **también en celdas vacías**; el espacio debe seguir viéndose blanco |

### Reglas de bordes

1. Definir en un único lugar una función reutilizable que produzca `border: { top, bottom, left, right }` (`thin` con el mismo color de línea, por ejemplo `D4D0DD`; un contraste suficiente sobre blanco). Aplicar a **todas** las celdas en el área utilizada: títulos, encabezados, resumen `A:B`, filas de datos, totales, notas y separadores. En bloques morados puede usarse borde un poco más claro.
2. **Crear las celdas vacías físicamente** cuando `aoa_to_sheet()`/`undefined` no las emita. Ejemplo: `sheet[A12] = { t: 's', v: '', s: ... }` o el procedimiento equivalente compatible con `xlsx-js-style`, sin introducir contenido visible. No insertar valores `0` donde no existan ni cadenas que parezcan datos financieros.
3. Las celdas combinadas de títulos/contexto/notas deben seguir combinadas, sin mostrar divisiones internas; asegurar un contorno visible y correcto del área combinada. Estilizar celdas integrantes si hace falta para que Excel 16 muestre el perímetro. No romper `!merges`, `!ref` ni `!autofilter`.
4. Conservar las filas de separación en blanco con altura pequeña (p. ej. 8–10 pt) y bordes muy sutiles. No colorear las filas separadoras y no repetir fecha, hora, ticket, medio de pago o responsable en líneas del mismo ticket.
5. No activar las *gridlines* globales del navegador Excel: los bordes deben formar parte del **archivo XLSX** y verse con `showGridLines="0"`. Mantener bordes al abrir en Microsoft Excel 16 e importando el XLSX.
6. Limitar el costo: no generar bordes/celdas fuera del rectángulo real de cada hoja. Mantener el límite existente de exportación y comprobar el caso de 10 000 líneas.

## 3. Microcopy: español claro, breve y exacto

**Regla:** título de sección de 2–5 palabras; subtítulo corto (idealmente 3–7 palabras). El período y el momento de generación no deben desaparecer, solo distribuirse de forma legible. Sin lenguaje de desarrolladores ni párrafos técnicos en las cabeceras visibles.

| Ubicación | Texto actual / problema | Propuesta |
|---|---|---|
| Encabezado `Resumen_Financiero` | `RESUMEN DEL NEGOCIO` | **RESUMEN DEL NEGOCIO** (conservar) |
| Fila de alcance | `Alcance` | **Sedes:** `Todas las sedes` / nombre de sede |
| Fila de fechas | `Fechas` | **Período:** `09/11/2026 – 15/11/2026` |
| Fila de generación | `Generado · hora de Lima` | **Generado:** `15/11/2026 · 23:33` (hora de Perú; indicar una sola vez si fuera necesario) |
| Hoja `Productos_Global` | `Productos de mostrador` | **PRODUCTOS VENDIDOS** |
| Cabecera productos | `Todas las sedes · 09/11/2026 a 15/11/2026 · Generado ...` | **Todas las sedes · 09–15/11/2026** (generación en metadata separada si se conserva) |
| Nota productos | `Unidades e importes netos después de las anulaciones.` | **Ventas menos anulaciones.** |
| `Unidades netas` | No es intuitivo | **Cantidad vendida** si se mantiene exactitud con anulaciones descontadas; explicar «menos anulaciones» en nota. Si se trata de unidades netas negativas, asegurar que no se oculte el signo ni se sugiera bruto |
| `Importe neto (S/)` | Excesivo | **Ventas (S/)** solo acompañado de la nota «Ventas menos anulaciones»; importes siguen siendo netos |
| `Productos_Sedes` | `Cada bloque muestra las unidades y los importes netos de una sede.` | **Ventas por sucursal.** |
| `Comparativa_Sedes` | Frase de auditoría extensa | **Ventas por sucursal.** Si existe diferencia de caja, especificar brevemente «Caja: diferencia confirmada»; **no** sumarla a ingresos |
| `Auditoría_Cajas` | Texto largo sobre fondo y diferencias | **Fondo inicial no es venta.** / **Sin arqueo = pendiente.** según contexto |
| `Detalle_<sede>` | Nota larga sobre subtotales | **Importe del movimiento = cobro o ajuste.** / **Subtotal de producto = solo detalle.** Opcional como dos microleyendas, no un párrafo |
| `Estado_Pedidos` | Referencias técnicas | **Pedidos y saldos.** |
| `Auditoría_Pedidos` | Nota técnica larga | **Pagos y ajustes de pedidos.** Una microleyenda adicional si se necesita aclarar un reembolso contable |

**Importante:** no cambiar el significado financiero para obtener textos más cortos. La UI debe seguir distinguiendo cobros registrados de ingresos netos, pagos de pedido, anulaciones, fondo inicial, referencia calculada y efectivo contado. En una cifra con riesgo de malinterpretación, preferir una etiqueta de dos palabras más larga a una afirmación incorrecta. Evitar poner «ganancia», «dinero real» o «cuadrado» sin pruebas.

El nombre del negocio (`DEMO` en la captura) es dato útil, **no eliminarlo**: presentarlo como `Negocio: DEMO` o una fila informativa equivalente, con bordes y buen espaciado.

## 4. Archivos a modificar (alcance mínimo)

1. **Obligatorio:** `frontend/src/utils/excelHelpers.js` — bordes en las cuatro caras, celdas vacías, encabezados, introducciones combinadas, separadores y totales. Mantener fechas numéricas, seguridad contra fórmulas y filtros existentes.
2. **Obligatorio:** `frontend/src/features/reports/application/salesWorkbook.js` — textos introductorios y notas según tipo de hoja; `summarySheet()`; opcionalmente nombres visibles de columnas si son coherentes y se actualizan todas las referencias.
3. **Solo si se cambian nombres de columnas:** `frontend/src/utils/salesDataProcessor.js` y esquema/pruebas dependientes. **Preferir renombrar en la capa de presentación**, sin cambiar los nombres del modelo contable ni su cálculo.
4. **Pruebas focalizadas:** `tests/reports.test.mjs`, `tests/plan14.test.mjs`, `tests/excel-export.browser.test.mjs` y `tests/helpers/reportWorkbook.mjs` según las rutas que realmente dependan del encabezado o columnas.
5. `docs/MIGAPOS-P25-V3-BORDES-Y-TEXTOS-EXCEL.md` — conservar esta especificación. No tocar `firestore.rules`, `firestore.indexes.json`, repositorios de ventas, caja, POS, caché, contratos, autenticación, PWA ni documentos legales.

## 5. Comprobaciones obligatorias (no basta con pasar lint)

- Generar un **XLSX real** de prueba con todas las hojas disponibles: `Resumen_Financiero`, `Auditoría_Cajas`, `Comparativa_Sedes`, `Productos_Global`, `Productos_Sedes`, `Detalle_<sede>`, y `Estado_Pedidos`/`Auditoría_Pedidos` cuando haya datos.
- Reimportar el XLSX con estilos habilitados y verificar en cada hoja que **todas las celdas del área lógica**, incluso una celda vacía entre productos y una celda del resumen, tengan borde superior, inferior, izquierdo y derecho. Inspeccionar XML del XLSX si la biblioteca de lectura no conserva completamente los estilos.
- Probar perímetro de áreas fusionadas, autofiltros donde existan, panes congelados y filas separadoras. No confundir apariencia con `showGridLines`.
- Verificar visualmente en Excel 16, si está disponible, o con capturas de las hojas: encabezado, celda blanca vacía, celda verde, celda amarilla, celda morada, nota fusionada y borde de total.
- Regresión de moneda `S/`, cantidades, fechas de Lima, pagos mixtos, operaciones anuladas, 9 tickets / `S/ 225.00`, cajas vencidas sin arqueo, y que no se dupliquen los ingresos al sumar la columna de movimientos.
- Ensayar 10 000 líneas: sin cuelgues, crecimiento descontrolado de memoria ni exceso del límite de filas establecido; no recorrer millones de celdas vacías.
- Ejecutar las pruebas focalizadas de Node y Chromium, lint, `npm run release:build -- --env production`, `npm run check:build` y `git diff --check`. Si falla un test por texto renombrado, actualizar su **expectativa semántica**, sin desactivar integridad/seguridad.
- Guardar muestras/capturas en `.release/qa-p25-v3/` (no hacer commit de artefactos de QA).

## 6. Criterios de aceptación

- A simple vista se distinguen **todas las columnas y filas** con bordes finos; las celdas vacías también tienen límites visibles y los espacios blancos entre tickets se preservan.
- Ninguna fila de cabecera parece un párrafo técnico; el dueño entiende **qué período, qué sucursal, cuánto vendió y por qué medio**.
- Los importes y el historial **coinciden exactamente con P25-V2** para los mismos datos y períodos.
- Los archivos generados siguen abriendo sin advertencias en Excel y la generación PDF no empeora.
- No se modifica ningún módulo de negocio, estructura de Firestore, caché, PWA, ni se introduce dependencia nueva.

**Entrega Codex:** PASS/FAIL, archivos cambiados, evidencia visual/XLSX y bloqueantes en **máximo 10–12 líneas**. Sin commit, push ni deploy.
