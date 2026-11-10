# PLAN — VIDEO PROMOCIONAL MigaPOS | Codex + Remotion (LOCAL)

**Versión:** 2.0 · **Fecha:** 2026-11-10 · **Estado:** listo para ejecutar localmente en Codex; video aún no producido.

## 0. Decisión principal: la carpeta local es la fuente de verdad

- **Directorio de trabajo de Codex (Windows):** `C:\Proyectos\MigaPOS`.
- **Rama base esperada:** `fix/migapos-production-readiness`.
- **Commit remoto verificado de esa rama:** `1b5bea45c07e8879962a572b1012d5f0abf46e13` (`1b5bea4`, «Plan 15»).
- **Rama nueva exclusiva del anuncio:** `marketing/video-promo-migapos`.
- **Repositorio remoto:** https://github.com/saintdeyb321/Mig.git — **solo referencia histórica; NO clonar ni usar `main` para trabajar**.
- **Estado local:** puede contener commits o cambios aún no publicados; Codex debe inspeccionarlo directamente y **preservarlo**, incluso cuando no coincida con el remoto.
- **Ningún cambio realizado por este plan se ha aplicado al disco del usuario:** este MD es una guía que hay que colocar en `C:\Proyectos\MigaPOS\docs\PLAN-VIDEO-PROMOCIONAL-MIGAPOS-CODEX.md`.

### Comprobación inicial, sin red ni modificaciones

Desde `C:\Proyectos\MigaPOS` (terminal de Codex / PowerShell):

```powershell
Get-Location
git branch --show-current
git rev-parse --short HEAD
git status --short
git log -1 --oneline
node --version
npm --version
(Get-PSDrive C).Free / 1GB
```

**Decisión de rama segura:**
1. Si la rama activa es `fix/migapos-production-readiness` y `git status --short` está vacío o solo muestra archivos nuevos conocidos sin colisión, ejecutar `git switch -c marketing/video-promo-migapos` desde el HEAD local actual. Conservar los archivos preexistentes, incluido `docs/GO-NO-GO-P15-PRODUCCION.md`. Si la rama de marketing ya existe, inspeccionarla antes de reutilizarla. Se aplica el [protocolo de colaboración](PROTOCOLO-COLABORACION-VIDEO-MIGAPOS.md).
2. Si ya está en `marketing/video-promo-migapos`, continuar ahí tras revisar estado y archivos. No intentar crearla de nuevo.
3. Si hay modificaciones rastreadas inesperadas, posibles colisiones o una rama activa distinta de las dos anteriores, conservar los archivos y documentar el bloqueo antes de cambiar de rama. Quedan prohibidos `git stash`, `git reset`, `git clean`, `git checkout -f`, `git pull`, `git rebase`, `git merge` y `git push`.
4. Si `HEAD` no es exactamente `1b5bea4`, registrar la diferencia, pero **nunca reemplazar la versión local con la remota**. La versión local correcta prevalece si estamos en la rama base esperada; solo informar las diferencias.
5. No consultar `main` ni descargar árboles de GitHub. No hacer `fetch` sin una razón concreta y autorización.

> Importante: la carpeta del usuario **no es accesible desde este chat de ChatGPT**; sí lo será para Codex si abre `C:\Proyectos\MigaPOS` como workspace. No presupongas que GitHub contiene todo lo implementado.

## 1. Objetivo comercial y entregables

Crear un **anuncio real y profesional de 30 segundos** para TikTok, Facebook Reels e Instagram Reels. Que un dueño de tienda, minimarket o negocio identifique el beneficio de MigaPOS en los primeros 3 segundos y quiera conocerlo.

- MP4 final, formato **9:16, 1080×1920, 30 fps, ~30 s**, codificación H.264; audio AAC si existe voz/música licenciada.
- Composición Remotion **editable**, reusable para futuros anuncios y con datos/textos configurables.
- Guion, storyboard cronometrado, lista de afirmaciones comerciales verificadas, registro de assets/licencias, informe de QA.
- Guion de voz y subtítulos en español; voz sintetizada solo si hay herramienta local o servicio consentido disponible, nunca exigir pago o API key.
- Copy para TikTok y Facebook y CTA genérica **«Solicita una demostración»** (sin inventar WhatsApp, dominios ni precios).
- **Versión 15 s opcional**, después de aprobar la primera y solo si recursos disponibles.

