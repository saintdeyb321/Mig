# MigaPOS — PLAN 09: Refactorización integral de UX/UI «Galaxy Nebula»

**Estado inicial:** PROPUESTO · pendiente de ejecución y validación.
**Fecha de preparación:** 2026-11-04.
**Repositorio:** https://github.com/saintdeyb321/Mig.git
**Rama de origen preferida:** `fix/migapos-production-readiness`.
**HEAD de referencia auditado:** `4d6ef8e6c443607f8a186a227f54731aad8b1a8d` (2026-11-03); el propietario comprobará localmente la referencia antes de abrir Codex.
**Rama de trabajo (la crea y gestiona exclusivamente el propietario):** `refactor/plan-09-ux-galaxia`.
**Ámbito:** experiencia de usuario y capa de presentación de **todo el frontend**.
**Skill elegida:** [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), instalación local para Codex CLI.
**Documento operativo:** `docs/PROMPT-CODEX-PLAN-09-MIGAPOS.md`.

> **Principio innegociable:** mejorar radicalmente la presentación sin alterar los contratos de negocio, estados financieros, seguridad, permisos, persistencia, transacciones ni infraestructura Spark. Una implementación atractiva **no autoriza por sí sola** vender MigaPOS: el cierre comercial exige pruebas y aceptación explícita.

> **REGLA ABSOLUTA: CODEX NO USA GIT NI GITHUB.** Prohibidos **todos** los comandos `git ...` y `gh ...` (incluso `git status`, `git diff`, `git branch`, `git log`, `git add`, `git commit`), así como GitHub CLI, API de GitHub, conectores de GitHub, `clone`, `fetch`, `pull`, `push`, creación/cambio de ramas, commits, tags, PR, merges y despliegues. No ejecutar esos comandos ni siquiera en modo lectura. **El propietario hace personalmente toda la gestión de versiones y publicación.** Codex trabaja **solo con los archivos locales** de la carpeta que el propietario ya abrió; su tarea es refactorizar, verificar con herramientas locales no Git y entregar un resumen breve. No necesita conocer SHA, historial ni estado de ramas.

### Protocolo propietario → Codex → propietario → auditoría

1. **Propietario (antes de Codex):** prepara la copia de trabajo, comprueba que los cambios estén seguros y crea/selecciona por su cuenta la rama `refactor/plan-09-ux-galaxia`; coloca los dos documentos PLAN 09 en `docs/`.
2. **Codex:** lee los documentos, inspecciona únicamente el código local, instala/usa la skill por su instalador de paquete verificado (sin Git/GitHub), implementa P09-00 a P09-06 y ejecuta lint/build/tests locales que no requieran despliegue ni acceso a producción. No modifica historial ni ramas.
3. **Codex:** entrega un informe **compacto** de archivos/secciones cambiados, pruebas con resultado, bloqueos y riesgos. Evita transcripciones largas, listados redundantes y copiar íntegros los documentos, para ahorrar tokens.
4. **Propietario:** revisa cambios y resultados, ejecuta personalmente cualquier comando Git, crea commits, sube a GitHub cuando lo considere oportuno y comparte el enlace del commit/PR/rama o ZIP actualizado.
5. **ChatGPT:** audita ese snapshot publicado, identifica defectos verificables y devuelve un **prompt de corrección acotado** o comunica qué ha quedado listo. Se repite el ciclo hasta aceptación; la aprobación comercial siempre requiere pruebas manuales.


---

## 1. Contexto real del repositorio y punto de partida

La auditoría está basada en el ZIP de la rama `fix/migapos-production-readiness` correspondiente al commit indicado. El proyecto ya dispone de una refactorización anterior (`docs/PLAN-REFAC-FRONTEND-UX-MIGAPOS.md`) **implementada a nivel de código** y pendiente de aceptación manual según dicho documento. El PLAN 09 **evoluciona y corrige** esa base; no repite una migración inicial a Tailwind ni propone reemplazar la arquitectura.

### Stack observado

