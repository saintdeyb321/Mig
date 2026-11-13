# MigaPOS — P19 · UX móvil adaptable, navegación nebulosa y componentes sin solapamientos

**Fecha:** 12/11/2026  
**Repositorio:** `saintdeyb321/Mig`  
**Rama de referencia:** `fix/migapos-production-readiness`  
**SHA remoto auditado:** `7c0fe8edd51c6da6cef48c65e036235875801c68`  
**Alcance:** presentación responsive, accesibilidad, estabilidad de scroll y componentes React. No afecta operaciones financieras, datos, Firestore Rules, índices, roles, cajas, licencias ni pagos.

## 1. Decisión y base de evidencia

**P19 UX móvil: NOT READY.** Las tres capturas aportadas de un Samsung muestran: (a) navegación superior/inferior de fondo blanco, desconectada de la identidad nebula del escritorio; (b) tarjetas POS demasiado comprimidas y un lanzador fijo de ticket que ocupa la parte inferior; (c) en Contratos, controles de caja/nuevo pedido y filtros distribuidos de forma irregular; (d) en Categorías, cabecera con acción y barra de filtros voluminosas. Las capturas demuestran el estado visual de esas pantallas, pero **no** prueban fallos en otras rutas no visibles ni permiten afirmar compatibilidad real con todos los móviles.

**Inspección estática en GitHub:**

- `frontend/src/layouts/AppLayout.jsx` líneas 28 y 48–66: escritorio usa `.nebula-brand` en el sidebar; header y bottom-nav móvil usan `bg-panel`. El `main` tiene padding inferior fijo basado en `6rem` y el menú inferior es `fixed`.
- `frontend/src/BottomNav.jsx` líneas 19–44: estilos activos/inactivos móviles diseñados para fondo claro; menú `Más` usa portal Radix. No basta cambiar el contenedor a oscuro: también requieren variantes de texto, iconos, foco y estado activo.
- `frontend/src/components/BranchSelector.jsx`: posee opción `dark` que se utiliza en escritorio, pero no en el header móvil; `NetworkBadge.jsx` ya soporta `dark`; revisar `NotificationBell` e `IconButton` para contrastes.
- `frontend/src/index.css` líneas 30–40 y 48–56: `.nebula-brand` define el gradiente y `.pos-cart-launcher` se coloca a una distancia inferior fija `calc(4.5rem + safe-area + 0.75rem)` sin derivarla de la altura real del bottom-nav.
- `frontend/src/modules/POS.jsx` líneas 148–170: barra de caja con `flex-wrap`, catálogo `grid-cols-2` desde el primer pixel y `sm:grid-cols-3`, filtro horizontal y lanzador del carrito `fixed`.
- `frontend/src/modules/pos/CatalogParts.jsx` líneas 11–26: filtros de chips con scroll horizontal y tarjetas con precio + botón `+` en una fila estrecha.
- `frontend/src/modules/contracts/ContractManager.jsx` líneas 169–205: `PageHeader` con estado de caja, cerrar caja, nuevo pedido; controles de búsqueda/orden; tres botones de filtro de pedidos dentro de `.segmented-control`, todos con `flex-1` y texto largo.
- `frontend/src/shared/ui/PageHeader.jsx` líneas 4–14: header con `flex-wrap` y `actions` alineadas al final; necesita contrato responsive coherente según anchura real de la tarjeta.
- `frontend/src/modules/contracts/components/ContractCard.jsx` líneas 95–130: información financiera en dos columnas y tres acciones de impresión en `grid-cols-3`; revisar texto, overflow y ancho mínimo.
- `frontend/src/modules/CategoryManager.jsx` líneas 61–87: comparte `PageHeader` y `view-toolbar`, con búsqueda + archivados; su `CategoryCard` tiene rejilla de icono, nombre y botón de edición. La captura no enseña la tarjeta de categoría: comprobarla en pruebas, no adjudicarle un fallo sin reproducirlo.
- `frontend/src/shared/styles/theme.css` define la paleta existente: `--color-sidebar #301b50`, `--color-sidebar-end #512d91`, `--color-brand-deep #352064`, `--color-sidebar-active #3f4bc4`, `--color-nebula #8d58d8`, `--color-stellar #2d57d2`; reutilizarla, no inventar una marca nueva.

