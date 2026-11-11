# MigaPOS — P14-RC+: Reportes claros + identidad visual cálida Galaxy Nebula

**Estado:** especificación para Codex; no implementado por este documento.\
**Ruta local de trabajo:** `C:\Proyectos\MigaPOS`\
**Rama de publicación elegida por el propietario:** `marketing/video-promo-migapos`\
**Referencia de auditoría (GitHub, 2026-11-10):** `8573fcb24c6d38dcbf6edd052e3c3bf82f431616`.\
**Límite estricto:** (A) reportes, Excel/PDF y sus pruebas; (B) **únicamente estilos/tokens compartidos y el layout raíz indispensables para aplicar un fondo cálido a todos los módulos**. No modificar lógica, JSX funcional de los módulos ni marketing/video/audio/assets/skills promocionales. No ejecutar Git/GitHub desde Codex. Estar en la rama de marketing **NO autoriza** trabajar en marketing.

## 0. Diagnóstico realizado sobre código publicado

Se revisaron los siguientes archivos en la rama indicada:

- `frontend/src/features/reports/application/managementReportHtml.js`: crea el bloque `Alertas operativas` con `view.cashEvents`, no con notificaciones; selecciona eventos `expiry` y cierres con estimación/diferencia y ejecuta `alerts.slice(-6).reverse()`. Actualmente muestra `Conciliación pendiente` y `Contado S/ ...` sin explicar la revisión requerida.
- `frontend/src/features/reports/application/cashAuditRows.js`: clasifica `opening`, `closing` y `expiry`; el efectivo contado puede ser **declarado**, la referencia de cierre puede ser **provisional**, y la diferencia puede ser **no calculable**. No reinterpretar valores nulos como cero.
- `frontend/src/features/reports/application/reportViewModel.js`: `cashEvents` ya es parte del modelo de informe. Debe reutilizarse.
- `frontend/src/features/reports/application/sessionReportReads.js`: `exportSnapshot()` consume lectores existentes de ventas, pagos, pedidos, anulaciones y cajas; comparte recursos con caché TTL. No añadir lectura para los avisos.
- `frontend/src/features/reports/hooks/useExportSales.js`: genera PDF y XLSX bajo demanda, con caché por identidad, negocio/sede/período y revisión. Conservar.
- `frontend/src/utils/salesDataProcessor.js`: `dailyReportRows()` expone las columnas ambiguas `Ingreso`, `Efectivo`, `Yape/Plin`, `Ingreso POS`, `Ingreso Pedidos`, `Pagos Pedidos`, `Tickets POS`, `Anulados`.
- `frontend/src/features/reports/application/salesWorkbook.js`: esquema de formato por encabezado `moneyColumns`, `countColumns`, `columnOptions`, hojas `Resum_<sede>`, `Comparativa_Sedes` y `Resumen_Financiero`. Si se renombran etiquetas, ajustar el esquema y el formato en el mismo commit.
- `frontend/src/utils/excelHelpers.js`: crea celdas con formatos semánticos, inmoviliza encabezados y prepara estilos. Mantener esta arquitectura.
- `frontend/src/features/reports/domain/reportTotals.js`: `netRevenue`, `cashRevenue`, `digitalRevenue`, `posRevenue` y `contractRevenue` son **netos contables**, no saldo de caja ni utilidad. `contractPaymentCount` cuenta pagos no reembolsos; `voidedTicketCount` cuenta anulaciones según la proyección existente.

### Error de comprensión observado

La captura muestra seis filas repetidas `Conciliación pendiente` y `Contado S/100.00`. Esos avisos **no son notificaciones**, y `Contado` no implica que una conciliación haya sido confirmada. La lectura correcta: **el cierre requiere revisión**. Debe quedar claro qué falta, quién debe revisarlo y qué dato es declarado/provisional.

### Error semántico observado en el Excel

La fila del 27/10/2026 muestra `Ingreso = S/222.00`, `Ingreso POS = S/17.00`, `Ingreso Pedidos = S/205.00`. El cálculo es coherente: **17 + 205 = 222**, pero `Ingreso` no explica que se trata de un **total neto contable**, y `Efectivo`/`Yape/Plin` no son dinero físico disponible ni el saldo de las billeteras.

## 1. Diseño: bloque de caja del PDF

### Título y explicación

