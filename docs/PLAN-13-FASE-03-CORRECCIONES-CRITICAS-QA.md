# MigaPOS — PLAN 13 Fase 03
## Correcciones críticas detectadas en QA automatizada · 2026-11-06

**Referencia auditada:** `fix/migapos-production-readiness` · commit `5f948d6019c5b3e277d162df52d382e27913ec06`.

**Estado:** NO-GO para comercialización operativa. La Fase 02 reportó 73 casos: 35 PASS, 4 FAIL, 26 BLOCKED y 8 MANUAL. El CI remoto de este commit terminó fallando en frontend lint (seis errores); la etapa remota de Spark/Rules y la de IndexedDB sí pasaron. Las pruebas P13 nuevas todavía no están integradas al workflow, por lo cual un CI verde anterior no las certifica.

**Objetivo único:** corregir los defectos demostrables, preservar los invariantes financieros y ejecutar nuevamente la evidencia automatizada antes de las simulaciones manuales de aceptación.

### Evidencia y defectos confirmados

| ID | Criticidad | Evidencia | Trabajo permitido |
| --- | --- | --- | --- |
| P13-03-FIN-01 | CRÍTICA | `tests/plan13.test.mjs`, caso `historical void`; `salesToDailyStats` omite ingreso/productos del ticket `voided`, pero `aggregateReport` añade su `pos_voids` negativo y cuenta otra anulación. Resultado −S/ 30 donde el caso coetáneo documentado exige S/ 0; 2 anulaciones y −1 unidad en lugar de 1 y 0. | Corregir **solo** proyección/normalización de lectura y exportación con prueba por ID, negocio, sede y períodos. |
| P13-03-UX-01 | ALTA | Pruebas `plan09.browser.test.mjs` y `plan10-correction.browser.test.mjs`; cobro debajo del viewport en escritorios de altura reducida; por ejemplo 1280×800 y 1440×900 con productos. | Ajustar layout y scroll. Conservar CTA, total y campos enfocados visibles; no eliminar validaciones. |
| P13-03-LINT-01 | MEDIA | `BottomNav.jsx` (2), `PaymentParts.jsx` (1) y `ReportParts.jsx` (3): seis `Icon` reportados por `no-unused-vars`. | Resolver uso JSX dinámico sin desactivar ESLint ni perder íconos; preferir uso explícito de referencias en JS si procede. |
| P13-03-CI-01 | ALTA | `.github/workflows/verify.yml` ejecuta P09 tras build, pero no `tests/plan13.test.mjs`, `tests/reports.test.mjs` ni la regresión P10-06 del cobro. | Incorporar controles bloqueantes con presupuesto razonable, sin eliminar suites ni atestación. |

### P13-03-A · Corrección financiera con invariantes de periodos

1. Mapear primero los flujos `sales -> salesToDailyStats -> aggregateReport -> dailyReportRows -> processSales -> buildSalesWorkbook` y el origen de `pos_voids`. Distinguir los tickets Spark confirmados de los históricos con `voided:true`.
2. Reconocer una compensación una sola vez por ID de ticket, verificando `saleId`, `authority`, negocio, sucursal, importes y contenido disponibles. No emparejar solo por nombre, importe o fecha.
3. Evitar un doble descuento cuando la misma reversión está reflejada como marca histórica y recibo inmutable; cuadrar ingreso, cantidad de productos, contador de anulaciones y canales.
4. Mantener la fecha propia del cobro y de la compensación. **El neto negativo de un canal en el día de una compensación de una venta anterior es legítimo** y no debe ocultarse ni convertirse artificialmente en cero.
5. **Cuándo faltan evidencias:** no inventar cobro original, fecha, canal ni devolución real. Si una corrección para períodos distintos exige leer datos ausentes o incrementar consultas, documentarlo y parar esa parte para aprobación; no añadir lecturas Firestore ocultas.
6. Mantener reportes y XLSX con la misma semántica, por sede/global y en `hoy`, `semana`, `mes`, `todo`. Para un mismo ticket no debe haber compensación repetida en el archivo detallado o las hojas de resumen.
7. Conservar inalteradas las escrituras de `posVoidRepository`, reposición de stock, locks de caja, Firestore Rules, Firebase, contratos y contabilidad de devoluciones no verificadas.

**Matriz financiera obligatoria, con regresiones automatizadas:**

