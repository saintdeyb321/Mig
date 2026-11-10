# MigaPOS · PLAN 14-UX FINAL — Informe gerencial PDF, Excel entendible y exportación bajo demanda

**Fecha:** 09/11/2026 · **Prioridad:** cierre de usabilidad e integridad antes del piloto · **Alcance:** UX de informes, reutilización de lecturas, impresión/descarga y proyección de datos legibles.

> **Límite de esta auditoría.** El código P14 se informó como modificado **en local**, aún no publicado en GitHub. La evidencia visual y los resultados reportados por Codex son información del propietario, no sustituyen revisar los archivos locales exactos. El último código público inspeccionado sigue siendo `fix/migapos-production-readiness` en `c8219a8` («Correccion Excel»). Codex debe localizar las implementaciones nuevas P14 en disco antes de editar.

## 0. Decisión de producto

**Una sola experiencia de informes, con dos salidas según finalidad:**

- **Informe visual (recomendado)**: documento gerencial breve, útil para imprimir/guardar PDF y compartir con el dueño. No es un dump de datos.
- **Detalle Excel**: herramienta de revisión, auditoría y filtrado de movimientos. Mantener hojas por sucursal, comparativa y el detalle que aporta valor.
- **Un único selector de período** `Hoy | Semana | Mes | Año`, un único selector de tipo `Informe visual | Detalle Excel`, **un solo botón principal** contextual: `Preparar informe PDF` o `Descargar detalle Excel`.
- **Cero consultas por montar la pantalla, cambiar fecha, cambiar tipo, desplegar detalles o cerrar un diálogo.** Consultar solo ante la intención explícita de generar. No tener dos widgets rivales que consulten cada uno por su cuenta.
- Tras generar una vez, repetir el mismo alcance **reutiliza snapshot y artefacto preparados** hasta caducar o invalidarse. No afirmar que el navegador guardó el archivo porque se abrió el cuadro de impresión.

**No reemplazar Excel por PDF.** Cada uno responde a una pregunta distinta. **No instalar nuevos frameworks o librerías** sin demostrar que las herramientas actuales son insuficientes. `.agents/skills/ui-ux-pro-max` ya está disponible para guiar UX; Tailwind/CSS y `printDocument.js` bastan inicialmente para informe A4.

## 1. Auditoría de la evidencia actual

### 1.1 Problema visual en la captura PDF

- Documento estrecho, tipografía pequeña, seis métricas con poca jerarquía, demasiados párrafos y líneas, espacio vacío exagerado y posible segunda página innecesaria.
- Datos `S/ 0.00` no tienen un estado vacío interpretativo; para un dueño parece una tabla sin contenido.
- No hay comparación de sucursales o visualización de ingresos por canal en formato escaneable; las advertencias contables dominan la lectura.
- El encabezado/pie técnico del navegador (`localhost:5173`, fecha, `1/2`) no representa una composición profesional. El navegador puede agregarlo mediante la opción de encabezados y pies de página; el diseño debe explicar cómo deshabilitar esos elementos en la impresión y controlar sus propios metadatos.
- El informe debe ser útil **sin gráficos si no hay datos**, y con **barras/tablas** cuando existan cifras; nunca gráficos decorativos ni porcentajes inventados.

### 1.2 La descarga queda cargando

- Captura: `Imprimir / Guardar como PDF` con indicador de carga continuo, alineado hacia la derecha en el pie de la vista previa.
- En el código público, `frontend/src/shared/printing/printDocument.js` llama a `window.print()` en iframe y espera a `afterprint` con timeout. Es una **hipótesis técnica verificable**, no una causa raíz confirmada del cambio local P14.
- La impresión del navegador abre un diálogo, **NO descarga automáticamente un PDF**; tampoco ofrece un evento fiable que pruebe que el usuario lo guardó. El producto debe evitar el lenguaje `Descarga terminada` si sólo invocó el diálogo.
- Hay que instrumentar la secuencia real: click → snapshot → HTML → carga de iframe → print() → cierre/cancelación del diálogo → limpieza/desbloqueo. Medir qué evento no llega, si el iframe desaparece antes de tiempo y si el indicador depende de `afterprint` en Chrome de escritorio/PWA.
- No alterar globalmente la impresión de tickets POS sin pruebas. Preferir un adaptador específico de informes o una extensión optativa y probada del helper compartido.