- Cambiar **«Alertas operativas»** por **«Cajas que requieren revisión»** (solo cuando existan incidencias); icono discreto de caja/reloj o advertencia; color ámbar tenue, morado profundo y superficies crema.
- Subtítulo fijo: «Estos registros corresponden a turnos de caja. No son notificaciones. Revisa los cierres pendientes y compara el efectivo declarado con tus comprobantes.» [abreviar si es necesario para A4].
- Clasificación legible y estricta, derivada de `cashAuditEvents`:
  1. `expiry`: **«Turno vencido sin arqueo»**, «Efectivo contado: No declarado», «Revisar el turno anterior». Nunca convertir fondo de apertura a contado.
  2. `closing` con `estimated/reconciliationPending`: **«Cierre pendiente de conciliación»**, «Efectivo declarado: S/ X» o «No declarado», «La referencia de caja es provisional: revisar». No presentar una diferencia como definitiva.
  3. `closing` con `difference > 0`: **«Sobrante registrado»**, mostrar diferencia solo si `difference` es verificada por la fuente y no estimada; mantener distinción entre declaración y comprobación.
  4. `closing` con `difference < 0`: **«Faltante registrado»**, idem.
  5. `closing` con diferencia `null`: **«Cierre sin diferencia calculable»** y «Revisar valores pendientes», sin `S/0.00` ficticio.
- Cada fila/tarjeta compacta debe mostrar **motivo** (primario), **sede**, **fecha y hora** (hora Lima implícita en contexto, no repetir «(Lima)» seis veces), **responsable** y **dato monetario con etiqueta específica**. Mantener una línea «Qué significa»/«Acción sugerida» real, sin acciones falsas, notificaciones o estados inventados.
- PDF A4: máximo **6 incidencias recientes** ordenadas por fecha descendente; la selección actual `alerts.slice(-6).reverse()` ya limita renderizado. Prohibido generar páginas vacías o bloques gigantes por avisos.
- Si hay más de 6: `Se muestran las 6 incidencias más recientes de N detectadas en el período.` Si N no pudiera derivarse sin lecturas, no inventarlo; con el arreglo `alerts` sí se conoce N.
- Si no hay incidencias: omitir el bloque completo, o mostrar «No se detectaron cajas pendientes de revisión» solo si todo el período fue leído íntegramente. No interpretar un reporte parcial como ausencia de incidencias.
- Para revisión completa, sugerir el módulo **Caja → Historial de turnos** / Excel `Auditoría_Cajas` únicamente si los nombres reales de navegación coinciden; no fabricar enlaces/botones que no funcionan.

### Modelo de presentación

Diseñar `cashReviewPresentation(events, { max: 6 })` o equivalente como función **pura**. Distinguir:

```
{
  totalCount: number,
  visible: Array<{
    key, title, branch, occurredAt, responsible,
    moneyLabel, moneyValueText, explanation, severity
  }>
}
```

Esta proyección solo transforma `cashEvents` recibidos. **No llamar Firestore**. No usar `event.kind === closing && event.difference !== 0` para etiquetar nulos como diferencia real; explicar estados explícitamente. HTML siempre escapado con el helper existente `escapeHtml`; evitar interpolaciones inseguras de nombres/observaciones.

## 2. Excel: diccionario de etiquetas en español natural

No modificar las métricas, únicamente su **presentación**. Nueva nomenclatura para `Resum_<sede>`:

| Antes | Después propuesto | Valor exacto (sin cambios) | Aclaración |
|---|---|---|---|
| `Fecha` | `Fecha` | `day.day` | Fecha del reporte |
| `Tickets POS` | `Tickets de venta válidos` | `day.posTicketCount` | Cantidad, no dinero |
| `Anulados` | `Ventas anuladas` | `day.voidedTicketCount` | Cantidad |
| `Ingreso` | `Total neto registrado (S/)` | `day.netRevenue` | **Total contable** del día; puede ser negativo |
| `Efectivo` | `Neto en efectivo (S/)` | `day.cashRevenue` | **No** saldo físico de caja |
| `Yape/Plin` | `Neto por Yape/Plin (S/)` | `day.digitalRevenue` | **No** saldo de billetera |
| `Ingreso POS` | `Neto de ventas en mostrador (S/)` | `day.posRevenue` | Cobros y compensaciones POS netos |
| `Ingreso Pedidos` | `Neto de pagos de pedidos (S/)` | `day.contractRevenue` | Pagos menos reembolsos contables; no total del contrato |
| `Pagos Pedidos` | `Pagos de pedidos (cantidad)` | `day.contractPaymentCount` | No incluye movimientos `refund` como pago |

