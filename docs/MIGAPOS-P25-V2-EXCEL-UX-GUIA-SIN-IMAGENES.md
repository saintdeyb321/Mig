# MigaPOS · P25-V2 — Excel gerencial intuitivo (especificación textual para Codex)

**Objetivo:** mejorar las hojas **XLSX existentes** de MigaPOS para que un dueño de pastelería comprenda las cifras en segundos. **No enviar capturas, imágenes, archivos Excel antiguos ni este chat a Codex.** Esta especificación contiene lo necesario. **Prioridad:** legibilidad y exactitud, no sumar columnas o colores porque sí.

**Rama:** `fix/migapos-production-readiness` · **Base remota inspeccionada:** `ecfd410a1f918656e1a9f5d07659cb9c8153fa31` (CI Success). **Comprobar HEAD y estado local antes de editar**; los cambios locales más recientes tienen prioridad. Esta P25-V2 **sustituye las indicaciones de diseño XLSX de P25 anterior** cuando divergen: **NO sustituir** la hoja visual de tickets por una lista plana; los tickets se presentan agrupados. El problema PDF de «Etapa integrity» sigue siendo una regresión que debe verificarse, pero no autoriza rehacer PDF ni aumentar el timeout arbitrariamente.

## 1. Comportamiento visual requerido (sin fotografías)

**Reglas generales para todas las hojas:**

1. Encabezados comprensibles, breves, en castellano: «Ingreso neto», «Ventas de mostrador», «Pagos de pedidos», «Efectivo», «Yape / Plin», «Tickets», «Sede», «Estado», «Detalle», «Responsable». Eliminar jerga visible como `ledger`, `compensación POS`, `sourceId`, `snapshot`, `total comercial de referencia` del **resumen principal**; el detalle/auditoría puede mostrar una nota corta y precisa cuando haga falta.
2. Encabezado de columnas: fondo **morado profundo** `#3E2C63`, texto **blanco**, negrita, altura 30–34 pt. Subtítulos de sección y títulos visibles; no usar encabezados gigantes ni colores saturados.
3. Paleta semántica **suave y constante** (definir constantes en un único sitio):
   - **Efectivo / monto efectivamente registrado:** verde menta `#C7F2D6`; verde fuerte solo para texto de cifras importantes `#166534`.
   - **Yape / Plin:** lila `#E9DEF8`.
   - **Pago mixto:** celeste `#CDEBFA`.
   - **Identificación de fecha/ticket/sede:** celeste pálido `#BDE7F5`.
   - **Producto / artículo:** crema-amarillo `#FFF5C2`.
   - **Total ticket / total neto:** verde suave `#C7F2D6`, texto verde oscuro en negrita.
   - **Advertencias / por verificar:** ámbar claro `#FFF0BF`.
   - **Faltante real confirmado:** rojo pastel `#FBDADA`; negativo en negrita.
   - **Bordes:** gris suave `#E0DDE7`; separadores **blancos sin borde intenso**; texto normal `#30243F`.
   - **Movimientos anulados:** gris pálido `#F2F1F5`, sin ocultarlos.