**No confundir:** la CI de dependencias del SHA auditado permanecía bloqueada por auditoría `npm` en la revisión anterior; P19 no debe alterar el lockfile ni silenciar seguridad para presentar UX como lista para producción.

## 2. Objetivos de producto

1. Navegación móvil coherente con escritorio: gradiente oscuro índigo/morado en header y barra inferior; texto e iconos claros; activo claramente visible en morado-azul, sin superficies blancas dominantes.
2. Ningún componente solapado, recortado, comprimido de forma ilegible o generador de scroll horizontal global entre **320 y 430 CSS px**; comportamiento correcto también en tablet y escritorio.
3. Los botones nunca empujan tarjetas hermanas ni desplazan el contenido financiero esencial. El tamaño o número de columnas responde al **espacio de contenedor**, no solo al viewport.
4. Navegación, botón «Ver ticket», menús, avisos, modales y teclado virtual conviven sin tapar acciones.
5. Mantener funciones, estados, permisos, texto financiero y rutas existentes. No remover la opción de imprimir, cobrar, editar, gestionar, seleccionar sede o entrar a «Más».
6. Mantener presentación accesible: foco visible, contraste WCAG AA orientativo (4.5:1 texto normal, 3:1 controles), objetivos táctiles mínimos 44×44 CSS px y soporte a texto ampliado/reduced motion.

## 3. Reglas de diseño obligatorias

- **Encapsulación:** cada tarjeta/rejilla debe tener `min-width:0`, contenido con `overflow-wrap:anywhere` donde corresponda; evitar `w-screen`, widths rígidos y transformaciones que desborden. No aplicar `overflow-x:hidden` global como «solución» que oculte botones.
- **Grid por contenedor:** usar `minmax(0,1fr)` y, cuando encaje, `repeat(auto-fit,minmax(min(100%,<ancho útil>),1fr))` o container queries; a 320 px preferir una columna si dos no permiten nombre, precio y acción. A 360–430 px dos columnas solo cuando visualmente cómodas; en tablet se incrementan.
- **Espaciado:** escala consistente (8, 12, 16, 20, 24 CSS px), gap real entre botones/tarjetas, padding adaptable. Ningún botón con márgenes negativos para «entrar» a la fuerza.
- **Controles largos:** `flex-wrap`/grid con filas útiles, `minmax(0,1fr)` y ancho completo cuando proceda; evitar tres botones de texto largo encajados sin reserva. Opcional menú agrupado («Imprimir») si preserva todas las acciones y es accesible.
- **Alturas:** en el shell usar `100dvh`, `safe-area-inset-*` y las variables de `useVisualViewport`; nunca asumir alto fijo de barra inferior/teclado o viewport estable en Android/iOS. La barra inferior no debe tapar la última acción.
- **Scroll:** scroll vertical principal normal; categorías en carril horizontal intencional con pista visual de desplazamiento, sin scrollbar grotesca ni corte abrupto de chips. No causar scroll lateral de la página. Conservar el estado de filtros y del carrito.
- **Sticky/fixed:** calcular y reservar una única altura efectiva del nav inferior (CSS compartido o medición controlada), incluyendo safe area; colocar el launcher POS encima con espacio 8–12px; al abrir drawer/teclado debe evitarse superposición.
- **Color:** mantener tema claro del **contenido** (tarjetas, formularios y superficies de trabajo) y usar nebula oscura para **chrome de navegación**; al pasar a dark, adaptar explícitamente iconos, estados activos, Focus Ring, sombras/bordes, selector de sede y dropdown «Más». Evitar globalmente poner `color-scheme:dark` en formularios que siguen claros.
- **Accesibilidad:** no ocultar información financiera o permisos en móvil; evitar truncamiento sin acceso al texto completo; encabezados semánticos, botones `aria-label`, controles navegables por teclado y lector de pantalla; `prefers-reduced-motion`.

