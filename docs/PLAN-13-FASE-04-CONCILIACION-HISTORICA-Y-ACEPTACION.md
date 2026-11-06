# MigaPOS — PLAN 13, Fase 04
## Conciliación histórica entre períodos y cierre de QA previo a piloto

**Fecha:** 2026-11-06 | **Base auditada:** `fix/migapos-production-readiness` `70512124e0f6b8518ac8b3bb1a27ce16b3117c91` | **Estado:** NO-GO para producción

## Actualización de auditoría: fallo real en CI #37 (P13-03)

El workflow del commit `70512124...` terminó en **FAIL**: Rules/Spark, IndexedDB, lint/build, finanzas P13 y Chromium P09 aprobaron; falló **P10-06 Chromium** en `tests/plan10-correction.browser.test.mjs`, línea 105. La condición conjunta fue:

```js
card.bg === 'rgb(255, 254, 252)' && card.height < 310
```

**No sabemos cuál operando falló** porque el log solo registró `neutral compact card rather than lavender header and oversized footer`. Esta es una regresión de la prueba sobre la **tarjeta de Historial**, no una prueba de que el botón Cobrar haya vuelto a salir del viewport. La ejecución no generó atestación ni artefacto de release.

### Fase 04-00 — Resolver primero esta regresión CI

1. Medir por separado `backgroundColor`, `height`, tamaño de la tarjeta y viewport, `font-family`, contenido del footer y el borde superior; registrar los valores medidos en los mensajes de fallo y, si es posible, en un JSON de artefactos.
2. Reproducir en Chromium con entorno de prueba equivalente al runner Linux. Detectar posibles diferencias de fuentes/layout entre Windows y Linux.
3. Si la tarjeta realmente supera el alto funcional, corregir con un ajuste **local y proporcional** de CSS/layout, sin quitar información de ventas ni tapar botones.
4. Si solo difiere el valor RGB por una representación de estilos/colores válida, reemplazar la aserción frágil por un criterio **semántico verificable** de tarjeta clara y contraste, conservando estrictamente el límite de altura, la simetría, los colores semánticos y las acciones accesibles. No silenciar ni omitir el test.
5. Asegurar que las pruebas P09, P10-06 y las financieras P13 se ejecutan juntas y resultan verdes en la misma plataforma, y que GitHub Actions produce atestación para el nuevo SHA.
6. No incrementar umbrales ni eliminar comprobaciones solo para obtener PASS. Documentar qué valor fallaba y por qué.

## Objetivo y límites

La P13-03 corrige la doble anulación cuando están disponibles tanto la venta histórica marcada `voided` como el recibo `pos_voids` coincidente. Falta resolver el caso en que el comprobante se registra *fuera del período consultado*. El objetivo es demostrar la conciliación en cierres de día, semana, mes y año, conservar seguridad multiempresa y mantener los costes de lectura bajo control.

**P13-04 autoriza investigación, pruebas aisladas y correcciones de lectura/proyección previamente justificadas. NO autoriza modificar ventas originales, compensaciones, recibos de caja, reembolsos, stocks, Firestore Rules ni datos de producción. Si la solución requiere nuevas lecturas Firestore, diseñarla y cuantificarla primero; documentar la decisión para el propietario antes de añadirlas.**

## Hallazgos verificables de partida

- `frontend/src/features/reports/domain/reportTotals.js` usa `reconcilePosRows()`; el emparejamiento valida ID, negocio, sede, pagos, líneas, precio y fecha, y deduplica comprobantes.
- `frontend/src/features/reports/infrastructure/sessionReportReads.js` consulta `sales` y `pos_voids` acotados al mismo período. Por tanto, si el recibo llega al día siguiente, no necesariamente se conoce durante la consulta del día anterior.
- `frontend/src/features/reports/hooks/useReports.js` y `frontend/src/features/reports/hooks/useExportSales.js` reutilizan el lector de períodos; Dashboard y Excel deben compartir resultados.
- Las Rules actuales incluyen `match /pos_voids/{saleId}` y permiten `get` de documento existente si el usuario tiene alcance financiero, o ausente si tiene perfil activo. Eso NO significa que los costes de lectura o el número de consultas sean irrelevantes.
- La cancelación de pedidos registra **reembolso contable**, no prueba de entrega de dinero; las anulaciones POS pueden reponer stock automáticamente. Son bloqueos comerciales separados pendientes, no parte del arreglo transperíodo.

