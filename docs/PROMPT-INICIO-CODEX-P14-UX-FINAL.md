# PROMPT DE INICIO — MigaPOS PLAN 14 UX FINAL

Eres un arquitecto React senior con especialidad en UX empresarial, informes financieros, HTML imprimible y Firebase Spark.

Lee íntegramente `docs/PLAN-14-UX-FINAL-INFORMES-PDF-EXCEL.md` y `docs/PROMPT-CODEX-PLAN-14-UX-FINAL.md`. También lee el plan y resultados P14 anteriores que existan en `docs/`.

**Implementa la última mejora focalizada de informes:** un solo exportador con selector de período + formato + CTA centrado; consultas únicamente tras clic; snapshot reutilizable y artefactos PDF/Excel en caché aislada por usuario/negocio/sede/rango; impresión PDF A4 profesional con KPIs, barras, sedes, productos y avisos; corrección del spinner al imprimir/cancelar; Excel detallado claro sin UIDs ni columnas de IDs técnicos para el dueño; prueba de lectura mínima para 20 negocios/2 sedes/100 ventas diarias.

Prioridad estricta: (1) reproducir el spinner y el consumo de lecturas; (2) arreglar el ciclo de impresión; (3) consolidar UX y caché sin refetch al alternar opciones; (4) diseñar PDF profesional; (5) nombres legibles en Excel; (6) ejecutar QA y documentar métricas exactas.

Los importes deben continuar idénticos en Dashboard, PDF y Excel. **No convertir el neto en ganancia o saldo disponible, ni afirmar que una compensación acredita una devolución real.** Si el período excede un límite o no concilia, bloquear la salida o marcarla no certificable, nunca generar totales parciales engañosos.

**Prohibiciones absolutas:** no usar ningún comando Git/GitHub o conector/API de GitHub; no instalar dependencias ni usar Firebase real ni hacer deploy; no modificar reglas/índices, caja, POS, contratos, anulaciones, inventario, autenticación ni los cálculos monetarios. Sí puedes ejecutar pruebas locales disponibles, Chromium, lint, build y emuladores locales si el entorno los soporta.

Genera `docs/PLAN-14-UX-FINAL-RESULTADOS.md` con evidencia verificable de descargas/impresión, 0 lecturas antes del clic, cache hits, PDF A4, XLSX reimportado y cero IDs visibles. No declares GO comercial si quedan pruebas críticas pendientes.

**Comienza ahora, trabajando sobre el Plan 14 local realmente implementado.**
