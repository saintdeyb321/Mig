# MIGAPOS — CODEX · Refactorización final UX de informes PDF/Excel y caché bajo demanda

Eres arquitecto senior de React, UX de software empresarial, Firestore Spark y generación segura de documentos. Trabaja **sobre la implementación local del Plan 14**, no sobre supuestos derivados del código público anterior.

## Material obligatorio

Lee primero, íntegramente:
- `docs/PLAN-14-UX-FINAL-INFORMES-PDF-EXCEL.md`.
- `docs/PLAN-14-CAJA-VENCIDA-INFORMES-PDF-EXCEL.md`.
- `docs/PLAN-14-RESULTADOS-CAJA-INFORMES.md` **si existe localmente**.
- `docs/CIERRE-EXCEL-UX-RESULTADOS.md`.

Inspecciona rutas reales de exportador PDF P14, hook de Excel, servicio compartido de datos, `printDocument.js`, `salesWorkbook.js`, `contractLedgerReport.js`, `cashAuditRows.js`, los tests existentes y CSS de impresión. No asumir rutas nuevas antes de descubrirlas.

## Problemas a resolver

1. El PDF actual parece una tabla de texto pequeña, con abundante vacío, casi ningún gráfico, demasiadas notas, presentación deficiente y una segunda página vacía o casi vacía. El dueño necesita un informe visual y comprensible al abrirlo.
2. Al intentar `Imprimir / Guardar como PDF`, el botón queda cargando. Está además mal alineado en el extremo derecho. Inspecciona la secuencia completa, incluida la dependencia de `afterprint`, sin culpar automáticamente a una sola causa.
3. El dueño ve UIDs largos como `Registrado por: QvY2SO...`, además de posibles columnas `ID Movimiento` y `Documento Pedido`. No deben verse identificadores técnicos en informes/Excel; nombres legibles y referencias comerciales reales.
4. Los módulos ofrecen dos botones de exportación y cuatro períodos; es una experiencia confusa. Debe haber un único panel, un período, un selector de tipo con dos opciones y un único CTA centrado.
5. Al seleccionar PDF o abrir vista previa no deben comenzar consultas. Un informe ya generado debe poder abrirse otra vez sin reconsultar, salvo vencimiento/invalidez del snapshot o necesidades explícitas de detalle adicionales de Excel.
6. Las lecturas Firestore para 20 negocios/2 sedes/100 ventas diarias deben mantenerse acotadas. Ni PDF ni Excel pueden desencadenar recorridos globales de tenants.

## EJECUCIÓN — orden obligatorio

### A. Auditoría dirigida y pruebas que fallen primero

Instrumenta con fixtures el número de lecturas y documentos para: montar tarjeta, cambiar período, cambiar formato, abrir/cerrar preview, primer clic, segundo clic, cancelar impresión, ir de PDF a Excel, cambio de identidad/sede y error de permiso.

Reproduce el spinner y determina si se debe al diálogo de impresión, evento `afterprint`, desmontaje, timeout, iframe o estado React. Reproduce una fila Excel/PDF con UID visible y el exceso de páginas A4. No simular PASS por ausencia de la UI real.

### B. Un único exportador, UX profesional

Implementa en una tarjeta Galaxy Nebula:
- Título `Informes del negocio` y subtítulo útil.
- `Período` (Hoy/Semana/Mes/Año), `Formato` (`Informe visual (PDF)` recomendado / `Detalle Excel`).
- Un solo botón centrado, en móvil full width: `Preparar informe PDF` o `Descargar detalle Excel`.
- Aclaración no intrusiva sobre qué ofrece cada formato; detalles avanzados plegables.
- Estados accesibles con indicador que se libera siempre; errores recuperables.

No consultar al render ni al cambiar los controles. La selección de período/formato no descarga, no abre impresión y no monta listeners Firestore innecesarios.

### C. Caché con integridad («antiansiosos»)

Extrae una capa compartida con key de identidad/negocio/sede/rango y revisión; coalescing `inFlight`, snapshot validado y artefactos derivados en memoria (HTML PDF / Blob Excel). Reutiliza `resources.read` y los TTL actuales; invalida tras movimientos confirmados, logout o cambio de cuenta/sede. Reintentar sobre datos válidos no debe volver a consultar y debe ser permitido aunque se haya cerrado/cancelado la impresión. No almacenar documentos sensibles en caché pública o sin aislamiento/cifrado.

Reutiliza la proyección financiera existente; si un Excel requiere información detallada no cargada para el PDF, realiza **solo las consultas adicionales estrictamente necesarias al pulsar generar Excel**, con presupuesto, deduplicación y trazas.

### D. PDF gerencial que parezca un reporte profesional