## 4. Implementación por prioridad

### P0 · Shell y navegación móvil (bloqueante)

**Archivos base:** `AppLayout.jsx`, `BottomNav.jsx`, `BranchSelector.jsx`, `NetworkBadge.jsx`, `NotificationBell.jsx`, `index.css`, `theme.css`, `shared/ui/IconButton.jsx` (solo si es necesario).

- Reusar `.nebula-brand` o extraer una variante reutilizable para header y nav de móvil, compartiendo tokens con sidebar; degradado oscuro sin aumentar ruido visual ni animaciones costosas.
- Header: logo y nombre al inicio; conexión/notificaciones/salir con zonas táctiles suficientes y espaciado, sin que desaparezca la selección de sucursal. Gestionar nombres largos y una fila adicional para sucursal cuando sea necesario.
- `BranchSelector` móvil debe aceptar estilo `dark` y opciones legibles; el dropdown de selección nativo debe mantener contraste, foco y accesibilidad.
- Bottom nav: iconos/textos claros, activo bien contrastado, 3 accesos y «Más» adaptados a 320px, etiquetas hasta dos líneas cuando haga falta, íconos sin encogerse; radices menú «Más» sobre el nav, usable por teclado y touch, con portal alto z-index.
- Reservar altura real de bottom-nav, incluyendo `env(safe-area-inset-bottom)`, y armonizar `main` con el launcher de ticket. Preferir un solo mecanismo de layout (evitar múltiples offsets independientes sin relación).
- La barra oscura no debe volverse blanca al navegar, reconectar, cambiar de cuenta, abrir «Más» o cambiar de orientación.

**Aceptación P0:** sin solapes header, selector, footer, carrito y teclado; marcas y controles visibles a 320px; estados active/inactive y focus legibles; no scroll global horizontal.

### P1 · POS: tarjetas, filtros, caja y launcher (bloqueante)

**Archivos:** `modules/POS.jsx`, `modules/pos/CatalogParts.jsx`, `modules/pos/TicketParts.jsx`, `index.css` y UI compartida si hay problema probado.

- Catálogo adaptable por anchura útil (320px, 360px, 375px, 390px, 412px, 430px, tablet). Evitar obligar siempre a 2 columnas. Nombres de productos (cortos/largos), precios grandes, stocks y botón añadir deben conservar legibilidad sin invadir otra tarjeta.
- En `ProductCard`, estructurar precio y acción con tamaño mínimo; cuando el ancho sea insuficiente, permitir distribución vertical o variante compacta, sin truncar montos ni reducir áreas táctiles por debajo de 44px. Mantener tarjeta clicable accesible.
- Barra de caja abierta + cerrar caja: distribución en filas cuando sea necesario, gap consistente; jamás comprimir badge hasta ocultar tiempo, monto o botón.
- Filtros de categorías: carril horizontal con indicadores de deslizamiento, scroll táctil nativo, chips completos, `shrink-0`, padding lateral y `aria-pressed`; permitir que el último sea alcanzable.
- Botón `Ver ticket (N)` debe quedar encima de bottom-nav, sin tapar tarjetas ni botones, aun con safe area y orientación distinta; reservar espacio inferior en el catálogo. Un solo CTA fijo.
- Drawer del ticket: conservar límite visible de pantalla, scroll de ítems/área de pago, resumen y CTA; al abrir teclado o cambiar de método de pago el botón «Cobrar»/«Guardar sin cobrar» sigue alcanzable. Mantener toda la lógica offline, stock, cálculo, descuentos y confirmación intacta.

**Aceptación P1:** añadir, actualizar cantidades, abrir ticket, cambiar medio de pago y cerrar drawer sin colisiones; precio legible y producto visible; ni tarjetas ni CTA flotante empujan el nav.

### P2 · Contratos: cabecera, filtros y tarjetas (bloqueante)

**Archivos:** `ContractManager.jsx`, `ContractCard.jsx`, `shared/ui/PageHeader.jsx`, `ContractDetailsModal.jsx`, `ContractFormModal.jsx`, componentes de pagos/acciones si muestran defectos reproducidos.