### 1.3 Identificadores técnicos en lugar de nombres

- Se ha visto una celda `Registrado por` con un UID largo (`QvY2SO...`). **No se debe exponer ese ID en informes de dueño**.
- El código público de `contractLedgerReport.js` añade columnas `Documento Pedido` con `payment.sourceId`, `ID Movimiento` con `payment.id` y fallback de pedido a `sourceId`. El exportador actualizado en local puede tener otros campos similares: auditarlos sistemáticamente.
- Campos de salida permitidos: `Registrado por: Ana Quispe`, `Responsable: Dueño`, `Sede: Principal`, `Pedido: PED-2026-0034` (solo cuando exista número comercial real). Si la información no existe/está autorizada, **`Empleado no identificado`** o `Sin número comercial` de manera honesta.
- No inferir nombres a partir de Gmail, UID, cadenas truncadas, etc.; no inventar nombres. Priorizar `cashierName`, `actorName`, `displayName`, `clientName`, `contractNumber` registrados y verificados, después un `usersById` del negocio **ya cargado**; si hace falta otra consulta, usar un **batch acotado** y presupuestado, no `getDoc` por fila.
- Los IDs **permanecen en el dominio y los registros técnicos** para idempotencia, auditoría y soporte. Solo se elimina su exposición innecesaria en columnas visibles de PDF/XLSX, notificaciones e interfaz gerencial. Si se necesita una referencia trazable para el dueño, usar un número de operación legible y único ya existente; no falsificar un número.

### 1.4 Consultas y alcance

- `sessionReportReads` ya utiliza `resources.read` con claves por negocio, sede y período; `reportTTL` = 2 minutos para Hoy/Semana y 15 minutos para Mes/Año. Reutilizar ese mecanismo en el nuevo flujo.
- `useExportSales` actualmente descarga a petición; inspeccionar la nueva vista P14 para comprobar si la vista previa carga datos al abrirla, por `useEffect`, `render`, `useReports` o snapshots activos. **No afirmar que abrir la vista previa cuesta lecturas antes de medirlo.**
- `reportTotals.js` ya concilia valores por método y movimientos. PDF y Excel deben consumir la misma proyección y dejar constancia cuando la información sea parcial/no conciliada.
- El escenario histórico de ticket `voided` con compensación de otro período sigue pendiente; **nunca esconderlo** ni presentar un informe parcial como conciliación confirmada.

## 2. Nueva experiencia de uso — una sola tarjeta