- React 19 + JavaScript + Vite 7; Tailwind CSS 4 con `@tailwindcss/vite`.
- Radix Dialog, AlertDialog y DropdownMenu; Lucide; `clsx` y `tailwind-merge`.
- `frontend/src/shared/ui/`: Button, IconButton, Card, Alert, Badge, Dialog, Drawer, ConfirmDialog, PageHeader, Input, FormField, SearchField y estados comunes.
- `frontend/src/shared/styles/theme.css`: fuente actual de tokens CSS con `@theme` y aliases de compatibilidad.
- `frontend/src/index.css`: Tailwind, estilos globales de base, foco, movimiento reducido y scrollbar.
- `frontend/src/layouts/AppLayout.jsx` y `frontend/src/BottomNav.jsx`: shell, navegación desktop/mobile, selección de sucursal y señales de sesión.
- `frontend/src/modules/`: operaciones visibles; `frontend/src/features/`: hooks, aplicación, dominio, infraestructura.
- Firebase Authentication, Cloud Firestore, Dexie/IndexedDB, PWA; operación en modo Firebase Spark.

### Hallazgos específicos que justifican el PLAN 09

| Código / pantalla | Observación comprobada estáticamente | Trabajo UX solicitado |
|---|---|---|
| `shared/styles/theme.css` | El diseño actual usa `--color-sidebar: #211a43`, violeta primario `#4f46c9`, panel blanco y canvas pálido. La identidad se acerca a violeta oscuro, pero no explota una jerarquía de tonos galaxia/nebulosa. | Renovar **tonalidades y profundidad**, sin volver ilegibles los espacios de trabajo. |
| `layouts/AppLayout.jsx` | Sidebar con degradado `from-sidebar via-brand-deep to-sidebar`, header móvil fijo por scroll, contenido fluido y bottom nav móvil. | Coherencia de marca, densidad, navegación y espacios seguros; preservar permisos. |
| `modules/POS.jsx` | Grid desktop con catálogo + `<aside className="sticky top-6 ...">`; botón flotante abre Drawer en móvil. | Carrito estable dentro del viewport; evitar que el scroll del catálogo mueva la acción de cobro. |
| `modules/pos/TicketParts.jsx` | `Ticket` usa `max-h-[calc(100dvh-3rem)]`, scroll que incluye líneas y zona de pago; botón final en pie separado. | Altura útil controlada; scroll **de productos** independiente; total, pago y CTA previsibles. |
| `shared/ui/Dialog.jsx` | Radix con overlay, foco gestionado, scroll interno, pie sticky y `fieldset` con clase `contents`. | Auditar tamaños, foco, formularios largos, teclados móviles, bloqueo durante submit y pies visibles. |
| `modules/SalesHistory.jsx` | Estados de ventas, borradores, anulaciones y comprobación remota diferenciados. | Mejorar comprensión y jerarquía visual **sin falsificar estados financieros**. |
| `modules/contracts/ContractManager.jsx` | Integra contratos, caja, pagos, filtros por sucursal e impresión. | Formularios y detalles consistentes; no tocar cálculo ni permisos. |
| `config/runtimeCapabilities.js` | Algunas capacidades Spark están habilitadas; `offlineSync`, `cashReconciliation`, `cloudFunctions`, `cloudStorage` están deshabilitadas. | Respetar límites; no introducir acciones que aparenten estar disponibles. |

**Límite del diagnóstico:** estos son hechos de lectura de código; no se ha certificado aún el comportamiento en navegador, emulador o Firebase real. Codex debe medir una línea base antes de afirmar que un problema está resuelto.

---

## 2. Objetivo y definición de éxito

Convertir la interfaz existente en un **producto SaaS/POS profesional, memorable, coherente, rápido y fácil de operar**, especialmente en caja, móvil y formularios extensos.

**Resultados obligatorios:**

1. Identidad «Galaxy Nebula» consistente en el 100 % de las vistas visibles para cada rol; colores actuales reconocibles, pero mejor graduados, no un dark mode negro uniforme.
2. POS: carrito de escritorio anclado al viewport, sin crecer indefinidamente ni desplazar acciones; en móvil, Drawer cómodo y CTA accesible incluso con teclado.
3. Dialogs y Drawers: medidas adaptativas, foco correcto, scroll interno, footer/CTA utilizable, no pérdida de datos ni dobles envíos.
4. Navegación y arquitectura visual transversal: jerarquía, espaciado, filtros, formularios, tablas, feedback, vacíos, loading y errores coherentes.
5. Responsive y accesibilidad comprobables; rendimiento razonable en equipos de caja modestos.
6. **Cero modificaciones del comportamiento financiero y del modelo de datos** por causa del rediseño.
7. Evidencia de aceptación por módulo; issues funcionales ajenos al UX documentados sin «solucionarlos» alterando dominio durante esta rama.

