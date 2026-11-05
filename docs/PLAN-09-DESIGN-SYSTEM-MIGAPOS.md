# MigaPOS · Galaxy Nebula

Contrato de presentación del Plan 09. La fuente efectiva de tokens es
`frontend/src/shared/styles/theme.css`; este documento no añade un tema ejecutable.

## Identidad y componentes

- Cosmos `#18163D`, índigo `#2B246B`, primario `#5545C6`, acento `#784CE3`,
  azul `#3769D0`, lila `#8D58D8`, cian decorativo `#5FB7D7`.
- Lienzo `#F6F5FF`, panel blanco, tinta `#1B1B38`, secundario `#555F7D`.
  Bordes de campo `#8187A3`; separadores `#DDE0F4`. Estados semánticos conservados.
- Gradientes limitados a marca, cabeceras y CTA primario. Importes, tablas y
  formularios usan superficies tranquilas. Logo y Lucide conservados.
- Inter con fallback del sistema, sin descargas de fuentes. Controles de texto
  de 16 px, importes tabulares, escala de espacios 4/8 px, radios 12–20 px,
  sombra suave y foco de 2 px. Botones táctiles habituales de 44 px.
- Hover/pressed sin desplazar el layout; transiciones de 150–180 ms y respeto
  de `prefers-reduced-motion`. Estados acompañados de texto, no solo color.

## Composición y responsive

- Shell: navegación lateral desde 1024 px, navegación inferior móvil y acceso
  al ticket con separación de safe areas. Selección y permisos originales.
- Ticket: altura explícita respecto al viewport; lista con scroll propio;
  total y CTA fuera del scroll; pago con scroll limitado en pantallas bajas.
- Drawer: conserva los valores del estado POS y sigue el viewport visible.
  Un listener visual compartido evita duplicación con diálogos anidados.
- Diálogos Radix: cabecera fija, cuerpo desplazable, footer sticky o fuera del
  scroll en formularios especializados. `fieldset` flex real conserva disabled.
  Foco útil, retorno al disparador y cierre bloqueado mientras están ocupados.
- Filtros en barras comunes; estados de los filtros con `aria-pressed`;
  tarjetas y textos largos adaptables. No se ocultan importes por hover.

## Procedencia de la skill

UI/UX Pro Max 2.15.0 se instaló mediante el CLI oficial empaquetado en npm,
con `init --ai codex --offline`, sin Git, API de GitHub ni instalación global.
Esta versión no soporta `--dry-run`: se previsualizó en `.release/p09-skill/preview`.
Instalación local: `.agents/skills/ui-ux-pro-max/`; archivos de desarrollo ajenos
al runtime. El propietario decide su versionado; no se modificó `.gitignore`.
El registro automático de la nueva skill puede requerir reiniciar Codex; su
SKILL.md se leyó directamente y sus búsquedas Python se ejecutaron en esta sesión.

La búsqueda de sistema para retail sugirió una dirección genérica de tienda,
no adecuada a la identidad pedida. Se usaron las pautas verificadas de foco,
contraste, formularios y React, y la paleta Galaxy del Plan 09. No se copiaron
assets o snippets de la skill al producto.

Licencias y procedencia diferenciadas: la auditoría independiente del 2026-11-04
documenta MIT para el repositorio upstream UI/UX Pro Max (LICENSE y README).
Eso no equivale a atribuir otros términos al upstream. El artefacto npm
`ui-ux-pro-max-cli@2.15.0` conservado localmente en `.release/p09-skill/package/`
contiene un README que declara CC-BY-NC-4.0 y un package.json que declara MIT.
Es una inconsistencia de ese material empaquetado, no una comprobación de cambio
de licencia upstream. No se volvió a consultar GitHub en P09-07.
Las siete skills locales son herramientas de desarrollo; no se borraron ni se
alteraron. El propietario decide su versionado y revisa los términos precisos de
cada material antes de distribuirlo.

## Cobertura y validación

Checkpoints A–E implementados y verificados localmente. Aceptación visual y
funcional del propietario pendiente; este resultado no autoriza comercialización.
Baseline: lint, build/PWA y 15 pruebas de Plan 08 aprobados antes de los cambios.

Validación final:

- PASS: lint y build/PWA. CSS de 69.85 a 66.84 kB; precache de
  2860.56 a 2862.44 KiB. Sin dependencias nuevas del producto. Avisos de chunks
  grandes preexistentes conservados.
- PASS: 46 pruebas Node de Plan 08, seguridad de UI y contraste del Plan 09.
  Pares críticos: tinta/lienzo 15.41:1; secundario/panel 6.33:1;
  blanco/primario 6.88:1; blanco/acento 5.33:1. Estados semánticos superiores a
  4.5:1 y bordes de control superiores a 3:1 en los fondos comprobados.
- PASS: Chromium Plan 09, 122 comprobaciones: 13 vistas reales a 7 anchos,
  ticket de 8 líneas, desktop bajo, Drawer horizontal, campo de pago enfocado
  con viewport reducido, reflujo equivalente de 640 px, formulario largo real,
  foco/retorno, Tab, anidados, doble confirmación, busy, error, vacío y roles.
- PASS: 3 escenarios Chromium de regresión (Plan 08 y céntimos de caja),
  71 comprobaciones. No hay operaciones financieras reales en esas pruebas.
- PASS: comparación local de hashes y revisión de espacios/conflictos.
  Archivos protegidos sin cambios. No se ejecutaron comandos Git/GitHub.
- BLOQUEADAS/NO EJECUTADAS: integración de Rules (sin emulador), dispositivos
  físicos, lector de pantalla real y aceptación comercial. No se instaló Java.

