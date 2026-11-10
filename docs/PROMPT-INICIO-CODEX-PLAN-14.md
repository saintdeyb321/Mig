# MENSAJE DE INICIO — CODEX / MIGAPOS PLAN 14

Actúa como arquitecto principal de MigaPOS (React, Firebase Spark, POS financiero y generación de informes).

**Inicia PLAN 14 — Recuperación segura de cajas vencidas + informe gerencial PDF y Excel optimizado.**

Lee primero, de principio a fin:

1. `docs/PLAN-14-CAJA-VENCIDA-INFORMES-PDF-EXCEL.md`
2. `docs/PROMPT-CODEX-PLAN-14-IMPLEMENTACION.md`

**Prioridad inmediata:** la caja Spark se vence a las 10 horas **desde la apertura** pero puede seguir cinco días con candado `open` y bloquear nuevas ventas. Corrige esto sin inventar un importe contado ni convertirlo en arqueo aprobado. Diseña y prueba la recuperación de una caja vencida con transacción Firestore y Rules, autorizada por dueño o cajero de esa sede; conserva la caja antigua como `expired_unreconciled` y permite abrir un turno nuevo con fondo propio. Si no puedes demostrar seguridad bajo Rules, no apliques una solución insegura: documenta el bloqueo.

**Segunda prioridad:** corregir la hoja `Auditoría_Cajas`: una APERTURA de S/100 no es «Contado Real S/100» ni tiene fecha de cierre. Separar APERTURA / CIERRE / VENCIMIENTO, dinero no declarado, estimaciones y diferencias. Después construir informe **HTML imprimible / Guardar como PDF** breve y elegante para el dueño; conservar Excel para tickets y auditoría, reutilizando la misma proyección y las mismas lecturas cacheadas por negocio/sede/período.

**Escala:** evaluar 20 negocios × 2 sedes × 100 ventas diarias por sede. Contar lecturas, no afirmar que el PDF reduce Firestore por sí solo. No crear nuevas hojas o consultas repetidas; no instalar librerías si el módulo de impresión existente resuelve el informe.

**Puedes ejecutar** pruebas locales Node, Chromium, build, lint, y Firebase emulador `demo-migapos` si está disponible. **Puedes editar Rules solamente en local** para garantizar la operación atómica, pero nunca publicarlas.

**Prohibido:** todos los comandos Git/GitHub (incluyendo `status` y `diff`), APIs o conectores de GitHub, push/commit/merge, deploy, Firebase real, instalaciones, Cloud Functions, TTL, falsos cierres con S/0, modificaciones financieras silenciosas o desactivar pruebas.

Al terminar, entrega `docs/PLAN-14-RESULTADOS-CAJA-INFORMES.md` con PASS/FAIL/BLOCKED, resultados de Rules, pruebas de apertura tras cinco días, PDF/Excel y consumo de lecturas. No declares listo para producción si falta una validación crítica.

**Comienza con la caja vencida y el emulador.**
