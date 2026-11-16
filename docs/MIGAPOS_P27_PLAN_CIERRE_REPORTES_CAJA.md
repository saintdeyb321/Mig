# MigaPOS P27 · Implementación dirigida (auditoría cerrada)

**Repositorio auditado:** `saintdeyb321/Mig` · rama `fix/migapos-production-readiness` · HEAD `07e56cc` (16/11/2026). **Codex implementa, NO audita.** No usar `git`/`gh`/GitHub, no leer planes anteriores, instalar paquetes, modificar reglas/índices Firestore, hacer commit, push o deploy. No descartar cambios locales.

## Evidencia verificada (sin volver a abrir archivos de referencia)

Se inspeccionaron las capturas, ambos `.xlsx` (XML, celdas, estilos, dimensiones) y el código del HEAD.

| Aspecto | Antiguo K(a)prichitos | MigaPOS actual | Instrucción |
|---|---|---|---|
| Tablas | Encabezado **fila 1**, sin banners introductorios | Encabezado **fila 5**; 4 filas de título/sede/generación/nota | Encabezado fila 1 en hojas tabulares |
| Bordes | **`thin #000000` solo en celdas con dato**; vacías sin bordes personalizados | `#8E8596` en todo `!ref`, incluso celdas vacías | Negro en celdas pobladas; vacías como Excel normal |
| Cuadrícula | Excel por defecto | `showGridLines="1"` (último commit) | **Conservar** cuadrícula visible |
| Diseño | Cabecera melocotón `#FCE4D6`; IDs celeste `#9DE0F6`; estado verde `#A9F08A`; producto amarillo `#FFFFA6`; valores azul `#B4C6E7` | Títulos morados, anchos elevados y filas de 22–65 pt | Recuperar densidad/color del antiguo sin perder datos actuales |
| Detalle | 10 columnas, ticket agrupado, total y separador blanco | 13 columnas más auditoría y datos financieros | Mantener 13 campos pero reducir ancho/alto y ruido visual |
| Ejemplo estructural | `Detalle_sede concepcion`: 110 celdas, 59 con valor, 51 vacías sin borde | `Detalle_Sede Principal`: 351 celdas, 104 con valor, 247 vacías estilizadas | **No materializar/colorear huecos** |

El XLSX actual muestra ingreso neto **S/258.90**, secundaria **S/157.30** + principal **S/101.60**, 12 tickets; auditoría con **+3**, **-43.30**, **0**, **-25.30**, **+32** y «No calculable». Usar estos casos como criterios de regresión, no como constantes. **No copiar** el error financiero del antiguo que sumaba sobrantes a «ingresos reales». Caja, anulaciones y subtotales de artículos NO se agregan como ventas nuevas.

## 1. Quitar tarjeta de vencimiento del POS

**Archivo:** `frontend/src/modules/POS.jsx`.

Eliminar importación y renderizado de `CashRecoveryStatus` (referencia cerca de líneas 17 y 161); desaparecen tarjeta «Cierre por vencimiento · sin arqueo», importes, «Consultar referencia» y botón de lectura/reintento. Si `frontend/src/modules/CashRecoveryStatus.jsx` no tiene otros consumidores, eliminar **solo ese componente de presentación**.

**Intocable:** vencimiento real, `isExpired`, candado, prohibición de ventas, permisos, apertura del siguiente turno mediante la acción ya existente, auditoría y **notificaciones al dueño**. No reemplazar la tarjeta por otra. Conservar alertas de bloqueos operativos independientes.

## 2. Cierre de caja: colores + modal adaptable

**Archivos:** `frontend/src/modules/CashRegisterModals.jsx`, `frontend/src/index.css`.

En `CashCountSummary`, el `resultTone` actual (~línea 25) está **invertido**:

| Resultado verificado | Etiqueta | Estilo |
|---|---|---|
| `difference < 0` | `Faltan S/…` | `border-danger/30 bg-danger-soft text-danger` (ROJO) |
| `difference > 0` | `Sobran S/…` | `border-warning/30 bg-warning-soft text-warning` (ÁMBAR) |
| `difference === 0` | `Coincide` | `border-finance-line bg-success-soft text-success` (VERDE) |
| Provisional/no verificado | `Por revisar` | Advertencia ámbar; no declarar cuadre confirmado |

No invertir signos ni modificar `calculateClose`, `confirmClose`, observaciones obligatorias o contabilidad.

En `index.css` existe `.cash-confirm-dialog { height: min(42rem, calc(var(--ui-viewport-height,100dvh) - 1.5rem)); }`: **altura fija es la causa del enorme hueco blanco**. Cambiar a altura **intrínseca** (`height:auto`) y `max-height` con el mismo límite seguro. En **ese** diálogo quitar `flex-1` de formulario/fieldset/cuerpo cuando lo fuerza a llenar el máximo. `details` cerrado → modal compacto; abierto → crece hasta el máximo y solo el contenido central tiene scroll; cabecera, botones y safe areas visibles. No modificar `shared/ui/Dialog.jsx` global ni otros modales.

