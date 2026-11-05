# INICIO — P09-08: cierre de CI y pruebas UX de MigaPOS

Actúa como arquitecto senior React/Firebase Spark y especialista en tests de regresión. Continúa desde el estado local del PLAN 09 ya corregido (P09-07). Lee `docs/PLAN-09-DESIGN-SYSTEM-MIGAPOS.md` y la auditoría P09-07 entregada por el propietario si existe localmente.

## Reglas absolutas

- **No ejecutes ningún comando Git o GitHub**, ni de lectura. Prohibidos `git`, `gh`, clone, fetch, push, commits, PRs, API/conectores GitHub, autenticación y deploy. El propietario gestiona versiones/publicaciones.
- No ejecutes scripts de release que invoquen Git; no toques Firebase real, credenciales, Rules, índices, persistencia ni transacciones financieras.
- No borres ni reinstales skills. Conserva la identidad Galaxy Nebula y todas las mejoras visuales P09.
- Aplica correcciones mínimas fundamentadas en evidencia; no hagas refactorizaciones generales.

## Hallazgo bloqueante confirmado

GitHub Actions del commit `f48d26e` aprobó seguridad y Spark/Rules en emulador, pero falló en `tests/offline-db.browser.html` porque el mock `apply` devuelve solo `{ stockVersions, syncedAt }` y no satisface `hasVerifiedSaleReceipt`.

Revisa `frontend/src/features/sales/domain/queueState.js` y el test. **Corrige solamente el mock de respuesta**, suministrando los campos que exige el contrato de recibo (`status: 'APPLIED'`, `saleId` correcto, `stockVersions`, `syncedAt`). No modifiques `hasVerifiedSaleReceipt`, `saleQueue`, IndexedDB ni el dominio para hacer aprobar un fixture antiguo. Conserva todas las aserciones, incluido que los históricos `synced` y `failed` no se reprocesan.

## Integración mínima de pruebas del PLAN 09 a CI

Actualmente `.github/workflows/verify.yml` no incluye `tests/plan09.test.mjs` ni `tests/plan09.browser.test.mjs`. Incorpóralos **solo como pruebas**, después de lint/build, usando el Chromium ya disponible en el runner y manteniendo sus fallos como bloqueantes. No cambies políticas de release, permisos, proyectos, variables de producción, despliegues, ni deshabilites verificaciones existentes. Editar el YAML localmente no autoriza usar Git/GitHub.

## Validación local permitida

1. Ejecuta `npm run test:offline-db` (usa Chromium/Edge disponible; no instales software pesado).
2. Ejecuta `npm run lint --prefix frontend` y `npm run build --prefix frontend`.
3. Ejecuta `node --test --test-concurrency=1 tests/plan09.test.mjs tests/plan09.browser.test.mjs` con el build preparado.
4. Ejecuta suites Spark que no invoquen `scripts/release.mjs` ni producción; si la prueba incompatible con la regla Git queda pendiente, informa el bloqueo expresamente.
5. Si aparece un fallo nuevo, localiza la causa y explica si es antiguo o introducido; no alteres lógica financiera ni pruebas para esconder fallos.

## Evidencia y salida eficiente

- Indica archivos modificados, cambios precisos y resultados PASS/FAIL con comandos.
- Anota que GitHub Actions debe comprobarse **después** de que el propietario publique un nuevo commit. No afirmes CI verde a partir de pruebas locales.
- No imprimas logs extensos ni archivos completos; usa un resumen compacto.
- No declares producto listo para vender: quedan aceptación humana, flujos con backend y el tema del `step="0.50"` del abono, que se resolverá en una tarea financiera separada.

Comienza a corregir P09-08 en los archivos locales. No te limites a investigar; implementa el ajuste y comprueba sus consecuencias.