**No es objetivo:** reescribir negocio, migrar a TypeScript, Next.js/shadcn o un nuevo framework, cambiar datos Firestore, habilitar offlineSync, cambiar reglas o índices, migrar a Blaze, desplegar, fusionar a `main`, imponer animaciones pesadas o rehacer el logo sin una solicitud posterior.

---

## 3. Skill de diseño y forma correcta de integrarla

### Skill principal: UI/UX Pro Max

**Fuente oficial:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Aporta orientación sobre sistemas visuales, paletas, UX, jerarquía, formularios, accesibilidad, componentes y pautas para React/Tailwind. **La skill asesora: no modifica automáticamente el producto**; Codex debe inspeccionar, diseñar, implementar y validar con criterio humano.

**Antes de instalar:**

1. Trabajar en la **carpeta local del proyecto** `Mig`, previamente preparada por el propietario, no en `frontend/` como raíz aislada; no comprobar su rama con Git.
2. Consultar README/licencia **si ya están disponibles localmente** y revisar los archivos a crear. No acceder a GitHub desde Codex ni ejecutar scripts ajenos sin verificación básica de procedencia.
3. Comprobar `node --version`, `npm --version`, `python --version` o `py -3 --version`; Python 3 es requisito de las búsquedas de la skill.
4. Evitar `npm install -g` y **no usar Git/GitHub ni clonar** el repositorio de la skill (se busca ocupar poco espacio). Solo se permite instalación por CLI de npm si fue verificado y no requiere comandos Git. Si el instalador exige Git/GitHub, informar para que el propietario lo gestione.
5. Previsualizar la instalación:

```powershell
npx ui-ux-pro-max-cli init --ai codex --dry-run
```

6. Si la previsualización es apropiada, instalar localmente en el repositorio:

```powershell
npx ui-ux-pro-max-cli init --ai codex
```

7. Comprobar la existencia de `.agents/skills/ui-ux-pro-max/SKILL.md`, leerlo y confirmar que scripts/data funcionan. Si Codex requiere recargar la sesión para detectar la skill, seguir el procedimiento soportado por la versión instalada.
8. **No añadir innecesariamente la skill al código comercial.** Revisar tamaño/licencia y reportar los archivos locales generados. **Solo el propietario decide cuáles versionar.** No editar `.gitignore` automáticamente.
9. Si Python no existe, informar el bloqueo y **no instalar Python automáticamente**. Si `npx` falla, informar; no inventar resultados de generación.

Ejemplo orientativo, después de confirmar la ruta real:

```powershell
py -3 .agents/skills/ui-ux-pro-max/scripts/search.py "retail point of sale SaaS dashboard galaxy nebula violet blue" --design-system -p "MigaPOS" -f markdown
py -3 .agents/skills/ui-ux-pro-max/scripts/search.py "responsive checkout modal form scroll accessibility" --domain ux
py -3 .agents/skills/ui-ux-pro-max/scripts/search.py "responsive layout" --stack react
```

En otros entornos usar `python3` si esa es la orden disponible. Los parámetros deben contrastarse con el `SKILL.md` real. La salida de la skill es **referencia**, no autoridad sobre la identidad obligatoria de MigaPOS.

### Entregable de diseño

Crear `docs/PLAN-09-DESIGN-SYSTEM-MIGAPOS.md` (o `design-system/migapos/MASTER.md`) con la paleta aprobada en código, tokens, gradientes permitidos, tipografía, spacing, radios, elevaciones, foco, variantes de botones, estados y patrones responsive. **Una sola fuente efectiva de tokens:** `frontend/src/shared/styles/theme.css`; el documento registra el contrato, no duplica un tema CSS ejecutable.

---

## 4. Dirección visual «Galaxy Nebula» — obligatoria

### Intención

**Azul nocturno + violeta dominante + acentos nebulares más luminosos.** La aplicación debe recordar galaxias y nebulosas por sus transiciones cromáticas, brillo sutil y profundidad, pero mantener productividad, confianza y legibilidad. No agregar fotografías de estrellas, fondos ruidosos, partículas animadas, destellos permanentes o glassmorphism en todas las tarjetas.

**Distribución conceptual:** el violeta es protagonista; índigo y azul dan profundidad; lila y cyan aparecen como matices, no como colores de todas las acciones. El contenido financiero requiere superficies tranquilas.

### Paleta semilla propuesta — ajustar tras validar contraste