**No prometer** “100 % offline”, “sin límites”, “facturación SUNAT”, integración con pagos, resultados numéricos, funcionalidades multiplataforma o ventas automáticas sin evidencia real en el código **y** prueba funcional local.

## 2. Herramienta elegida — skill oficial de Remotion

- **Skill:** https://github.com/remotion-dev/skills
- **Guía oficial de instalación:** https://www.remotion.dev/docs/ai/skills
- **Creación y render:** https://www.remotion.dev/docs/ai/coding-agents
- **Por qué:** MigaPOS está construido con React; Remotion permite construir un comercial con secuencias, zooms, transiciones, tipografía, composiciones, audio y render reproducible. No sustituye la verificación de pantallas de MigaPOS.
- **Skills útiles:** `remotion-best-practices` (base), `remotion-create` (proyecto), `remotion-markup` (animación/layout), `remotion-render` (última etapa). Leer **solo** las instrucciones necesarias para la fase activa.

**Instalar una sola vez, no duplicar:** verificar si ya hay skills Remotion locales, CLI y proyecto creado. Si no existen, elegir **un** procedimiento oficial vigente: `npx skills add remotion-dev/skills` o crear proyecto Remotion aislado y ejecutar `npx remotion skills add` desde él. No ejecutar los dos. Confirmar origen, permisos y espacio libre antes de instalar; evitar la instalación global si basta la local. Nunca incorporar Remotion al `frontend/package.json` de producción.

