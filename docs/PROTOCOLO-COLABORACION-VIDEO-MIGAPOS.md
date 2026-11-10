# MigaPOS — Protocolo de producción y revisión del video promocional

**Versión:** 1.0 — 2026-11-10  
**Workspace local:** `C:\Proyectos\MigaPOS`  
**Rama fuente:** `fix/migapos-production-readiness`  
**Rama de marketing propuesta:** `marketing/video-promo-migapos`  
**Fuente de verdad para Codex:** árbol local; GitHub es un punto de revisión publicado por el propietario.

## 1. Estado comprobado en la revisión

- El 10/11/2026 GitHub mostraba el HEAD de `fix/migapos-production-readiness` en `5dfe31102ac77b0a235e175145d6f439595f2d23`, un commit por delante de `1b5bea4`.
- El commit `5dfe311` contiene `docs/GO-NO-GO-P15-PRODUCCION.md`, el plan promocional y los cinco documentos de Codex en `marketing/video-migapos/docs/`.
- **No se ha verificado el HEAD ni el estado Git actual del ordenador:** Codex debe comprobarlo directamente.
- Documentos revisados: `FEATURE_EVIDENCE.md`, `STORYBOARD.md`, `VOICEOVER.md`, `ASSETS-LICENSES.md`, `PROGRESS.md`.
- Hito B documental aceptable para prototipo; **no hay capturas finales ni prueba visual ni render**.

## 2. Evaluación técnica del trabajo existente

**Aprobado como base:** siete escenas, 900 frames a 30 fps (30 s), cuatro beneficios extraídos del código real: preparación del ticket, existencias por sede, reportes por período y comparación de caja. Se utiliza la paleta del tema del frontend y un fixture de navegador aislado como candidato a capturas. 

**Pendiente de comprobar:** que el fixture produzca imágenes legibles y que cualquier dato usado sea sintético; legibilidad en 9:16 y zonas seguras de TikTok/Facebook; capturas del ticket, stock, reportes y resumen de caja; logo y CTA; derechos de voz/música. 

**Cuidado semántico:** `CashCountSummary` puede indicar «Por revisar» y una conciliación pendiente. No insinuar un cierre automático, conciliación certificada ni saldos garantizados. La presencia de componentes no sustituye la prueba funcional. Mantener en el video el rótulo «Datos de demostración» y «Recreación» cuando corresponda.

## 3. Git local: sí se permite; operaciones remotas: no

Codex puede utilizar `git status`, `git branch`, `git log`, `git diff`, `git rev-parse` y `git switch -c` **solo de forma local**. Estos comandos no necesitan autenticación de GitHub. 

Codex **no ejecutará** `git push`, `git pull`, `git fetch`, `git ls-remote`, `git clone`, `git merge`, `git rebase`, `git reset`, `git clean`, `git stash`, ningún comando `gh`, ni operaciones mediante GitHub API. Tampoco creará commits por defecto: **el propietario hace `git add`, `git commit` y `git push`** al aprobar cada entrega. Evitar cambios en archivos ya existentes fuera de `marketing/video-migapos/`, salvo la corrección explícita y limitada del plan/documentación y `.gitignore` si hace falta para impedir binarios.

Procedimiento local de rama:

```powershell
Set-Location 'C:\Proyectos\MigaPOS'
git branch --show-current
git rev-parse --short HEAD
git status --short
git branch --list 'marketing/video-promo-migapos'
```

Si la rama es `fix/migapos-production-readiness`, el estado está limpio **o solo tiene archivos nuevos conocidos, sin colisión**, y la rama de marketing no existe, ejecutar:

```powershell
git switch -c marketing/video-promo-migapos
```

Los **archivos no rastreados no son, por sí solos, impedimento** para `git switch -c`; se conservan. Solo detenerse si hay modificaciones rastreadas inesperadas, conflictos potenciales, rama distinta o riesgo de sobrescribir archivos. Si la rama de marketing ya existe, inspeccionar y continuar sin `-c` ni forzar. Nunca borrar `GO-NO-GO-P15-PRODUCCION.md`.

El anterior plan v2.0 bloqueaba por cualquier archivo ajeno sin seguimiento: **esta sección reemplaza específicamente esa regla rígida**. Tras la creación segura de la rama, Codex debe actualizar el plan local con esta decisión.

## 4. Roles y canal compartido

| Participante | Responsabilidad | Intercambio |
|---|---|---|
| **Codex** | Implementar Remotion, crear escenas, documentar avances, ejecutar pruebas locales seguras y generar previews | `marketing/video-migapos/docs/PROGRESS.md`, `REVIEW_PACKET.md` y artefactos locales |
| **Propietario** | Aprobar estética y mensajes, guardar versiones, efectuar `git add/commit/push` manualmente, compartir previews | Comparte el hash del commit y sube capturas o MP4 aquí cuando quiera revisión visual |
| **ChatGPT** | Revisar código publicado mediante conexión GitHub, examinar previews adjuntos, detectar problemas y redactar correcciones para Codex | Informe de revisión y nuevo prompt en esta conversación |

