# Prompt para Codex — ejecutar P19 UX móvil de MigaPOS

Actúa como arquitecto senior React/Tailwind CSS v4, especialista en responsive mobile-first, accesibilidad, CSS Grid/Flexbox y pruebas de interfaz.

**Código local:** `C:\Proyectos\MigaPOS`.
**Rama de referencia auditada:** `fix/migapos-production-readiness`, SHA remoto `7c0fe8edd51c6da6cef48c65e036235875801c68`.
**Plan obligatorio:** `docs/PLAN-UX-MOVIL-RESPONSIVE-MIGAPOS-P19.md` (el propietario copiará ahí el MD adjunto antes de ejecutar).

**OBJETIVO:** IMPLEMENTA el plan P19. Arregla el UX móvil del shell/nav y los módulos POS, Contratos, Categorías y los patrones compartidos que afecten a los demás módulos. Corrige deformación de tarjetas, acciones que se comprimen o solapan y el launcher «Ver ticket» frente al bottom nav. Mantén la paleta existente morado/azul tipo galaxia; usa el mismo gradiente `.nebula-brand` del sidebar para el header y bottom-nav móviles con contraste y estados de navegación apropiados. El contenido interno puede continuar claro.

**PASOS:**
1. Comprueba que el árbol local corresponde a la rama prevista; conserva cambios no relacionados. Lee el MD, las capturas suministradas por el propietario y solo los archivos pertinentes al plan. Evita una auditoría general.
2. P0: `AppLayout.jsx`, `BottomNav.jsx`, `BranchSelector.jsx`, `NetworkBadge.jsx`, `NotificationBell.jsx` y estilos. Convierte header y bottom-nav a nebula oscura sin romper los controles, el selector ni el menú «Más». Resuelve safe areas, alto variable del footer, scroll y foco.
3. P1: `POS.jsx`, `CatalogParts.jsx`, `TicketParts.jsx`. Sustituye las columnas forzadas cuando no caben por una rejilla adaptativa; respeta separación entre nombre/precio/stock/añadir; controla carril de categorías y caja; reubica el launcher encima del footer sin tapar contenido. Conserva el drawer, pagos y offline sin alterar su lógica.
4. P2: `ContractManager.jsx`, `ContractCard.jsx`, `PageHeader.jsx` y modales relacionados. Reorganiza en móvil caja/cerrar caja/Nuevo Pedido, búsqueda/orden, pestañas de estado, tarjetas, importes, badges, impresión y Gestión. No escondas funciones ni modifiques lógica financiera.
5. P3/P4: `CategoryManager.jsx`, `ProductCatalog.jsx`, historial y módulos del menú «Más»: audita con una checklist corta los patrones compartidos y corrige únicamente casos reproducidos de overflow/tap targets/scroll/modales.
6. P5: añade y ejecuta regresiones visuales/geométricas para anchos 320, 360, 375, 390, 412, 430, 768 y escritorio, alturas bajas, orientación horizontal, contenido largo, teclado/zoom. Usa pruebas existentes de Chromium; screenshot y aserciones de bounding rect. Reporta navegadores físicos no probados como BLOCKED.

**REGLAS UX INNEGOCIABLES:** no scroll horizontal global; ningún botón sobre otro; botones táctiles >=44×44 CSS px; tarjeta sin precio recortado; mantén `min-w-0`, `minmax(0,1fr)`, buen wrap y container queries cuando sean útiles; no arreglar con `overflow:hidden` en toda la página; el carrito no tapa nav ni acciones. Usa tokens del sistema visual existente. Asegura foco visible, contraste y `prefers-reduced-motion`.

**RESTRICCIONES:** no cambiar Git/rama ni crear commits/push/merge; no deploy; no instalar librerías/skills sin necesidad; no modificar `firestore.rules`, `firestore.indexes.json`, seguridad/CI, Firebase real, operaciones financieras, caja de 14h, cobros, permisos, fotos P18, índices ni backup. Si el entorno local muestra cambios previos, consérvalos. No aplicar una refactorización masiva o reescribir componentes sanos.

**SALIDA:** crea `docs/RESULTADOS-P19-UX-MOVIL.md` con antes/después por módulo, archivos y pruebas PASS/FAIL/BLOCKED. Incluye screenshots de los tamaños críticos si el entorno lo permite. Entrega código corregido, no solo sugerencias. No afirmes producción lista hasta validación del propietario y CI.