### 2.1 Composición (Galaxy Nebula, accesible)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ▌ [icono]  INFORMES DEL NEGOCIO                                   │
│             Conoce tus ventas y movimientos sin complicaciones    │
│                                                                     │
│  PERÍODO               TIPO DE INFORME                              │
│  [ Esta semana  ▾ ]    [ Informe visual ◉ | Detalle Excel ○ ]        │
│                                                                     │
│  Sede: Todas las sedes  ·  Se incluirán operaciones confirmadas    │
│                                                                     │
│                       [ Preparar informe PDF ]                      │
│                                                                     │
│  Último informe: hoy 22:58 · datos actualizados / botón Reutilizar   │
│  (detalles técnicos y filtros complejos, solo bajo demanda)         │
└─────────────────────────────────────────────────────────────────────┘
```

- Componente único en módulo de reportes/historial, no dos CTA rivales en secciones distintas. Evitar duplicar la tarjeta si ambas vistas montan exportadores.
- Selector único de período y selector claro de finalidad; `Informe visual` seleccionado inicialmente. No presentar ocho archivos como ocho opciones: son dos formatos sobre cuatro períodos, con **una sola acción visible**.
- CTA centrado en el **ancho de la tarjeta**, no pegado a la esquina derecha. Desktop `min-width` ~220px; móvil ancho 100 %. Foco y teclado accesibles, targets ≥44px.
- Estilo: fondo cálido crema, borde lavanda sutil, línea/acento esmeralda discreto, encabezado oscuro índigo, pequeñas superficies lavanda/menta; gradiente difuso y nunca saturado. Título 20–24px, subtítulo 14px, etiquetas 12–13px legibles. No incrustar galería ornamental.
- Estado: `Listo`, `Preparando información`, `Generando informe`, `Abriendo impresión` / `Solicitando descarga`, `No se pudo completar`, `Datos reutilizados`. Mensajes reales sin porcentajes ficticios.
- Cambiar período/formato **no provoca petición ni abre automáticamente vista previa**. Un botón `Actualizar datos` puede ofrecer refrescar si el snapshot está obsoleto, mostrando que sí consultará de nuevo y estimación para período caro.
- La vista previa **no es un paso obligatorio**: al elegir PDF y pulsar una vez, prepara e inicia impresión/guardar PDF. Si se mantiene una vista previa, usar **solo el snapshot ya cargado** con acción de salida clara y un botón centrado, y no consultar al abrir/cerrar la vista ni al regresar.

### 2.2 Estados vacíos y errores

- Período sin operaciones: tarjeta `No se registraron movimientos confirmados en este período` + cero claro y datos de sucursal/período. No imprimir una segunda página vacía con textos contables repetidos.
- Si excede límite de 10 000 tickets/otras lecturas acotadas: detener antes de descargar/abrir impresión, mostrar `Este período supera el límite de detalle; prueba un rango menor` o un **resumen validado disponible**; no usar totales truncados.
- Si falta permiso, índice, conexión, conciliación o evidencia histórica: fallo específico, no presentar el reporte como completo. Estado de caché y antigüedad visibles.
- Error de impresión o cancelación: reactivar siempre el botón y ofrecer `Volver a intentar con los datos preparados` **sin Firestore**. Si el navegador cierra el diálogo sin guardar, no atribuir éxito o fallo de descarga.

## 3. Modelo único de informe

Crear/extraer **una proyección pura** `OwnerReportViewModel` (nombre orientativo, descubrir arquitectura) derivada del conjunto existente de ventas/pagos/voids/contratos/cajas y `aggregateReport`, sin volver a calcular montos en JSX ni en la plantilla.

Campos mínimos:

- `scope`: negocio, sede o global *dentro del negocio*, período Lima, generado, origen/fecha de actualización, `complete`, advertencias.
- `financial`: cobros registrados, compensaciones POS, reembolsos **contables** de pedidos, neto contable, POS neto y pedidos netos, efectivo y Yape/Plin; diferencias calculadas en céntimos.
- `activity`: tickets POS, tickets anulados, pagos de pedidos, pedidos pendientes/entregados/cancelados/con saldo. No duplicar contadores y no mezclar unidades con soles.
- `branches`: nombre comercial, cobros/netos/canales/tickets/contratos por sede; comparar con totales globales.
- `products`: top productos por unidades y S/ de venta para el período, sin porcentaje sobre denominador 0; incluir cancelaciones/compensaciones conforme al mismo motor.
- `cash`: sesiones abiertas, vencidas sin arqueo, cierres declarados, diferencia **sólo si procede**, avisos de conciliación. No presentar el fondo inicial como ventas ni una apertura como efectivo contado.
- `readableActors`: referencias visibles y verificadas; ningún UID o ID técnico en el ViewModel de presentación.
- `evidence`: si hay ausencia de referencias, historial no reconciliable o límites, marcar `incomplete`/`blocked` con causas. No inventar cifras.

**Invariantes:** `neto = cobros + compensaciones + reembolsos contables`, `neto efectivo + neto digital = neto total`; suma de sedes físicas = global del mismo negocio; PDF y XLSX coinciden exactamente en céntimos sobre el mismo snapshot. Nunca llamar `neto contable` **ganancia**, **dinero en banco** o **efectivo disponible**.

## 4. PDF visual profesional — especificación exacta

### 4.1 Aspecto y estructura

- A4 vertical (`@page { size: A4; margin: 10mm 12mm; }` como objetivo, ajustar con capturas). Contenido útil centrado con márgenes; tipografía sistema/Arial embebible, base 10–11pt, subtítulos 12–13pt, título 20–24pt. Contraste alto en tinta índigo; colores suaves que también se entienden en escala de grises.
- Portada compacta **sin portada vacía**: marca/logo legible, `INFORME DEL NEGOCIO`, rango, sedes, hora de generación Lima, estado de actualización.
- Primer bloque: **4 tarjetas KPI** bien distribuidas: Cobros registrados, Compensaciones/ajustes, Neto contable, Tickets POS. Un segundo pequeño bloque puede mostrar neto por efectivo/Yape y pedidos.
- Segundo bloque: **composición de ingresos** visual con barras horizontales proporcionales, dos canales (efectivo, Yape/Plin) y cifras exactas; el bar representa magnitudes apropiadas y **no interpreta negativos como porcentajes positivos**. Para negativos, usar barra divergente o tabla con señal y texto explicativo.
- Tercer bloque: **comparativa de sucursales** solo si hay >1 sede (barras por sede y tabla breve con POS, pedidos y total) con título y nota `suma de sedes = negocio` si concilia. Si hay 1 sede, usar `Desempeño de la sede` sin gráfico comparativo ficticio.
- Cuarto bloque: top 5 productos (nombre, unidades, ingresos), barra de magnitud opcional, formato sobrio y legible. Si no hay detalle suficientemente válido para este dato, ocultar con nota concreta, no calcularlo inventando.
- Quinto bloque: **Pedidos y alertas operativas**, en tarjetas de estado, no párrafos largos. Cajas vencidas/revisión de devoluciones claramente distinguidas.
- Pie compacto de **interpretación:** `Neto contable no equivale a ganancia ni a dinero disponible`, devolución registrada no confirma pago físico/digital. Una nota breve; explicación ampliada en detalles del sistema o al final, no repetir 5 párrafos.
- Para periodos sin movimientos: 1 página funcional con aviso honesto y metadatos, no una cuadrícula de ceroes que ocupa hojas.
- Sin tablas de 25 columnas ni IDs técnicos. Tablas pequeñas con máximo 5–7 columnas, `thead` repetible si hay varias páginas y `break-inside: avoid` para KPI y filas críticas.

### 4.2 Técnica de impresión / PDF

- Reusar `frontend/src/shared/printing/printDocument.js` sin desactivar el sanitizador/CSP. Ese helper **elimina SVG y scripts**: las barras y gráficas del HTML imprimible deben implementarse con HTML/CSS, no depender de Lucide/SVG en el documento final. El icono en pantalla sí puede usar Lucide.
- CSS imprimible autocontenido. `print-color-adjust: exact` cuando el navegador lo permita, pero incluir bordes, texto, alineación y patrones suficientes sin colores impresos.
- Eliminar el segundo folio en blanco cuando no corresponda. Asegurar que todos los folios con contenido tengan encabezado/continuación legible; PDF A4 no necesita una portada independiente.
- No afirmar `PDF descargado` por llamar `window.print()`. Etiqueta precisa: `Imprimir / Guardar como PDF`; mostrar ayuda de navegador para elegir `Guardar como PDF` y desactivar `Encabezados y pies de página` si aparecen `localhost`/fechas automáticas.
- **Bug spinner:** instrumentar y arreglar lifecycle `afterprint`, iframe, `abort`, `finishTimeout`, render, cierre/cancelación, StrictMode y desmontaje. Nunca dejar botón deshabilitado permanentemente. Un fallo no debe relanzar consultas; un reintento sobre snapshot reutiliza HTML.
- Si se decide ofrecer un botón literal `Descargar PDF` que cree un Blob PDF sin intervención del navegador, **ese es otro requisito técnico**: la impresión nativa no garantiza un archivo descargado. No sustituir silenciosamente el comportamiento ni incorporar librería pesada sin autorización.

## 5. Caché «antiansiosos» sin pérdida de integridad

### 5.1 Almacenamiento efímero en memoria, no persistencia global

Key obligatoria: `identityKey + businessId + branchId + period.start + period.end + backendRevision/fetchedAt`, donde `identityKey` delimita usuario y sesión. Nunca mezclar `global` entre negocios ni compartir reportes por URL local.

- **Layer A: Snapshot**: `Promise` in-flight por scope que une clics concurrentes y reutiliza `resources.read/sessionReportReads`. Conservar snapshot tipado (costo acotado) mientras no caduque ni se invalide por una mutación confirmada.
- **Layer B: Artefactos derivados**: PDF HTML seguro / diseño imprimible, y workbook/Blob Excel por `(scope, format, snapshotVersion)`; repetir impresión/descarga desde artefacto válido **0 lecturas Firestore**, sin recalcular por cada clic.
- **TTL recomendado alineado al código existente:** 2 min Hoy/Semana, 15 min Mes/Año como máximo inicial; para períodos con cambios financieros confirmados, invalidación inmediata. La antigüedad se muestra. Es un punto de partida, no una garantía de coherencia cross-device: un informe puede necesitar refresco explícito antes de presentarse como actualizado.
- Reutilizar datos ya cargados por Dashboard si tienen el conjunto de evidencia requerido; un simple total agregado no siempre alcanza para construir Excel detallado. Diferenciar `resumen` vs `detalle` de modo que el formato PDF no fuerce lecturas de tickets de Excel cuando no sean necesarios.
- **Nunca** cachear archivos sensibles en `localStorage`, SW público, URL compartible, global JS para todas las cuentas o IndexedDB sin cifrado/aislamiento autorizado. Preferir memoria de sesión; eliminar en logout, cambio de identidad, negocio, sede y desmontaje prolongado. No conservar enlaces Blob abiertos indefinidamente.
- Invalidar en venta, pago, anulación, cancelación, recuperación/cierre de caja confirmados por servidor. Si no puede saberse que otro dispositivo actualizó el período, marcar fecha de datos y exigir actualización al vencer TTL; no vender como “tiempo real”.
- Para un `timeout`, denegación de permiso, resultado parcial, reconciliación fallida o snapshot incompleto: **NO cachear como éxito** y no reutilizar un archivo incompleto. Los fallos permiten reintentar sin cooldown; los éxitos se pueden reabrir sin consulta.
- Un segundo clic mientras `inFlight`: ignorar o mostrar la misma operación; jamás crear otra consulta. Una vez listo: permitir repetir la acción con copia del artefacto, sin falso cooldown de 5 segundos que impida reabrir impresión cancelada.
- El PDF no debe consultar por abrir/volver de preview. El Excel reutiliza los mismos datos base, pero puede requerir lecturas adicionales explícitas si necesita detalle no cargado; esas lecturas se hacen **solo cuando el usuario elige Excel y pulsa generar**, de forma compartida por caché.

### 5.2 Estados de interfaz recomendados

`idle -> preparing-data -> rendering -> print-requested / download-requested -> idle-ready`;
`error` conserva snapshot si el fallo ocurrió solamente al abrir impresión, pero no conserva resultados financieros incompletos.

El resultado **`print-requested`** significa «se abrió/solicitó el diálogo de impresión», **no** «PDF guardado». El resultado de `download-requested` de Excel tampoco asegura que el SO lo guardara.

## 6. Excel: claridad para dueños (sin alterar el motor)

- No destruir las hojas que ya aportan valor: `Resumen_Financiero`, `Comparativa_Sedes`, `Productos_Global`, `Productos_Sedes`, `Auditoría_Cajas`, `Auditoría_Pedidos`, detalles por sede. Mantenerlas bajo topes existentes.
- Cambiar cabeceras crípticas por términos operativos. Ejemplos: `ID Pedido` → `N.º de pedido` **cuando exista número de pedido real**; `ID Movimiento` técnico fuera de la vista del dueño; `Registrado por` → nombre legible verificado; `Reembolso contable` no se convierte en `Devolución entregada`.
- Si se necesita trazar una operación sin número comercial, presentar fecha/hora, sede, tipo y nombre; poner `Sin referencia comercial` donde aplique. Evitar identificadores técnicos por completo en las hojas de uso gerencial.
- Hojas detalladas: primera fila título/período, cabeceras de alto contraste, `freeze` cabecera, autofiltro si es compatible, ancho razonable, formato `S/ #,##0.00`, tipos fecha Excel válidos cuando útil, números negativos legibles, fila de totales y notas interpretativas cortas. **No reducir pruebas existentes que esperan un encabezado**: actualizar pruebas con aprobación semántica.
- Ninguna columna debe confundirse entre efectivo esperado / efectivo declarado / diferencia sin arqueo. Revisar particularmente el resultado local P14 para `VENCIMIENTO`, `APERTURA`, `CIERRE`.
- Revisar systematically output de `contractLedgerReport`, `cashAuditRows`, `salesDataProcessor`, `salesWorkbook` y cualquier PDF/exportador nuevo. Usar un escáner/test que busque cadenas con forma de UID en **celdas visibles**, sin prohibir IDs internos del dominio.
- Sanitizar texto que empieza por `=`, `+`, `-`, `@` contra formula injection; preservar importación de XLSX como test de regresión. Mantener exactitud de céntimos y método de pago.

