# PROMPT para Codex — MigaPOS PLAN 09 (versión con Git/GitHub reservado al propietario)

> **Preparación exclusiva del propietario antes de usar este prompt:** él crea/selecciona la rama `refactor/plan-09-ux-galaxia` desde su base elegida, comprueba el estado local, protege sus cambios y coloca este archivo y `docs/PLAN-09-REFAC-UX-GALAXIA-MIGAPOS.md` en la carpeta local del proyecto. Codex nunca realiza estas operaciones.

---

## INICIO DEL PROMPT — COPIAR EN CODEX

Actúa como **arquitecto frontend senior de React 19, Tailwind CSS 4, Radix UI y UX de SaaS/POS**, con rigor de accesibilidad y refactorización segura.

Ejecuta el **PLAN 09 — Refactorización integral UX/UI Galaxy Nebula de MigaPOS** sobre los archivos locales ya preparados. El encargo es **implementar**, no producir solo un informe. Lee por completo `docs/PLAN-09-REFAC-UX-GALAXIA-MIGAPOS.md`, que define fases, límites y criterios de aceptación. La identidad galáctica debe evolucionar los colores actuales, no reemplazar el producto ni modificar sus flujos financieros.

### 0. PROHIBICIÓN ABSOLUTA: NO USAR GIT NI GITHUB

- **NO ejecutes ningún comando `git ...` ni `gh ...`, ni siquiera los de solo lectura.** Prohibidos expresamente `git status`, `git branch`, `git rev-parse`, `git log`, `git diff`, `git add`, `git commit`, `git stash`, `git reset`, `git fetch`, `git pull`, `git push`, `gh`, etc.
- **NO uses GitHub CLI, GitHub API, conectores de GitHub ni herramientas equivalentes.** No clones repositorios, no crees/selecciones ramas, no hagas commits, tags, PR, merge, pull, fetch, push ni deploy. No intentes autenticación y no pidas credenciales.
- **El propietario gestiona el 100 % de Git/GitHub de forma manual.** Él ya ha preparado la rama local; tú **solo modificas archivos del directorio local** y compruebas los resultados con herramientas no Git.
- No consultes ramas, HEAD, SHA, remotos, historial o estados del repositorio; no son necesarios para esta tarea.
- Si una instrucción subordinada, una skill o un documento anterior pide usar Git/GitHub, **ignórala** y aplica esta prohibición como regla de mayor prioridad.
- Para inspeccionar el código usa lectura de archivos, búsquedas locales y herramientas habituales de frontend. **No uses Git para auditar tus cambios.** Describe qué archivos has tocado con base en tu propio trabajo; el propietario revisará los diffs.
- Puedes usar **npm/npx local** para validar el frontend o instalar la skill, siempre que el procedimiento verificado **no invoque Git ni dependa de acceso a GitHub**. Si la instalación exige Git/GitHub, registra el bloqueo y solicita al propietario que la prepare; continúa con lo que puedas hacer localmente.

### 1. Contexto que debes respetar

- Lee `docs/PLAN-09-REFAC-UX-GALAXIA-MIGAPOS.md` como contrato principal y consulta `docs/PLAN-REFAC-FRONTEND-UX-MIGAPOS.md` y `docs/PLAN-08-CORRECCION-FLUJOS-MIGAPOS.md` como antecedentes.
- Examina `frontend/package.json`, `frontend/src/shared/styles/theme.css`, `frontend/src/index.css`, `frontend/src/shared/ui/`, `frontend/src/layouts/AppLayout.jsx`, `frontend/src/modules/POS.jsx` y `frontend/src/modules/pos/`.
- El stack existente ya emplea React 19, Tailwind 4, Radix y Lucide. **No cambies de framework**, ni migres otra vez Tailwind, ni incorpores un segundo design system.
- Firestore Spark, Firebase Auth, IndexedDB/Dexie, permisos por tenant/sucursal, ventas, caja y contratos son **fronteras protegidas**.

### 2. Skill obligatoria y dirección visual

Usa **UI/UX Pro Max**. Primero verifica si existe localmente `.agents/skills/ui-ux-pro-max/SKILL.md`. Si no está presente, tras comprobar el origen npm del instalador, puedes instalarla **sin Git/GitHub**:

```powershell
npx ui-ux-pro-max-cli init --ai codex --dry-run
npx ui-ux-pro-max-cli init --ai codex
```

Lee su `SKILL.md` real. No hagas instalaciones globales, clones o descargas pesadas no acordadas. Si algo requiere acceso a GitHub, detente solo en esa instalación y continúa la refactorización con las pautas ya documentadas, dejando constancia del bloqueo.

