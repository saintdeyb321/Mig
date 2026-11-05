# MigaPOS — PLAN 10 / P10-06: corrección de regresiones UX del POS, Historial y sidebar

**Fecha:** 2026-11-05  
**Estado:** Especificación de corrección. No implica implementación ni aceptación.  
**Referencia auditada:** `saintdeyb321/Mig`, rama `fix/migapos-production-readiness`, commit `a72e9e9c6cd297e52693d676b2b9ea68e6c5387b` (Plan 10).  
**Documentos relacionados:** `docs/PLAN-10-UX-OPERATIVA-POS-HISTORIAL.md` y `docs/PLAN-10-RESULTADOS.md`.  
**Referencia visual obligatoria:** las capturas que entregó el propietario y las comparativas locales `.release/p10-visual/before-*` y `after-*` si existen.

## 1. Motivo y criterio del propietario

P10-00…P10-05 pasaron varias pruebas, pero el resultado visual NO fue aceptado. El usuario pide corregir, no volver a rediseñar desde cero. En la versión nueva, el carrito dedica demasiado espacio a controles y avisos frente a los productos; el sidebar desplaza elementos que deben permanecer fijos; el historial resulta menos legible, menos compacto y menos agradable que su composición anterior. El criterio de aceptación es **una mejora perceptible sobre la referencia anterior**, no solo que los elementos entren en pantalla o que el build termine.

## 2. Hallazgos en código fuente

| ID | Prioridad | Evidencia | Cambio requerido |
| --- | --- | --- | --- |
| P10-06-01 | P0 | `frontend/src/index.css`: `.pos-ticket-items { flex: 1 1 35%; }` y `.pos-ticket-payment { max-height: 42%; }`; P10 CI falló en foco de campo parcialmente oculto | Redistribuir la altura para que la lista sea el área elástica principal, el pago use su altura intrínseca y tenga scroll solo en altura reducida; entrada enfocada totalmente visible |
| P10-06-02 | P1 | `frontend/src/modules/pos/TicketParts.jsx`: `<details>` permanente «Límite por ticket» y contador «0 de 8 productos diferentes» | Retirar el texto técnico permanente del carrito, mostrar «N productos» en estado normal y aviso corto solo al alcanzar el límite; conservar validación de 8 productos en dominio |
| P10-06-03 | P1 | `frontend/src/modules/pos/PaymentParts.jsx`: hint permanente «Máximo S/ 50 000. Hasta dos decimales» | Reducir ruido visual sin suprimir validación ni errores; ayuda contextual o discreta si resulta necesaria, accesible para lector de pantalla |
| P10-06-04 | P0 | `frontend/src/layouts/AppLayout.jsx`: `.sidebar-scroll` envuelve marca, notificaciones, usuario, sucursal y módulos | Sidebar con zonas independientes: encabezado/identidad/sucursal inmóviles, lista de módulos como única zona desplazable, cierre de sesión inmóvil |
| P10-06-05 | P0 UX | `frontend/src/modules/sales-history/SaleHistoryCard.jsx`: tarjeta extendida, cabecera lavada, importe separado y botón de anulación a todo lo ancho; `index.css`: `.history-grid` | Restaurar composición clara y densa del historial de referencia y modernizarla: fecha+importe arriba, ID/sucursal/método, detalle de ítems legible, acciones secundarias compactas, estados financieros intactos |
| P10-06-06 | P1 | `frontend/src/modules/ExportSales.jsx` reducido pero aún ocupa dos líneas informativas | Mantener exportación compacta, sin reintroducir checkbox de consentimiento, mensaje de capacidad Spark o avisos técnicos; detalles desplegables disponibles |

### CI real que NO debe ignorarse

Workflow del commit `a72e9e9`: `https://github.com/saintdeyb321/Mig/actions/runs/42049674305` terminó con fallo en `PLAN 09 Node and Chromium UX regressions`. La aserción afectada es **«payment focus scrolls into the visible payment region above the checkout action»** (`tests/plan09.browser.test.mjs`). El log mostraba `field: [272,318]`, `payment: [281,309]`, `scroll:99`, `height:28`. Es un defecto de foco/viewport o un diseño inviable bajo ese tamaño: **no corregir alterando ni eliminando la aserción**. La ejecución anterior de backups/IndexedDB sí había pasado en este commit; la CI final sigue roja.

## 3. Diseño objetivo de POS: prioridad del área de productos

### Reglas

