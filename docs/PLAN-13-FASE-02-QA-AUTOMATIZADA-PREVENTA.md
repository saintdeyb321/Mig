# MigaPOS — Plan 13, Fase 02: QA automatizada y simulación de preventa

**Fecha de planificación:** 2026-11-06  
**Referencia auditada:** `fix/migapos-production-readiness` en `08fb405ad51df13a627c60b7ae3f3f6f262f26ab`  
**Propósito:** convertir la matriz de aceptación en pruebas de regresión reproducibles y producir evidencia verificable. **No** equivale a aprobación comercial automática.

## 0. Estado inicial y precauciones

- `main` aún está en `6ca437bf2c4c29ffa169e6cc47c87e11c91d0cf2`; no mezclar el código/resultado de ambos commits.
- Último CI consultado: ejecución `42299430845` fallida: 76 pruebas Spark correctas y una prueba `tests/ui-security.test.mjs` fallida por inventario explícito de documentación `.md` desactualizado. El resto del workflow no se ejecutó. No interpretar esto como un PASS de build, Rules ni de casos financieros.
- F13-01 incorporó `channels.cash|digital` con `collections`, `posCompensations`, `contractRefunds`, `net`, y desgloses equivalentes en `Resumen_Financiero`. El dinero entregado realmente en devoluciones no tiene registro independiente verificable; `refund` contable **no es** devolución ejecutada.
- `aggregateReport` suma contadores de anulaciones de ventas y de `pos_voids`; verificar que el caso mixto histórico no duplique `voidedTicketCount` ni unidades de producto. La presencia de ventas confirmadas con compensación es el flujo Spark esperado.
- La anulación POS repone stock al estar aplicada; peligro operativo con productos perecederos devueltos que no son revendibles. Sin política e implementación de merma/inspección, es un bloqueo de comercialización para ese flujo.
- Los scripts existentes pueden requerir Chromium, CLI Firebase o Java. **No** instalar grandes dependencias ni descargar emuladores sin aprobación explícita del propietario; reportar `BLOCKED` si no están disponibles.

## 1. Política de seguridad innegociable

1. Codex **no utiliza** `git`, `gh`, comandos de GitHub, API o conectores GitHub; tampoco push, merge, commit, deploy o publicación de Rules/índices.
2. Está **autorizado a ejecutar pruebas locales** para esta fase (reemplaza la prohibición específica de pruebas en iteraciones anteriores de UX). No está autorizado a ejecutar escrituras en Firebase real, ni contra un proyecto que no sea claramente de prueba y preferiblemente emulado.
3. Prohibido borrar/resetear datos reales, usar cuentas de clientes, secretos de producción o ejecutar scripts de release que modifiquen el entorno. `preview` o `build` con variables de producción no autorizan operaciones reales.
4. Antes de cualquier browser/E2E, verificar efectivamente `VITE_USE_EMULATORS=true`, proyecto `demo-migapos` (o equivalente aislado) y destinos de Auth/Firestore/Storage. **No basta con que el nombre del archivo o el comentario digan "test".**
5. Los tests deben crear fixtures falsos determinísticos con businessId, branchId, usuarios y movimientos aislados, sin información personal real. No modificar lógica financiera para hacer pasar una prueba; primero producir reproducción mínima y diagnóstico.
6. Las pruebas no deben depender del orden ni de saldos provenientes de otras ejecuciones. Repetirlas debe dar los mismos resultados. Evitar sleep arbitrarios, timeouts inestables, lecturas innecesarias y reintentos no acotados.
7. Para garantizar integridad del resultado, estado de cada caso será `PASS` / `FAIL` / `BLOCKED` / `MANUAL` / `N/A` con motivo y evidencia. Nunca declarar PASS sobre una prueba no ejecutada.

## 2. Fases de trabajo para Codex

### QA-00 — Inventario y plan de cobertura