Nota de interpretación breve, **sin hoja nueva**: «Total neto registrado = neto de ventas en mostrador + neto de pagos de pedidos. Los netos incluyen ajustes contables y no representan ganancia, saldo de caja ni saldo en Yape/Plin.» Si el formato existente permite nota en el encabezado/segunda fila, utilizarlo y actualizar correctamente autofiltro/freeze; si impacta demasiado, usar un comentario explicativo discreto dentro de las hojas existentes sin estropear filtros.

Otras hojas a auditar sin rediseñarlas:

- `Comparativa_Sedes`: mismas etiquetas para las mismas métricas, sin romper suma global; `Ventas Sistema (S/)` puede ser `Total neto registrado (S/)` y `Ingreso POS/Pedidos` como antes. **Mantener** columna `Sucursal` porque aquí sí se comparan varias.
- `Resumen_Financiero`: usar el mismo lenguaje donde aparezca una métrica equivalente; no renombrar claves indiscriminadamente si se utilizan como referencia automatizada, actualizar tests cuidadosamente.
- `Productos_Global`, `Productos_Sedes`: `Ingreso` puede representar ingreso neto de productos de POS y **no ingreso total de pedidos**; dar nombre preciso solo después de verificar origen. No llamar «ganancia» a ingresos ni mezclar unidades con soles.
- `Auditoría_Cajas`: conservar `No declarado` y `No calculable` para importes ausentes, distinguir fondo inicial de dinero contado.
- `Auditoría_Pedidos`, `Estado_Pedidos` y `Detalle_<sede>`: preservar el diseño de **movimientos separados** que ya se implementó; mejorar solo etiquetas ambiguas verificadas, sin remover evidencias para una auditoría.
- Evitar «Neto Real», «ganancia», «dinero disponible» y «saldo bancario» si la fuente es solamente contable.

### Tabla de aceptación financiera

Con datos de ejemplo (no cambiar datos del usuario):

| Fecha | Total neto registrado | Neto efectivo | Neto Yape/Plin | Neto mostrador | Neto pedidos | Pagos (cant.) |
|---|---:|---:|---:|---:|---:|---:|
| 24/10/2026 | S/ 6.00 | S/ 5.50 | S/ 0.50 | S/ 6.00 | S/ 0.00 | 0 |
| 27/10/2026 | S/ 222.00 | S/ 100.00 | S/ 122.00 | S/ 17.00 | S/ 205.00 | 3 |

Invariantes: 6 = 5.50 + 0.50 = 6 + 0. 222 = 100 + 122 = 17 + 205. Deben mantenerse iguales en Dashboard, PDF, XLSX y reimportación XLSX. Verificar netos negativos, devoluciones contables y dos sedes sin doble conteo.

## 3. Optimización Firestore y anti-repeticiones

- El PDF ya selecciona las **seis últimas incidencias desde el arreglo de eventos**. `slice(0,6)` no economiza lecturas que ya fueron hechas: no presentar esto como optimización de SDK.
- Conservar `sessionReportReads.exportSnapshot()` y `useExportSales()` con el TTL y caché actual; una elección de formato o la apertura de preview no debe disparar consultas adicionales.
- **Prohibido** añadir llamadas a `getDocs`, `getDoc`, listeners, búsquedas por usuario/turno o paginación nueva para renderizar avisos. No usar `limit(6)` sobre `cash_sessions` porque el Excel `Auditoría_Cajas` necesita el período íntegro y una consulta truncada daría una impresión falsa de «sin incidencias».
- Si el lector de sesiones ya consulta demasiados documentos: **medir** por período y sede, documentar un diseño opcional de resumen/acumulados **sin implementarlo aquí**; diferenciar rendimiento de UI (máximo 6) de lecturas SDK (cantidad histórica del período).
- Mantener bloqueo por `report-limit` (10.000 tickets), caché por identidad/negocio/sede/revisión y no compartir resultados entre negocios. No alterar las validaciones que fallan de forma segura.

## 4. Pruebas y criterios de aceptación