Compón HTML/CSS A4 listo para imprimir/guardar como PDF, sin librerías nuevas:
- Marca, nombre de negocio, sede, rango Lima, fecha de generación.
- 4 KPIs principales en tarjetas (cobros, ajustes, neto, tickets), desglose por canal bien legible.
- Barras horizontales/visuales con datos reales y signos correctos, no gráficas decorativas.
- Tabla compacta de comparativa por sucursal si hay más de una.
- Top 5 productos, resumen de pedidos y alertas de caja/devoluciones cuando existan datos válidos.
- Estados vacíos honestos, advertencias cortas de neto contable, sin párrafos repetidos ni referencias técnicas.
- A4 con márgenes correctos, tipografía legible, saltos adecuados, máximo páginas razonable por el contenido; cero páginas finales vacías, sin recorte, 1/2/3 páginas solo si contienen contenido válido.

`printDocument.js` elimina SVG: usa barras CSS, no SVG o JavaScript en documento imprimible. No rebajes sanitización/CSP. Evita impactar impresión de tickets POS.

**Arregla el spinner:** prueba en navegador real Chrome/PWA las rutas imprimir, cancelar, cerrar, volver y reabrir. La UI debe resetearse aunque no se reciba `afterprint` en cierto orden. Nunca decir `PDF descargado` si solo se abrió el diálogo nativo; indica cómo usar `Guardar como PDF` y desactivar encabezados/pies automáticos si aparecen `localhost`, fecha y numeración del navegador. Si se necesita descarga directa sin diálogo, trátala como un requisito separado no simulado.

### E. Excel legible y sin IDs

Revisa *todas* las hojas visibles incluyendo cajas, pedidos y detalles. Muestra nombre confirmado o `Empleado no identificado`, jamás UID. Usa número comercial real para pedido si existe; elimina columnas con `ID Movimiento`, `Documento Pedido` técnico y otros IDs de exposición gerencial, manteniendo IDs internamente para auditoría/idempotencia. Resuelve nombres con snapshots autorizados o una tabla ya cargada, no N consultas por fila.

Mantén las hojas valiosas por sede y comparativa; mejora cabeceras, anchos, fechas, moneda, freeze panes y notas. No rompas formato numérico ni mitigación de fórmulas de Excel. Comprueba `Auditoría_Cajas`: apertura/expiración/cierre y falta de arqueo no deben confundirse.

### F. Pruebas de aceptación y coste

Añade tests Node y Chromium que cubran:
1) 0 consultas antes del primer clic en Exportar;
2) 1 pipeline en frío, 0 lecturas adicionales para reimpresión/cache hit;
3) cero descargas con error, límite o datos inconsistentes;
4) reintento tras cancelar print sin spinner;
5) 0 IDs técnicos visibles en PDF/Excel;
6) PDF A4 con vacío, 1 sede, 2 sedes, montos negativos y caso con contenido en 2 páginas;
7) Excel real reimportado y cifras iguales a Dashboard/PDF en céntimos;
8) no mezclar datos por cuenta, negocio o sede y 0 consultas transversales;
9) 20 negocios de 2 sedes y 100 ventas/día por sede, con contadores de documentos/consultas/hits, sin afirmar cuota certificada sin mediciones;
10) cero regresión en tickets POS, impresión PWA, permisos, caja vencida y suites existentes.

Integra la regresión de exportación visual en CI si las suites caben en límites existentes; no elimines controles ni amplíes tiempos a ciegas. Ejecuta localmente Node, Chromium, lint, build/PWA, emuladores cuando estén disponibles; si Java falta declara BLOCKED.

Crea/actualiza `docs/PLAN-14-UX-FINAL-RESULTADOS.md` con: diagnóstico, root cause del spinner, evidencias de PDFs y XLSX abiertos, árbol de hojas, conteo de lecturas antes/después, nombres visibles, métricas A4, archivos modificados y PASS/FAIL/BLOCKED/MANUAL. Incluye el inventario Markdown cerrado por rutas exactas.

## Restricciones inviolables

- **No comandos `git`, `gh`, APIs/conectores GitHub, ni siquiera `status`/`diff`.** Sin commit/push/merge/deploy.
- **No Firebase real**, ni consultas/escrituras/despliegues al proyecto de clientes; usar fixtures/emulador `demo-migapos`.
- **No instalar** dependencias, Java, navegadores, PDF libraries, TanStack Query u otros frameworks.
- **No modificar** lógica financiera, transacciones de POS, caja, anulación, stock, contratos, Firestore Rules/índices ni permisos. Si hay bug de dominio independiente, deja diagnóstico y criterio de gate, no maquilles cálculos.
- **No** ocultar negativas contables, sumas parciales, términos confusos, errores o fallos de prueba.
- **No** declarar MigaPOS listo para producción por esta tarea; la recuperación P14 requiere verificación de Rules y aceptación del propietario.

Implementa la refactorización completa de informes, valida y entrega resultados verificables. No solicites confirmación intermedia salvo decisión de seguridad imprescindible.