- Leer `docs/AUDITORIA-ANULACIONES-CAJA-REPORTES.md`, `docs/AUDITORIA-FINANCIERA-ANULACIONES-CAJA-EXCEL.md` y el checklist `CHECKLIST-QA-PREVENTA-MIGAPOS-2026-11-06.md` donde esté disponible.
- Revisar `package.json`, `frontend/package.json`, `.github/workflows/verify.yml` y suite de pruebas existente antes de duplicarla.
- Registrar matriz *ID del checklist → nombre/ruta de prueba → resultado → evidencia → cobertura pendiente*. La matriz debe incluir todos los IDs, incluso los manuales. No afirmar cobertura 69/69 si una parte es visual o requiere hardware.
- Verificar versión que Codex tiene en el directorio **sin comandos Git/GitHub**: leer manifests y documentación local; si no puede establecer SHA exacto, pedir al propietario que lo anote en el reporte.

### QA-01 — Corregir bloqueo de CI de forma limitada

- En `tests/ui-security.test.mjs`, actualizar de forma **explícita y exacta** la lista de `.md` autorizados para reflejar los documentos legítimos versionados. **No** quitar el `assert`, no usar `true`, regex permisiva, comodines, saltar carpetas ni relajar las reglas de seguridad.
- Si un documento parece contener información sensible o no corresponde al repositorio, reportarlo y mantenerlo bloqueado; no incluir ciegamente todo archivo nuevo.
- Ejecutar únicamente la comprobación local pertinente; conservarla como control bloqueante en CI.

### QA-02 — Pruebas puras de finanzas y Excel (prioridad máxima)

Crear o extender pruebas automatizadas para:

1. Venta solo efectivo, solo Yape y Plin, y pago mixto con precisión decimal y reconciliación.
2. Venta del mismo día y anulación del mismo día, sin doble ajuste.
3. Venta original anterior, compensación en fecha actual; neto digital negativo válido y etiquetado como **contable**, no saldo Yape.
4. Duplicado del mismo `pos_voids` y coexistencia con `sale.voided` histórico: distinguir exactamente una anulación y movimientos derivados; si el modelo actual produce doble conteo, registrar FAIL y proponer corrección mínima independiente.
5. Pedido con anticipo, abono, cancelación y movimiento `refund` contable; no presentar evidencia de dinero devuelto.
6. Caja abierta, cerrada, cambio de turno, cierre provisional, discrepancia, presencia de compensaciones y cierre inmutable.
7. Stock: compra, anulación, reposición actual; verificar y documentar limitación de perecederos como riesgo separado, no marcarlo falsamente aprobado.
8. Idempotencia: doble confirmación, pérdida de red, confirmación incierta, consulta posterior, dos sesiones concurrentes, y permisos de dueño/cajero (según infraestructura disponible).
9. Reportes por día/semana/mes/año, sedes A/B y negocios A/B, límites del período, deduplicación y mezclas de fechas.
10. Excel: importar el `.xlsx` generado en memoria y conciliar fila por fila `Resumen_Financiero`, `Auditoría_Pedidos`, detalles y totales por sede con `aggregateReport` para las mismas entradas. Verificar notas de contramovimientos y seguridad/sanitización de celdas.

**Invariantes**: `neto_canal = cobros + compensaciones_POS + reembolsos_contables`; `neto_general = neto_efectivo + neto_digital`; misma moneda y céntimos; ninguna devolución contable implica desembolso. La suma de movimientos por sede debe concordar con el global para el mismo período y fuente.

### QA-03 — Pruebas aisladas con emuladores y navegador

- Reutilizar los tests Node y navegador existentes; no reinstalar librerías o migrar a una plataforma E2E nueva.
- Si las dependencias existentes permiten usar emuladores locales **ya disponibles**, cubrir: roles, tenant isolation, stock por sede, una caja activa por operador, ventas, anulaciones, contratos y fallos de red.
- Verificar que *todos los endpoints* son de emuladores antes de ejecutar cualquier test que cree/modifique documentos. Si no puede demostrarlo, marcar `BLOCKED` y no arrancarlo.
- Validar en Chromium existente: carrito scroll independiente, cobro visible, apertura/fin de modal, cierre de caja, historial, carga, navegación por teclado, diálogo de anulación y Excel. El soporte manual de lector de pantalla/impresora física debe quedar `MANUAL`.