## 3. Descargas siempre GLOBAL (no filtro por sede)

**Archivos:** `frontend/src/features/reports/hooks/useExportSales.js` y texto en `frontend/src/modules/ExportSales.jsx`.

- En **exportación Excel/PDF únicamente**, usar `branchId = 'global'` para `sessionReportReads`, agregación, view model, libro, PDF y claves de snapshot/caché. **Ignorar `activeBranchId` del selector operativo**, NO ignorar `filter` de período (`hoy/semana/mes/año`).
- El XLSX incluye resumen global, comparativa y **una pestaña de detalle por cada sede**. Una solicitud de exportación → un conjunto de lecturas globales, no descargas separadas por sucursal.
- Actualizar microcopy a «Todas las sucursales · Un archivo incluye todas las sedes». Seleccionar otra sede NO debe reiniciar/cancelar el caché de exportación. Sí invalidarlo al cambiar `businessId`, identidad, revisión o caducidad. Reutilizar el snapshot entre PDF y XLSX del mismo período.
- **Seguridad:** respetar permisos existentes; si un rol no puede leer alcance global, mostrar error de autorización, jamás descargar silenciosamente datos parciales ni cambiar Rules. No tocar POS/caja/vistas por sede.

## 4. Corregir `data-read · report-timeout` y evitar lecturas repetidas

**Archivos:** `frontend/src/features/reports/application/sessionReportReads.js`, `frontend/src/features/reports/hooks/useExportSales.js`; pruebas directas.

**Causa identificada:** `REMOTE_TIMEOUT=30000` envuelve `exportSnapshot` entero, que hoy espera **ventas primero** y solo después carga **pagos, contratos, anulaciones y cajas**. El timeout de 30 s es del guard local, **no prueba** un índice faltante ni cuota agotada.

**Cambio elegido (no investigar alternativas):**

1. En `exportSnapshot`, para **hoy/semana**, leer ventas, pagos, contratos, anulaciones y sesiones **una sola vez** con `Promise.all` acotado; conservar todas las validaciones y comprobaciones de integridad. En **mes/año conservar `sales()` primero** como gate para rechazar períodos >10 000 tickets sin disparar lecturas complementarias innecesarias.
2. Introducir timeout dedicado a `data-read` (**máximo de seguridad ~90 s**, otros guardias siguen como hoy), junto con concurrencia y caché; **no presentar aumento de timeout como optimización por sí solo**. Conservar indicador de etapa/errores específicos y mediciones de fase solo DEV.
3. Actualmente el `AbortController` del intento protege la espera pero los lectores usan `resources.signal`. Asegurar que cambio de identidad/cancelación invalide el intento y que un reintento **no cree dos lecturas activas idénticas**. Dedupe de lectura en curso por negocio + global + período + revisión, sin asumir que cancelar un Promise anula el cobro de Firestore. Evitar `discardSnapshot` prematuro mientras las consultas siguen en curso.
4. Preservar paginación/indexes existentes, límites de 10 000 movimientos y 500 contratos históricos; jamás exportar parcial, duplicar ventas o reembolsos. Si `groupedTicketRows` supera el presupuesto por filas de TOTAL/separadores, **rechazar claramente** o tratar el límite expandido de forma segura, no truncar datos.

**Costo:** una descarga global evita 2–3 solicitudes por sedes, pero Firestore sigue cobrando documentos leídos; el cache caliente debe evitar **nuevas** consultas. No prometer latencia garantizada en redes lentas.

## 5. Rediseño XLSX como antiguo; datos del nuevo

**Archivos:** `frontend/src/utils/excelHelpers.js`, `frontend/src/features/reports/application/salesWorkbook.js`. Otros archivos solo si una referencia directa impide compilar.

### Reglas exactas

