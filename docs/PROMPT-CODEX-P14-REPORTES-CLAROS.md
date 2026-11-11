# PROMPT TÉCNICO PARA CODEX — MIGAPOS P14-RC+ (REPORTES + PALETA CÁLIDA GLOBAL)

## Contexto

La captura del informe gerencial muestra avisos repetidos «Conciliación pendiente» con `Contado S/100.00`, sin explicar a los dueños qué significan. El Excel `Resum_<sede>` usa las columnas `Ingreso`, `Efectivo`, `Yape/Plin`, `Ingreso POS`, `Ingreso Pedidos` y `Pagos Pedidos`, que son ambiguas. El objetivo es UX semántica del informe **y una corrección cromática global heredada** (marfil cálido + sidebar violeta vivo) sin tocar el motor financiero.

**Trabaja exclusivamente en:** `C:\Proyectos\MigaPOS`.\
**Rama elegida por el propietario:** `marketing/video-promo-migapos`.\
**No consultar ni cambiar la rama con Git.** No tocar `marketing/**` ni `.agents/**`, aunque la rama tenga material promocional. No investigar/reproducir/editar videos, audio ni assets.

Lee íntegramente `docs/PLAN-P14-REPORTES-CLAROS-AVISOS-CAJA.md` y cumple sus especificaciones y restricciones.

## Etapa A — Auditoría rápida y minimalista

1. Inspecciona solo estos archivos locales de reportes: `managementReportHtml.js`, `cashAuditRows.js`, `reportViewModel.js`, `salesDataProcessor.js`, `salesWorkbook.js`, `excelHelpers.js`, `reportTotals.js`, `sessionReportReads.js`, `useExportSales.js`, y tests relacionados.
2. Confirma con el código que `Alertas operativas` se deriva de eventos de caja, no de notificaciones. No cambies los datos monetarios ni las fuentes.
3. Confirma que `dailyReportRows().Ingreso === day.netRevenue` y que `Efectivo`/`Yape/Plin` corresponden a netos contables. Estudia la semántica exacta de `contractPaymentCount` antes de renombrarla.
4. Identifica todos los puntos que usan cadenas como claves de columnas, estilos, filtros, sumas y pruebas. Presenta un resumen breve en el informe final.

## Etapa B — Implementación UX

1. Cambia el título del PDF a «Cajas que requieren revisión», con explicación corta de que son incidencias de turnos de caja, no notificaciones ni alertas de usuario.
2. Muestra como máximo 6 incidencias ordenadas de más reciente a más antigua, sin añadir lecturas. Muestra el total de incidencias del período si deriva del arreglo ya recibido.
3. Explica claramente vencimiento sin arqueo, conciliación pendiente, faltante y sobrante; muestra `Efectivo declarado` solo si el dato realmente se declaró. Nunca inventes diferencia ni uses `S/ 0` para nulo.
4. Mejora presentación en PDF A4 con tarjetas/filas semánticas compactas, acento Galaxy Nebula sobrio, saltos de página controlados, jerarquía por relevancia y buen contraste. No crear secciones extensas ni páginas adicionales por seis avisos.
5. En las hojas de resumen por sede (`Resum_<sede>`) reemplaza los encabezados ambiguos conforme al plan:
   - `Ingreso` → `Total neto registrado (S/)`.
   - `Efectivo` → `Neto en efectivo (S/)`.
   - `Yape/Plin` → `Neto por Yape/Plin (S/)`.
   - `Ingreso POS` → `Neto de ventas en mostrador (S/)`.
   - `Ingreso Pedidos` → `Neto de pagos de pedidos (S/)`.
   - `Tickets POS` → `Tickets de venta válidos`.
   - `Anulados` → `Ventas anuladas`.
   - `Pagos Pedidos` → `Pagos de pedidos (cantidad)`.
6. Incluye en el Excel una explicación breve de qué es el neto contable y qué no representa; no crear otra hoja solamente para texto. Respeta anchos, filtros, celdas de fecha, formatos `S/`, conteos y encabezados inmovilizados.
7. Audita etiquetas equivalentes en `Comparativa_Sedes` y `Resumen_Financiero` para evitar palabras contradictorias; no modifiques `Detalle_<sede>`, `Auditoría_Pedidos` o `Auditoría_Cajas` salvo términos efectivamente confusos demostrados.
8. Centraliza nombres de métricas donde reduzca errores, pero sin introducir una abstracción gigante ni rehacer los generadores. No añadir dependencias.

## Etapa C — NUEVO: aplicar paleta global cálida con mínimo cambio

Lee la **sección 6 del plan completo**. La referencia visual del propietario muestra una aplicación luminosa con fondo **crema/panadería**, tarjetas muy claras y sidebar **morado galaxia vivo**, no un sistema gris, apagado o uniformemente azul.