**Ubicación propuesta para el video:** `C:\Proyectos\MigaPOS\marketing\video-migapos\` con su **propio** `package.json`, dependencias, `src/`, `public/assets/`, `docs/` y `out/`. Los archivos de trabajo del video se mantienen separados de `frontend`, `functions`, `firestore.rules` y Firebase Hosting. Para scaffold, ejecutar la herramienta oficial desde `marketing/` para que cree `video-migapos/` sin anidar carpetas incorrectamente. Si el espacio disponible es insuficiente, **no instalar ni renderizar**: generar primero guion, lista de assets y plan de captura, indicando el bloqueo exacto.

**Skills y marca que ya podrían estar en el repo local** (comprobar existencia antes de abrirlas): `.agents/skills/brand/`, `.agents/skills/design-system/`, `.agents/skills/ui-ux-pro-max/`, `frontend/src/config/brand.js`, `docs/PLAN-09-REFAC-UX-GALAXIA-MIGAPOS.md`. Su existencia en GitHub no garantiza que el workspace actual sea idéntico; no ejecutar sus scripts innecesariamente.

## 3. No afectar datos reales ni el POS

- **Prohibidos:** llamadas a Firestore productivo, autenticarse con cuentas reales para pruebas, ejecutar ventas, borrados o pagos de prueba contra servicios reales, alterar reglas, índices, Cloud Functions, licencias o desplegar.
- Capturas **solamente** de la instancia local con **datos demostrativos aislados**; usar mocks/fixtures o emuladores **si ya están disponibles y su aislamiento se ha verificado**. Si no se puede garantizar que la app no escribirá en Firebase real, **NO abrir flujos de venta**: usar screenshots aportados por el usuario o recreaciones visuales basadas en la UI, documentándolas como recreaciones.
- Nunca exportar teléfonos, nombres reales, documentos, IDs, claves, archivos `.env`, tokens, datos de clientes ni material administrativo.
- No modificar la UI productiva por razones estéticas del anuncio. El anuncio puede incluir **marcos, fondos y animaciones que envuelven capturas**, pero no debe falsificar funciones.
- Audio/imagen/fuentes: usar recursos originales, provistos o con **licencia comercial acreditada**. Evitar usar audio comercial de TikTok dentro de un MP4 sin derechos; si no hay licencia, video provisional silencioso y subtítulos.
- **No** instalar generadores de video adicionales, modelos enormes, dependencias de IA para voz o servicios de pago en esta primera iteración.
- No commits de binarios MP4, cachés, capturas sensibles ni `node_modules`; incluir exclusiones específicas en `.gitignore` si falta. Sin `push`, `merge` ni `deploy` automáticos.

## 4. Auditoría focalizada: solo el código local actual

Orden de comprobación para Codex (no leer todos los archivos completos):

1. Estado Git y espacio en disco de la sección 0.
2. Revisar `package.json`, `frontend/package.json`, `frontend/src/config/brand.js`, assets/logo y los planes de identidad de marca locales. Usar `rg -n` o búsqueda equivalente de **secciones concretas**, evitar volcados de logs y archivos de miles de líneas.
3. Inspeccionar únicamente los módulos que sirvan para 4–5 demos: POS, catálogo/inventario, historial de ventas, reportes y, opcionalmente, caja/sucursales/clientes. **Localizar rutas reales** antes de asumir que archivos existentes en el remoto siguen existiendo igual.
4. Para cada claim: comprobar componente existente, estado funcional razonable, permiso de pantalla y **posibilidad segura de mostrarlo** con datos ficticios. Si falta prueba, marcar pendiente o descartado.
5. Registrar 4–6 beneficios máximo en `marketing/video-migapos/docs/FEATURE_EVIDENCE.md` (beneficio, rutas código, prueba visual, restricción/estado). Si aún no puede crearse el proyecto, usar `marketing/video-migapos-preproduction/` temporal sin instalar paquetes.
6. Reutilizar assets de marca. No descargar recursos externos salvo que realmente hagan falta, y anotar licencias.

## 5. Concepto creativo y storyboard preliminar (30 s)

**Estética:** universo premium / galaxia, predominio del morado oscuro y azul noche con gradientes violeta-azulados y brillo contenido; **extraer colores reales de marca** si los hay. Composiciones basadas en pantallas verificadas, no dashboards genéricos inventados. Texto con contraste fuerte, movimiento fluido, foco visual, safe areas de Reels/TikTok, animaciones que funcionen incluso sin sonido.

| Tiempo | Visual | Texto en pantalla | Narración opcional |
|---|---|---|---|
| 0–3 s | Hook visual con interfaz MigaPOS y transición breve | «¿Tu negocio necesita más control?» | Pregunta/hook |
| 3–8 s | POS local/demo, acercamiento al carrito con datos ficticios | «Vende de forma organizada» | Beneficio verificable |
| 8–13 s | Catálogo e inventario solo si confirmados en la versión actual | «Organiza tus productos» | Beneficio concreto |
| 13–18 s | Historial/reportes visuales verificados | «Consulta tus operaciones» | Beneficio concreto |
| 18–23 s | Caja o sucursales: escoger **una** funcionalidad validada | «Control para cada jornada» | Beneficio real |
| 23–27 s | Montaje dinámico de 2–3 pantallas reales | «Conoce MigaPOS» | Frase breve de marca |
| 27–30 s | Logo, fondo nebular y CTA | «Solicita una demostración» | CTA claro |

**Storyboard sujeto a auditoría.** No incluir una pantalla simplemente porque exista un nombre de componente. Reemplazar claims no demostrables por mensajes neutrales. 6 palabras aproximadamente por titular, subtítulos grandes, un foco visual por escena; primera escena debe captar atención y enseñar algo del software antes de una intro lenta.

### Reglas técnicas audiovisuales

- `width=1080`, `height=1920`, `fps=30`, `durationInFrames=900` (30 segundos exactos).
- Componentes por escena; configuración/timeline/claims separadas de la vista; sin replicar lógica de negocio del POS.
- Mantener acciones y textos importantes fuera de las zonas típicamente cubiertas por controles de TikTok/Reels, verificando preview en móvil.
- Transiciones suaves, zoom moderado a UI, recortes legibles, motion accesible; evitar flashes o textos minúsculos.
- Verificar comienzo, mitad, fin, bordes/crops, subtítulos, logo y CTA mediante **tres capturas fijas** antes del render de calidad alta.
- Validar música, voz, niveles de audio, créditos/licencias. Si falla audio, generar versión silenciosa con texto legible antes que usar material sin derechos.

## 6. Ejecución por hitos: comenzar con resultados útiles

### Hito A — Seguridad + preparación (primer prompt)

**Acciones:** comprobar Git y aplicar la decisión de rama segura de la sección 0. Verificar Node, npm y espacio, detectar recursos y skills locales, y registrar el resultado.

**Hecho cuando:** base local documentada y rama segura definida; entorno viable o bloqueo explicable.

### Hito B — Preproducción (mismo primer prompt)

**Acciones:** auditar máximo 5 flujos relevantes con lecturas selectivas; preparar `FEATURE_EVIDENCE.md`, `STORYBOARD.md`, `VOICEOVER.md`, `ASSETS-LICENSES.md`, `PROGRESS.md` concisos. Seleccionar textos permitidos, escena inicial y assets existentes. **No** hacer render final.

**Hecho cuando:** storyboard de 900 frames, claims fundamentados, necesidades de captura claras y preproducción lista.

### Hito C — Primer prototipo Remotion (al final del primer prompt solo si hay margen/entorno apto; si no, siguiente prompt)

**Acciones:** crear proyecto Remotion separado si no existe, instalar una sola vez las skills y paquetes indispensables **tras verificar disco**, diseñar introducción y escena de producto con capturas seguras/recreación marcada. Montar una composición de 30 s aunque haya escenas provisionales identificadas. Iniciar Studio si el entorno lo permite y preparar **3 stills**. No usar render de 30 s 1080p todavía.

**Hecho cuando:** proyecto con preview reproducible, sin cambios en `frontend` ni backend, y capturas de referencia para aprobar.

### Hito D — Producción completa + QA

**Acciones:** completar escenas, subtítulos y audio autorizado; hacer una prueba corta o a baja resolución; corregir cortes/overflow/capturas sensibles; **un único render definitivo** 1080×1920 30 fps tras pasar verificaciones. Registrar comandos y tiempo de CPU/disco medidos, no estimados.

**Hecho cuando:** MP4 comprobado y reproducible, con evidencia de QA; si falla, describir causa y recuperación sin afirmar éxito.

### Hito E — Publicación lista (sin publicar automáticamente)

**Acciones:** copy para TikTok y Facebook, hashtags prudentes, miniatura, instrucciones de reutilización, archivo final en `marketing/video-migapos/out/migapos-promo-30s.mp4`, `README.md`, lista de licencias y estado. Opcional 15 s si tiene sentido.

**Hecho cuando:** video y fuentes editables listos, sin datos reales ni despliegues.

## 7. Política estricta de tokens, disco y reanudación

- No investigar GitHub de nuevo: **siempre usar archivos locales**. Una sola inspección de los 4–5 módulos que entrarán en el anuncio; no intentar comprender toda la arquitectura de MigaPOS.
- Por defecto **GPT-6 Sol**; no existen datos públicos comprobados aquí que permitan establecer una jerarquía de consumo entre Sol/Astra/Terra/Luna. Cambiar modelo solo por un bloqueo técnico concreto.
- Máximo 6 claims; 6–7 escenas; 1 composición principal; 3 stills de revisión; 1 render final después de QA. No generar 10 versiones por prueba y error.
- Antes de descargar dependencias medir `Get-PSDrive C`; revisar herramientas existentes, instalar solo lo imprescindible, prohibido ejecutar `npm install` en raíz de MigaPOS o en `frontend` por este plan.
- **Al final de cada hito** actualizar `marketing/video-migapos/docs/PROGRESS.md` (máximo 250–300 palabras): base/rama, avance, artefactos, riesgos y siguiente comando. Al reanudar, leer **solo** `PROGRESS.md` + 1–2 archivos indispensables, no todo el repo.
- Respuesta en español de máximo 12 líneas por hito, con rutas y resultados comprobados. No imprimir árboles completos ni logs extensos.
- Detener solo la acción riesgosa si la verificación de rama falla, existe riesgo de conectar a producción, el disco es insuficiente, se exige una dependencia de pago o la licencia de un recurso es dudosa. Continuar con el trabajo seguro.

## 8. Estructura objetivo (no requiere existir hoy)

```text
C:\Proyectos\MigaPOS\
  docs\
    PLAN-VIDEO-PROMOCIONAL-MIGAPOS-CODEX.md
  marketing\
    video-migapos\
      package.json
      src\                 # Composiciones Remotion, escenas, timeline
      public\assets\       # Recursos validados y autorizados
      docs\
        FEATURE_EVIDENCE.md
        STORYBOARD.md
        VOICEOVER.md
        ASSETS-LICENSES.md
        PROGRESS.md
      out\                 # MP4 y renders: no versionar
      README.md
