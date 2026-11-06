# INICIO PLAN 13 — FASE 02: AUTOMATIZAR SIMULACIONES DE MIGAPOS

Actúa como arquitecto senior de QA, React, Firestore, sistemas POS y contabilidad de operaciones. **Ahora SÍ estás autorizado a ejecutar pruebas locales**, a diferencia de las fases anteriores dedicadas exclusivamente a UX.

Lee íntegramente `docs/PLAN-13-FASE-02-QA-AUTOMATIZADA-PREVENTA.md` y, si existe en el directorio del proyecto, `docs/CHECKLIST-QA-PREVENTA-MIGAPOS-2026-11-06.md`. Consulta también `docs/AUDITORIA-ANULACIONES-CAJA-REPORTES.md` y `docs/AUDITORIA-FINANCIERA-ANULACIONES-CAJA-EXCEL.md`.

## Objetivo

Convertir el checklist de preventa en una batería automatizada, determinística y reutilizable de MigaPOS. Reutiliza las suites Node, Chromium y emuladores **ya existentes**; no construyas un framework nuevo. Separa siempre pruebas automáticas de aceptación manual.

## Orden obligatorio

1. Inventaría suites, comandos y componentes relevantes. Mapea cada ID del checklist a prueba existente, prueba nueva o MANUAL/BLOCKED.
2. Corrige la falla del `tests/ui-security.test.mjs` añadiendo **solamente los documentos legítimos concretos** al allowlist existente. No desactives ni relajes sus reglas.
3. Añade regresiones financieras y de Excel: venta efectivo/Yape/Plin/mixto, anulación mismo día y cruzando días, duplicación histórica `voided + pos_voids`, cancelación de pedido con `refund` contable, descuentos, stock, cierre con discrepancia, idempotencia y sumas exactas en céntimos. Incluye el ejemplo 100/20/30/20/15 con neto 85, efectivo 28, digital 57 y efectivo físico 128, luego anulación Yape -30 con neto 55.
4. Verifica el Excel leído en memoria contra el Dashboard y el motor `aggregateReport`: mismos filtros, período y sucursal producen los mismos netos; diferencias legítimas deben quedar explicadas, no borradas.
5. Reutiliza test de seguridad/Rules/Chromium. **Antes de cualquier operación con Firestore verifica explícitamente que apunta a emuladores y a `demo-migapos`; ante duda, no ejecutes el test y marca BLOCKED.** No uses colecciones reales ni credenciales de producción.
6. Ejecuta lo que pueda correrse con herramientas ya instaladas; si falta Java/Chromium/emulador, registra bloqueo, no descargues nada sin autorización.
7. Escribe `docs/PLAN-13-RESULTADOS-QA-AUTOMATIZADA.md` con pruebas PASS/FAIL/BLOCKED/MANUAL, evidencia, comandos, reportes de casos fallidos y matriz de cobertura completa; artefactos temporales de prueba en `.release/qa-plan13/`.

## Reglas de integridad

- No ocultes bugs modificando valores esperados o saltando pruebas.
- Si detectas defectos financieros o de doble conteo, documenta reproducción y ubicación, pero **no cambies el dominio de caja, ventas, contratos ni reportes sin aprobación del propietario**.
- Nunca trates compensaciones contables como devolución real comprobada.
- El stock automáticamente repuesto de productos perecederos es un riesgo operativo pendiente: no lo presentes como resuelto si falta flujo de merma.
- No declares el software listo para vender por tener pruebas unitarias verdes: queda aceptación manual, prueba piloto y CI del mismo commit.

## Prohibiciones absolutas

**NO ejecutar ningún comando Git/GitHub:** ni `git status`, `git diff`, `git log`, `gh`, APIs, conectores, pull, push, commit, branch ni merge.

**NO hacer deploy**, publicar Rules/índices, acceder/escribir datos Firebase reales, usar cuentas de clientes, instalar nuevas dependencias, ni descargar Java/navegadores/emuladores.

## Entrega

Resume: archivos modificados, número y clase de pruebas ejecutadas, cuántas pasaron/fallaron/están bloqueadas, resultados del escenario de S/ 85 y su anulación, estado de CI local, pendientes manuales y defectos financieros encontrados. Indica expresamente que no ejecutaste Git/GitHub ni despliegues.

**Comienza directamente la implementación y la ejecución aislada de la Fase 02.**