- Pruebas Node para `cashReviewPresentation` (o equivalente): cierre pendiente con S/ 196, S/ 100; cierre sin declaración; turno vencido; diferencia +/−; aviso sin excepción; más de 6; orden cronológico; cero; HTML escapado.
- Aserción: solo hasta 6 avisos renderizados, **cero nuevas consultas** a Firestore por la presentación; no se pierden filas en `Auditoría_Cajas` por el recorte visual.
- Reimportar XLSX (por ejemplo con librería ya instalada en tests): valores y formatos correctos, nombre de columna actualizado y 2+ sedes; los datos de octubre deben conservar los totales de muestra.
- Aserción en PDF: no dice «Notificaciones» ni «Alertas operativas» ambiguas, sino «Cajas que requieren revisión»; no etiqueta como conciliado un cierre pendiente; una compensación contable no significa devolución real.
- Pruebas de período hoy/semana/mes/año y sedes `global`/individual, usando solo fixtures; no aumentar lecturas reales ni pruebas de datos de producción.
- Node, Chromium disponible, lint, build/PWA. No instalar nada. No permitir modificaciones silenciosas a pruebas para falsear un PASS. Actualizar aserciones de texto cuando se cambie intencionalmente el encabezado, conservando todas las aserciones numéricas.
- Si se crea un documento `docs/RESULTADOS-P14-REPORTES-CLAROS.md`, registrarlo en la lista exacta de Markdown de `tests/ui-security.test.mjs` si corresponde, sin excluir carpetas enteras ni relajar el control.

## 5. Alcance de archivos y protección marketing

**Permitidos — reportes:** `frontend/src/features/reports/**`, `frontend/src/utils/salesDataProcessor.js`, `frontend/src/utils/excelHelpers.js` (solo si el esquema lo exige), `frontend/src/modules/reports/**` (solo si es necesario), tests de reportes/P14/Excel, `tests/ui-security.test.mjs` **únicamente inventario Markdown**, `docs/RESULTADOS-P14-REPORTES-CLAROS.md`.

**Permitidos — apariencia GLOBAL y solo para esa finalidad:** `frontend/src/shared/styles/theme.css`, `frontend/src/index.css`; `frontend/src/layouts/AppLayout.jsx` **solo si hace falta aplicar el fondo/degradado al contenedor raíz o sidebar**; `frontend/src/BottomNav.jsx` **solo si la navegación móvil necesita armonización de color, sin cambiar rutas ni funcionamiento**. Se permite añadir pruebas visuales/estilos de contraste en `tests/**` relacionadas con estos cambios, sin introducir dependencias. Priorizar la solución con **solo dos archivos CSS**; los otros son excepciones que deben justificarse en el informe.

**Prohibidos:** `marketing/**`, `.agents/**`, `public/**`, vídeos, audios, assets, imágenes, prompts del video, workflows de marketing, `functions/**`, Rules, índices, autenticación, Firestore, ventas, contratos, caja, PWA y cambios a ramas; también `frontend/src/**` **salvo** la lista blanca explícita de reportes y estilos/layout compartidos. No cambiar JSX de negocio, acciones, cálculos, contratos ni dependencias; no modificar `package.json`.

Codex **NO EJECUTA Git/GitHub**, incluyendo `git status`, `git diff`, `git checkout`, `git branch`, `gh`, conectores GitHub, commits o pushes. El propietario seleccionará la rama y hará el commit/push. Codex debe simplemente señalar que está trabajando en `C:\Proyectos\MigaPOS` con la rama esperada `marketing/video-promo-migapos` **según instrucción del propietario**, sin afirmar haberla verificado si no puede hacerlo sin Git.

**Riesgos explícitos:** la rama de marketing contiene cambios del video y cambios del Excel ya implementados; trabajar sobre el árbol local actual, **no restaurar el código antiguo de la rama fix**, no hacer cherry-pick, no copiar directorios completos, no borrar cambios pendientes. Revisar estado de archivos relevantes leyendo el sistema local, no Git. Si el árbol local ya incorpora una corrección, preservarla.

**Entrega:** archivos modificados (solo whitelist), informe PASS/FAIL/BLOCKED con cifras y número de lecturas añadidas (=0), capturas o resultados de reimportación; **comparación visual antes/después en los módulos clave**, auditoría de contraste/overflow y confirmación de ausencia de modificaciones de marketing/Git/despliegues. No declarar listo para producción solo por renombrar columnas o colores.

## 6. NUEVO — Dirección de arte global: crema panadería + nebulosa violeta

### 6.1 Intención de diseño y referencia visual