| Rol visual | Valor inicial | Uso principal |
|---|---|---|
| Cosmos profundo | `#18163D` | Sidebar, regiones muy oscuras de marca |
| Índigo espacial | `#2B246B` | Transiciones de navegación/cabeceras |
| Violeta principal | `#5545C6` | CTA primario, acciones y foco de identidad |
| Violeta nebular | `#784CE3` | Acentos y parte de gradientes |
| Azul estelar | `#3769D0` | Segundo eje cromático y pequeñas zonas de gradiente |
| Lila nebulosa | `#8D58D8` | Acentos controlados, estados no semánticos |
| Cyan tenue | `#5FB7D7` | Brillos y decoraciones mínimas, **no texto blanco sobre cyan** |
| Bruma/lienzo | `#F6F5FF` | Fondo general claro y sereno |
| Superficie | `#FFFFFF` | Tarjetas, formularios y contenido de lectura |
| Tinta | `#1B1B38` | Texto de operación |
| Texto secundario | `#555F7D` | Descripciones legibles |
| Borde frío | `#DDE0F4` | Separadores y campos |

Mantener tokens semánticos existentes (`success`, `warning`, `danger`, `focus`, `finance-line`, `sidebar-muted`) con contrastes validados. Los colores de peligro, confirmación, estados inciertos y cobro **no pueden identificarse solo por el color**.

**Contraste de referencia verificado matemáticamente para algunos pares semilla:** blanco sobre violeta principal ≈ 6.88:1, tinta sobre lienzo ≈ 15.41:1 y texto secundario sobre lienzo ≈ 5.85:1. Los gradientes, overlays, transparencias y estados interactivos requieren comprobación adicional sobre su fondo real. Exigir WCAG 2.2 AA: texto ordinario ≥ 4.5:1, texto grande y controles esenciales ≥ 3:1 (según el criterio aplicable).

### Normas del estilo

- Sidebar de «cosmos profundo» con transición índigo/violeta y acento azul **visible pero sutil**, sin degradados saturados por todas partes.
- Header de módulos y títulos con jerarquía estable; opcionalmente una banda de marca sutil, no un banner ornamental gigante.
- Tarjetas y formularios en panel claro; balance blanco/bruma para evitar monotonía y fatiga.
- Gradientes reservados a marca, CTA primario y contadas superficies protagonistas; **no** en badges de error, números de stock, tablas ni cada botón.
- Sombras suaves, bordes fríos, radios consistentes; prohibidas sombras excesivas y grandes áreas de `backdrop-filter` en equipos de bajo rendimiento.
- Animación entre ~120 y 220 ms donde mejore feedback; `prefers-reduced-motion` siempre respetado; ninguna animación debe retrasar un cobro.
- Tipografía funcional y tabular para dinero (`tabular-nums`), `S/` siempre legible; no usar fuentes ornamentales para formularios ni números.
- Logo e iconografía MigaPOS existentes se preservan; iconos Lucide coherentes y `aria-label` en controles icónicos.
- No agregar «modo oscuro» global como tarea extra. Si el tema actual se mantiene principalmente claro, mejorarlo sin invertir inesperadamente todas las superficies.

---

## 5. Frontera arquitectónica y restricciones duras

### Permitido dentro de PLAN 09

- `frontend/src/shared/styles/theme.css`, `frontend/src/index.css` y estilos estrictamente visuales existentes.
- `frontend/src/shared/ui/**`, `frontend/src/layouts/**`, `frontend/src/BottomNav.jsx`.
- JSX y estado **exclusivamente de presentación** dentro de `frontend/src/modules/**` y componentes de vista.
- Pequeños hooks visuales aislados, siempre que no creen nuevas suscripciones, consultas o escrituras.
- Pruebas de render, accesibilidad, layout/responsive y documentación de diseño.
- Dependencias del frontend **solo** si el comportamiento visual no es viable con las ya instaladas y se justifica necesidad, coste y compatibilidad.

### Prohibido sin autorización expresa y nueva tarea

- `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`, `.env*`.
- `functions/**`, `frontend/src/features/**/domain/**`, `application/**`, `infrastructure/**`, repositorios Firebase, transacciones y protocolo Spark.
- `frontend/src/config/runtimeCapabilities.js` y cambios en límites financieros, permisos, licencias, roles, sesión o separación por tenant/sucursal.
- Contratos de hooks (`usePOS`, `useCashRegister`, `useContracts`, `useSalesHistory`, etc.), o cambios en cálculos, IDs, idempotencia, estados, stock, pagos o arqueos.
- `offlineDB`, Dexie, IndexedDB, cifrado, sincronización offline y PWA/service worker/cache.
- Plantillas/semántica de tickets impresos, comprobantes y exportación contable; la pantalla de exportación sí puede mejorar visualmente.
- **Cualquier comando Git/GitHub, incluso de lectura**, así como `gh`, GitHub API/conectores, clone, commit, push, pull, fetch, merge, cambio de rama, PR, deploy, limpieza de colecciones reales, instalación de herramientas globales o cambio de plan Firebase. Esto corresponde exclusivamente al propietario.