```

Al completar instalación, añadir exclusiones para `marketing/video-migapos/node_modules/`, `out/`, `.cache/`, renders temporales y cualquier captura sensible, sin modificar otras reglas de exclusión no relacionadas.

## 9. PROMPT INICIAL PARA PEGAR EN CODEX

```text
Actúa como director creativo de anuncios SaaS y desarrollador senior de React/Remotion. Workspace LOCAL de Windows: C:\Proyectos\MigaPOS. Lee `C:\Proyectos\MigaPOS\docs\PLAN-VIDEO-PROMOCIONAL-MIGAPOS-CODEX.md` y síguelo. No clones el repo ni uses `main`: el código local actual es la fuente de verdad.

Base esperada: `fix/migapos-production-readiness`, con el HEAD local como fuente de verdad. Antes de editar, verifica rama, HEAD, estado, Node, npm y espacio libre. Aplica la decisión de rama de la sección 0 y conserva los archivos preexistentes.

Quiero empezar a PRODUCIR un short comercial profesional de MigaPOS: 30 s, 9:16, 1080x1920, 30 fps, estética premium azul oscuro/morado galaxia, pantallas verificadas del programa, subtítulos, hook de 3 s y CTA. Usa skill oficial de Remotion `https://github.com/remotion-dev/skills` (instalarla una sola vez solo si falta) y skills locales de marca si están presentes. Todo el proyecto audiovisual irá aislado en `marketing/video-migapos/`; no modifiques `frontend/`, Firebase, Firestore, funciones ni producción.