## 7. Escala y presupuesto Spark

**Escenario:** 20 negocios, cada uno con 2 sedes y 100 tickets diarios por sede → 4.000 ventas/día en el proyecto; 120.000 ventas/mes sin contar pagos de contratos, voids, sesiones, personal y lecturas para validaciones. **No equivale automáticamente a igual número de lecturas facturadas**.

La cuota gratuita estándar es 50.000 lecturas/día **compartidas a nivel de base del proyecto**, junto con 20.000 escrituras/día. Si los 20 negocios hacen una exportación mensual con 6.000 ventas cada uno, ya son unas 120.000 filas/documentos potenciales en un mismo día, antes de lecturas extra y dashboard. No afirmar que 20 negocios están certificados sin instrumentación real de cuota y transacciones.

- Acceso de dueño `global`: global **solo de las sedes de su propio negocio**, jamás de los 20 tenants.
- No consultar por formato, preview, cambio de selector o botón de regreso.
- Contadores de QA: peticiones Firestore, documentos retornados por clase, bytes, latencia, ratio de cache hits, lecturas evitadas, cancelaciones, recursos del navegador, archivos generados.
- Métrica objetivo: **0 llamadas extra** al alternar formato o reimprimir sobre un snapshot *suficiente* válido; **1 conjunto de consultas** por clave en frío; si Excel requiere datos más detallados, el coste incremental se muestra y mide.
- Si Mes/Año exceden límites: FAIL seguro y mensaje útil; **no** aumentar `maxRows:10000` sin una estrategia indexada/agregada. Proponer resumen diario persistente transaccional como etapa aparte, sin introducir escrituras ni Rules nuevas en esta UX.
- Presupuestar 2 sedes × 100/día × 30 = 6.000 ventas/mes por negocio; 73.000/año. Un informe PDF visual no necesita incluir todas las líneas de tickets, pero tampoco puede inventar un resumen anual sin origen verificable.