4. **Espacios y agrupaciones con intención:** una fila blanca vacía entre grupos (tickets, sedes, bloques de resumen); no repetir fecha, hora, número de ticket, responsable, estado o medio de pago en las filas de artículos que pertenezcan al mismo ticket. **Las celdas visibles quedan vacías**, sin merged cells innecesarias ni texto repetido. No generar cientos de separadores para listados extensos: máximo una fila por grupo.
5. Alinear texto a la izquierda y números a la derecha, importes como **números Excel** (formato `"S/" #,##0.00;[Red]-"S/" #,##0.00`), cantidades enteras, fechas/hora numéricas y seriales Lima. `0` debe distinguirse de «No declarado», «No verificable» y «Sin arqueo».
6. Anchos **controlados** (nunca 55–65 caracteres por defecto ni truncar nombres habituales); preferir 10–34, excepcionalmente observaciones hasta 44, `wrapText` solo cuando aporta. Alturas de filas normales ~22–26 pt; título ~32 pt; notas breves ~28–38 pt. Sin columnas técnicas visibles que no aporten al negocio.
7. Los resúmenes/hojas de lectura **no necesitan autofiltro**. En hojas planas de auditoría sí dejar filtros y encabezado congelado. **NO aplicar autofiltro a un rango que mezcle tickets agrupados con filas blancas o filas «TOTAL TICKET»**, porque filtrar una cabecera puede dejar artículos huérfanos; en `Detalle_<sede>` priorizar la lectura agrupada sobre el filtro. Mantener filtros solo en otras hojas tabulares si la semántica sigue siendo válida.
8. Asegurar que abrir en Excel o visor compatible no convierta textos de productos que empiezan con `= + - @` en fórmulas. Mantener protección actual `cell.t='s'`, sin `cell.f` ni enlaces inyectados. No añadir emojis si el motor de fuentes no los representa correctamente: preferir títulos en texto; iconos son opcionales.
9. En todo el libro, visible y persistente: **nombre de sede o «Todas las sedes»**, período, fecha generada y (si hay dato antiguo/provisional) nota corta de conciliación. Sin bloquear la lectura con párrafos técnicos.
10. Conservar los nombres de hojas existentes si es posible y **no agregar otras únicamente para colores**. Mantener `xlsx-js-style`, freeze, filtros donde correspondan, ZIP válido y descarga. Nada de dependencias ni consultas nuevas.

## 2. Definición por hoja: seis referencias antiguas traducidas a hojas actuales

### Hoja 1 · `Resumen_Financiero` — la primera hoja es un tablero, no una tabla genérica

**Distribución 2 columnas A/B, sin autofiltro.** Ancho A aprox. 43–49; B 22–26. Orden recomendado, usando referencias de datos (no importes fijos):

```text
A                           | B
RESUMEN DEL NEGOCIO         | [periodo]
Alcance                     | [nombre de sede / Todas las sedes]
Fechas                      | [desde] al [hasta]
Generado                    | [fecha-hora Lima]
[BLANCO]
INGRESO NETO REGISTRADO     | S/ ...           [VERDE]
[BLANCO]
VENTAS DE MOSTRADOR        | S/ ...           [CELESTE]
  Efectivo                  | S/ ...           [MENTA]
  Yape / Plin               | S/ ...           [LILA]
[BLANCO]
PAGOS DE PEDIDOS           | S/ ...           [AMARILLO]
  Efectivo                  | S/ ...           [MENTA]
  Yape / Plin               | S/ ...           [LILA]
[BLANCO]
TICKETS COMPLETADOS        | [número]
PAGOS DE PEDIDOS           | [número]
TICKETS ANULADOS           | [número, ROJO si >0]
[BLANCO]
CAJAS QUE REQUIEREN REVISIÓN | [cantidad real, si disponible]
Sobrante confirmado        | S/ ... o «Sin datos verificados»
Faltante confirmado        | S/ ... o «Sin datos verificados»
[nota corta opcional]
```

- «Ingreso neto registrado» = POS neto + movimientos netos de pedidos, **no utilidad**, y no se suman sobrantes ni fondos iniciales.
- Mantener canales efectivo + digital iguales al neto según el dominio. Si hay reembolsos/compensaciones, incluir un **mini-bloque secundario** de «Ajustes contables» con valores firmados, sin desplazar los números clave a la parte baja.
- NO generar filas de conceptos financieros de dominio para cada combinación canal/tipo en la portada; trasladar ese nivel de auditoría a hoja existente adecuada. No prometer «dinero realmente disponible» a partir de datos contables.
- **Ejemplo ilustrativo del usuario** (NO hardcodear): alcance «Todas las sedes», neto `S/ 225.00`, mostrador `S/ 225.00`, efectivo `S/ 134.00`, Yape/Plin `S/ 91.00`, pedidos `S/ 0.00`, tickets `9`. Es una referencia visual histórica, no el resultado de cualquier otro período.

