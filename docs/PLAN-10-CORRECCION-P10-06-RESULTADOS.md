# P10-06 · Corrección UX operativa

2026-11-05. Correcciones A–F implementadas y verificadas localmente.
**Aceptación visual humana pendiente. No se declara PASS visual ni aprobación de producción.**

## Cambios y comparación

- **Ticket:** artículos como única zona elástica principal, pago de altura intrínseca
  con mínimo visible suficiente para un control completo. En 1440×900 con 8 líneas:
  artículos **327 → 433 px**, pago **230 → 160 px**. Total y CTA fuera del scroll.
- **Foco:** además del mínimo de altura, un observador local de tamaño y el foco
  reajustan exclusivamente el scroll del pago al cambiar de orientación o contenido.
  No cambian importes ni foco de usuario, ni crean listeners de datos/viewport.
  En teclado bajo, la descripción repetitiva del drawer pasa a formato solo lector
  de pantalla. La prueba nueva exige CTA dentro del ticket, no solo del viewport.
- **Ruido:** contador «N productos», advertencia solo al llegar a ocho y retirada
  de «Límite por ticket». Ayuda monetaria vinculada al input para accesibilidad;
  errores, validaciones, vuelto e importes conservados.
- **Sidebar:** identidad/sede/notificaciones fijas, únicamente módulos con scroll,
  pie fijo. Antes el logo se desplazaba 211 px; ahora cabecera y pie no se mueven
  al recorrer 211 px de módulos. Roles, orden y acciones intactos.
- **Historial:** retomada la jerarquía de referencia: fecha y total juntos, ID/sede,
  método y estado legibles, ítems y responsable, anulación pequeña delineada.
  Superficie blanca y borde semántico, sin cabecera lila. Caso de 3 tarjetas:
  altura 255.5 px y acción 95.1 px en tarjeta de 358 px. Excel **133 → 69 px**.

Archivos: `frontend/src/index.css`, `layouts/AppLayout.jsx`,
`modules/pos/{TicketParts,PaymentParts}.jsx`, `modules/SalesHistory.jsx`,
`modules/sales-history/SaleHistoryCard.jsx`, `modules/ExportSales.jsx` (rutas bajo
`frontend/src`); nuevo `tests/plan10-correction.browser.test.mjs` y lista Markdown
de `tests/ui-security.test.mjs` con los tres documentos autorizados por nombre exacto.

## Pruebas

- PASS: lint frontend, build/PWA y `node scripts/check-build.mjs`; precache 2.80 MiB.
- PASS: `node --test --test-concurrency=1 tests/plan08.test.mjs tests/plan09.test.mjs tests/ui-security.test.mjs` (**42** pruebas).
- PASS: `node --test --test-concurrency=1 tests/plan09.browser.test.mjs tests/plan10.browser.test.mjs`: **199 + 195** comprobaciones, incluida la aserción original del foco.
- PASS: `node --test tests/plan10-correction.browser.test.mjs`: **276** comprobaciones, 48 combinaciones cantidad/método/viewport, resize con foco activo y CTA completo dentro del ticket.
- PASS: `tests/plan08.browser.test.mjs` y `tests/cash-amount.browser.test.mjs`: **27 + 44** comprobaciones; recibos, anulaciones, borradores, dinero provisional y precisión sin regresión. Total: **6 escenarios Chromium, 741 comprobaciones**, sin escrituras reales.
- Cotejo local: archivo `tests/plan09.browser.test.mjs` completo idéntico al baseline,
  incluida la aserción de foco de CI; 48 atributos previos de control y 25
  callbacks/guardas/cálculos críticos sin cambios. Revisión de hashes/espacios sin Git.

## Capturas y procedencia

`.release/p10-06-visual/`: **72 PNG**, 27 capturas del baseline anterior a editar, 43 posteriores
en 1440×900, 1024×768, 390×844 y 320×560, más foco a 360/390 px de alto y alturas
desktop 560/600/700/900. Dos referencias adicionales: MigaPOS anterior a P10 y
baseline P10 rechazado. No son datos reales ni snapshots de Firebase.
Foco extremo verificado: campo 231.5–277.5 px dentro del pago 201.5–281.5 px;
CTA termina en 342.5 px y ticket en 343 px, con viewport de 360 px de alto.

| Comparación | Archivos PNG en esa carpeta |
|---|---|
| Historial anterior y P10 rechazado | `reference-history-before-plan10.png`, `reference-history-rejected-plan10.png` |
| POS lleno antes/después | `before-pos-full-1440.png`, `after-pos-full-1440.png` |
| Sidebar desplazado antes/después | `before-sidebar-scroll-1280.png`, `after-sidebar-scroll-1280.png` |
| Foco y CTA en horizontal | `after-payment-focus-768.png` |
| Historial nuevo desktop/móvil | `after-history-3-1440.png`, `after-history-3-390.png` |
| Ticket y errores móviles | `after-pos-full-320.png`, `after-invalid-payment-320.png` |

Las suites heredadas regeneran sus carpetas `after-*` habituales. Para esta
comparación se usan los `before-*` P10-06 capturados antes de editar; la referencia
del P10 rechazado procede de ese baseline local, no de una captura nueva etiquetada
como anterior. La referencia previa a P10 se copió del PNG original disponible.

## Pendientes y límites

- Falta aprobación visual del propietario, pruebas físicas/lector de pantalla y
  CI del próximo commit. No se consultó GitHub ni se afirma CI remota aprobada.
- Sin Rules/emuladores, Firebase real ni scripts de release. No se modificaron
  dominio, transacciones, hooks de negocio, permisos, autenticación, IndexedDB,
  caché, dependencias, configuraciones de despliegue ni skills. Sin Git ni deploy.