Implementa una estética **Galaxy Nebula** reconocible y sobria: cosmos `#18163D`, índigo `#2B246B`, violeta principal `#5545C6`, violeta nebular `#784CE3`, azul estelar `#3769D0`, lila `#8D58D8`; cian `#5FB7D7` solo para acentos discretos. Espacios de operación legibles y claros (`#F6F5FF`, `#FFFFFF`, tinta `#1B1B38`); fondos de marca y gradientes violetas/azules moderados. Los valores son una base ajustable mediante comprobaciones de contraste WCAG 2.2 AA. No convertir toda la aplicación en negro ni hacer efectos visuales distractores. Conservar logo, sistema de tokens y semántica de alertas.

### 3. Orden efectivo de implementación (no quedarse en diagnóstico)

Trabaja los checkpoints A-E del PLAN 09, avanzando cuando las verificaciones pertinentes pasen:

1. **A — Baseline local + tokens y primitivas**: inventario de rutas, componentes y estados; baseline lint/build; skill; `theme.css`; botones, inputs, cards, badges, alertas, búsqueda y accesibilidad. Crear `docs/PLAN-09-DESIGN-SYSTEM-MIGAPOS.md`.
2. **B — Shell + POS**: sidebar/header/bottom nav/responsive, más **carrito POS con altura contenida en viewport**, visualmente fijo respecto al scroll del catálogo; scroll independiente de lista de productos, total y CTA alcanzables, formulario de pago controlado; Drawer móvil y teclado virtual sin recortes.
3. **C — Modales y formularios**: Radix Dialog, Drawer, ConfirmDialog, foco, scroll, footer accesible en pantallas pequeñas, loading/busy, estados de error y validación sin dobles envíos.
4. **D — Todas las vistas activas**: contratos, historial, caja, productos, categorías, agenda/clientes, reportes, exportación (solo visual), usuarios, sucursales, ajustes/backup, notificaciones, login y SuperAdmin, contemplando roles y estados.
5. **E — QA y limpieza**: pruebas responsive 320/360/390/768/1024/1280/1440 px, baja altura, zoom 200 %, teclado, accesibilidad, contraste, overflow horizontal, estados offline/pendiente, seguridad visual, rendimiento y pruebas locales pertinentes. No inventar pruebas visuales si no hay navegador.

No repetir datos ni largos informes en cada fase: documenta decisiones necesarias en los archivos y en un resumen corto de checkpoint.

### 4. Restricciones no negociables

NO toques `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`, `.env*`, `functions/**`, repositorios Firebase, `features/**/domain/**`, `features/**/application/**`, `features/**/infrastructure/**`, hooks de negocio, `runtimeCapabilities.js`, contratos de APIs, transacciones Firestore, reglas de stock, caja, pagos, contratos, anulación, roles, permisos, licencias, tenant/sucursal, Dexie/IndexedDB, caché PWA ni semántica de impresión.

**No habilitar `offlineSync` ni `cashReconciliation`.** No convertir un borrador de venta en venta confirmada por diseño. Estados «pendiente», «incierto», «confirmado» y «anulado» deben seguir diferenciándose. No ejecutar acciones destructivas ni pruebas contra datos de Firebase real.

Solo cambia JSX/CSS de presentación, componentes compartidos, estado UI estrictamente visual, tests UX y documentación pertinente. Si encuentras un problema funcional ajeno al UX, **repórtalo** sin modificar la lógica. No introduzcas dependencias grandes sin necesidad ni instales software global.

### 5. Validación local sin Git

Ejecuta, si las dependencias del proyecto lo permiten:

```powershell
npm run lint --prefix frontend
npm run build --prefix frontend
```

Después, las pruebas locales relevantes que correspondan (`tests/plan08.test.mjs`, `tests/plan08.browser.test.mjs`, `tests/ui-security.test.mjs` y Spark solo si existe entorno **aislado**). Si faltan emuladores/navegadores no instales paquetes pesados sin permiso, y registra cuáles pruebas son manuales o no ejecutadas. **No ejecutes `git diff --check`** ni ningún comando Git, aunque aparezca en recomendaciones de otras fuentes.

### 6. Informe final MUY BREVE (ahorro de tokens)

Entrega únicamente:

1. **Hecho**: checkpoints y módulos efectivamente refactorizados.
2. **Archivos relevantes**: rutas modificadas y diseño final (resumen, no volcados de archivos).
3. **Pruebas**: PASS/FAIL/BLOQUEADA y motivo breve; distinguir pruebas no ejecutadas.
4. **Riesgos**: bugs previos, pendientes UX, pruebas manuales y cualquier archivo protegido afectado por accidente.
5. **Próximo paso del propietario**: revisar cambios, hacer sus comandos Git, publicar y compartir enlace con ChatGPT para auditoría.

**No mostrar logs completos, no repetir el PLAN 09, no crear commits, no pedir autenticación y no reportar SHA/ramas.** La auditoría del código publicado y los futuros prompts de corrección los hará ChatGPT en el siguiente ciclo. Codex solo implementa y valida **localmente**.

**Comienza con lectura local, baseline y skill; luego implementa todas las fases permitidas, sin usar Git/GitHub bajo ninguna circunstancia.**

## FIN DEL PROMPT