La captura de referencia adjunta por el propietario presenta **navegación lateral violeta profunda y viva**, selección azul eléctrica, cuerpo **marfil cálido, luminoso y no grisáceo**, tarjetas claras y legibles, y acentos azules/verdes/violetas diferenciados. Ese espíritu debe trasladarse a **todos los módulos de la aplicación sin reescribir sus componentes**: Dashboard, Reportes, POS, Historial, Contratos, Caja, Productos, Categorías, Personal y Ajustes.

**Evitar estos extremos:**
- Gris/lavanda desaturado por toda la página (`--color-canvas: #f4f3fa` actualmente) que hace parecer el POS apagado.
- Blanco puro plano de extremo a extremo que elimina la jerarquía.
- Azul sólido, violeta sólido o degradados saturados en todo el contenido.
- Crema amarillento intenso, fondos marrones, degradados grandes detrás de números, tarjetas de muchos colores aleatorios, transparencias que reduzcan legibilidad.

El lenguaje buscado es **masa de pan / vainilla suave / marfil**, contrastado con **galaxia morada**. Sensación operativa premium, fresca y viva; sin afectar percepción de montos, estados de error o accesibilidad.

### 6.2 Tokens existentes verificados y paleta sugerida (orientativa)

En `frontend/src/shared/styles/theme.css` se encuentra `@theme` con los tokens globales, y `frontend/src/index.css` importa ese archivo y define `html` y `body`. **No inventar un segundo sistema de variables ni duplicar tokens en cada módulo.** Antes de cambiar algo, leer los valores del árbol local actual porque la rama de marketing puede haber avanzado.

| Función | Valor actual en base auditada | Objetivo de color sugerido | Uso |
|---|---|---|---|
| `--color-canvas` | `#F4F3FA` | `#FFF9F1` | fondo general tipo crema/marfil |
| `--color-panel` | `#FFFFFF` | `#FFFEFA` | tarjetas y modales luminosos |
| `--color-subtle` | `#F0F3F9` | `#FFF2E7` | áreas suaves y grupos de filtros, no todas las tarjetas |
| `--color-line` | `#E1E6F0` | `#E8DCD4` | líneas y bordes cálidos, discretos |
| `--color-ink` | `#17213B` | `#261B3D` | títulos y texto principal, contraste alto |
| `--color-muted` | `#627089` | `#60596C` | texto secundario legible |
| `--color-sidebar` | `#211A43` | `#361E60` | color sólido de respaldo del sidebar |
| `--color-sidebar-muted` | `#BAAFCE` | `#E0D3F4` | texto secundario sobre sidebar |
| `--color-primary` | `#4F46C9` | `#5446CE` o preservar el actual | CTA principal; no alterar el significado de estados |
| `--color-accent` | `#7C3FC8` | mantener vivo y coherente | detalles morados, no toda la superficie |
| Tokens de éxito/advertencia/error | existentes | **conservar semántica** | ventas, estados de caja, errores |

Estos valores son **punto de partida**, no órdenes para codificar ciegamente. Ajustar tras medir contraste y revisar capturas. Si `--color-panel` ya es utilizado en tablas densas, el marfil debe ser prácticamente blanco; conservar blanco puro localmente cuando mejore la lectura.

**Sidebar:** se puede usar un degradado **solo en su contenedor**, por ejemplo `linear-gradient(165deg, #301B50 0%, #432470 58%, #512D91 100%)` con fallback en `--color-sidebar`. No insertar gradiente como valor de un token esperado como `background-color` por Tailwind; usar la propiedad CSS adecuada y preservar estados activos/hover, legibilidad blanca y foco visible. La selección actual azul-violeta viva puede mantenerse si pasa contraste. Los iconos deben distinguirse sin cambiar semántica ni rutas.

**Fondo principal:** preferir `--color-canvas` cálido y, si hace falta luz, un **gradiente muy discreto y estático** en el contenedor principal (ejemplo conceptual `linear-gradient(145deg, #FFF9F1, #FFFDF8 60%, #FCF8F6)`), sin grandes radios brillantes, sin movimiento, sin `background-attachment: fixed`. No colocar el gradiente detrás de todos los textos ni afectar contenedores desbordables del POS.

**Acentos secundarios opcionales:** menta pálida `#EAF8F1`, lavanda clara `#F3ECFF`, azul ligero `#EBF1FF`, albaricoque muy tenue `#FFF0DD`. Usar solo en encabezados de sección, bandas de resumen y estados que realmente lo justifiquen. No convertir las tarjetas en arcoíris. Mantener los totales financieros con diferenciación semántica verde/morado/azul, **sin cambiar los importes**.