- `PageHeader`: título/subtítulo y botón principal `Nuevo Pedido` en estructura mobile-first, con caja abierta/cerrar caja en zona separada y filas claras; CTA en ancho completo cuando sea necesario, pero sin empujar ni cubrir el estado de caja. No modificar la validación de caja.
- Barra búsqueda/orden: búsqueda ancho completo en móvil, label de ordenar separado o apilado; no colocar `Select` demasiado angosto.
- Segmentos `Pedidos en Curso`, `Cuentas por Cobrar`, `Historial Cerrados`: en móvil evitar tres controles con textos partidos en 3–4 líneas. Usar carril horizontal con scroll y selección accesible, o variante compacta bien etiquetada con control claro; nunca ocultar filtros.
- `ContractCard`: nombre/teléfono/ID/badges largos no desbordan; secciones fecha y resumen financiero se apilan si hace falta; importes nunca se recortan. Acciones de imprimir y `Gestionar` en filas apropiadas; si un menú de impresión sustituye 3 botones, preservar las tres variantes de impresión y sus títulos.
- Detalle/formulario modal: ancho máximo `min(100vw-espaciado, límite)`; scroll dentro de la vista real y footer accesible con teclado, sin perder envío de contrato ni evidencias de fotos. Mantener reglas P18 de fotos, campos e idempotencia sin alteraciones.

**Aceptación P2:** búsqueda, cambio de estados, abrir/editar pedido, impresión, gestionar anticipo, historial y flujos de foto desde 320–430px; ningún ID/badge/monto ni CTA cortado.

### P3 · Categorías y otros módulos (alta)

**Archivos iniciales:** `CategoryManager.jsx`, `ProductCatalog.jsx`, `SalesHistory.jsx` y módulos mostrados en navegación «Más»; UI compartida (`PageHeader`, `SearchField`, toolbar, `DialogFooter`, botones).

- `CategoryManager`: botón `Nueva categoría` a ancho móvil útil, búsqueda y `Ver archivados` bien alineados; `CategoryCard` con nombre muy largo y estado no empuja botón editar ni crea scroll horizontal.
- Revisar en cada módulo visible de la app listas/tablas, tarjetas, toolbars, filtros, paginación, acciones, vacíos y mensajes de error. Adaptar tablas mediante vista móvil semántica o scroll interno explícito si son grandes; no esconder datos financieros.
- Evitar generalizar arreglos locales a componentes compartidos cuando alteren desktop; controlar variantes y alcance mediante props/clases/tokens.
- Paginación y acciones de estado permanecen visibles con longitudes de texto reales de Perú.

**Aceptación P3:** sin overflow global ni acciones desaparecidas al cambiar de módulo y regresar.

### P4 · Modales, navegación y estados (alta)

- Revisar Radix DropdownMenu, Dialog, Drawer y menús con teclado Android/iOS, área segura y accesibilidad.
- Confirmar que modales nunca quedan detrás del footer/header; la apertura del teclado ajusta altura/scroll, no crea doble scroll inusable.
- Mostrar errores, carga, desconexión, caja cerrada, negocio/sede inactiva y datos largos sin cubrir acciones.
- No modificar consultas Firestore, dependencias de seguridad o modelo de sesión.

### P5 · Tests y evidencia (obligatoria para declarar READY)

**QA automatizada:** usar infraestructura Chromium existente (`tests/helpers/browserHarness.mjs`), añadir fixtures o tests focalizados si es necesario, sin sustituir las pruebas reales. Comprobar tamaños con screenshots (antes/después) y aserciones sobre `getBoundingClientRect`, `document.documentElement.scrollWidth`, `visualViewport` y `scrollHeight`.

**Matriz de viewport CSS** (ancho × alto; no equivalen a modelos comerciales exactos):

| Tipo | Tamaños mínimos de regresión |
| --- | --- |
| Móvil estrecho | 320×568, 320×640 |
| Móvil común | 360×740, 375×667, 390×844, 412×915 |
| Móvil ancho | 430×932 |
| Horizontal / poco alto | 667×375, 844×390 |
| Tablet | 768×1024, 820×1180 |
| Escritorio | 1024×768, 1280×560, 1440×900 |