**Regla adicional:** la lectura/uso de utilidades bajo `functions/src/` por parte del frontend puede ser legítima. No borrar carpetas porque parezcan heredadas. No introducir Firestore en nuevos componentes puramente visuales.

Si se descubre un defecto funcional real: registrar prueba, archivo, impacto y recomendación en hallazgos PLAN 09; corregir únicamente si es una falla **estrictamente visual** con alcance comprobable. No aprovechar la refactorización para cambiar la operación financiera.

---

## 6. Fases de ejecución — implementar en orden, con checkpoints

### P09-00 — Preflight local, baseline y skill (sin Git/GitHub)

**Precondición que cumple el propietario:** haber creado/seleccionado la rama y colocado los archivos PLAN 09 antes de abrir Codex. Codex confía en el directorio ya preparado, sin consultar el historial o la rama.

1. Inspeccionar **solo carpetas y archivos locales** (`frontend/package.json`, vistas, CSS, pruebas, documentación); no usar `git`, `gh` ni GitHub API.
2. Inventariar páginas por rol, componentes, modales, drawers, puntos de entrada, tokens, clases hard-coded, áreas scrollables, estados financieros y tests existentes.
3. Ejecutar baseline de lint/build y pruebas locales relevantes sin acceder a Firebase real; registrar problemas preexistentes por separado.
4. Instalar y activar UI/UX Pro Max desde la CLI de npm verificada, sin Git/GitHub; confirmar archivos y scripts y generar recomendaciones adaptadas a MigaPOS.
5. Preparar matriz de cobertura UX: pantalla × rol × viewport × estado (normal, loading, error, vacío, disabled, offline/pendiente).

**Salida:** baseline, inventario, skill disponible o bloqueo documentado y sistema visual inicial. La gestión de ramas, seguridad del trabajo y commits está fuera del alcance de Codex.

### P09-01 — Design tokens + componentes base

Archivos guía: `shared/styles/theme.css`, `index.css`, `shared/ui/Button.jsx`, `Card.jsx`, `Badge.jsx`, `Alert.jsx`, `Input.jsx`, `FormField.jsx`, `SearchField.jsx`, `IconButton.jsx`, `PageHeader.jsx`, `States.jsx`.

- Recalibrar tokens sin renombrar arbitrariamente clases consumidas; preservar aliases CSS usados por impresión/gráficos.
- Establecer variantes y estados: hover, focus-visible, pressed, disabled, loading, success, danger, warning y empty.
- Unificar spacing, tamaños, sombra, radio, bordes, controles de al menos área táctil adecuada (preferencia 44×44 px en móvil) y densidad para negocio.
- Reemplazar colores hard-coded recurrentes por tokens semánticos donde sea seguro.
- Verificar contrastes en estados y combinar icono/texto para mensajes críticos.

**Salida:** design system de MigaPOS adoptado por componentes compartidos; sin cambiar lógica.

### P09-02 — Shell, navegación y responsive global

Archivos guía: `layouts/AppLayout.jsx`, `BottomNav.jsx`, `components/BranchSelector*`, `components/NetworkBadge*`, `components/NotificationBell*`, Auth y pantallas de sesión.

- Sidebar con degradado Galaxy Nebula; header, selector de sucursal, avatar/rol y notificaciones integrados visualmente.
- Evitar scroll horizontal y anidación de scroll injustificada; soportar 320 px y 200 % de zoom.
- Navegación móvil fija sin tapar CTA flotantes, inputs o formularios; safe areas y teclado virtual.
- Respetar módulos accesibles por rol, global vs sucursal, y accesos bloqueados.
- Cada pantalla debe distinguir título, objetivo, acción principal, filtros y estado.

**Salida:** shell coherente desktop/tablet/móvil, navegación sin regresiones de permisos.

### P09-03 — POS y carrito: prioridad máxima (bloqueante)

Archivos guía: `modules/POS.jsx`, `modules/pos/CatalogParts.jsx`, `TicketParts.jsx`, `PaymentParts.jsx`, `modules/QRPaymentCard.jsx`, `modules/CashRegisterModals.jsx`.