### 6.3 Estrategia de implementación mínima

1. Identificar el árbol local real y sus variables activas (no asumir que son idénticas al ZIP de auditoría). Mapear **referencias existentes** a `--color-canvas`, `--color-panel`, `--color-subtle`, `--color-line` y `--color-sidebar`.
2. Aplicar primero la paleta a `theme.css`. Revisar `index.css` y el **layout raíz** para asegurar que la pantalla completa, contenido desplazable y vacíos muestren el mismo marfil, sin un rectángulo gris residual.
3. Revisar visualmente navegación lateral, barra móvil, encabezados, cards, modales, tablas y formularios. Cambiar `AppLayout.jsx` o `BottomNav.jsx` **solo si las variables compartidas no son suficientes**, sin modificar lógica de navegación ni montar componentes nuevos.
4. Conservar blanco cálido o blanco en superficies densas (Excel, tablas, modales informativos, inputs) para contraste. No forzar el crema dentro del carrito, la lista de productos, ni dentro de overlays cuando rompa jerarquía.
5. Mantener **el carrito anclado al alto visible**: encabezado, total, medios de pago y botón Cobrar siempre accesibles; solo el listado central hace scroll. La modificación de fondo nunca debe añadir `height`, `padding`, `overflow` o `min-height` que lo rompan.
6. No cambiar CSS de impresión para pintar toda una hoja A4 crema o violeta. El PDF debe imprimirse sobre blanco, con secciones/acento cálido muy tenue, conservar contraste y no consumir tinta innecesaria. Excel mantiene sus propias reglas de estilo.
7. Evitar CSS global con selectores amplios como `div { background: ... }`, `article { ... }`, `!important` generalizado, búsqueda/reemplazo de colores en todos los módulos, y cualquier dependencia nueva.

### 6.4 Heurísticas y criterios de aceptación globales

- **Jerarquía visual:** zona principal marfil; tarjetas ligeramente más claras; bloques funcionales con variación sutil; sidebar violeta reconocible; CTA y estado activo inmediatamente visibles.
- **Coherencia:** Dashboard, POS, Historial, Contratos, Caja, Personal, Ajustes, Reportes, Productos y Categorías se benefician de la misma paleta heredada sin introducir 10 variantes locales.
- **Legibilidad:** texto normal con contraste WCAG AA orientativo ≥4.5:1 y límites/botones/indicadores esenciales ≥3:1; verificar con herramienta automatizada o función de contraste existente. No cambiar el color del texto de importes para hacerlo pastel si reduce el contraste.
- **Responsive:** revisar 375×667, 768×1024, 1280×560 y 1440×900; sin cortes, horizontal scroll accidental, fondos grises fuera de tarjetas o acciones inaccesibles.
- **Estados:** validar hover/focus/active, error, éxito, aviso, disabled, vacío, carga, impresión y accesibilidad con `prefers-reduced-motion`.
- **Rendimiento:** cero consultas SDK nuevas, cero efectos de red para un cambio cromático; evitar assets grandes y efectos CSS de renderizado costoso.
- **Pruebas y evidencia:** capturas **antes/después** en al menos Dashboard, POS, Reportes, Personal/Ajustes y Caja/Contratos si el navegador local está disponible. Para cada módulo, comprobar el fondo, la jerarquía de tarjetas, el sidebar y las áreas con scroll.
- **No tocar marketing:** los cambios se limitan a tokens globales/estilos de aplicación y a la mejora original de reportes. Nada de videos, voz, archivos promocionales, `.agents/**` ni assets de marketing.

### 6.5 Orden de trabajo y prioridad

1. Ajustes originales P14-RC de terminología de Excel y explicación de cajas PDF (**secciones 1–4**, sin cambios financieros).
2. Fondo marfil + sidebar violeta con **tokens compartidos**; máximo alcance CSS/layout autorizado en **sección 5**.
3. Capturas de escritorio/móvil, verificación de legibilidad, regresión de carrito, PDF y tablas.
4. Entrega de `docs/RESULTADOS-P14-REPORTES-CLAROS.md` con apartado **«Ajuste global de identidad visual crema-nebulosa»**, rutas CSS cambiadas, contrastes validados y capturas/mediciones. Distinguir siempre cambios efectuados de sugerencias no implementadas.