**Casos:** vista con caja abierta/cerrada; productos con nombres y precios extensos, 0/1/varios ítems; 15+ categorías; 20+ contratos con IDs/textos largos, urgencia y saldo; títulos largos; 200 % zoom/texto ampliado; Safari iOS y Samsung Internet como pruebas físicas pendientes si no existe navegador automatizado; teclado virtual, barra del sistema, safe area, cambio de orientación y PWA instalada.

**Aserciones:**

1. `document.documentElement.scrollWidth <= window.innerWidth + 1` (salvo scrollers internos explícitos cuya anchura permanece confinada).
2. Rectángulos de controles interactivos hermanos no se solapan; áreas mínimas 44×44 CSS px en controles táctiles.
3. Header y bottom-nav no cubren el contenido de lectura/acciones; `Ver ticket` no cubre nav ni último producto alcanzable.
4. Texto financiero, etiqueta de estado, precio y acción siguen completos y visibles o accesibles claramente sin pérdida.
5. Al activar teclado, campos y CTA permanecen navegables; foco visible y contraste suficiente.
6. La UI escritorio conserva sidebar, layout de ticket, scroll y botones tal como P17/P18; no romper 1280×560.
7. Pruebas existentes de caja 14h, POS/offline, contrato, imágenes, reportes y sesiones permanecen PASS cuando puedan ejecutarse; reportar BLOCKED por separado.

### Medición de resultados

- Guardar screenshots antes/después para POS, Contratos y Categorías en 320, 360, 390, 430 y 1280 CSS px (artefactos locales, sin datos personales reales).
- Crear informe `docs/RESULTADOS-P19-UX-MOVIL.md` con incidencias antes/después, rutas, tamaños, pruebas PASS/FAIL/BLOCKED y lista de pendientes físicos.
- Nunca declarar compatible con *todos* los teléfonos solo por Chrome emulado; pedir prueba Samsung Android, iPhone Safari (si disponible) y PWA instalada.

## 5. Restricciones, orden y criterio GO/NO-GO

- Trabajar sobre **rama de UX separada**, preferiblemente `refactor/p19-mobile-responsive`, creada/seleccionada por el propietario antes de ejecutar Codex. El plan fue auditado contra el SHA de producción arriba indicado. Codex no debe forzar merges ni cambiar automáticamente de rama.
- No modificar `firestore.rules`, `firestore.indexes.json`, Firebase, scripts de seguridad, datos productivos ni políticas de cobro/offline; no deploy, commit, push, merge ni instalación de skills/librerías si no se justifican.
- No cambiar contrato financiero, operación, idempotencia P18, roles/sede, ventana de caja de 14 h, sincronización, índices, backups o lógica React de negocio salvo bug estrictamente de interfaz demostrado.
- Reutilizar Tailwind v4 y componentes existentes; no introducir un segundo sistema de diseño ni grandes overrides globales; no eliminar UI por esconderla mediante CSS.
- Ejecutar primero P0 + P1, después P2, después P3/P4, y cerrar con P5. Mantener cambios pequeños por componente, sin rebases destructivos ni limpieza innecesaria.
- **Código UX READY** solo con todos los casos P0/P1/P2 sin overflow y regresiones existentes PASS. **Producción GO** requiere por separado seguridad/CI, publicación coordinada Firebase y aceptación física de P18. P19 no altera ese protocolo.

## 6. Entrega de Codex

- Código responsive ajustado, sin tocar Firestore ni lógica financiera.
- Archivo `docs/RESULTADOS-P19-UX-MOVIL.md` con evidencia y QA.
- Lista corta: problemas → causa → archivos corregidos → pruebas → pendientes.
- Mostrar específicamente cómo se corrigieron header/sidebar/bottom nav, POS/carrito, Contratos/filtros/tarjetas y Categorías.
- No publicar nada. El propietario revisará y fusionará los cambios solo tras verificar resultados.