- Venta del día, no anulada: ingreso y productos correctos.
- Ticket histórico `voided` sin recibo: representación de compatibilidad sin fabricar compensación.
- Ticket histórico `voided` + recibo válido mismo día: un solo efecto económico. Caso P13 existente: Yape S/ 30, neto S/ 0, 1 anulación, cantidad de producto 0.
- Ticket Spark confirmado + un recibo válido mismo día: ingreso original y compensación de una sola aplicación; neto S/ 0.
- Ticket original el día anterior, compensación hoy: +S/ 30 en el período original, −S/ 30 hoy, total conjunto S/ 0; no falsear periodos en falta de contexto.
- Mismo ID de recibo repetido: una sola aplicación, sin repetir productos ni contador.
- Compensación sin venta original en el rango: no crear venta ficticia; neto negativo legítimo con texto aclaratorio.
- Diferentes sedes o negocios y recibos de distinta identidad: no emparejar; fallar de forma segura cuando los datos sean inconsistentes.
- Mixto: efectivo y Yape/Plin concilian individualmente; conservar el escenario de S/ 85 inicial y S/ 55 tras una anulación Yape.
- Los totales deben coincidir al céntimo entre Dashboard, resumen Excel, filas diarias, detalle, productos y sedes.

### P13-03-B · Checkout visible y accesible

Analizar las relaciones entre `#main-content`, `.pos-workspace`, `.pos-ticket-desktop`, `.pos-ticket`, `.pos-ticket-items`, `.pos-ticket-payment` y `.pos-ticket-actions`, incluidos los avisos superiores y el alto disponible. Corregir primero la distribución de altura y el contenedor raíz; no compensar el bug únicamente con `scrollIntoView` ni reducir botones por debajo del tamaño táctil requerido.

**Contrato UX:** en 1280×800, 1440×900, alturas 560–900, con 0/1/5/8 productos y efectivo/mixto/Yape, los controles activos completos, el total y Cobrar deben quedar en viewport o dentro del panel visible sin recorte; solo las listas y el área de pago deben desplazarse internamente cuando haga falta. Preservar `focus-visible`, lector de pantalla, teclado, `aria-describedby`, validaciones monetarias y la accesibilidad de la vista móvil.

### P13-03-C · Seis errores ESLint

Corregir las seis referencias dinámicas a `Icon` manteniendo el componente visual. El config actual aplica `no-unused-vars` base y puede no contar el JSX como uso en parámetros de callback. Se puede utilizar una llamada explícita en JS como `createElement(Icon, props)` o el ajuste local equivalente que no rebaje las reglas. **No** aplicar `eslint-disable`, no cambiar umbrales globales y no ocultar los avisos.

### P13-03-D · Ampliar CI

Añadir después del build, antes de `attest`, una etapa bloqueante para `tests/reports.test.mjs` y `tests/plan13.test.mjs` y la regresión de escritorio P10-06. Mantener Spark, Rules, IndexedDB, P09, lint, PWA y seguridad. Evitar instalaciones nuevas. Si el tiempo total supera el límite CI actual, justificar una segmentación de jobs sin degradar el release ni emitir atestación parcial. GitHub Actions ya instala Java; **no exigir Java local al propietario**.

### P13-03-E · Ejecutar y registrar

Ejecutar solamente sobre datos sintéticos/SDK simulado/emuladores locales ya disponibles; evitar cualquier acceso/escritura a Firebase real. Los cambios de producción están limitados al motor de **lectura de reportes** y al CSS/layout del checkout. Las pruebas de integración Firestore Rules pueden ejecutarse en GitHub Actions si falta Java local. Registrar comandos ejecutados, PASS/FAIL/BLOCKED y causa, sin confundir pruebas de fixture con flujos integrados.

Actualizar `docs/PLAN-13-RESULTADOS-QA-AUTOMATIZADA.md` con una sección de resultados P13-03, exacto número de casos, y mantener los 26 bloqueados/8 manuales hasta comprobarlos; no reinterpretar todos como PASS porque otros casos quedaron verdes.

### Restricciones absolutas para Codex

- **Prohibido Git/GitHub:** ningún comando `git`, `gh`, conectores/API de GitHub, creación de ramas, commits, push, pull, merge ni deploy. El propietario conserva esas operaciones.
- No modificar ni consultar datos de producción. No ejecutar `release:deploy`, ni scripts de release con Git oculto.
- No instalar dependencias, emuladores o Java.
- No tocar escrituras financieras, stock, pagos, locks, Firestore Rules, permisos o migraciones. La corrección financiera se limita a proyecciones/lecturas y tests.
- No debilitar, saltar ni borrar pruebas para conseguir verde. Los cálculos deben seguir fallando explícitamente ante datos no verificables.
- No ampliar el alcance a cambios estéticos ajenos a checkout.

### Salida exigida

Entregar concisamente: archivos modificados, raíz del doble descuento, decisión para cruzar períodos sin lecturas nuevas, resultado de los casos P13, corrección geométrica del carrito y métricas de scroll/foco, lint, build/PWA y estado de las pruebas locales. El propietario hará el push manualmente y después una auditoría independiente del SHA de GitHub Actions.

**Puerta de salida:** este plan no equivale a autorizar ventas reales. Antes del piloto comercial permanecen las verificaciones de devolución real de dinero, inventario perecedero, recuperación de backup, aislamiento de negocios, aceptación manual, cuota Firebase y CI completa del mismo SHA.