**Contrato desktop imprescindible:**

1. Catálogo y carrito en dos columnas claras. El scroll del catálogo **no mueve ni estira indefinidamente** el panel del ticket.
2. El `<aside>` del carrito mantiene posición `sticky` en la columna derecha cuando el viewport lo permite. Calcular su alto útil con `100dvh`, espaciado superior e inferior reales. No depender únicamente de `max-height` en un contenedor de altura intrínseca.
3. Usar layout interno de flex/grid con `min-h-0`: cabecera `shrink-0`, **lista de productos `flex-1 overflow-y-auto`**, totales/pago en zona propia controlada y barra final `shrink-0` siempre visible.
4. Los botones «Cobrar», «Guardar sin cobrar», «Abrir caja» o «Revisar turno» no desaparecen bajo el scroll. En pantallas de baja altura, el formulario de pago puede usar su **propio scroll limitado**, pero el CTA permanece accesible.
5. El número de productos no modifica el tamaño externo del ticket. Mantener límites definidos por dominio; no codificar límites nuevos en presentación.
6. Evitar `position: fixed` que superponga el ticket a la barra de navegación o arrastre scroll de la página.

**Contrato móvil/tablet:**

- Catálogo legible con filtros; acceso al carrito visible, con contador y total, sin colisión con bottom navigation ni safe areas.
- Drawer accesible y desplazable internamente: cabecera, productos, campos, resumen y CTA diferenciados. Considerar teclado virtual, orientación horizontal y pequeños altos.
- Al cerrar y abrir Drawer se conservan líneas, método e importes introducidos; al variar sucursal/usuario se respeta el reseteo seguro existente.
- Flujo QR, confirmación, ticket nuevo y mensajes de estado probados tanto dentro como fuera del Drawer.

**Contrato funcional a preservar:** caja abierta/cerrada/vencida, global de solo lectura, stock, cambios de catálogo, precios, pagos efectivo/Yape/mixto, vuelto, validaciones, doble clic, recibos confirmados, borradores locales y confirmaciones inciertas. **Nunca** convertir «Guardado sin cobrar» en «Venta registrada» por estilismo.

### P09-04 — Sistema de modales, drawers y formularios

Archivos guía: `shared/ui/Dialog.jsx`, `shared/ui/useConfirmDialog.jsx`, `modules/CashRegisterModals.jsx`, `modules/CategoryManager.jsx`, `modules/ProductCatalog.jsx`, modales de contratos, sucursales, usuarios, administración, QR, términos y otros.

**Normas de modal profesional:**

- Radix como base; no reemplazarlo por overlays caseros.
- Overlay/portal, título y descripción accesibles, enfoque inicial útil, trap de foco, Escape cuando corresponda y retorno al disparador al cerrar.
- El panel se adapta a `dvh` real, safe areas y teclado; no se corta en 320 px ni con zoom 200 %. Un solo contenedor principal dueño del scroll; footer de acción visible (sticky al contenedor correcto o fuera de la zona desplazable).
- Formularios largos: campos legibles, errores cerca del campo, máximo ancho por tarea, acciones primarias y secundarias claramente diferenciadas; checkbox/label y mensajes `aria-*` correctos.
- Operaciones financieras `busy`: prohibido cerrar, duplicar submit o perder valores mientras la operación está en curso. Las demás ventanas sí deben poder cerrarse normalmente.
- Auditar semántica y comportamiento del `fieldset` actual con `display: contents`; no sacrificar `disabled` ni accesibilidad por CSS.
- Verificar modales anidados o encadenados (contrato → cobro, anulación, caja, QR) y retorno de foco; evitar overlays superpuestos que bloqueen la interfaz.
- No cambiar la lógica de los handlers de negocio: el alcance es composición visual, focus/scroll y estado UI local.

### P09-05 — Modernización de todas las vistas de negocio

Matriz mínima de cobertura, **no omitir ninguna ruta o rol activo**:

