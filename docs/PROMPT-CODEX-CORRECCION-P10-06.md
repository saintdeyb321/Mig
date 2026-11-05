# MIGAPOS — PROMPT DE INICIO P10-06 (CORRECCIÓN VISUAL OBLIGATORIA)

Actúa como arquitecto frontend senior y diseñador UX de POS, especializado en React 19, Tailwind CSS 4, Radix UI y accesibilidad. **La implementación visual del PLAN 10 NO fue aprobada por el propietario.** Tu misión es corregirla de forma localizada y comparativa: recuperar lo que funcionaba en el diseño anterior y mejorarlo, sin introducir otro rediseño arbitrario.

Lee íntegramente:
- `docs/PLAN-10-UX-OPERATIVA-POS-HISTORIAL.md`
- `docs/PLAN-10-RESULTADOS.md`
- `docs/PLAN-10-P10-06-CORRECCION-UX-OPERATIVA.md`

Usa **UI/UX Pro Max**, que ya está instalada localmente, sin reinstalar, descargar, clonar o añadir dependencias.

## PROHIBICIÓN ABSOLUTA

No ejecutes **ningún** comando Git o GitHub, ni de lectura: prohibidos `git`, `gh`, APIs y conectores GitHub, ramas, commits, push, pull, fetch, PR y merges. No autentiques GitHub. No ejecutes deploy, Firebase remoto ni scripts de release que invoquen Git. **Solo archivos locales y pruebas permitidas.** El dueño gestiona Git/GitHub y luego ChatGPT audita.

## Lo que debes corregir (sin desviar el alcance)

**A. Carrito POS — prioridad máxima.** En `frontend/src/index.css` y `frontend/src/modules/pos/TicketParts.jsx` corrige la competencia de altura entre `.pos-ticket-items` (`flex: 1 1 35%`) y `.pos-ticket-payment` (máximo 42%). La lista debe quedarse con el espacio elástico principal, el pago con su altura intrínseca, y total/CTA siempre visibles. Para teclado y alturas 560/600 px, el campo enfocado debe verse ENTERO dentro de su scroll; no aceptes un panel de pago de 28 px. La CI del commit P10 falló en `tests/plan09.browser.test.mjs` por «payment focus scrolls into the visible payment region above the checkout action». Corrige el layout real y pasa esa aserción intacta. El carrito vacío debe ser sobrio; con 1/5/8 líneas debe permitir desplazarse por los productos.

**B. Ruido técnico.** En `TicketParts.jsx`, elimina el bloque permanente `<details>` «Límite por ticket» y su texto de operación atómica. Cambia el contador normal «0 de 8 productos diferentes» por «0 ítems» o «0 productos». Solo al alcanzar el máximo muestra una advertencia breve y útil. Mantén **sin cambios** el límite de 8 y todas sus validaciones. En `PaymentParts.jsx` simplifica la ayuda visual constante «Máximo S/ 50 000…» conservando la validación y los errores accesibles.

**C. Sidebar.** En `frontend/src/layouts/AppLayout.jsx` crea tres regiones reales: encabezado fijo con marca, usuario, sucursal y notificaciones; zona intermedia `min-h-0 flex-1 overflow-y-auto` que contiene **solo módulos**; pie fijo con Cerrar sesión. Actualmente `.sidebar-scroll` envuelve todo el encabezado y no cumple el requisito. Respeta permisos, teclado y móvil. Retoca `BottomNav.jsx` solamente si hace falta para espaciados.

**D. Historial — recuperar estética anterior.** Usa como referencia obligatoria las capturas compartidas y, si existen localmente, `.release/p10-visual/before-history-3-1440.png` y `after-history-3-1440.png`. La versión actual no es aceptable: demasiado fondo lila lavado, botones «Anular ticket» gigantes, espacios que desperdician altura y jerarquía peor que antes. Rehaz solo la presentación en `SaleHistoryCard.jsx` y `SalesHistory.jsx`: cabecera con fecha y total prominentes, ID y sucursal discretos, pill del método de pago, detalle de ticket legible, pie con responsable y anulación pequeña delineada. Preserva etiquetas y acciones de estados confirmados, anulados, borrador, rechazados, inciertos y pendientes; no ocultes advertencias críticas. 3 columnas de verdad en escritorio, 2 tablet y 1 móvil, sin card heights artificiales ni cortes. Fondos claros con contraste, morado/índigo Galaxy Nebula sobrio, acentos verdes/ámbar/rojos por estado. **No reemplaces de nuevo un diseño usable por una estética de plantilla.** Mantén la barra Excel compacta de P10.

## Verificación obligatoria

1. Antes de editar, confronta capturas reales «antes y después» y establece el defecto observable de cada sección; los requisitos del propietario tienen precedencia sobre preferencias de la skill.
2. Prueba 1440×900, 1024×768, 390×844 y 320×560; POS con 0/1/5/8 líneas, efectivo/Yape/mixto, read-only/caja cerrada/abierta, foco y teclado; sidebar con muchos módulos; historial con 1/3/10 tickets y estados excepcionales.
3. Ejecuta lint, build/PWA, `tests/plan09.browser.test.mjs`, `tests/plan10.browser.test.mjs` y pruebas relacionadas que no invoquen Git/Firebase real. **No borres, relajes ni saltes la aserción P09 del foco.** Si falla, corrige CSS/estructura.
4. Genera nuevas capturas comparativas en `.release/p10-06-visual/`. Da prioridad a POS abierto lleno, POS vacío, pago bajo viewport corto, sidebar con scroll e historial viejo/nuevo en escritorio/móvil.
5. Documenta resultados en `docs/PLAN-10-CORRECCION-P10-06-RESULTADOS.md`, con evidencias, errores pendientes y archivos modificados. Marca explícitamente si falta aceptación visual humana. No declares aprobado solo porque tests pasan.

**Límites estrictos:** no tocar lógica financiera, usePOS, hooks, saleModel, checkoutPolicy, cash repositories, contratos, permisos, Firestore, reglas/índices, exportaciones financieras, IndexedDB, dependencias, skills ni arquitectura global. La corrección es solo UX de POS, Historial y sidebar, con tests visuales asociados. No despliegues.

**Forma de respuesta:** implementa, prueba, documenta y resume en pocas líneas. Evita narraciones largas, diffs y logs extensos. Si surge una regresión no visual, repórtala sin modificar el dominio. El dueño hará commit/push manual y enviará el enlace para auditoría externa.

**Comienza ahora P10-06. No te detengas en el diagnóstico: corrige realmente los componentes.**
