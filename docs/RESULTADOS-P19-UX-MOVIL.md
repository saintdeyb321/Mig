# P19 · Resultados de UX móvil

## Cambios

| Área | Antes | Después |
| --- | --- | --- |
| Navegación | Cabecera y barra inferior claras. Selector de sede en una segunda fila de altura fija. | Degradado y estados del sidebar en móvil, selector nativo con nombre visible en varias líneas, controles de 44 px y menú «Más» con foco de retorno. |
| POS | Dos columnas forzadas a 320 px. El botón flotante tenía su propio desplazamiento respecto al menú y podía cubrir productos. | Tarjetas horizontales de una columna cuando el catálogo es estrecho y cuadrícula adaptable en los demás anchos. El catálogo móvil desplaza dentro de su área. Ticket y navegación comparten una barra con espacio propio y área segura. |
| Contratos | Acciones, ordenamiento, filtros y textos largos competían por el ancho. | Estado de caja separado de «Nuevo Pedido», búsqueda y orden en filas adaptables, filtros desplazables, importes e identificadores legibles y tres formatos de impresión accesibles. |
| Categorías | Alta y archivo usaban anchos dispares. | Controles al ancho disponible, nombres largos envueltos y edición con área táctil amplia. |
| UI compartida | Zoom bloqueado por el viewport. El drawer podía recortar el pie con el teclado. | Zoom habilitado, medidas de viewport visual y áreas seguras, scroll del drawer cuando falta altura, foco de retorno y formularios con acciones alcanzables. |

En Productos, Historial, Reportes, Agenda, Personal, Sedes, Ajustes, SuperAdmin y respaldos se reutilizaron los controles compartidos. La regresión P09 revisa el desbordamiento de estas vistas y sus formularios. La caja, los cobros, stock, offline, fotos P18, respaldos, permisos, Rules e índices conservan sus protocolos existentes.

## Archivos

- Shell y UI compartida — `frontend/index.html`, `frontend/src/index.css`, `layouts/AppLayout.jsx`, `layouts/MobileDockContext.js`, `BottomNav.jsx`, `components/{BranchSelector,NetworkBadge,NotificationBell}.jsx`, `shared/ui/{Dialog,IconButton,PageHeader,SearchField}.jsx` y `shared/ui/useVisualViewport.js`.
- Módulos — `modules/POS.jsx`, `modules/pos/{CatalogParts,TicketParts}.jsx`, `modules/CategoryManager.jsx`, `modules/contracts/ContractManager.jsx` y `modules/contracts/components/{ContractCard,ContractDetailsModal,ContractFormModal}.jsx`.
- Validación — `tests/plan09.fixture.jsx`, `tests/plan09.browser.test.mjs` y el inventario Markdown exacto de `tests/ui-security.test.mjs`. Las rutas de UI abreviadas son relativas a `frontend/src/`.

## Evidencia local

Se usaron datos de simulación. Los directorios `.release/qa-p19/before/` y `.release/qa-p19/after/` contienen las capturas de POS, Contratos y Categorías para 320×568, 360×740, 390×844, 430×932 y 1280×560. Cada directorio contiene su `geometry.json`. La evidencia incluye el formulario de pedido y el teclado simulado a 320 px.

En POS a 320×568, la cabecera pasó de 149 a 111 px y la barra de navegación de 80 a 63 px. El catálogo pasó de dos columnas de 142 px a una de 296 px. La separación entre «Ver ticket» y la navegación pasó de 4 a 9 px y el último producto quedó alcanzable dentro del área de desplazamiento.

| Vista | Antes | Después |
| --- | --- | --- |
| POS a 320 px | [Captura](../.release/qa-p19/before/pos-320x568.png) | [Captura](../.release/qa-p19/after/pos-320x568.png) |
| Contratos a 390 px | [Captura](../.release/qa-p19/before/contracts-390x844.png) | [Captura](../.release/qa-p19/after/contracts-390x844.png) |
| Categorías a 320 px | [Captura](../.release/qa-p19/before/categories-320x568.png) | [Captura](../.release/qa-p19/after/categories-320x568.png) |
| POS a 1280×560 | [Captura](../.release/qa-p19/before/pos-1280x560.png) | [Captura](../.release/qa-p19/after/pos-1280x560.png) |

## Validación

Chromium 157 en Windows. La matriz P19 contempla 320×568, 320×640, 360×740, 375×667, 390×844, 412×915, 430×932, 667×375, 844×390, 768×1024, 820×1180, 1024×768, 1280×560 y 1440×900. Los tamaños son píxeles CSS. El teclado se simula con la altura e insets del viewport visual.

- **PASS** · 177 pruebas Node, incluidas UI/seguridad, caja, contratos, sesión, reportes y respaldos.
- **PASS** · 82 pruebas de Rules y transacciones en Firebase Emulator Suite con `demo-migapos`, incluidas fotografías P18.
- **PASS** · Lint frontend y build/PWA demo. 45 archivos locales de precaché (2,94 MiB), Excel diferido y scripts externos verificados.
- **PASS** · Cuatro pruebas Chromium sobre el build final (P14-RC, P09, P19 y P10-06), sin fallos. P09 incluye 199 comprobaciones de vistas, roles, diálogos y foco.
- **PASS** · Regresiones Chromium de caja de 14 h, montos exactos, POS offline, IndexedDB, sesión, P18, PDF y Excel.
- **PASS** · Matriz P19 con 42 combinaciones de vista y tamaño. Verifica desbordamiento horizontal, controles principales de 44 px, alcance del último producto, 17 opciones de filtro, 23 pedidos, nombres e importes largos, foco de retorno y texto al 200 %. Las tres plantillas de impresión se verificaron con un destino simulado.
- **BLOCKED** · Pruebas físicas en iPhone Safari y Samsung Internet, teclado nativo, áreas seguras de hardware, impresión física y PWA instalada. Requieren dispositivos y aceptación del propietario.
- **PENDIENTE** · CI Ubuntu y aceptación visual del propietario.
