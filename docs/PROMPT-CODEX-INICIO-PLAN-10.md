# PROMPT PARA CODEX — INICIO PLAN 10 MIGAPOS

Actúa como arquitecto y desarrollador React senior, especialista en UX para POS SaaS, Tailwind CSS 4, Radix UI, accesibilidad y refactorización **exclusivamente de presentación**.

## Objetivo

Implementa completamente `docs/PLAN-10-UX-OPERATIVA-POS-HISTORIAL.md` sobre el directorio local de MigaPOS ya preparado por el propietario. No estamos construyendo toda la aplicación de nuevo: este trabajo se limita a **dos módulos principales, POS e Historial de Ventas**, sus modales de caja y el sidebar compartido.

El propietario ha compartido capturas: quiere una experiencia **Galaxy Nebula** con morado profundo e índigo predominantes, degradaciones orgánicas discretas, menos pasteles y superficies de trabajo de mayor contraste; POS centrado en catálogo y carrito, Historial centrado en tickets y Excel compacto.

## Regla absoluta de gobernanza

**PROHIBIDO USAR GIT O GITHUB BAJO CUALQUIER CIRCUNSTANCIA**, incluso para consultar `status`, `diff`, rama o historial. Tampoco `gh`, API/conectores GitHub, clone, push, pull, fetch, PR, commit, merge, solicitudes de autenticación o publicación. **No ejecutar scripts de release que invocan Git internamente ni hacer deploy.** El propietario se encarga de todas esas acciones. No necesitas comprobar la rama; trabaja en los archivos locales existentes.

No instalar ninguna herramienta adicional: la skill UI/UX Pro Max ya está instalada localmente. Localízala en `.agents/skills/ui-ux-pro-max` (o su instalación Codex existente), lee sus instrucciones aplicables a React/Tailwind y úsala; si falta, informa y procede con las guías del PLAN 10, **sin descargarla**.

## Implementación obligatoria

**1. Sidebar/tema (dependencia visual):** limpia huecos y alineación de marca, notificaciones, usuario, selector y navegación; conserva `getSessionModules(user)` y el menú por roles. Recalibra los tokens y el degradado hacia morado nocturno/índigo/azul estelar; reduce pastel y contraste lavado. Respeta WCAG AA y no alteres lógica compartida.

**2. POS:** elimina solo la **tarjeta visual** de cabecera sobredimensionada en `POS.jsx`, sustituyéndola por un título/estado/acción compactos. Conserva advertencias de global/solo lectura pero en una barra breve, legible y no bloqueante visualmente; mantén el bloqueo funcional. Haz que el catálogo y el ticket ocupen prácticamente toda la altura útil de escritorio, con scroll independiente; ticket y total/CTA visibles sin desplazar la página, incluso con muchos productos y caja cerrada. No conviertas el ticket en un drawer oculto en escritorio. En móvil respeta drawer, safe areas y barra inferior.

**3. Modales de caja:** en apertura y conteo usa frases humanas muy breves. En confirmación muestra principalmente `referencia/esperado`, `contado`, `coincide/faltan/sobran` o `por revisar` con jerarquía visual y color semántico. Deja el cálculo extendido y explicación de gastos/salidas/anulaciones detrás de `Ver detalle del cuadre` cerrado inicialmente. **Si hay `hasUnverifiedDisbursements` o `expectedAmount < 0`, NO declares una falta definitiva**: explica en una línea que el cuadre es provisional. No inventes un campo ni montos de gastos si el resumen no los ofrece; indica que los gastos/salidas no registrados deben anotarse y revisarse. Conserva la nota requerida de 5 caracteres cuando hay diferencia, las validaciones, doble submit, estados busy y transacciones existentes. No cambies `calculateClose` ni `confirmClose`.

**4. Historial + Excel:** reduce cabecera y espacios vacíos, usa fondo perla-lavanda no blanco excesivo, tarjetas compactas y estados financieros diferenciados por texto/icono/color. Distribuye 3 tarjetas en escritorio si la anchura real permite legibilidad, 2 en tablet, 1 en móvil, sin cards enormes vacías. En el encabezado del Historial, reemplaza el gran bloque de `ExportSales` por una franja compacta: período y `Descargar Excel` visibles, alcance técnico en detalle expandible. El usuario no quiere checkbox rutinario ni mensajes «Spark» en el flujo habitual. Antes de eliminar `consent`, comprueba su necesidad funcional/legal; si no es obligatorio, usa el clic de descargar como acción explícita con aviso breve; si lo es, emplea confirmación puntual accesible. Nunca hagas consultas o descargas automáticas, ni alteres permisos, períodos, los reportes, su contenido, límites, errores, seguridad o la lógica del hook `useExportSales`.

## Límites técnicos

Consulta las rutas permitidas/prohibidas de PLAN 10. No tocar `frontend/src/features/**` ni Firebase/Rules/índices, Auth, permisos, persistencia, contratos financieros, reportes contables, hooks de negocio, paquetes, skills o workflows. Conserva `onClick`, `disabled`, `busy`, validaciones y estados financieros intactos. No uses frases como «listo para producción» sin pruebas reales.

No resuelvas el problema pendiente del runner CI (`backups.browser.test.mjs` no consigue DevTools) dentro de esta refactorización: es un asunto independiente y no autoriza relajar pruebas.

## Verificación / pruebas / evidencia

- Lee la documentación PLAN 10 y realiza baseline local, sin repetir auditorías ajenas al alcance.
- Implementa por fases **P10-00 a P10-05**, haciendo cambios reales en código (no te quedes en análisis ni propuestas).
- Ejecuta lint/build/PWA y tests Node/Chromium adecuados si ya están disponibles. No ejecutes scripts npm que invoquen Git o recursos externos. No alterar tests para ocultar fallos; añade cobertura de layout, accesibilidad y estados de caja, POS e Historial.
- Verifica 320/390/768/1024/1280/1440 px; alturas bajas y zoom 200%; lectura global, caja cerrada, ticket largo, modales, historial y exportación. Guarda capturas locales **antes/después** en `.release/p10-visual/`, sin incluir datos reales.
- Registra un informe final breve en `docs/PLAN-10-RESULTADOS.md`. No generes logs gigantes ni expliques cada cambio línea a línea. Máximo ~15 líneas de resumen final, más hallazgos puntuales verificables.

## Resultado esperado

Un MigaPOS visualmente más profesional, centrado en la tarea, con sidebar Galaxy Nebula bien espaciado, POS casi a pantalla completa, caja explicada sin sobrecarga y Historial donde las ventas aparecen pronto y el Excel no ocupa media pantalla. **No se permite ninguna regresión financiera, de permisos o de persistencia.**

Comienza ahora la implementación local del PLAN 10. **No uses Git/GitHub ni despliegues.**
