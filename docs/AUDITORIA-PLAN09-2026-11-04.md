# MigaPOS — Auditoría independiente del PLAN 09

**Fecha:** 2026-11-04  
**Repositorio:** https://github.com/saintdeyb321/Mig  
**Rama inspeccionada:** `fix/migapos-production-readiness`  
**Commit PLAN 09:** `966ec333503ba55bad6b8ebed3cd911bc4ae649c`  
**Base comparada:** `4d6ef8e6c443607f8a186a227f54731aad8b1a8d`  
**Método:** lectura de GitHub, comparación de archivos y CI; sin escrituras, despliegues, acceso a Firestore ni ejecución de pruebas sobre el commit nuevo.  
**Dictamen:** CORRECCIONES REQUERIDAS antes de producción.

## Evidencia de alcance

Un commit adelante; 220 archivos modificados en total: 39 frontend, 6 tests, 3 documentos, 172 en `.agents/skills/`. No se detectan modificaciones en Firestore Rules, índices, Firebase, modelos de dominio, transacciones financieras, hooks financieros, dependencias ni PWA. El diff de `POS.jsx` contiene solo 3 cambios de layout/clases; el protocolo de cobro no se modificó directamente. No equivale a prueba end-to-end financiera.

## Hallazgos

### H01 — Títulos con JSX literal (UX, corrección necesaria)

- `frontend/src/modules/AgendaManager.jsx`, línea 92: `'<Plus aria-hidden="true" /> Nuevo contacto'`.
- `frontend/src/modules/BranchManager.jsx`, línea 127: `'<Plus aria-hidden="true" /> Nueva sede'`.

Son cadenas: React presenta las etiquetas como texto. Sustituir por títulos de texto legibles o elementos JSX reales. Añadir regresión de modal sin escrituras reales.

### H02 — CI rojo (bloqueante para release)

[Verify MigaPOS, run 41924826647](https://github.com/saintdeyb321/Mig/actions/runs/41924826647): 76/77 pruebas del grupo Spark aprobaron, 1 falló; los siguientes grupos quedaron sin ejecutar. La prueba `tests/spark-startup.browser.html` busca `Nuevo Cliente` (literal sensible a mayúsculas), mientras `frontend/src/modules/SuperAdmin.jsx` presenta `Nuevo cliente` tras P09. Ese desajuste basta para que `createButton()` falle en la aserción `Migrated native administration is enabled`. La UI de alta de cliente no ha demostrado estar rota; falta ejecutar CI verde con la corrección. Restaurar capitalización de etiqueta o adoptar un selector estable accesible (sin debilitar pruebas). La versión base previa fallaba antes, en auditoría de dependencias, por tanto no es posible atribuir toda la historia de CI al PLAN 09.

### H03 — 172 archivos de skills publicados (higiene de repositorio y licencias)

Se añadieron 172 archivos en siete subcarpetas: `banner-design` (2), `brand` (18), `design-system` (27), `design` (35), `slides` (6), `ui-styling` (16) y `ui-ux-pro-max` (68). No forman parte del runtime. Evitar distribuir paquetes de desarrollo innecesarios; el propietario gestiona su desversionado con Git **manualmente**. Conservar instalación local si es útil. El repositorio upstream UI/UX Pro Max publica actualmente licencia MIT en su `LICENSE` y README; la documentación local de P09 afirma una discrepancia CC-BY-NC-4.0/MIT que debe aclararse conforme a los archivos/versiones precisos distribuidos. Verificar licencias de las otras skills.

### H04 — Pruebas P09 no integradas en CI (cobertura)

`tests/plan09.test.mjs` y `tests/plan09.browser.test.mjs` están publicados y su documentación reporta 46 pruebas Node + 122 comprobaciones Chromium P09 + 71 anteriores. Sin embargo, `.github/workflows/verify.yml` sigue ejecutando `npm run test:spark`, `npm run test:spark:rules`, IndexedDB, lint y build; **no** incluye los dos nuevos tests P09. Los reportes locales de Codex no se han reproducido de forma independiente aquí. Estudiar adición futura de estos tests al pipeline, con autorización explícita para modificar la configuración protegida.

### H05 — Aceptación visual y financiera real pendiente

El P09 incorpora cambios estructurales correctos en `theme.css`, `index.css`, `TicketParts.jsx`, `Dialog.jsx` y `AppLayout.jsx`: tema Galaxy Nebula, alturas del POS, scroll separado, CTA visible y adaptación del viewport. Las capturas `.release/plan09-visual/` no figuran en GitHub; sin acceso a ellas o una preview verificable **no** se ha aprobado visualmente cada módulo. Las pruebas P09 utilizan fixtures sintéticas y mocks que prohíben escrituras de negocio; no certifican venta, cobro, stock, reglas reales, caja, contratos, emisión de ticket o exportación.

### H06 — Deuda preexistente en abonos y modales especializados

`frontend/src/modules/contracts/components/ContractDetailsModal.jsx` no cambió en P09 y conserva `Input type="number" min="0.1" step="0.50"` para registrar abonos. Puede restringir la edición de montos de un céntimo o producir incrementos inesperados, según formulario/navegador. No modificar el dominio de pagos silenciosamente: abrir tarea funcional con tests, y verificar manualmente centavos. Este modal también conserva estilos heredados que merecen inspección visual especializada. La mejora de los componentes compartidos no certifica automáticamente cada modal.

### H07 — El proyecto tiene guardas de release, y staging independiente no está configurado

`firebase.json` ejecuta `node scripts/release.mjs guard` antes de publicar Hosting. `scripts/release.mjs` exige configuración generada, CI aprobado del mismo commit, recibo/hash y autorización del propietario. `frontend/src/config/environments.js` declara explícitamente que no existen recursos de staging. No bypass de guardas ni `firebase deploy` genérico. Firebase Hosting preview apunta normalmente a los **mismos servicios backend reales** del proyecto configurado (documentación oficial: https://firebase.google.com/docs/hosting/test-preview-deploy). Primero revisar la app localmente o preparar un entorno independiente; toda publicación es tarea manual del propietario.

## Dictamen y avance

- **Confirmado por lectura:** mejora real del diseño y la distribución de POS; cambio de aspecto en navegación, componentes, formularios y módulos activos; ausencia de cambios directos en el núcleo financiero.
- **No certificado:** cero regresiones financieras end-to-end, ausencia de errores en dispositivos físicos, lectura con screen reader, exactitud en Reglas reales, aspecto final en pantallas reales, distribución/licencias de todas las skills, CI verde.
- **Decisión:** NO publicar a live ni declarar comercialización lista todavía. Ejecutar corrección P09-07, subir exclusivamente a cargo del propietario, esperar CI verde y compartir capturas o preview no productiva para auditoría visual. Concluir mediante aceptación funcional y release guard existente.
