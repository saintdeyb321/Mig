# PROMPT CODEX — CIERRE DE EXCEL: DETALLES CLAROS Y SIN REDUNDANCIAS

Actúa como arquitecto senior React y especialista en reportes XLSX financieros, UX para dueños de negocios y optimización Firebase Spark.

## Directorio / rama / permisos

- ÚNICO directorio: `C:\Proyectos\MigaPOS`.
- Rama de destino que **EL PROPIETARIO debe haber seleccionado manualmente antes de esta tarea**: `fix/migapos-production-readiness`.
- La rama `marketing/video-promo-migapos` y la carpeta `marketing/` se consideran fuera de alcance: no tocar videos, audio, animaciones promocionales, assets, scripts, documentación o dependencias relacionadas.
- **PROHIBIDO cualquier comando Git/GitHub**, incluso `git status`, `git branch`, `git diff`, `git log`, `gh`, conectores/APIs; no cambiar ramas, no commitear, no hacer push, merge ni deploy. El propietario gestionará personalmente la rama y publicación.
- Si sospechas que la rama o directorio no son los correctos, **detén la edición y explica el impedimento**; no uses Git para resolverlo.

Lee íntegramente `docs/PLAN-EXCEL-DETALLE-CLARO-MIGAPOS.md` y este prompt. Inspecciona primero el código local real y conserva sus cambios posteriores a GitHub.

## Hallazgo confirmado

`processSales()` crea las hojas `Detalle_<sede>` con 13 columnas fijas: repite `Sucursal`, muestra `(Lima)` y genera `TOTAL TICKET ➔` aparte; además modela un abono de pedido como si fuera un producto del cliente (`Producto=clientName`, `Cantidad=1`, `Precio unitario=importe`). `styleTotalRows()` y los formatos monetarios dependen de posiciones de columnas rígidas. Corrige la semántica, no solo el estilo.

## Implementación obligatoria

1. Refactoriza la proyección de `Detalle_<sede>` para distinguir `VENTA POS`, artículo del ticket, `COMPENSACIÓN POS`, `ADELANTO PEDIDO`, `ABONO PEDIDO` y `REEMBOLSO CONTABLE PEDIDO`. El dueño debe entender cada fila.
2. Elimina `Sucursal` del detalle por sede y `(Lima)` del título. Mantén las fechas correctas en zona `America/Lima`. No elimines nombres de sucursal donde son necesarios para comparar o atribuir movimientos entre sedes.
3. En un abono: mostrar `Pago de pedido · cliente` y el número comercial real. Dejar `Cantidad`, `Precio unitario` y `Subtotal producto` vacíos. El importe solo va a `Importe movimiento`, con su signo correcto.
4. Para tickets multítem: mostrar artículos, cantidades y subtotales, pero solo **un** importe financiero del ticket (preferentemente primera línea). El importe no vuelve a aparecer en una fila de total separada. Los subtotales NO son ingresos adicionales.
5. Crea un esquema reutilizable de columnas y estilos **basado en nombres/roles semánticos**, no letras fijas, para que cambiar columnas no rompa moneda, fechas, filtros, widths ni congelación.
6. Audita `Resumen_Financiero`, `Comparativa_Sedes`, `Auditoría_Pedidos`, `Estado_Pedidos`, `Auditoría_Cajas`, `Productos_Global`, `Productos_Sedes`, `Resum_<sede>`. Conserva las hojas útiles: elimina solo redundancia inequívoca según filtro global o sede, sin crear pestañas adicionales salvo necesidad justificada.
7. No mostrar IDs/UIDs técnicos; usar nombres comerciales reales o fallbacks comprensibles. No inventes números de ticket ni reemplaces nombres de productos numéricos que son auténticos. No agregar lecturas a Firestore para resolver nombres.
8. Mantén textos como texto literal de Excel, nunca fórmulas ejecutables; mantén negativos y monedas como números con formato visual.
9. El XLSX debe seguir exactamente el motor financiero existente; **NO cambiar `aggregateReport()` ni cálculos, caja, movimientos, anulaciones, contratos, stock, Firestore, Auth, caché o release**.
10. Reutiliza el mismo dataset y el Blob preparado cuando sea válido. No hacer consultas repetidas ni desmontar la caché del exportador.

## Criterio numérico con ejemplo real

- POS Yape S/20.00, POS mixto S/37.30 (Efectivo S/10 + digital S/27.30), POS efectivo S/6.00.
- Dos pagos del pedido `PED-2A010C09`: Yape S/20.00, Efectivo S/80.00.
- **Total de cobros S/163.30**, sin anulaciones ni otras operaciones. Los pagos de pedidos no se tratan como ventas nuevas de artículos.
- Dos productos de un ticket mixto totalizan S/37.30 y el `Importe movimiento` contribuye **una sola vez** con S/37.30.
- Conciliar totales por sede y global con Dashboard/PDF, sin sumar los subtotales de producto por duplicado.

## QA y entrega

- Escribe primero casos que fallen con la salida actual y después corrige.
- Reimporta los XLSX y valida columnas, títulos, importes numéricos, negativos, fechas, multiartículo, abonos, movimientos de anulación, caja sin arqueo, 1 y 2 sedes, histórico provisional, límite 10.000, nombres ausentes e inyección de fórmulas.
- Actualiza las regresiones existentes que comparan columnas antiguas o la palabra `(Lima)`, sin relajar las verificaciones financieras.
- El commit visible de `fix` incluye dos Markdown legítimos que causaron CI rojo por inventario: `docs/GO-NO-GO-P15-PRODUCCION.md` y `docs/PLAN-VIDEO-PROMOCIONAL-MIGAPOS-CODEX.md`. Agrega al inventario estricto de `tests/ui-security.test.mjs` **estas dos rutas y las tres de esta tarea** más `docs/RESULTADOS-EXCEL-DETALLE-CLARO.md`. No desactives ni amplíes el filtro con comodines. No edites documentos o código de video.
- Ejecuta tests Node/Chromium relevantes, `npm run test:spark`, lint y build/PWA sin instalar herramientas nuevas. Indica BLOCKED cuando corresponda.
- Entrega `docs/RESULTADOS-EXCEL-DETALLE-CLARO.md` con antes/después, totales, muestras de datos interpretables, consultas añadidas (objetivo 0), hojas alteradas, tests y riesgos.
- No declares producción aprobada: el propietario revisará/publicará los cambios manualmente en la rama `fix/migapos-production-readiness` y luego realizará auditoría de CI.

**Comienza la corrección enfocada del Excel; no hagas otra refactorización general.**