### Hoja 2 · `Auditoría_Cajas` — estados auténticos y diferencias verificables

Columnas claras: **Fecha | Turno / hora | Sede | Cajero | Fondo inicial (S/) | Efectivo esperado (S/) | Efectivo contado (S/) | Diferencia (S/) | Estado | Observaciones** (ajustar según qué campos están realmente disponibles sin consultas nuevas).

- Un turno abierto NO está «Cuadrado»: mostrar **«En curso»**. Una apertura sola **no tiene efectivo contado** ni diferencia calculable.
- Un turno `expired_unreconciled` se muestra **«Vencido sin arqueo»**, con hora real límite. Referencia calculada SOLO cuando verificada; contado real «No declarado»; diferencia «No calculable». No inventar «cerrado por olvido (>18h)» si el límite real es 10/14 horas; no fingir cierre con conteo.
- Un cierre arqueado y confirmado puede mostrar «Cuadrado», «Sobrante» o «Faltante». Pintar diferencia en verde/ámbar/rojo según estado, no solo por signo sin evidencia.
- Se pueden separar visualmente turnos (borde superior o una fila blanca) **solo si no rompe el autofiltro**. Preferible continuidad de la tabla y banda de borde tenue por cambio de sede/turno cuando necesite filtro.
- No sumar sobras/faltas de cajas para producir «Ingreso real» del negocio: son diferencias de arqueo, no ventas.

### Hoja 3 · `Comparativa_Sedes` — comparar sin engañar

Solo para vista global con varias sedes. Encabezados: **Sede | Tickets | Ventas mostrador (S/) | Pagos de pedidos (S/) | Ingreso neto (S/) | Diferencia de caja confirmada (S/)** (última solo si verificable).

- El usuario antes tenía «Taller: 6 tickets, S/157 ventas; sede concepción: 3 tickets, S/68». Conservar esa legibilidad, pero **NO renombrar ventas + sobrante a «Ingreso real»**. Si la última columna no puede verificarse, omitirla o mostrar «Sin arqueo», nunca `0` inventado.
- Fila **TOTAL NEGOCIO** al final en banda verde, fuera del autofiltro si es fila calculada de presentación. Sumar usando métricas contables ya disponibles, no volver a leer la BD.
- Si una sede no tuvo movimientos, mostrar `0` real con etiqueta, sin ocultarla cuando el alcance global y el inventario de sedes estén disponibles.

### Hoja 4 · `Productos_Global` — productos vendidos

Encabezados: **Producto | Unidades netas | Importe neto (S/)**.

- Columna producto amarillo suave; importe en verde pálido. Ordenar por unidades netas desc, empate por importe y nombre de forma estable. Nombres legibles y número de unidades, no IDs internos.
- Productos anulados/compensados deben descontarse según `model.products`; no sumar ventas POS anuladas como producto vendido. No mezclar artículos de pedidos especiales si el sistema solo tiene detalle POS.
- **Ejemplo visual**: `asd 9 u. S/9`, `123a 6 u. S/138`, `123 5 u. S/10`, `asdf 4 u. S/12`, `gd 4 u. S/56` (solo ilustración).

### Hoja 5 · `Productos_Sedes` — bloques por sucursal

Columnas: **Producto | Sucursal | Unidades netas | Importe neto (S/)**; ordenar por sede, luego unidades descendentes.

- Mostrar el nombre de sede solo en la primera línea del bloque o en un título corto encima de la tabla; el resto de celdas de sede del mismo bloque puede quedar **visual y voluntariamente vacío**. Una fila blanca entre sedes.
- **Si esto rompe el autofiltro**, elegir uno de dos diseños y comprobarlo en pruebas: (A) *vista agrupada* sin autofiltro y celda sede vacía repetida, o (B) *tabla filtrable* con sede en cada fila pero bandas visuales por grupos, sin separadores dentro del rango. **No combinar celdas vacías de agrupación con autofiltros que hagan imposible filtrar por sede.** Preferir (A) para la vista gerencial y conservar una hoja de movimientos plana filtrable para auditoría si ya existe.
- Colores pastel: producto amarillo, sede celeste, números alineados y agrupación nítida.