## Invariantes irrenunciables

1. Una venta tiene un ID estable, pertenece a un negocio y a una sede. Una compensación válida se aplica como máximo una vez.
2. El cobro se atribuye al día Lima en que ocurrió; la compensación se atribuye al día Lima de su recibo, sin retrofechar ni reescribir cierres.
3. El neto de dos períodos contiguos debe ser igual al neto de la unión de ambos, salvo que se informe un error explícito por datos no conciliables. Jamás devolver números silenciosamente incorrectos.
4. Venta Yape S/30 el día D + compensación S/−30 el día D+1 = S/0 en la unión, pero día D refleja +S/30 y día D+1 −S/30 **cuando la pareja es verificable**.
5. Ticket histórico `voided` **sin recibo verificable** mantiene el comportamiento histórico, con estado explícito; no fabricar una venta ni un movimiento.
6. Caja física no equivale a neto contable; una compensación digital no certifica devolución bancaria.
7. Reportes por dueño/cajero/sede/negocio nunca incorporan datos de otra sede no autorizada o de otro negocio.
8. Los reportes y Excel deben conciliar hasta el céntimo, incluidos conteos y productos. Los errores de permisos y datos incompletos NO se ocultan con ceros.
9. No consultas ilimitadas: toda estrategia de lectura adicional debe tener límites por periodo, paginación/agrupación, cancelación, caché y métricas de lecturas.

## Fase 04-A — Regresiones del límite de período (automatizar primero)

Crear casos independientes en `tests/plan13.test.mjs` para estas variantes:

- **A1:** venta POS moderna el día D; recibo D+1, sin `sale.voided`: `D=+30`, `D+1=−30`, unión=0.
- **A2:** venta histórica `voided: true` D; recibo válido D+1: mismos importes esperados, una sola anulación y producto neto cero en la unión.
- **A3:** recibo y ticket histórico en el mismo día: total cero, una sola anulación; duplicado idéntico del recibo no duplica.
- **A4:** ticket histórico sin comprobante: estado histórico consistente y NO se crea compensación artificial.
- **A5:** fechas en límite 23:59/00:00 Lima, cambio semana/mes/año y cambio de turno.
- **A6:** pago mixto +20 (S/8 efectivo, S/12 digital) y compensación siguiente día -20: canales/Excel concilian.
- **A7:** recibo con `businessId`, `branchId`, `saleId`, importe o líneas falsificados: error explícito, no datos cruzados.
- **A8:** fallo de red o `permission-denied` en verificación: bloquear resultados no fiables; no reutilizar cache de otra identidad.
- **A9:** filtro por sede y global; suma de sedes y canales igual al total general.
- **A10:** dos consultas separadas de D y D+1 frente a una consulta conjunta; igualdad de importes, cantidades, número de anulaciones e ingresos por producto.

Las pruebas deben cubrir tanto el cálculo agregado (`aggregateReport`) como la descarga XLSX serializada/reimportada y la ruta real de lectura con stubs. Las pruebas unitarias con entradas artificialmente completas NO prueban por sí solas que el lector de Firestore trae la información necesaria.

## Fase 04-B — Diagnóstico técnico y diseño de cierre

Comparar tres estrategias sin cambiar todavía persistencia:

**Opción 1, preferida si resulta segura:** para ventas históricas *marcadas* `voided` de la consulta, buscar recibos por ID únicamente cuando no estén ya entre los `voids` leídos. Verificación servidor, filtrado por negocio/sede, alcance de permisos y timestamp, deduplicación y caché por sesión. Requiere lecturas adicionales. Proponer límite explícito, coste esperado, tratamiento de falta de red y de >N tickets legacy. **No implementar lecturas nuevas sin aprobación del propietario.**

