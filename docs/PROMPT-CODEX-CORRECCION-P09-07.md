# Codex — P09-07: cierre de hallazgos y pruebas antes de QA visual

Trabaja exclusivamente en la copia local de MigaPOS. Aplica una corrección **acotada** al PLAN 09; no rehagas el diseño ni reestructures dominios, datos, persistencia, transacciones o permisos.

## Prohibiciones absolutas

**No ejecutar comandos Git/GitHub**, ni `git` siquiera en lectura, `gh`, API/conectores GitHub, autenticación, commits, ramas, push, merge, deploy o cambios a recursos Firebase. Las operaciones de control de versiones y publicación son exclusivas del propietario. No ejecutar scripts de release que internamente dependan de Git.

## Corrige en este orden

1. `frontend/src/modules/AgendaManager.jsx` y `frontend/src/modules/BranchManager.jsx`: los títulos de diálogo contienen cadenas literales `'<Plus aria-hidden="true" /> ...'`. Renderiza títulos reales, sin presentar HTML como texto; conserva handlers, rol, `busy`, foco, datos y botones. Busca el mismo patrón de cadenas JSX accidentales en otros títulos, mensajes y módulos.
2. `frontend/src/modules/SuperAdmin.jsx`: la prueba heredada `tests/spark-startup.browser.html` busca el texto literal `Nuevo Cliente`; el cambio a `Nuevo cliente` hace fallar CI. Preferir la solución mínima: restaurar el texto visible `Nuevo Cliente`, sin alterar `onClick`, permisos ni formularios. No deshabilitar, omitir, silenciar ni debilitar las aserciones. Si encuentras otro motivo, documenta evidencia exacta.
3. Incorpora pruebas de regresión UX enfocadas en los dos títulos y la apertura correcta de diálogos dentro de `tests/plan09.browser.test.mjs` o pruebas equivalentes, sin backend ni escrituras reales. Mantén inalterado el significado de tests financieros.
4. Revisa los modales especializados que no se tocaron directamente (en especial `ContractDetailsModal`, caja, catálogo, sucursal, personal, administración, QR y confirmaciones). Corrige **solo** los problemas visuales inequívocos y documenta el resto. No modifiques el `step="0.50"` del abono como arreglo casual: registra el problema con una propuesta aislada y pruebas financieras posteriores.
5. Revisa `docs/PLAN-09-DESIGN-SYSTEM-MIGAPOS.md`: diferencia entre licencia del upstream MIT y cualquier material empaquetado con otros términos. El propietario decidirá qué skills sigue versionando; **no borres ni alteres `.agents/skills`, `.gitignore`, workflows de CI o paquetes de terceros** en esta tarea.

## Verificaciones

Ejecuta lint y build/PWA y, si las dependencias locales lo permiten sin usar Git internamente, tests Node y Chromium P09, más `npm run test:spark` (en los tests que no requieren emulador). Comprueba localmente vista SuperAdmin, apertura de nuevo cliente, Agenda y Nueva sede, títulos, foco/retorno, responsive, POS ocho líneas, checkout y modales largos. No instales Java ni uses Firebase real. La batería de Rules correrá después en CI bajo control del propietario.

Registra de forma compacta PASA/FALLA/SIN EJECUTAR y rutas de capturas PNG para comparar Galaxy Nebula en 7 tamaños con modalidades desktop y móvil. No prometas ausencia de regresiones financieras si no se probaron end-to-end.

La CI publicada no integra aún `tests/plan09.test.mjs` y `tests/plan09.browser.test.mjs`: documenta esa deuda sin modificar `.github/workflows/verify.yml` sin autorización explícita.

## Entrega

Responde de manera breve con: archivos tocados, causas corregidas, pruebas y conteos exactos, capturas creadas, hallazgos pendientes. **No usar Git ni GitHub ni hacer deploy.** El propietario subirá los cambios y ChatGPT revisará nuevamente el CI y el código.