1. Estructura vertical del ticket en escritorio: **cabecera compacta → lista de productos (flexible, scroll propio) → total fijo → selector y campos de pago (altura intrínseca, scroll solo si estrictamente necesario) → CTA fijo**.
2. La lista de productos es la sección que absorbe primero el espacio sobrante y que se desplaza con muchos artículos. No darle `flex-basis` porcentual rígido que compita con una sección de pago desproporcionada. El ticket ocupa toda la altura real disponible, no más allá de la pantalla.
3. En alturas 560, 600, 700 y 900 px, asegurar que el CTA y el total sigan visibles y que los inputs de pago puedan enfocarse y quedar completamente dentro de su propia región visible. Si la ventana es demasiado baja, preferir scroll acotado del pago, no recortar el control o cubrirlo con el CTA.
4. Estado vacío: iconografía moderada y sin grandes bloques que reduzcan el área reservada para futuros productos. No agregar frases repetitivas, botones extras ni indicadores redundantes.
5. Contador: «0 ítems» o «0 productos» en lugar de «0 de 8 productos diferentes». Mostrar aviso corto «Llegaste al límite de productos de este ticket» únicamente en el límite efectivo, conservando el bloqueo de una novena línea y la posibilidad de aumentar cantidades válidas.
6. Eliminar de la UI normal el desplegable «Límite por ticket» y el párrafo «Máximo 8 productos diferentes por operación atómica verificada...». No tocar `VERIFIED_ATOMIC_LINE_LIMIT`, `checkoutPolicy`, `canAddDistinctProduct`, operaciones ni Rules.
7. Los avisos financieros de seguridad **sí deben mostrarse al ser relevantes**: stock cambiado, cobro incierto, error de pago, caja cerrada, read-only, offline, etc.
8. Mantener el drawer móvil y sus protecciones de foco, teclado táctil y safe areas; no crear un segundo carrito diferente.

### Resultado visual esperado

Se debe parecer más a la **segunda captura previa proporcionada**: lista principal amplia, total/tipo de pago/monto/CTA ordenados y compactos, menos bloques decorativos; evolución Galaxy Nebula morado profundo, sin introducir más pasteles.

## 4. Sidebar: scroll SOLO de módulos

En `AppLayout.jsx` redistribuir `<aside>` como columna de altura del viewport:

- **ZONA 1 fija:** marca MigaPOS, conectividad/notificaciones, usuario, sucursal activa o selector, sin scroll.
- **ZONA 2 flexible:** `nav` de módulos, con `min-h-0 flex-1 overflow-y-auto overscroll-contain`, y únicamente esta zona con barra de desplazamiento. Región nombrada y navegable con teclado.
- **ZONA 3 fija:** cerrar sesión y controles persistentes.

No usar `position: sticky` dentro de un único contenedor scrollable como sustituto de separar zonas. Probar con alturas de 560 px y navegación con teclado. No romper roles, permisos, orden de módulos, selector de sucursal ni notificaciones.

## 5. Historial: conservar lo bueno del MigaPOS anterior

**Referencia de aceptación:** captura anterior del propietario y `.release/p10-visual/before-history-3-1440.png` si existe. El P10 actual no es la referencia aspiracional.

Diseño de tarjeta solicitado:

- **Encabezado claro:** fecha/hora en primer plano, importe alineado al lado derecho; segunda línea con ID legible y nombre de sucursal, badge pequeño del medio de pago. Estado financiero accesible sin llenar media tarjeta de insignias.
- **Cuerpo:** ítems ordenados con cantidad, nombre y subtotal; densidad suficiente para ver varias ventas sin excesiva altura, separadores sutiles y fondos neutrales con contraste. Si hay muchos ítems, mantener acceso al detalle completo y evitar ocultar información financiera.
- **Pie compacto:** responsable a la izquierda; «Anular ticket» como acción secundaria delineada, no botón ancho que domine cada tarjeta. En estados pendientes, las acciones «Verificar»/«Revisar» sí deben ganar prioridad por seguridad.
- **Tarjetas y rejilla:** usar 3 columnas en escritorio cuando quepan de verdad, 2 en tablet, 1 en móvil; preservar lectura, evitar recortes y grandes áreas de relleno vertical. No forzar alturas mínimas artificiales; mantener coherencia en filas.
- **Color:** mantener Galaxy Nebula con morado/índigo profundo en acentos, pero NO bañar todas las tarjetas de un lila lavado. Superficies claras, sombras discretas y bordes/tiras superiores por estados; verde para confirmado, rojo para error/anulación, ámbar para pendientes, violeta para branding/selección. Contraste WCAG AA.
- **Datos:** conservar ID, medio, total, productos, estados `draft_offline/rejected/uncertain/voidPending/voided`, observaciones, acciones y permisos. La simplificación debe ser de **presentación**, nunca de información crítica ni reglas de negocio.
- **Exportación Excel:** conservar la barra de selección/descarga de P10 en una sola línea a ancho suficiente, con ayuda técnica plegada; priorizar ventas al entrar al módulo. No reintroducir confirmaciones redundantes ni quitar validaciones del hook.