Capturas sintéticas revisadas: `.release/plan09-visual/` (POS desktop/móvil,
viewport reducido y foco, contratos, formulario y plataforma). Se capturaron
tras finalizar las animaciones; no representan datos de Firebase real.

Se corrigieron dos recortes medidos en QA: CTA del Drawer con 390 px de alto y
footer del formulario de contratos por altura intrínseca del fieldset nativo.
El formulario largo usa altura explícita y fieldset al 100 %. El pago del POS
tiene márgenes de foco propios, para que el importe no quede recortado.

| Grupo | Roles representados | Anchos de QA aislada | Estados a cubrir |
|---|---|---|---|
| POS y caja | Dueño, cajero | 320–1440 px, altura baja | 8 líneas, efectivo, Drawer, valores conservados |
| Historial | Dueño, cajero | 320–1440 px | confirmado, borrador, incierto, anulado, rechazado |
| Contratos, catálogo, categorías, agenda | Dueño | 320–1440 px | listas simuladas, formulario largo |
| Reportes y exportación | Dueño | 320–1440 px | métricas y consentimiento original |
| Personal, sedes, ajustes | Dueño | 320–1440 px | listados y controles originales |
| SaaS y exportador | SuperAdmin | 320–1440 px | sin módulos operativos en navegación |
| Login y componentes comunes | Anónimo, negocio | 320–1440 px | foco, anidados, busy, error, movimiento reducido |

Los datos de QA son sintéticos y las fronteras de repositorios están simuladas.
Ninguna captura aislada acredita aceptación comercial, autorización de Rules,
lector de pantalla real o comportamiento del teclado de un dispositivo físico.

AC09-01/02/03/05/07/08/09/10: comprobados dentro del alcance aislado descrito.
AC09-04/06/11: evidencia aislada aprobada; falta aceptación funcional en equipos
del propietario. AC09-12: pendiente de autorización y revisión comercial.

## Hallazgos previos fuera del alcance visual

- `ContractDetailsModal.jsx` conserva un abono con `min="0.1"` y `step="0.50"`.
  Puede restringir importes en céntimos frente al resto de formularios. Se deja
  sin corregir: requiere una tarea funcional con prueba específica de pagos.
- Bloqueo de minimatch conocido y chunks grandes preexistentes: sin actualización
  de dependencias ni cambios de infraestructura en este plan.
- Pruebas de Rules, teclado móvil físico, zoom real 200 %, lector de pantalla,
  impresión/exportaciones reales y aceptación del propietario siguen pendientes.

## Corrección P09-07 · 2026-11-04

- Agenda y Sucursales: títulos legibles de alta/edición e iconos como nodos JSX,
  conservando handlers, campos, busy, cierre y foco. El análisis de strings de
  todo `frontend/src` encontró únicamente los dos casos confirmados.
- SuperAdmin: etiqueta original `Nuevo Cliente` restaurada. La prueba Spark
  original de arranque y alta volvió a aprobar sus 10 comprobaciones sin cambiar
  sus aserciones ni invocar Firebase real.
- Detalle/anulación de contratos: identificadores largos desbordaban a 320 px.
  Se ajustaron solo clases de ancho y salto de línea. El abono `step="0.50"`
  queda intacto para una corrección financiera independiente.
- La captura inicial del POS mostró el CTA debajo del viewport antes de hacer
  scroll. El layout desktop ahora descuenta cabecera, avisos del shell y padding;
  el catálogo tiene scroll propio. Solo CSS/clases, sin cambios a `usePOS`.
- Revisión de caja, catálogo, sucursal, personal, administración, QR/fotografía y
  confirmaciones con componentes reales y datos sintéticos. Personal se midió
  expresamente: su pie cabe; no se aplicó una corrección funcional especulativa.
- Regresiones nuevas: cadenas JSX accidentales, títulos de alta/edición,
  apertura de Nuevo Cliente, foco/retorno, desbordamiento de modales y CTA inicial
  y offline. Se mantienen las aserciones anteriores.
- Se reconocen por nombre exacto los dos documentos de auditoría/corrección
  entregados por el propietario en la lista de Markdown permitida; continúa
  rechazándose documentación inesperada.

Validación local P09-07:

- PASS: lint frontend y build/PWA.
- PASS: cotejo local de hashes y comprobación de espacios/conflictos sin Git;
  sin cambios en dominio, repositorios, persistencia ni configuración protegida.
- PASS: 27 pruebas Node (`plan09.test.mjs` y `ui-security.test.mjs`).
- PASS: 199 comprobaciones UX en Chromium aislado. Se conservaron las
  aserciones anteriores y se verificaron layouts de 320 a 1440 px.
- Capturas finales: 88 PNG en `.release/p0907-visual/`, con POS, contratos,
  administración, caja, formularios y modales en escritorio y móvil. Son
  componentes reales con datos sintéticos; no certifican operaciones financieras
  end-to-end ni sustituyen la revisión manual en dispositivos físicos.
- PASS: 76 pruebas de las entradas Spark locales, incluida la prueba original
  de SuperAdmin. Se ejecutaron directamente con Node, no con el script npm
  completo, por la prohibición de ejecutar release.
- NO EJECUTADA: `generates production-only Spark resources and refuses additional
  resources, endpoints and altered guards`, de `tests/backups.test.mjs`, porque
  inicia `scripts/release.mjs guard`. Se excluyó solo de esta ejecución local;
  su código y todas sus aserciones se conservan para CI bajo control del dueño.
- NO EJECUTADAS: Rules, al no haber emulador activo en `127.0.0.1:8080`.
  No se instaló Java ni se intentó acceder a Firebase real.
- CI remoto pendiente de comprobación por el propietario. Los tests P09 todavía
  no están integrados en el workflow; esa deuda requiere autorización aparte.
  No se modificaron workflows, scripts de release, dependencias ni skills.