| Grupo | Archivos/módulos de referencia | Mejoras esperadas |
|---|---|---|
| Autenticación y acceso | `modules/Auth.jsx`, estados de sesión | Login legible, errores, recuperaciones y estados de acceso |
| POS y caja | `modules/POS.jsx`, `CashRegisterModals.jsx` | Ticket, cobro, apertura/cierre, estados seguros |
| Historial y anulaciones | `modules/SalesHistory.jsx`, `modules/sales-history/*` | Tickets, filtros, diferencias de confirmación, detalle y cancelación |
| Contratos y pedidos | `modules/contracts/**` | Tarjetas, búsqueda, detalles, formulario, pagos, cancelación, entrega e impresión visible |
| Catálogo | `ProductCatalog.jsx`, `CategoryManager.jsx` | Productos, stock, categorías, formularios y acciones |
| Agenda y clientes | `AgendaManager.jsx`, componentes de contactos | Datos, filtros, vacíos, tarjetas y acciones |
| Reportes y exportación | `Reports.jsx`, `ExportSales.jsx`, `modules/reports/*` | Métricas, filtros, periodos, tablas, exportación sin alterar resultados |
| Sucursales y personal | `BranchManager.jsx`, `UserManagement.jsx` | Permisos, listados, formularios, estados y confirmaciones |
| Ajustes/backup | `Settings.jsx`, `features/backups/components/BackupPanel.jsx` | Secciones y formularios comprensibles; no modificar el backup |
| Plataforma SaaS | `SuperAdmin.jsx`, `modules/admin/*` | Clientes, licencias, estados, permisos, administración |
| UI transversal | notificaciones, errores de consultas, carga, desconexión, componentes globales | Feedback consistente y recuperable |

En listados extensos, elegir tabla o tarjetas según ancho disponible; no ocultar datos financieros esenciales bajo hover; filtros accesibles por teclado; evitar colocar acciones destructivas junto a acciones primarias sin diferenciación.

### P09-06 — Calidad, accesibilidad, rendimiento y limpieza

- Evaluar 320, 360, 390, 768, 1024, 1280, 1440 px, además de alturas reducidas, zoom 200 % y orientación horizontal móvil.
- Estados: vacío, loading, error, sin red, sucursal global, caja cerrada, caja vencida, permisos limitados, operación pending y confirmación incierta.
- Keyboard: Tab, Shift+Tab, Enter, Space, Escape, foco visible, retorno al origen; lector de pantalla y roles/labels.
- Auditar overflow-x, contenido cortado, scroll de carrito/modal, pie oculto, contraste, botones que pierden respuesta y toast que oculta el CTA.
- Mantener impresión y PWA: `@media print`, reportes/ticket HTML, service worker, IndexedDB; no borrar datos locales.
- Revisar bundles/chunks si crecen; no agregar librerías de animación, icon packs o gráficos innecesarios; evitar cambios que aumenten lecturas Firestore.
- Remover duplicaciones solo después de comprobar que no existen consumidores; no efectuar una reescritura masiva por estética del código.
- Registrar deuda pendiente y riesgos. **Si se detectan errores funcionales ajenos al UX, no incluir correcciones financieras en esta rama.**

---

## 7. Criterios de aceptación (Definition of Done)

| ID | Evidencia esperada | Criterio de aceptación |
|---|---|---|
| AC09-01 | Tokens y pantallas comparables | La nueva marca es reconocible como azul/violeta/nebular, más rica en tonos y sin oscurecer formularios críticos. |
| AC09-02 | Prueba POS desktop con muchos productos | El ticket no crece fuera del viewport; catálogo independiente; CTA y total alcanzables sin desplazar toda la página. |
| AC09-03 | POS en viewport bajo/zoom 200 % | Formulario de pago accesible; scroll controlado y botón final no desaparece. |
| AC09-04 | POS móvil y teclado virtual | Acceso al carrito sin choques con bottom nav; Drawer conserva datos y permite cobrar/cerrar según los estados reales. |
| AC09-05 | Diálogos largos y de confirmación | Sin recortes, focus trap, Escape seguro, retorno de foco, estados busy/disabled, botón final alcanzable. |
| AC09-06 | Pantallas por rol y estado | Dueño, cajero y SuperAdmin solo ven acciones autorizadas; sin datos ajenos a tenant/sucursal. |
| AC09-07 | Estados financieros | Diferencia visual inequívoca entre cobrado, no cobrado, incierto, anulado y en conciliación; no se altera persistencia. |
| AC09-08 | Accesibilidad y responsividad | Sin scroll horizontal global, contraste WCAG AA en controles/textos críticos, foco visible, mensajes semánticos. |
| AC09-09 | Rendimiento | UI estable en equipos modestos; sin librerías/lecturas nuevas innecesarias y sin animaciones obstructivas. |
| AC09-10 | Integridad de cambios | Diff restringido a presentación, documentos y tests de UX; lint/build y tests pertinentes reportados con resultado real. |
| AC09-11 | Revisión de regresión | Venta, borrador, anulación, apertura/cierre, contrato, pagos, impresión y exportación conservan comportamiento existente. |
| AC09-12 | Aceptación comercial | No declarar «listo para vender» sin revisión visual y funcional del dueño y verificación de pendientes de producción/seguridad. |