### Hoja 6 · `Detalle_<sede>` — reproducción fiel del patrón intuitivo de tickets

**Conservar como vista visual agrupada, NO reemplazarla obligatoriamente por una fila por movimiento y artículos en otra hoja.** Encabezados, por ejemplo:

**Fecha | Hora | Ticket / referencia | Estado | Medio de pago | Producto | Cantidad | Precio unitario | Subtotal (S/) | Observaciones**. Conservar «Responsable» si disponible, pudiendo ubicarlo al final sin sacrificar legibilidad; no mostrar IDs técnicos gigantes.

Patrón por ticket POS, con las celdas de identidad SOLO en primera fila:

```text
Fecha    Hora  Ticket  Estado  Pago                 Producto Cant. Unitario  Subtotal
15/11    22:20 A720.. COMPLETADA MIXTO (Ef 22 / Yp 31) 123      1     2.00       2.00
[blanco en columnas Fecha..Pago]                        123a     2    23.00      46.00
[blanco en columnas Fecha..Pago]                        asd      2     1.00       2.00
[blanco en columnas Fecha..Pago]                        asdf     1     3.00       3.00
[blanco en columnas Fecha..Pago]                                   TOTAL TICKET  S/ 53.00
[UNA FILA BLANCA SEPARADORA]
[siguiente ticket: nueva fila de identidad y artículos...]
```

- Color **EFECTIVO verde, YAPE/PLIN lila, MIXTO celeste** en celda de pago. Estado completada verde. Producto amarillo pastel. Subtotales pálido azul. Banda `TOTAL TICKET` verde intenso **solo en etiqueta y valor**, nunca como una segunda venta.
- `TOTAL TICKET` debe ser igual al importe del ticket, incluyendo el caso MIXTO, pero no necesariamente igual a los cobros de otro día/periodo. Usar los importes ya calculados y verificados. **No insertar una fila adicional de importe financiero sumable en el mismo rango de venta**.
- Un ticket vacío de artículos no puede generar un total válido; conservar `assertPosReportDetail` o rechazo seguro existente. Para tickets anulados, nunca mostrar «COMPLETADA» ni ingreso positivo; conservar estado, descuento y advertencia según evidencia.
- Pagos/adelantos/reembolsos de pedidos (sin detalle POS) se muestran **como una fila operativa separada**, con referencia a pedido, método, importe neto firmado y responsable; no se inventan artículos ni se los agrupa como tickets POS.
- El `Importe movimiento` que hoy se ubica en la primera fila no debe desaparecer sin sustitución: o mantener una columna **«Importe neto movimiento (S/)»** (solo fila primaria, sin repetir el valor en subtotal ni fila total) o exponer una hoja `Movimientos` plana si ya existe; garantizar conciliación, legibilidad y pruebas. **Nunca sumar a la vez totales de tickets y subtotales de artículos**.
- Priorizar lectura humana: sin autofiltro en la hoja visual de grupos si Excel no mantiene la integridad de cada grupo al filtrar. Los controles de auditoría de operaciones deben continuar verificables en hojas existentes.

## 3. Otras hojas actuales que deben mantenerse

- `Estado_Pedidos`: pedido, cliente, estado, total del pedido de referencia, pagado, saldo; colores suaves por estado, distinguir lo adeudado.
- `Auditoría_Pedidos`: cobro/adelanto/reembolso por operación (una fila cada uno), método y responsable, signo correcto; mantener **autofiltro**.
- `Resum_<sede>`: si el período usa agregados diarios en vez de tickets, tabla compacta con Fecha, POS, Pedidos, Efectivo, Yape/Plin, Total neto, Tickets, Anulados; encabezado congelado, columna Fecha real, orden cronológico, números y filtros correctos. No mezclar estos agregados con desglose individual no consultado.
- `Auditoría_Cajas` y demás hojas históricas existentes con datos deben seguir presentes y conciliar; sin crear hojas vacías ni cambiar nombres técnicos reconocidos por tests salvo justificación.

