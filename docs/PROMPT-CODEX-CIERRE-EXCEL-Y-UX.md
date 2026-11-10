# MIGAPOS — ÚLTIMO PROMPT DE CORRECCIÓN: EXCEL + UX

Actúa como arquitecto senior de React 19, Vite 7, Tailwind CSS 4, PWA y QA para un POS multiempresa. Esta es una **corrección focalizada de cierre previo al piloto**, no otra refactorización general.

## Lee primero

- `docs/PLAN-13-CIERRE-EXCEL-Y-UX.md` (obligatorio, aplicar íntegramente).
- `docs/PLAN-13-RESULTADOS-QA-AUTOMATIZADA.md` (contexto financiero y pruebas anteriores).
- Inspecciona los componentes reales en local en vez de asumir que su versión coincide exactamente con GitHub.

## Problema real del propietario

Al pulsar `Descargar Excel`, la UI muestra:

`Failed to fetch dynamically imported module: http://localhost:5173/node_modules/.vite/deps/xlsx-js-style.js?v=...`

El componente interpreta el problema como fallo general de consulta (`No se pudo actualizar`). Además la barra `Excel` luce plana y desordenada frente a la antigua tarjeta `Exportar Reportes Contables`, que tenía icono, título, subtítulo, borde izquierdo verde, selector largo y botón esmeralda.

## Misión A — CORRECCIÓN FUNCIONAL OBLIGATORIA

1. Traza `ExportSales.jsx` → `useExportSales.js` → `import('xlsx-js-style')` → `buildSalesWorkbook` → Blob/descarga. Determina **dónde y por qué** falla el módulo con Vite dev, usando red y consola local, sin culpar sin pruebas a Firebase.
2. Diagnostica optimización de dependencias (`node_modules/.vite/deps`, `?v=...`, status HTTP, 504 outdated optimize dependency), recargas, caché del navegador y Service Worker de desarrollo. Si justificado, ajusta `optimizeDeps.include` o la estrategia de carga conservando lazy loading de Excel y el caché PWA actual.
3. Diferencia fallos de carga de librería, lectura de Firestore, integridad del reporte y descarga. Debe existir **reintento real inmediato tras fallo** sin bloqueo artificial de 5 segundos; conserva anti-doble-clic mientras se genera.
4. No uses fallbacks silenciosos, totales ficticios, archivos incompletos ni reportes parcialmente descargados.
5. Prueba desde el **clic real sobre el botón**: Vite dev y build/preview, XLSX reimportado con sus hojas y métricas, no solo tests unitarios que importan la librería de forma estática.
6. Conserva validaciones por identidad/sede y seguridad, cifrado de cachés, límites de exportación, revocación de ObjectURLs, descarga diferida PWA y CSP. Usa fixtures y entornos de ensayo sin Firebase real.

## Misión B — REFINAMIENTO UX OBLIGATORIO

Renueva `frontend/src/modules/ExportSales.jsx`, inspirado en la imagen antigua descrita en el plan:

- Tarjeta diferenciada con borde redondeado ~20–24px, sombra tenue, crema/canvas + tintes menta casi imperceptibles, **franja verde esmeralda vertical izquierda**.
- Cabecera iconográfica elegante, título visible `Exportar reportes contables`, descripción `Descarga un Excel con resumen financiero, movimientos, productos y sucursales para revisar tu negocio.`
- Segunda fila: selector grande con superficie gris azulada suave y botón **Descargar Excel** verde sólido, ambos alineados en desktop; apilados, 100% ancho, en móviles.
- Disclosure `Detalles de exportación` secundario e integrado.
- Error específico y compacto con acción de reintento, y detalles técnicos colapsables para soporte, **no** un bloque rojo enorme que desplace la página.
- Estados accesibles, foco correcto, colores mediante tokens ya existentes de Galaxy Nebula y sin incorporar dependencias.
- No alterar el historial de ventas ni el checkout POS ni el diseño financiero del Dashboard.

## Pruebas y entregable

Ejecuta (están autorizadas en esta tarea) las pruebas Node/Chromium relevantes, lint, build/PWA, Vite dev y preview según las herramientas ya instaladas. Agrega una regresión verificable para el fallo de lazy import, el reintento y la descarga real; protege la igualdad del Excel y Dashboard.

Crea `docs/CIERRE-EXCEL-UX-RESULTADOS.md` con causa raíz, diferencias de dev/preview, pasos de prueba, XLSX reimportado, resultados por caso, capturas/métricas si disponibles y pendientes reales. Si añades documentos, actualiza el inventario cerrado exacto de Markdown en `tests/ui-security.test.mjs`.

## Restricciones absolutas

- **No ejecutar nada de Git/GitHub:** ni comandos de consulta (`git status`, `git diff`), ni `gh`, ni APIs/conectores, ni commit/push/merge/branch. El propietario se encarga.
- **No** realizar deploy, escrituras en Firebase real, cambios de Firestore Rules/índices, ni instalaciones de dependencias/Java/navegadores.
- **No** cambiar lógica de negocio de ventas, anulaciones, caja, contratos, inventario ni fórmulas financieras para conseguir un PASS.
- **No** eliminar o rebajar pruebas, controles de seguridad, CSP o funciones offline.
- **No** declarar que MigaPOS está completamente listo para producción: esta fase solo cierra la exportación y su UX.

Comienza por la reproducción y reparación del error Excel; después implementa el rediseño y ejecuta las regresiones. Finaliza con un resumen breve de archivos tocados, prueba del clic de descarga, resultado UX y confirmación de restricciones.