1. Inspecciona los tokens reales `--color-canvas`, `--color-panel`, `--color-subtle`, `--color-line`, `--color-sidebar`, `--color-ink`, `--color-muted`, `--color-primary` en `frontend/src/shared/styles/theme.css`; revisa `frontend/src/index.css`. Usa **un único sistema de tokens compartidos** en vez de retocar 10 módulos.
2. Cambia la base a marfil cálido (orientativo `#FFF9F1`) y paneles ligeramente claros (orientativo `#FFFEFA`), con bordes suaves y textos oscuros legibles. Sidebar morado profundo con degradado moderado si el layout lo permite. Mantén activos/CTA con energía visual, sin saturar toda la pantalla.
3. Limita los cambios globales a `theme.css`, `index.css` y, **solo si es necesario**, `AppLayout.jsx` y `BottomNav.jsx` para los fondos de contenedores o sidebar. No alterar las rutas, elementos funcionales ni layout vertical del POS.
4. Evalúa Dashboard, POS, Historial, Contratos, Caja, Personal, Ajustes, Reportes, Productos, Categorías, modales y móvil mediante herencia de tokens; no modifiques el código de cada módulo. Diferencia superficies por función con colores pastel suaves, sin introducir colores arbitrarios por tarjeta.
5. Mantén **el carrito del POS acotado al viewport** con Cobrar/total siempre accesibles, bordes/focos contrastados y cero scroll horizontal accidental. No romper la capacidad de imprimir/guardar el informe: papel blanco y acentos discretos, no hojas crema de tinta intensiva.
6. Mide o comprueba contraste de texto y controles (objetivos WCAG AA 4.5:1 / 3:1 según corresponda), responde a `prefers-reduced-motion` y verifica pantallas 375×667, 768×1024, 1280×560 y 1440×900.
7. Captura o describe con evidencia antes/después, en especial Dashboard y POS; documenta la lista exacta de tokens modificados y confirma **cero lecturas Firestore adicionales**.

No instalar bibliotecas, no editar diseño de marketing, no convertir esto en una refactorización funcional. **Preferir dos archivos CSS**; cualquier excepción debe justificarse.

## Etapa D — Invariantes, rendimiento y regresiones

1. Prueba el ejemplo del usuario:
   - 24/10/2026: neto 6, efectivo 5.50, digital 0.50, POS 6, pedidos 0, pagos 0.
   - 27/10/2026: neto 222, efectivo 100, digital 122, POS 17, pedidos 205, pagos 3.
2. Comprueba `Neto total = Neto efectivo + Neto digital = Neto POS + Neto pedidos` para esos casos y otros con anulaciones, reembolsos contables y signos negativos. Mantén Dashboard, XLSX y PDF consistentes.
3. Reimporta XLSX y verifica encabezados, formato numérico/money, freeze y autofiltro. Actualiza tests que referencian los encabezados anteriores, conservando intactas sus verificaciones financieras.
4. Verifica que PDFs con 0, 1, 6 y más de 6 incidencias no afirmen hechos no verificados. Las filas de auditoría de caja no se deben recortar por el límite visual del PDF.
5. Verifica mediante tests instrumentados **cero llamadas adicionales a SDK** debidas a la transformación PDF o al cambio de encabezados de XLSX, con caché vigente para el mismo usuario/negocio/sede/período.
6. Ejecuta pruebas Node/Chromium que existan, lint y build/PWA sin instalaciones. Si los tests de Rules requieren Java y no está disponible, deja `BLOCKED` sin instalar Java.
7. Crea `docs/RESULTADOS-P14-REPORTES-CLAROS.md` con cifras, resultados y limitaciones. Actualiza la allowlist exacta de Markdown en `tests/ui-security.test.mjs` únicamente cuando sea necesario; nunca relajes controles de seguridad.

## Restricciones absolutas

- Prohibido ejecutar Git, gh, API/conector de GitHub, comandos de ramas, commits, push, pull, diff o status.
- Prohibido modificar cualquier archivo de `marketing/**`, `.agents/**`, videos, audios y assets, aun si los encuentras dentro de la misma rama. **Única excepción al alcance anterior:** CSS global de aplicación (`frontend/src/shared/styles/theme.css`, `frontend/src/index.css`) y el shell visual (`frontend/src/layouts/AppLayout.jsx`, `frontend/src/BottomNav.jsx`) solo cuando resulte indispensable; no otros módulos.
- Prohibido deploy, publicar en Firebase real, instalar dependencias, borrar datos, modificar Firestore Rules, índices, autenticación, caja, ventas o dominio financiero.
- No añadir nuevas consultas ni cambiar TTL/caché/paginación en esta iteración.
- No modificar los valores numéricos para que coincidan con las etiquetas.
- No mentir sobre el resultado de una prueba ni afirmar que se verificó el nombre de la rama mediante Git.

## Entrega final

Responde con: (1) lista exhaustiva de archivos modificados dentro del alcance, (2) capturas/resultados de PDF y XLSX, (3) capturas comparativas del fondo global y sidebar en módulos clave, (4) tabla de pruebas PASS/FAIL/BLOCKED incluyendo POS 1280×560 y móvil, (5) evidencia de 0 lecturas adicionales, (6) cualquier ambigüedad financiera aún pendiente, (7) confirmación expresa de que NO tocaste marketing ni ejecutaste Git/GitHub/despliegues.