## 8. Pruebas obligatorias

**UX/performance**

1. Montar pantalla de informes, cambiar 4 períodos y 2 formatos, abrir/cerrar detalle sin pulsar Generar → **0 nuevas consultas Firestore** atribuibles al exportador.
2. Pulsar PDF una vez en fixture día con S/85 → consulta autorizada, snapshot y A4; segunda impresión sin editar ni vencer TTL → **0 consultas adicionales**.
3. PDF → Excel del mismo scope/periodo → reutilización de filas compartidas; consultas incrementales solo si Excel requiere datasets no disponibles; registrar cada una.
4. Doble/triple clic rápido → una sola promesa de lectura y un único trabajo activo, UI recuperable.
5. Cancelar impresión y volver a pulsar: botón listo, no spinner infinito, 0 lecturas extra. `window.print` no certifica guardado del PDF.
6. Cambiar sede, cuenta, negocio, logout, período mientras existe `inFlight` → descartar resultado antiguo y no exportar datos de contexto anterior; borrar caché sensible.
7. `permission-denied`, falta de índice, offline sin datos, timeout, límite 10.000, historial inconsistente → mensaje específico, cero archivo presentado como completo.
8. PDF A4 con 0 ventas, 1 sede, 2 sedes, 100+ operaciones, textos largos, importes negativos y 2 páginas con contenido: comprobar `printToPDF` real, 1–3 páginas útiles, sin blanco forzado/solapamiento/recortes, tamaños legibles y contraste en gris.
9. Excel hoy/semana/mes/año reimportado, hojas esperadas, identidad legible, sin fórmula ejecutable y netos idénticos a Dashboard/PDF en céntimos.
10. `Registrado por: UID` en cualquier PDF/XLSX visible → **FAIL**. Si el nombre no existe: `Empleado no identificado` (sin inventarlo) y nota de soporte, sin disparar N lecturas.
11. Trazabilidad de caja vencida P14, arqueo pendiente y diferencia null → no convertir en cierre conciliado. Rules en emulador siguen requisito aparte para aprobar recuperación de caja.
12. Control Linux CI del test del PDF/Excel y no solo pruebas Node; mantener P13, P10-06, Spark Rules, seguridad, build/PWA.