## 4. Arquitectura permitida y archivos exactos

**Leer y modificar solo lo necesario:**

- `frontend/src/features/reports/application/salesWorkbook.js` — composición de hojas, orden, resumen por secciones y generador de detalle agrupado.
- `frontend/src/utils/excelHelpers.js` — tokens cromáticos, renderizados reutilizables, alturas, bordes, freeze, filtros, separación **con soporte para estilos por fila/por grupo**; no usar un único estilo de tabla para todo.
- `frontend/src/utils/salesDataProcessor.js` — **solo si hace falta** devolver metadatos de grupo para `Detalle_<sede>`; no modificar el algoritmo de netos.
- `frontend/src/features/reports/application/reportViewModel.js`, `cashAuditRows.js` — **solo si faltan campos derivados** que ya existen en datos consultados; no volver a leer.
- `frontend/src/features/reports/application/contractLedgerReport.js` — únicamente para etiquetas de la auditoría de pedidos si fuese imprescindible.

**Leer sin modificar salvo fallo demostrado:**

- `frontend/src/features/reports/domain/reportTotals.js` (`aggregateReport`, `assertPosReportDetail`, `reconcilePosRows`): **NO tocar lógica financiera**.
- `frontend/src/features/reports/hooks/useExportSales.js`, `application/sessionReportReads.js`, `infrastructure/sessionReportReads.js`, `reportExportCache.js`, `excelModule.js`: no crear nuevas consultas ni invalidar caché por diseño.
- `frontend/src/features/reports/application/managementReportHtml.js`, `frontend/src/modules/ExportSales.jsx`: fuera del rediseño XLSX; **mantener prueba PDF semanal** para detectar el fallo pendiente de «Etapa integrity». Si el error se reproduce, describirlo y reparar solo la causa verificada dentro de su archivo, sin rehacer los reportes de PDF por estética.

**Pruebas a modificar/agregar:** `tests/reports.test.mjs`, `tests/plan13.test.mjs`, `tests/plan14.test.mjs`, `tests/excel-export.browser.test.mjs`, `tests/excel-export.fixture.jsx`; más `tests/plan14-read-cost.test.mjs` solo si cambian consultas (no deberían).

**Prohibido:** editar `firestore.rules`, `firestore.indexes.json`, POS, caja, contratos de negocio, autenticación, PWA, textos legales, módulos de venta ni librerías instaladas. No hacer commit, push ni deploy.

## 5. Invariantes de seguridad, contabilidad y performance

1. Los **valores se calculan por dominio y se pintan por presentación**. Mantener signos, `S/`, 2 decimales, fechas Lima, identidad `businessId`/`branchId`, `voids`, `refunds`, pagos mixtos, y no duplicar importes. `netRevenue === posRevenue + contractRevenue`, y el desglose cash + digital concilia según reglas actuales.
2. **Sobrantes/faltantes confirmados** no se suman a ventas. Un cierre de caja vencido SIN arqueo no puede ser «cuadrado». No presentar «efectivo contado = fondo inicial». Si falta evidencia, texto «No declarado» o «No calculable», no cero ficticio.
3. El XLSX se genera **exclusivamente con el snapshot ya leído**: nada de consultas extra para colores, nombres o cortes visuales. Mantener TTL, límites 10.000/500 y cachés por identidad/sede/período.
4. Mantener seriales Excel de fecha/hora, número real (no string `S/`), validación de datos finitos, textos escapados contra fórmulas, nombres de hojas únicos y `writeSalesWorkbook` congelación de encabezados y ZIP sin corrupción.
5. En modo agregados mes/año no inventar tickets individuales no descargados. Los nombres de producto no se repiten si ya están representados por línea. Evitar celdas fusionadas dentro de datos filtrables.
6. **No desactivar ni alterar validaciones financieras** para que pase un ejemplo visual. Cuando un dato histórico esté pendiente de conciliación, dejar advertencia visible en hoja y mantenerlo provisional.
7. Rendimiento: usar transformaciones lineales por ticket/sede; memoria y bytes acotados; no duplicar 10.000 filas para conseguir grupos. No insertar una fila en blanco por cada artículo, solo por ticket, y omitirla en períodos masivos si supera límites de salida.

