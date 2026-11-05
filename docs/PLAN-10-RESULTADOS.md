# PLAN 10 · Resultados locales

2026-11-05. **P10-00 a P10-05 implementadas y verificadas localmente.** Aceptación humana pendiente; no certifica producción.

## Cambios

- **P10-00:** baseline lint/build y 20 capturas anteriores con componentes reales, datos ficticios y perfiles aislados.
- **P10-01:** sidebar morado profundo/ciruela/índigo, espacios regulares, controles de 44 px y scroll independiente. Tokens con contraste AA verificado. Skill UI/UX Pro Max local: foco, reflujo y divulgación progresiva; sin reinstalarla.
- **P10-02:** POS con barra compacta; global explícitamente solo lectura. Catálogo/ticket con scroll propio, filtros accesibles, total/CTA visibles, placeholder y métodos de pago compactos. Ocho productos seguros; el noveno sigue bloqueado.
- **P10-03:** apertura/conteo breves; esperado o referencia, contado y resultado dominantes. Detalle expandible sin inventar gastos ni devoluciones físicas. Diferencias provisionales no anuncian faltantes. Resumen/observaciones desplazables y ambos botones del cierre visibles, incluso a 320 × 560.
- **P10-04:** historial de 3 columnas a 1280/1440 px, 2 a 768/1024 y 1 en móvil; estados e ítems largos accesibles. Excel medido: 358 → 133 px en escritorio. El consentimiento era local al componente, sin requisito separado encontrado en hook/tests/documentos de este flujo: el clic explícito inicia la consulta. Guardas, períodos, errores y límites originales conservados; consentimientos de backups/confirmaciones intactos.
- **P10-05:** pruebas de 320/390/768/1024/1280/1440 px, alturas 560/700/900, teclado, movimiento reducido y reflujo equivalente a 200 %. Regresiones de caja/global/offline/carrito, estados financieros, errores, exportación y doble envío. Fixtures heredadas adaptan etiquetas/esperas; conservan sus 44 y 27 comprobaciones financieras.

Archivos bajo `frontend/src`: `modules/{POS,CashRegisterModals,SalesHistory,ExportSales}.jsx`, `modules/pos/{CatalogParts,PaymentParts}.jsx`, `modules/sales-history/SaleHistoryCard.jsx`, `BottomNav.jsx`, `layouts/AppLayout.jsx`, `index.css`, `shared/styles/theme.css`.
Tests: nuevo `tests/plan10.browser.test.mjs`, `plan09.fixture.jsx`, `plan08-pos.browser.html`, `cash-amount.browser.html`, `ui-security.test.mjs`. La lista Markdown admite solo los tres documentos P10 por nombre exacto.

## Pruebas PASS

Node 22 disponible, sin instalaciones ni scripts de release:

- `npm run lint --prefix frontend`; `npm run build --prefix frontend`; `node scripts/check-build.mjs`: PWA inicial 2.80 MiB, Excel diferido. Aviso preexistente de chunks grandes.
- `node --test --test-concurrency=1 tests/plan08.test.mjs tests/plan09.test.mjs tests/ui-security.test.mjs`: **42 pruebas**.
- `node --test --test-name-pattern="Phase 7 workbooks in memory|Phase 7 bounded data and lifecycle|Plan04 cash export cursor limits" tests/reports.test.mjs`: **17 pruebas** de Excel en memoria, scope, cuotas y ciclo de vida.
- `node --test --test-concurrency=1 tests/plan09.browser.test.mjs tests/plan10.browser.test.mjs tests/plan08.browser.test.mjs tests/cash-amount.browser.test.mjs`: **5 escenarios**, **465 comprobaciones** (199 P09, 195 P10, 27 P08, 44 céntimos).
- Pruebas existentes `tests/spark-startup.browser.test.mjs` y `tests/offline-db.browser.test.mjs`: **2 escenarios**, **32 comprobaciones**. Sin login/Firebase real; IndexedDB únicamente en perfil de prueba.
- Cotejo local: **25** callbacks/guardas/cálculos/estados críticos idénticos en AST al baseline, excluyendo posiciones del texto. Hashes y espacios/conflictos revisados sin Git.

## Capturas

**43 PNG** en `.release/p10-visual/`: 20 anteriores y 23 posteriores. Incluyen POS abierto/global/cerrado, historial con 1/3/10 tickets, Excel y caja en escritorio/móvil. Selección de 12:

| Caso | PNG |
|---|---|
| POS antes | `before-pos-open-1440.png` |
| POS después | `after-pos-open-1440.png` |
| Global después | `after-pos-global-1440.png` |
| POS móvil después | `after-pos-open-390.png` |
| Historial/Excel antes | `before-history-3-1440.png` |
| Historial/Excel después | `after-history-3-1440.png` |
| Historial/Excel móvil | `after-history-3-390.png` |
| Cuadre coincidente | `after-cash-match-1440.png` |
| Diferencia negativa de la fixture | `after-cash-short-1440.png` |
| Diferencia positiva de la fixture | `after-cash-extra-1440.png` |
| Provisional sin declarar faltante | `after-cash-provisional-320.png` |
| Ambos botones del cierre en móvil | `after-cash-confirm-320.png` |

## Pendientes y restricciones

- CI remota y la incidencia DevTools de `backups.browser.test.mjs` indicada por el propietario quedan fuera de esta corrección. Sin cambios de harness/workflows/release; el nuevo test P10 es local y su incorporación a CI requiere autorización posterior.
- Sin ejecutar Rules/emuladores ni la suite Spark completa que invoca release. Sin Java, Git/GitHub, Firebase real, commits o despliegues.
- Faltan aceptación física, zoom real, lector de pantalla, impresión/Excel con backend y simulación comercial. El abono de contratos `step="0.50"` queda para una tarea financiera independiente.
- Intactos: dominio, repositorios/hooks financieros, permisos, autenticación, IndexedDB/caché, contratos de datos, Rules/índices, dependencias, configuración de producción y skills.
