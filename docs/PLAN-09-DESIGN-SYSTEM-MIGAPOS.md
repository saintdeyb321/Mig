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
assets o snippets de la skill al producto. Su README declara CC-BY-NC-4.0 y su
package.json MIT: esa discrepancia debe revisarse antes de distribuir su paquete.

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
