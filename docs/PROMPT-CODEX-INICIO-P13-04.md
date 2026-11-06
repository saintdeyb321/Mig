# INICIO P13-04 — Auditoría transperíodo, pruebas y diseño de cierre

Actúa como arquitecto senior de POS, finanzas, Firestore Spark, React y pruebas automatizadas. Continúa desde el commit P13-03 existente en mi carpeta local.

Lee:
- `docs/PLAN-13-FASE-04-CONCILIACION-HISTORICA-Y-ACEPTACION.md`
- `docs/PLAN-13-RESULTADOS-QA-AUTOMATIZADA.md`
- `docs/AUDITORIA-ANULACIONES-CAJA-REPORTES.md`

**Problema prioritario:** al consultar dos períodos separados, una venta antigua marcada `voided` en el día D y su recibo `pos_voids` en D+1 pueden resultar en 0 y -30, mientras que unidos deberían reconciliar +30 y -30 = 0. Debemos demostrar y cerrar este caso sin alterar ni reescribir transacciones originales.

## NUEVA PRIORIDAD P0: corregir la regresión de CI #37

En el commit `70512124...` GitHub Actions sí completó Rules, IndexedDB, lint/build, P13 y P09. La etapa **P10-06** falló en la línea 105 de `tests/plan10-correction.browser.test.mjs`: `card.bg === 'rgb(255, 254, 252)' && card.height < 310`. No está determinado si falló el color, el alto o ambos. Antes de abordar conciliación histórica, instrumenta esa prueba para medir **por separado** RGB y altura, reproduce o explica la diferencia entre Chromium Windows/Linux y corrige el problema real. No relajes el límite de compacidad ni quites controles visuales; si solo se trata de un RGB hardcoded frágil, reemplázalo por un criterio semántico verificable conservando controles de contraste, altura y acciones. No declares PASS remoto antes de que el propietario publique un nuevo SHA y su workflow termine verde.

## Ejecuta ahora

1. Revisa de forma estática `reconcilePosRows`, `sessionReportReads`, `reportResource`, `useReports`, `useExportSales`, `salesWorkbook` y las Rules de lectura de `pos_voids`.
2. Añade pruebas de regresión que ejerzan D, D+1, unión, cambio de mes/año, efectivo, Yape/Plin, mixto, duplicados, sede, negocio, recibos falsos, permisos denegados y Excel serializado/reimportado.
3. Verifica que el **camino real de lectores acotados** pueda reconciliar los escenarios, no solamente funciones a las que se inyecta manualmente el comprobante futuro.
4. Analiza un `get` por ID solo para tickets legados `voided` como alternativa acotada, con validación completa. **No implementes nuevas lecturas Firestore sin autorización**: primero presenta cantidades, límites, caché, riesgo de 403 y coste Spark por período.
5. Si todavía no podemos probar la integridad, deja pruebas que revelen el defecto y redacta `docs/PLAN-13-FASE-04-DIAGNOSTICO-CONCILIACION.md` con opciones y recomendación, sin inventar PASS.
6. Actualiza el inventario exacto de documentos en `tests/ui-security.test.mjs` para estos nuevos Markdown. No relajes la allowlist.
7. Ejecuta pruebas Node/Chromium locales existentes que sean aplicables y documenta el resultado. No instales Java ni herramientas nuevas. No uses Firebase real.
8. Mantén documentados los otros bloqueos de lanzamiento: reembolso físico/digital verificable, stock perecedero, restauración, pruebas multiempresa y consumo Spark.

**Prohibido Git/GitHub en Codex (incluso lectura), despliegues, instalación de dependencias, cambios en Rules, índices, autenticación, ventas, anulaciones, caja, inventario o persistencia.**

Entrega: archivos modificados, pruebas que pasaron/fallaron/quedaron bloqueadas, tabla de coste estimado, diagnóstico y decisión recomendada. No declares MigaPOS listo para producción.

Comienza la P13-04 con la reproducción del problema entre períodos y la evaluación de alternativas.