En ESTE primer turno completa Hitos A y B: comprueba la base local y crea la rama segura; revisa selectivamente un máximo de 5 funcionalidades y assets; escribe FEATURE_EVIDENCE.md, STORYBOARD.md, VOICEOVER.md, ASSETS-LICENSES.md y PROGRESS.md; selecciona únicamente afirmaciones comerciales comprobables. Si la rama está lista, el espacio alcanza y puedes hacerlo sin riesgos, avanza también la preparación del proyecto Remotion y una preview inicial (Hito C). No hagas todavía render final ni instales servicios externos de IA de pago.

Protección: nunca uses datos de clientes ni ventas reales; no contactes Firebase productivo, no inicies operaciones de negocio para grabar, no expongas secretos ni inventes funciones. Usa demo aislada/fixtures o material recreado de forma honesta. Evita instalar paquetes repetidos y leer archivos extensos completos. Guarda avance en `marketing/video-migapos/docs/PROGRESS.md` (<=300 palabras), incluyendo ruta exacta del siguiente paso. No push, merge o deploy.

Trabaja de forma autónoma en lo seguro: no te detengas solo en planificar si ya puedes preparar el anuncio. Finaliza con un resumen de máximo 12 líneas: rama/HEAD local, hallazgos, archivos creados, preview si existe, bloqueos y siguiente hito. Responde en español.
```

**Para reanudar luego** (nuevo turno de Codex, sin repetir contexto):

```text
Workspace C:\Proyectos\MigaPOS. Lee primero `marketing/video-migapos/docs/PROGRESS.md` y `docs/PLAN-VIDEO-PROMOCIONAL-MIGAPOS-CODEX.md`. Continúa desde el siguiente hito pendiente, sin rehacer la auditoría. Mantén la rama `marketing/video-promo-migapos`, usa solo recursos y claims validados; prueba el video y luego genera un único MP4 final 1080x1920 si pasa QA y existen recursos/licencias suficientes. Actualiza PROGRESS.md y reporta rutas/resultados reales. No tocar producción, no push/merge/deploy.
```

## 10. Fuentes oficiales y nota de verificación

- Remotion agent skills: https://www.remotion.dev/docs/ai/skills
- Repositorio skill oficial: https://github.com/remotion-dev/skills
- Remotion + coding agents: https://www.remotion.dev/docs/ai/coding-agents
- Commit remoto de referencia confirmado: https://github.com/saintdeyb321/Mig/commit/1b5bea45c07e8879962a572b1012d5f0abf46e13
- La rama remota `fix/migapos-production-readiness` apuntaba a ese SHA al preparar este documento (2026-11-10). **Esto no valida ni inspecciona el disco local**, que Codex debe comprobar en su primer paso.
