# INICIO CODEX — MigaPOS PLAN 13, Fase 03

Actúa como arquitecto senior de React 19, Firestore, sistemas POS, conciliación financiera y QA automatizada.

Lee íntegramente:
- `docs/PLAN-13-FASE-03-CORRECCIONES-CRITICAS-QA.md`
- `docs/PLAN-13-RESULTADOS-QA-AUTOMATIZADA.md`
- `tests/plan13.test.mjs`

**Hay cuatro filas FAIL documentadas (dos causas principales), seis errores de lint y un CI rojo. Debes corregir los defectos, no producir otra auditoría genérica.**

1. **Finanzas:** reproduce `historical void`; analiza los datos de `salesToDailyStats`, `aggregateReport`, `processSales` y `buildSalesWorkbook`. Corrige la doble proyección de ticket marcado `voided` + recibo POS válido, sin modificar transacciones ni reembolsos. Conserva la fecha económica de cada evento y un neto digital negativo legítimo si la compensación corresponde a una venta anterior. Asegura que Dashboard y XLSX cuenten una sola vez por ID/negocio/sede. Implementa y pasa la matriz de pruebas de períodos y casos históricos. Si un caso no puede resolverse sin lecturas adicionales o datos faltantes, documenta el bloqueo y no inventes información.
2. **POS:** arregla el botón Cobrar fuera del viewport en escritorio. Revisa el alto de `#main-content`, `.pos-workspace` y `.pos-ticket`, priorizando scroll interno y manteniendo fijo el CTA. No modifiques ni relajes las aserciones P09/P10-06 de foco, visibilidad y tamaños.
3. **Lint:** resuelve los seis `Icon` no utilizados en `BottomNav`, `PaymentParts` y `ReportParts`, preservando iconos y sin deshabilitar reglas.
4. **CI:** incorpora `tests/reports.test.mjs`, `tests/plan13.test.mjs` y la regresión visual P10-06 como controles bloqueantes posteriores al build y anteriores a `attest`. Mantén todas las verificaciones existentes.
5. **Validación:** ejecuta solo las suites locales necesarias, lint y build/PWA con el entorno ya instalado. Usa fixtures/SDK simulado; nada de Firestore real. Actualiza el informe QA con métricas exactas y problemas que sigan BLOCKED/MANUAL.

**Regla absoluta:** no uses ningún comando o conector Git/GitHub, ni despliegues. No instales dependencias ni Java. No modifiques escrituras financieras, stock, autenticación, Firestore Rules, índices ni persistencia. No hagas pasar las pruebas por omisión o disminución de criterios.

Entrega un resumen técnico breve: cambios, pruebas y PASS/FAIL/BLOCKED, puntos no resueltos y confirmación de ninguna operación Git/GitHub o despliegue. El propietario publicará el código y ChatGPT auditará el commit y CI.

**Comienza ahora P13-03.**