### QA-04 — Optimizar reporte y trazabilidad

- Crear reporte en `docs/PLAN-13-RESULTADOS-QA-AUTOMATIZADA.md` con: entorno, comandos exactos, fechas, resultados por suite, total PASS/FAIL/BLOCKED/MANUAL, archivos modificados, logs de fallos resumidos, casos de negocio y riesgos restantes.
- Guardar artefactos de ejecución útiles en `.release/qa-plan13/` sin contraseñas, tokens ni datos reales.
- Si encuentra un bug financiero, describir secuencia y valores exactos y **no implementar cambios de dominio silenciosamente**. El propietario revisará diagnóstico y aprobará su corrección aparte.
- Corregir únicamente fallos de harness, fixtures o aserciones manifiestamente desactualizadas en esta fase, conservando controles de seguridad. Nunca adaptar expectativas para ocultar un error financiero.

## 3. Escenarios numéricos esenciales

**Escenario base (una sucursal, un turno, sin otros movimientos):** fondo inicial S/ 100; venta efectivo S/ 20 (cliente entrega S/ 50, recibe S/ 30); venta Yape S/ 30; venta mixta S/ 20 (= S/ 8 efectivo + S/ 12 Yape); anticipo de pedido Yape S/ 15.

Esperados antes de anulación: `POS 70`, `Pedidos 15`, `Neto general 85`, `Neto efectivo 28`, `Neto digital 57`, `Físico esperado 128`. No confundir fondo inicial con ingreso.

**Anular venta digital S/ 30:** compensación digital `−30`; neto general `55`, efectivo `28`, digital `27`; efectivo físico teórico permanece `128` si no hubo salida de efectivo.

**Anular venta del día anterior:** si el intervalo de consulta solo cubre hoy, ingreso original anterior no aparece y la compensación sí, por lo que el neto del canal puede ser negativo. Se debe explicar el signo, sin inventar devolución.

**Pedido cancelado con Yape:** movimiento `refund` contable negativo no demuestra transferencia efectiva al cliente; caso `BLOCKED` para certificación de reembolso real mientras falte flujo de verificación.

## 4. Comandos locales admitidos (solo en ambiente aislado)

- `npm run test:reports`
- `npm run test:sales`
- `npm run test:architecture`
- `npm run test:spark` (incluye navegador: usar solo si binario necesario está presente)
- `npm run test:offline-db` (Chromium local requerido)
- `npm run test:spark:rules` **solo si** emuladores/Java disponibles sin instalación e aislados de producción
- `npm run lint --prefix frontend`
- `npm run build --prefix frontend` **solo con variables de prueba/emulador verificadas**, nunca para despliegue

Los comandos son sugerencias, no autorización para instaladores, red, Firebase real, despliegues ni credenciales.

## 5. Puertas de salida antes de piloto

**Bloqueantes**:

- CI verde del **mismo commit** que se piensa pilotear; prueba de seguridad de docs intacta.
- Reglas y control de tenant comprobados, sin acceso cruzado, ventas/anulaciones idempotentes y caja consistente.
- Dashboard y Excel reconciliados para efectivo, digital, mixto, anulación cruzando períodos y cancelación de contratos.
- No registrar devolución física/digital como **ejecutada** sin evidencia y flujo verificable.
- Política de inventario para anulaciones de productos perecederos aplicada o limitación del piloto documentada y controlada.
- Respaldo verificable, recuperación, errores de red, navegador físico y aceptación manual mínima.

**No bloqueantes para demo sin dinero real:** detalles cosméticos, reportes gráficos interactivos secundarios y otras mejoras no financieras.

## 6. División de responsabilidades

- **Codex:** automatización, fixtures, ejecución y evidencia locales; no Git/GitHub ni deploy ni producción.
- **Propietario:** publica manualmente sus cambios, observa CI, realiza un recorrido UX acotado y aprueba decisiones financieras.
- **Auditor:** inspecciona los resultados del mismo commit y decide PASS/FAIL/BLOCKED, sin declarar comercializable el producto antes de pruebas y piloto.