- En **todas las hojas tabulares** (`Auditoría_Cajas`, `Comparativa_Sedes`, `Productos_Global`, `Productos_Sedes`, `Detalle_*`, `Resum_*`, `Estado_Pedidos`, `Auditoría_Pedidos`): **fila 1 = encabezados de columna**; eliminar las cuatro filas de `title/context/generated/note`, fusiones decorativas y notas extensas superiores. No mostrar «Generado» en **ninguna** hoja. Conservar negocio, período y alcance **una sola vez** en `Resumen_Financiero`; generación/período en `workbook.Props`/metadatos y período en filename.
- Cabeceras: `#FCE4D6`, texto oscuro, negrita, `thin #000000`, altura **23–27 pt**. Filas de datos **18–21 pt**; totales **20–23 pt**; separador libre **8–10 pt**. Fuente 10–11 pt. No usar filas de 50–65 pt por pagos mixtos/observaciones; datos textuales completos permanecen en las celdas, con texto visualmente ajustado a un máximo razonable (2 líneas).
- **Solo celdas con valor**: bordes `top,bottom,left,right` `thin #000000`. En huecos, NO `sheetCell()` artificial, NO estilos `fill/border` (ni siquiera blanco), dejando la cuadrícula nativa Excel (`showGridLines="1"`). Mantener `!ref` correcto y `!cols/!rows` solo para rangos utilizados. No activar `showGridLines="0"`.
- Color solo donde comunica significado: fecha/ref `#9DE0F6`; completada `#A9F08A`; producto `#FFFFA6`; cantidad, precio y subtotal `#B4C6E7`; efectivo verde; Yape/Plin lila; mixto celeste; anulada gris; **faltante rojo / sobrante ámbar**. Evitar pintar filas enteras, bordes tenues y bloques vacíos de color.
- Anchos máximos orientativos de `Detalle_*` (en caracteres): `Fecha 12`, `Hora 10`, `Referencia 18`, `Estado 14`, `Medio pago 20–24`, `Producto 30–35`, `Cantidad 10`, `Precio 14`, `Subtotal 15`, `Importe movimiento 17–19`, `Responsable 17–20`, `Movimiento 18–21`, `Observaciones 30–36`. Conservar **todos** los campos modernos; abreviar rótulos visibles si procede, **sin cambiar claves del dominio**. Fecha/hora compactas; no ensanchar por contenido arbitrario.
- **Ticket:** primera fila con metadatos, siguientes artículos con esos campos en blanco, `TOTAL TICKET` junto al subtotal, **una** separación blanca baja por ticket. No duplicar importe cobrado con subtotal de artículos. Mantener ajustes/anulaciones, métodos mixtos y rastreabilidad.
- Resumen: dos columnas compactas, bloques espaciados, conservando ingresos netos, ventas POS, pagos de pedidos, canales, tickets, anulaciones, caja y advertencias **solo cuando aplican**. Fondo inicial y diferencias fuera de los ingresos. `0`, vacío y «No calculable» distintos. Importes numéricos `S/ #,##0.00`, cantidades enteras, seriales de fecha Lima, seguridad contra fórmulas `= + - @`.
- **Autofiltro solo en hojas planas**. `Detalle_*` agrupado **sin filtro** (un filtro por artículo deja totales huérfanos). Congelar cabecera en **fila 1**. No modificar representación de PDF salvo globalización.
- Puede añadirse `layout:'compact'` a `createSheet` para no afectar otros consumidores. Conservar `writeSalesWorkbook`, límites, estructura de hojas, compatibilidad `xlsx-js-style` y caché.

## 6. Pruebas concretas, sin exploración

**Modificar solo tests relacionados:** `tests/helpers/reportWorkbook.mjs`, `tests/reports.test.mjs`, `tests/excel-export.browser.test.mjs` + fixtures y pruebas UI caja/POS existentes. El antiguo `assertWorkbookBorders` obliga estilo en TODA celda del rectángulo: cambiarlo para exigir **borde negro en cada celda poblada y ningún borde/relleno artificial en vacías**, verificando XML real y `showGridLines=1`.

1. XLSX real: cabeceras tabulares en fila 1, sin filas `Generado`, anchos moderados, totales agrupados, separadores libres, hojas por sede, autofiltros solo donde son seguros, Excel numérico, `No calculable` preservado y fórmulas maliciosas literales.
2. Reconciliación de muestra equivalente: **157.30 + 101.60 = 258.90**, 12 tickets, caja positiva/negativa/cero sin sumar diferencias al ingreso, sin doble contabilización de `TOTAL TICKET`/pedidos.
3. Exportar con selector operativo en sede A y B da **mismo global**, una ronda de fuentes; switching entre sedes y PDF→Excel reutiliza snapshot, cambio de negocio no. Prueba caso con numerosas ventas, timeout/reintento sin lecturas duplicadas, año >límite sin lecturas secundarias.
4. Caja: falta `-43.30` **rojo**, sobra `+3` **ámbar**, `0` **verde**, provisional **advertencia**. Modal ajustado en 375×667/1440×900, detalles cerrado/abierto, scroll sin recortes. POS sin tarjeta ni «Consultar referencia», pero bloqueo por vencimiento y notificación al dueño conservados.

**Ejecutar:** `npm run test:reports`; `node --test tests/excel-export.browser.test.mjs`; pruebas UI relevantes de caja/POS; `npm run check:build` y build/lint ya disponibles si corresponde. No instalar dependencias ni lanzar suite completa de emuladores. Reportar pruebas no ejecutables sin afirmar éxito.

## Orden y entrega

**A)** POS → **B)** colores/modal → **C)** global → **D)** lecturas → **E)** XLSX → tests. Cambios mínimos, sin reescritura financiera/Firestore/arquitectura general, sin cambios en notificaciones reales. **Salida Codex: máximo 12 líneas** con archivos, resultados de comandos y límites; **ninguna** operación git/gh, commit o despliegue.