**Criterios de salida:** No PASS si PDF queda con spinner; no PASS si se fuerza a guardar en la UI como éxito; no PASS si vuelve a aparecer un ID técnico visible; no PASS si hay refetch al cambiar formato sin intención. No registrar PASS de Rules o del flujo P14 local sin ejecutar emulador bajo el commit correcto.

## 9. Archivos candidatos (Codex debe descubrir rutas locales P14)

- Nueva tarjeta principal: `frontend/src/modules/ExportSales.jsx` y/o nueva vista P14 según implementación local.
- `frontend/src/features/reports/hooks/useExportSales.js` + hook/servicio PDF local P14 (inspección obligatoria).
- `frontend/src/features/reports/application/sessionReportReads.js`, `reportResource.js` (reutilizar, **no** añadir listeners globales), `reportTotals.js`.
- `frontend/src/features/reports/application/salesWorkbook.js`, `contractLedgerReport.js`, `cashAuditRows.js`, `frontend/src/utils/excelHelpers.js`.
- `frontend/src/shared/printing/printDocument.js` solo si la corrección está aislada y no afecta al POS; preferir extensión por opción y pruebas de tickets.
- Nuevos test Node + Chromium y un archivo de resultados `docs/PLAN-14-UX-FINAL-RESULTADOS.md`.