**Opción 2:** precalcular reconciliación legacy mediante revisión/migración auditada y controlada, sin alterar documentos financieros originales. Es más laboriosa y puede exigir reglas nuevas: documentar antes de implementarla.

**Opción 3:** marcar períodos con evidencia insuficiente como «requiere conciliación histórica», bloquear el dato consolidado y exportación financiera en lugar de publicar un neto falso. Alternativa temporal prudente.

La solución seleccionada debe dejar *una sola* definición semántica de venta, compensación, conteo de anulaciones y cantidades, compartida por Dashboard/Excel. No editar `sales` o `pos_voids` históricos para obtener resultados esperados.

Crear `docs/PLAN-13-FASE-04-DIAGNOSTICO-CONCILIACION.md` con:
- reproducción,
- mapa lector→proyección→Excel,
- comparativa de opciones,
- estimación de lecturas extra por sesión y rangos `hoy`, `semana`, `mes`, `todo`,
- límites y política de fallo conservadora,
- plan de regresión y aceptación,
- recomendación explícita y decisiones pendientes de aprobación.

## Fase 04-C — Verificación de infraestructura y CI

- Contrastar el último workflow de SHA `70512124...` y registrar si llegó a `release-verification`, con estado de cada paso; NO extrapolar un PASS local a GitHub sin evidencia.
- Ejecutar sin nuevas instalaciones las pruebas Node/Chromium disponibles que correspondan a la nueva cobertura.
- Usar los resultados del `test:spark:rules` de GitHub Actions (Java 21 del runner), sin exigir Java en el PC propietario.
- Medir coste mediante conteo de llamadas a repositorios y presupuestos de Firestore; aún sin métricas de facturación reales, etiquetar estimado y no afirmar capacidad validada para 10–20 empresas.
- Cualquier MD añadido debe incluirse en el inventario exacto `tests/ui-security.test.mjs`, sin permitir todos los `.md` indiscriminadamente.

## Fase 04-D — Puerta de aceptación comercial (NO-GO hasta resolver)

Separar claramente:
1. **CI verde del commit exacto** y artefacto de atestación.
2. **Integridad histórica**: fechas cruzadas, Reportes/Excel y no duplicación.
3. **Reembolso real** de efectivo/Yape/Plin y pedidos: registro de deuda al cliente, devolución efectuada, evidencia y permiso; **aún no implementado ni certificado**.
4. **Stock perecedero**: política de no reponer automáticamente productos no revendibles; **pendiente de definición de negocio**.
5. **Restauración de backup aislado** y **simulación con dos negocios/roles/sedes**.
6. **Aceptación manual del dueño**: cobro, cierre, anulación, reembolso, Excel/impresión y operación con reconexión.
7. **Cuota Spark**: medición de lecturas reales, no suposiciones, para uno y varios negocios.

El piloto comercial con dinero real sigue condicionado a cerrar los bloqueos financieros y de seguridad. Pueden demostrarse flujos con datos ficticios en entorno aislado.

## Restricciones de Codex

- Nunca usar `git`, `gh`, APIs/acciones/conectores GitHub, ramas, commits, pushes, merges o deploys. El propietario decide y publica.
- Nunca acceder ni escribir a Firebase real; solo pruebas in-memory, stubs, build de emulador y emuladores locales YA disponibles.
- No instalar dependencias, Java ni nuevos binarios.
- No tocar Firestore Rules, índices, autorizaciones, caja, pagos, inventario ni operaciones de anulaciones en esta fase.
- Nunca eliminar, omitir ni relajar pruebas para que queden verdes.
- Si surgen nuevos requisitos de lecturas pagadas, cambios de persistencia o migraciones, parar la implementación de ese punto y presentar propuesta cuantificada para autorización.

## Entregables

1. Regresiones sobre períodos y sus resultados, con casos que fallen si aún existe el defecto.
2. Documento de diagnóstico y decisión técnica.
3. Resumen de CI real, si existe evidencia publicada por el propietario o logs proporcionados; de lo contrario, marcar pendiente.
4. Estado de bloqueos comerciales sin afirmar READY/GO de forma prematura.
