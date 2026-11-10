# MigaPOS · Cierre Excel y UX

**9 de noviembre de 2026 · America/Lima · Verificación local en entorno de ensayo**

## Diagnóstico y corrección

El flujo anterior iniciaba la importación de `xlsx-js-style` y las consultas a la vez. Con Chromium aislado y Vite real, una petición vigente al módulo preoptimizado devolvió HTTP 200, MIME `text/javascript` y caché inmutable. Al forzar un hash `v` obsoleto en la misma ruta, Vite devolvió **504 Outdated Optimize Dep**, sin MIME de JavaScript. El panel anterior mostró «No se pudo actualizar» y ya había iniciado cuatro lecturas simuladas. La página del ensayo inicial carecía de un service worker controlador. El 504 reproduce el mecanismo compatible con el mensaje del propietario. Falta la captura Network de su navegador para atribuir el origen exacto de su hash. [Caché de dependencias de Vite](https://vite.dev/guide/dep-pre-bundling)

Vite preoptimiza el paquete CommonJS desde el arranque y Chromium sigue solicitándolo solo al exportar. El cargador valida la API de escritura y consolida importaciones concurrentes. Un fallo permite reintentar en la misma página mediante otra identidad de módulo. El reintento se limita al asset Excel del mismo origen y en dev descarta el hash obsoleto de Vite. Si el asset de una versión anterior desapareció del servidor, la interfaz pide recargar si el fallo persiste. [Fallos de importación dinámica en Vite](https://vite.dev/guide/troubleshooting.html#failed-to-fetch-dynamically-imported-module)

El hook carga el módulo antes de consultar. Distingue fallos de módulo, lectura, límite o conciliación, y preparación de la descarga. El bloqueo de cinco segundos se aplica después de solicitar una descarga. Una exportación fallida permite reintentar de inmediato. Cambiar período, sede o identidad invalida el resultado anterior, al igual que desmontar el panel. Se eliminan los enlaces temporales y se revoca la URL Blob. El mensaje de éxito indica que se solicitó la descarga al navegador.

En preview se observó otra diferencia. La URL de reintento permitió importar el chunk de producción, pero la regla de Workbox basada en la URL completa no lo incorporó a su caché. La regla ahora compara el `pathname` en el mismo origen. El chunk sigue fuera del precache, con los mismos límites de su caché de uso. Tras HTTP 503 simulado y reintento 200, Workbox sirvió el módulo en la recarga offline sin otra petición al servidor de preview. Los datos de esa prueba son sintéticos y se suministran en memoria.

## Tarjeta de exportación

Tarjeta Galaxy Nebula con franja esmeralda, icono de hoja de cálculo, título y descripción visibles. El selector y el botón verde se alinean a partir de 768 px y se apilan a ancho completo en móvil. Los avisos se anuncian mediante `role="status"` y `role="alert"`. El error enfoca Reintentar exportación y el detalle técnico permanece colapsado. Se verificaron 1440 × 900, 1024 × 768, 768 × 900, 390 × 844 y 320 × 560, además de reflujo equivalente a zoom de hasta 200 % a 640 px. Chromium comprobó el orden de Tab y los nombres accesibles del selector y el botón. [Escritorio](../.release/qa-excel-ux/tarjeta-1440.png) · [Móvil](../.release/qa-excel-ux/tarjeta-320.png)

## Archivos XLSX reimportados

Los archivos se descargaron con un clic real sobre el botón. Se comprobaron la firma ZIP, las hojas, los netos y la ausencia de fórmulas o enlaces inyectados desde texto de negocio.

| Entorno y filtro | Archivo de ensayo | Neto | Efectivo | Yape/Plin |
| --- | --- | ---: | ---: | ---: |
| Dev, hoy | `Reporte_Diario_Detallado_2026-11-09.xlsx` | S/ 85.00 | S/ 28.00 | S/ 57.00 |
| Dev, semana con compensación | `Reporte_Semanal_Detallado_2026-11-09.xlsx` | S/ 55.00 | S/ 28.00 | S/ 27.00 |
| Preview, mes con compensación | `Reporte_Mensual_Resumen_2026-11-01.xlsx` | S/ 55.00 | S/ 28.00 | S/ 27.00 |
| Preview offline con módulo en caché y fixture vacía, año | `Reporte_Anual_Resumen_2026-01-01.xlsx` | S/ 0.00 | S/ 0.00 | S/ 0.00 |

Los dos detallados contienen `Resumen_Financiero`, `Auditoría_Pedidos`, `Auditoría_Cajas`, `Comparativa_Sedes`, `Productos_Global`, `Productos_Sedes` y `Detalle_Centro`. El mensual contiene el resumen financiero, auditoría de pedidos, comparativa, ambas hojas de productos y `Resum_Centro`. El anual vacío contiene solo `Resumen_Financiero`. Los tests Node cotejan estos invariantes con el modelo de Dashboard.

## Verificación

Logs y XLSX de ensayo en `.release/qa-excel-ux/`. Para las descargas, la fixture sustituye las lecturas y el contexto autenticado. Usa la configuración real de Vite, el componente, el hook, el módulo Excel, el generador y el service worker de la aplicación. La red de Chromium se limita a loopback.

| Comprobación | Evidencia local |
| --- | --- |
| Reproducción del 504 y respuesta correcta en dev | `00-repro.log`. |
| Dev, descarga y reintento desde UI | PASS. 504 → 200 en la misma página, cero lecturas durante el fallo, recarga dura y descarga semanal. Fallos de permisos, conciliación, límite y Blob con cero archivos nuevos. Cambio de sede, identidad y desmontaje descartan las lecturas pendientes. `17-excel-final.log`. |
| Build/preview, XLSX mensual y anual, reintento 503, carga fría y caché offline | PASS. El módulo no aparece en el arranque. Al quedar inaccesible se anuncia el fallo. Tras reintentar, se descarga y la recarga offline obtiene HTTP 200 desde el service worker, sin otra petición al servidor. `17-excel-final.log`. |
| Reportes, Plan 13 e inventario Markdown | PASS 85/85. `18-node-final.log`. |
| P09 y P10-06 | PASS 4/4, con 199 controles de P09 y 480 de P10-06. La prueba de compacidad mantiene el límite de las tarjetas del historial y mide el formulario de Excel por separado de la nueva cabecera. `09-ux.log`. |
| Spark | PASS 77/77. Incluye el control de seguridad Markdown y los navegadores de arranque, recursos locales y respaldo. `10-spark.log`. |
| Lint, build de aplicación y PWA | PASS. Precache de 44 archivos y 2.86 MiB, scripts externos y Excel diferido. `15-lint-release.log`, `13-build-release.log`, `16-pwa-release.log`. |

Reproducir con el Chromium local mediante `node --test --test-concurrency=1 tests/excel-export.browser.test.mjs`. Para revisar el panel con el entorno de ensayo del propietario, arrancar `npm run dev --prefix frontend -- --force`, abrir el historial como dueño y pulsar Descargar Excel. `--force` regenera el prebundle de Vite. Una recarga de la página permite adquirir los identificadores de la versión activa. No hace falta borrar IndexedDB ni la caché de usuario.

Pendientes de alcance. La revisión con lector de pantalla físico y la aceptación visual del propietario quedan manuales. Los resultados de PWA offline prueban la disponibilidad del código de Excel, con movimientos de ensayo suministrados por la fixture. Los permisos y la disponibilidad de lecturas reales siguen aplicando. La conciliación histórica de períodos disjuntos continúa documentada en P13-04.

## Archivos modificados

- Carga y exportación en `frontend/vite.config.js`, `frontend/src/features/reports/application/excelModule.js` y `frontend/src/features/reports/hooks/useExportSales.js`. Tarjeta en `frontend/src/modules/ExportSales.jsx`.
- Regresión de clic y fixtures en `tests/excel-export.browser.test.mjs`, `tests/excel-export.fixture.jsx`, `tests/helpers/excelExportHarness.mjs` y `tests/helpers/browserHarness.mjs`. Actualización de las pruebas visuales en `tests/plan09.fixture.jsx`, `tests/plan10.browser.test.mjs` y `tests/plan10-correction.browser.test.mjs`.
- Inventario cerrado por rutas exactas en `tests/ui-security.test.mjs` e informe `docs/CIERRE-EXCEL-UX-RESULTADOS.md`.

No se ejecutaron Git/GitHub, instalaciones ni despliegues. No se accedió a Firebase real ni se cambiaron cálculos, transacciones, inventario o Rules.