No existe comunicación automática en tiempo real entre ChatGPT y el ordenador del usuario. Hasta que el propietario suba un commit o adjunte archivos, ChatGPT **no puede ver los cambios locales**. No dar por revisado lo no compartido.

### Paquete mínimo de revisión por hito

Codex generará `marketing/video-migapos/docs/REVIEW_PACKET.md` de **máximo 40 líneas** con:

1. Hito, rama y HEAD **local**; estado `git status --short`.
2. Archivos nuevos/modificados y descripción breve.
3. Beneficios/claims mostrados y tipo de evidencia (captura aislada, recreación, pendiente).
4. Resultado de comandos de verificación (comando, aprobado/falló, sin logs enormes).
5. Rutas locales de **cinco PNG de revisión** para frames 36, 315, 465, 615 y 870, o explicación si faltan.
6. Problemas, decisiones pendientes y **una sola recomendación concreta** de siguiente paso.

El propietario realiza commit y push exclusivamente a la rama `marketing/video-promo-migapos` cuando quiera revisión de código. Después comparte aquí el SHA o enlace. Los MP4 finales, directorios de dependencias, caches y material sensible no se suben a GitHub; las previews pueden adjuntarse directamente en este chat.

### Hitos de aprobación

- **Revisión 1 — Dirección creativa:** storyboard/voz/claims. Ya existe el material; se revisan ajustes puntuales, no se rehace desde cero.
- **Revisión 2 — Preview:** cinco imágenes de frame 36 (hook/ticket), 315 (inventario), 465 (reportes), 615 (caja), 870 (CTA) + composición Remotion. Propietario valida visualmente, ChatGPT audita legibilidad y contenido publicado.
- **Revisión 3 — Máster:** después de aprobación y espacio suficiente, una prueba a resolución reducida y luego un MP4 definitivo 1080x1920. El propietario aprueba el lanzamiento.

## 5. Disco, instalación y capturas

El último reporte local dio **1.81 GiB libres en C:**. Este espacio es insuficiente como margen fiable para instalar paquetes, descargar un navegador de render y producir previews y MP4. Codex debe comprobar todos los volúmenes disponibles y tamaño/cache existentes; **no instalar ni renderizar a ciegas**. Como objetivo operativo prudente, preferir **5 GiB o más libres** en el volumen donde estarán dependencias/temporales, idealmente 8–10 GiB para trabajar con holgura; no es un requisito oficial de Remotion ni una garantía de consumo.

Si C: no tiene espacio: buscar otro volumen ya disponible con margen; proponer qué carpetas temporales y outputs podrían ubicarse allí sin mover el código productivo; **no borrar** datos del usuario ni instalar software de optimización. Mientras tanto, avanzar con código fuente, composición, storyboard y definición de capturas usando herramientas ya disponibles. No disparar `npm install` si la ubicación de paquetes y cache no está resuelta. Remotion debe estar en un proyecto independiente bajo `marketing/video-migapos/`.

Para las capturas, priorizar `tests/plan09.fixture.jsx` y `tests/helpers/browserHarness.mjs`, verificando de forma explícita que el harness bloquea conexiones a producción antes de ejecutar. Nunca iniciar una venta real ni usar clientes reales. Si la ruta de captura segura no está comprobada, crear una recreación fiel marcada como tal.

## 6. Skills y licencia

Skill oficial: https://github.com/remotion-dev/skills. La documentación vigente admite `npx skills add remotion-dev/skills` sin utilizar GitHub CLI. Si hay plugin/skill Remotion instalado, reutilizarlo; si no, hacerlo **solo** cuando haya espacio y se necesite, una vez. No ejecutar `gh auth`, ni usar credenciales GitHub, ni instalar varias alternativas para el mismo propósito.

Remotion permite uso comercial bajo su licencia gratuita a individuos y equipos de hasta tres personas bajo sus condiciones; para organizaciones que no cumplen esa elegibilidad es necesaria la licencia correspondiente. Verificar condiciones antes de publicar: https://www.remotion.dev/docs/license/pricing.

## 7. Comportamiento esperado de Codex

- Responder en español, máximo 12 líneas al finalizar cada hito, evitando textos redundantes.
- Actualizar `PROGRESS.md` y `REVIEW_PACKET.md` sin reanalizar el repositorio completo.
- No inventar resultados de ejecución, afirmaciones comerciales ni permisos/licencias.
- No declarar terminado el video hasta haber revisado preview visual y MP4 final.
- Continuar la producción segura aun si una tarea concreta (por ejemplo, instalación por disco insuficiente) queda bloqueada.