## 6. Restricciones obligatorias

- Solo frontend visual + tests de presentación. Prohibido modificar: hooks/dominio/transacciones de ventas/caja, Firestore Rules/índices, auth/permisos, IndexedDB/caché/PWA, reportes XLSX, dependencias, runtime Spark, deploy/release.
- Las skills ya instaladas pueden usarse **localmente**; UI/UX Pro Max como pauta, no como permiso para inventar patrones o reescribir el design system. No instalar frameworks nuevos.
- **Codex: absolutamente ningún comando Git/GitHub (`git`, `gh`), ni API/conectores Github, ni auth, ni commits, push, ramas, merges o deploys.** El propietario se encarga.
- No eliminar aserciones ni relajar tests para obtener PASS. Se permite ampliar tests o adaptar selectores solo si una etiqueta visible cambió realmente; justificar y demostrar preservación.
- No declarar «listo para vender» antes de CI verde, pruebas financieras/QA manual de aceptación y despliegue supervisado.

## 7. Fases de ejecución

**P10-06-A — Baseline visual:** leer las capturas, inspeccionar JSX/CSS actuales y documentar qué empeoró frente a la referencia. No cambiar de nuevo la arquitectura general.

**P10-06-B — Ticket:** reestructurar distribución de altura, eliminar ayuda de límite permanente y compactar pago. Probar 0, 1, 5 y 8 líneas con efectivo, Yape/Plin y mixto, en modo read-only, caja cerrada y abierta, desktop y drawer móvil.

**P10-06-C — Sidebar:** separar cabecera, lista scrollable y pie fijo con teclado y viewport reducidos.

**P10-06-D — Historial:** recomponer tarjetas a partir de la referencia anterior, ajustar densidad, jerarquía, fondos y acciones; verificar todos los estados y errores, exportación compacta.

**P10-06-E — Regresión:** ejecutar lint/build, P09 + P10 browsers (sobre todo foco de campo en alturas pequeñas), pruebas financieras locales permitidas, revisión visual/manual de capturas. Corregir el defecto real, nunca la aserción para callar el fallo.

**P10-06-F — Entrega:** generar `.release/p10-06-visual/` con comparativas etiquetadas antes/después; documentar en `docs/PLAN-10-CORRECCION-P10-06-RESULTADOS.md` los cambios, capturas, pruebas, hallazgos y pendientes. No ejecutar Git/GitHub.

## 8. Criterios bloqueantes de aceptación

1. Usuario confirma que el POS **tiene más espacio para la lista de artículos** que P10; panel de pago y CTA no lo estrangulan.
2. Campo de pago enfocado visible íntegramente en viewport pequeño, sin perder total o CTA y sin fallar la aserción P09.
3. Párrafo técnico y desplegable «Límite por ticket» ya no aparecen permanentemente; el límite de 8 sigue operativo y los avisos contextuales funcionan.
4. Sidebar: marca, usuario, sucursal, notificaciones y cerrar sesión quietos; solo módulos se desplazan.
5. Historial visualmente iguala o supera la **referencia previa del propietario**, con 3 tarjetas legibles en escritorio y sin botón de anulación a todo el ancho como protagonista.
6. Todas las clases de estado financiero conservan distinciones, permisos y acciones; no hay mezcla de tickets de sucursal ni doble cobro.
7. Excel conserva funcionalidad sin volver a ocupar un bloque alto.
8. Capturas completas comparativas en 1440×900, 1024×768, 390×844 y 320×560; caja abierta/cerrada, POS vacío/lleno, historial 1/3/10 tickets y estados de excepción.
9. Lint/build y baterías P09/P10 + pruebas existentes sin regresión. Fallos externos documentados honestamente.
10. Nada de Git/GitHub ni deploy por Codex.

**Regla de cierre:** si el diseño está peor que la referencia en una dimensión significativa, declarar **NO APROBADO** y corregir antes de entregar. Los tests de layout no sustituyen aceptación visual.