## 6. Pruebas y artefactos de aceptación (obligatorios)

- Construir fixture sin datos privados: vista global y dos sedes con 9 tickets y POS S/ 225.00 (= 157 + 68), cash S/134, digital S/91; una venta mixta S/53 (Ef 22 / Yape 31), otro ticket S/24 y uno S/29. **Estas cifras solo orientan el formato**; no rellenar datos de producción ni hardcodear valores en exportador.
- **Importar el XLSX generado** con la misma biblioteca del proyecto, inspeccionar: orden y nombres de hojas, números y fechas Excel, colores/fills, tamaños, freeze, filtros, filas vacías **dentro y fuera** del rango, grupos por ticket, totales en una sola celda, protección de `=1+1` y títulos sin truncamiento.
- Para `Detalle_<sede>` verificar: fecha/hora/ticket/pago solo en primera fila; subtotales de cada artículo; total solo al terminar grupo; exactamente una separación blanca entre grupos; mezcla Ef/Yape con color celeste. El conteo de tickets debe depender del dominio, NO del número de filas.
- `Auditoría_Cajas`: apertura sin arqueo, expiración sin conteo, cierre confirmado cuadrado/sobrante/faltante; sin diferencia calculable fabricada. `Comparativa_Sedes`: total 157+68=225, sin sumarle sobrantes.
- `Productos_Global`: netos por producto; `Productos_Sedes`: sedes legibles sin repetición inútil y sin filtros rotos.
- **Prueba visual real**: abrir o renderizar XLSX generado en un visor compatible del entorno y guardar capturas en `.release/qa-p25-excel/` de las 6 hojas (sin pasar imágenes por el prompt de entrada). No basta `cell.s` en JSON. Corregir cortes/desbordamientos. **No agregar capturas al repo.**
- Regresión PDF semanal: abrir vista previa con fixture y garantizar que no aparece timeout en fase integrity. Si falla, localizar causa por fase y registrar aparte la reparación mínima antes de dar informe «PASS»; no falsear el test.
- Escenarios: sin ventas, 1 ticket, 9 tickets, muchas filas, tickets anulados/compensados, pedidos y reembolsos, nombres largos, `=1+1`, 2 sedes, datos faltantes.
- Pruebas locales relevantes y build:

```powershell
node --test tests/reports.test.mjs tests/plan13.test.mjs tests/plan14.test.mjs
node --test tests/excel-export.browser.test.mjs
node --test tests/plan14-read-cost.test.mjs
npm run lint --prefix frontend
npm run release:build -- --env production
npm run check:build
git diff --check
```

- Conserva pruebas preexistentes y actualiza **solo** expectativas de presentación cuando cambien nombres/posiciones de columnas. No rebajar asserts de montos, fechas, seguridad, anomalías ni filtros. Si CI exige otras regresiones, ejecutarlas una vez; no repetir suites globales sin necesidad.

## 7. Entrega y criterios de cierre

1. `Resumen_Financiero` al abrir: los números clave en primer plano, colores con significado y filas de separación; sin 25 líneas técnicas.
2. `Detalle_<sede>` idéntico en **patrón visual** a los ejemplos, con grupos de tickets, total verde y espacio blanco; sin repetir identidad en cada artículo.
3. Productos/sedes/caja: tabla gerencial coherente; sin estados inventados ni «Ingreso real» derivado de sobrantes.
4. XLSX válido, reimportable, abierto visualmente, cifras conciliadas, pruebas y build verdes, sin lecturas nuevas.
5. P25-V2 NO incluye rediseño de frontend completo. Sin commit/push/deploy. Muestras y capturas locales en `.release/qa-p25-excel/` sin datos privados; resumen final **máximo 12 líneas**, indicando archivos, pruebas, 1–2 métricas de rendimiento si están medidas y bloqueantes.