### Pruebas técnicas mínimas (sin Git)

```powershell
npm run lint --prefix frontend
npm run build --prefix frontend
```

Inspeccionar con lectura local las rutas editadas y las protegidas; informar la lista de archivos modificados según el propio trabajo de Codex. **No ejecutar `git diff --check` ni ningún otro comando Git**; el propietario realizará por su cuenta la inspección de diferencias y la verificación de integridad antes de publicar.

Como regresión focalizada, revisar la viabilidad de las pruebas actuales (`tests/plan08.test.mjs`, `tests/plan08.browser.test.mjs`, `tests/ui-security.test.mjs` y pruebas Spark pertinentes). Si las dependencias ya existen y el entorno lo permite, ejecutar las pruebas afectadas; si requieren emuladores o navegador no disponible, **reportar el bloqueo sin fingir ejecución ni instalar software pesado automáticamente**. Nunca apuntar estas pruebas a datos productivos. No ejecutar despliegues.

### Pruebas manuales guiadas

Registrar evidencia de estado **real**, sin inventar capturas. Si existe navegador autorizado/local, verificar el aspecto de vistas representativas antes/después; de lo contrario, entregar una lista precisa para el propietario con rutas y tamaños. Probar con datos simulados/ambiente controlado y sin borrar colecciones reales.

---

## 8. Checkpoints de implementación y responsabilidad de publicación

- **Codex no crea ramas, no hace commits, no ejecuta Git ni GitHub, ni siquiera para consultas.** Trabaja únicamente sobre la copia local que el propietario le entrega.
- Checkpoint A: P09-00/01 (skill, baseline, design system + primitivas).
- Checkpoint B: P09-02/03 (shell + POS/carrito).
- Checkpoint C: P09-04 (modales y formularios).
- Checkpoint D: P09-05 (todas las vistas de negocio).
- Checkpoint E: P09-06 (QA, accesibilidad, limpieza y cierre).
- Codex puede avanzar de un checkpoint al siguiente sin pedir autorizaciones repetitivas cuando las pruebas pasan y el alcance no cambia. Detenerse solamente ante riesgo de pérdida de datos, cambio financiero o limitación bloqueante.
- **El propietario** ejecutará los comandos Git que decida y hará commits, push, PR, merge o rollback únicamente cuando lo estime adecuado.
- Después de publicar, el propietario proporciona el link o snapshot a ChatGPT para auditoría, observaciones y prompt de correcciones. Codex solo implementará esas correcciones locales en el siguiente ciclo.

## 9. Informe mínimo y eficiente que Codex debe producir

Al cerrar cada checkpoint, o al final si no hay bloqueos, entregar un **resumen breve**, sin copiar el plan, sin historiales de consola extensos ni repetir detalles ya acordados:

1. Checkpoints completados y módulos/categorías de archivos afectados (sin listar archivos no tocados).
2. Design tokens establecidos y decisiones UX importantes, especialmente POS y Dialog.
3. Resultado resumido de cada validación ejecutada (PASS/FAIL/BLOQUEADA, comando y motivo breve).
4. Archivos protegidos tocados: **ninguno**; si se detecta una alteración incidental, identificarla de inmediato para revisión del propietario sin comandos Git.
5. Hallazgos pendientes, riesgos y puntos exactos de prueba manual por el propietario.
6. AC09-01..12 resumidos por estado, sin inventar verificaciones visuales.

**No solicitar SHA, rama, remotos ni credenciales. No afirmar que creó commits, que hizo push o que inspeccionó Git.** Eso lo gestiona el propietario.

## 10. Orden final al agente

**No detenerse en una auditoría teórica:** una vez revisado el proyecto local y la skill, implementar P09-01 a P09-06 **por fases** dentro de la carpeta local ya preparada. No consultar ni alterar Git/GitHub. El trabajo que requiera una herramienta inexistente, intervención externa o un cambio prohibido se documenta como bloqueo. No sacrificar integridad de datos por estética.

**Fuente de skill:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
**Antecedente UX implementado:** `docs/PLAN-REFAC-FRONTEND-UX-MIGAPOS.md`
**Antecedente de flujos:** `docs/PLAN-08-CORRECCION-FLUJOS-MIGAPOS.md`