## 10. Restricciones absolutas

1. **Codex NO puede ejecutar `git`, `gh`, APIs o conectores GitHub, ni siquiera para leer estado/diff.** El propietario administra las ramas y publicaciones.
2. NO deploy ni acceso a Firebase real; NO escribir colecciones reales; NO instalación de dependencias/Java/Chrome. Usar fixtures, mocks y emuladores disponibles.
3. NO tocar reglas ni persistencia de caja vencida P14, POS, anulación, inventario, contratos, lógica monetaria, RBAC ni seguridad para arreglar apariencia. Si detectas bug financiero independiente, documentarlo sin cambiar el dominio.
4. Sí autorizar pruebas locales Node/Chromium, lint, build/PWA, seguridad y emuladores ya instalados; un fallo queda FAIL/BLOCKED, nunca se oculta.
5. No borrar pruebas, límites de lectura ni sanitización; no sacrificar claridad para reducir páginas ni coste de consultas.
6. Mantener identidad Galaxy Nebula, accesibilidad teclado/foco, responsive, y funcionalidad de tickets POS.

## Referencias técnicas revisadas

- MDN: `window.print()` abre un diálogo de impresión, no devuelve un PDF guardado: https://developer.mozilla.org/en-US/docs/Web/API/Window/print
- MDN: impresión CSS: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Printing
- Firebase cuotas estándar: https://firebase.google.com/docs/firestore/quotas
- Firestore lecturas y agregaciones: https://firebase.google.com/docs/firestore/pricing
- Recomendación conceptual de invalidación selectiva (sin instalar la librería): https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
