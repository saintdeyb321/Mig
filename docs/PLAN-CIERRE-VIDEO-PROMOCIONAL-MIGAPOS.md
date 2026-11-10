# MigaPOS — Cierre integral del video promocional (Remotion)

**Versión:** 1.0 · **Fecha:** 2026-11-10  
**Workspace local y fuente de verdad:** `C:\Proyectos\MigaPOS`  
**Rama de trabajo existente:** `marketing/video-promo-migapos` (NO crear otra)  
**Último commit visible al auditor en GitHub:** `24df9dfa349dc50d2746e4b2a633e54c098f50b2`  
**Base de esta rama:** `5dfe31102ac77b0a235e175145d6f439595f2d23`  
**Proyecto audiovisual:** `C:\Proyectos\MigaPOS\marketing\video-migapos`  
**Entregable:** `marketing/video-migapos/out/migapos-promo-30s.mp4`, candidato final (no publicado).  
**Ejecución:** UN ÚNICO prompt principal. Solo usar un segundo prompt si el QA identifica defectos concretos.

## 1. Estado ya auditado — NO repetir la investigación

Se revisaron en la rama publicada `marketing/video-promo-migapos` estos archivos:

- `src/Promo.jsx`, `src/DemoPanel.jsx`, `src/styles.css`, `src/timeline.mjs`, `src/captions.json`, `src/index.jsx`;
- `scripts/capture-demo.mjs`, `scripts/render-review.mjs`, `scripts/timeline.test.mjs`, `package.json`, `README.md`;
- `docs/FEATURE_EVIDENCE.md`, `STORYBOARD.md`, `VOICEOVER.md`, `ASSETS-LICENSES.md`, `PROGRESS.md`, `REVIEW_PACKET.md`.

**Confirmado en el código publicado:** composición `MigaPOSPromo30` de **7 escenas, 900 frames, 30 fps, 1080 × 1920**; 9 cues de subtítulos; capturador de 5 estados sintéticos de componentes reales usando el fixture Plan 09 y restricciones de red; diseño Galaxy, logo de marca, Remotion 4.0.542 en el proyecto separado, pruebas del timeline, scripts de preview. El paquete de revisión informa que `check`, `capture` y `review` pasaron en la máquina local y que Studio compiló. **No se han visto directamente los cinco PNG ni un MP4 desde este chat**: los PNG están en `out/`, que no se publica en GitHub.

**Hallazgos a corregir antes de la entrega:**

1. **RIESGO DE RECREACIONES SILENCIOSAS:** `DemoPanel.jsx` renderiza una UI recreada cuando falta `public/assets/demo/<asset>.png`. El MP4 final NO debe publicarse por accidente con recreaciones no aprobadas: comprobar los 5 archivos `ticket.png`, `ticket-updated.png`, `inventory.png`, `reports.png`, `cash.png`; capturarlos de nuevo con el fixture seguro si faltan; hacer fallar el render final ante ausencias. Conservar la etiqueta «Datos de demostración»; si una recreación se autoriza expresamente, etiquetarla como recreación.
2. **TRANSICIONES:** el timeline es contiguo, pero los cortes entre `<Sequence>` pueden resultar bruscos. Mejorar con animaciones discretas y cambios de foco dentro de cada escena, sin alterar las duraciones, tapar datos ni añadir destellos agresivos. Verificar fotogramas antes/después de cada corte.
3. **AUDIO:** el prototipo es silencioso; no hay licencia de música/voz verificada. Priorizar diseño sonoro **original y generado localmente** (por código, sin descargar samples ni copiar melodías) si mejora la pieza. Incluir narración en español únicamente si existe recurso autorizado y su uso comercial es claro. Si no, conservar versión sin narración con subtítulos perfectamente legibles; nunca usar música o voz con derechos dudosos.
4. **QA VISUAL REAL:** el diseño usa un ancho útil cercano a 810 px y recortes de pantallas; hay que comprobar a escala de teléfono que cantidad, stock, período, conteo y CTA se leen sin pausas. Prestar atención a la superposición entre subtítulos y panel y a las zonas tapadas por botones de TikTok/Reels.
5. **VERIFICACIÓN FINAL:** los tests actuales solo validan timeline/subtítulos; faltan preflight de assets, revisión de movimiento, metadatos del MP4, miniatura, copy comercial y registro final del render.

**Mensajes permitidos:** «Prepara cada ticket», «Consulta el stock por sede», «Revisa tus ventas por período», «Compara el efectivo al cierre», «Solicita una demostración». En caja conservar explícitamente el estado «Por revisar» y la naturaleza provisional del cálculo. No prometer cierre certificado ni conciliación automática. No inventar contacto, web, precio, SUNAT, operación 100 % offline o métricas de rendimiento.

## 2. Restricciones innegociables

- Solo trabajar en la **rama ya existente** `marketing/video-promo-migapos`; leer `git status --short`, `git rev-parse --short HEAD`, `git branch --show-current` (localmente). Si el HEAD local es posterior al remoto, prevalece el local; preservar cambios previos.
- **CERO operaciones remotas de Git/GitHub por Codex:** prohibidos `git fetch`, `pull`, `push`, `clone`, `ls-remote`, `gh` y APIs de GitHub. Tampoco `reset`, `stash`, `clean`, `checkout -f`, `merge`, `rebase`, ni commits. El propietario hace el versionado y el push manual.
- No crear otra rama. No modificar `frontend/`, `functions/`, Firestore, Firebase, rules, índices, licencias ni sistemas de producción. No abrir transacciones reales ni usar datos de clientes.
- Mantener Remotion y dependencias dentro de `marketing/video-migapos/`. **NO reinstalar la skill Remotion** ni bloquearse por su ausencia; Remotion ya está instalado y se puede desarrollar con sus APIs. No ejecutar comandos que requieran autenticación GitHub.
- Priorizar herramientas disponibles; `npm ci` solo si realmente faltan dependencias. Capturas exclusivamente con fixture y red aislada después de validar las protecciones, sin autenticar a Firebase real.
- `node_modules`, `.cache`, `out`, renders y `public/assets/demo` deben seguir excluidos del commit. La salida final **no** se sube a GitHub; el usuario podrá adjuntarla a ChatGPT para revisión.
- No publicar el anuncio automáticamente, no desplegar ni solicitar autorización por tareas rutinarias seguras. Si una acción concreta es insegura, omitirla, continuar con alternativas seguras y documentarla.

## 3. Ejecutar como una única producción (sin más hitos artificiales)

### A. Preflight ligero y recuperación de capturas

1. Leer SOLO este archivo, `docs/REVIEW_PACKET.md`, `README.md`, `src/Promo.jsx`, `src/DemoPanel.jsx`, y los scripts necesarios. No reauditar MigaPOS completo.
2. Confirmar rama, cambios, espacio libre, `node_modules`, Chrome/Edge existente, cinco imágenes demo y logo. No instalar de nuevo si están disponibles.
3. Ejecutar `npm.cmd run check`; ejecutar `npm.cmd run capture` solo si los PNG faltan o están defectuosos y **después de verificar aislamiento**. Exigir que los 5 PNG sean archivos reales legibles y asociarlos a las 4 funciones verificadas.
4. Añadir una verificación previa al render maestro que falle si faltan los PNG requeridos, no son PNG válidos, están vacíos o la composición utiliza recreaciones por fallback. No permitir un éxito falso del render por imágenes sustituidas. Mantener fallback solo en desarrollo, claramente rotulado.

### B. Edición profesional concisa

1. Refinar con moderación hook (0–3 s), movimiento en cada beneficio y transiciones entre secuencias; conservar siete escenas y 900 frames. Aplicar aceleraciones suaves por fotograma y enfoque visual en las cifras reales del fixture, nunca animar valores financieros inventados.
2. Asegurar lectura en móvil de los titulares, cifras importantes, rótulo demo, aviso «Por revisar», subtítulos y CTA. No exponer encabezados con datos reales. Mantener Galaxy: azul noche, morado nebulosa y superficies auténticas de la interfaz.
3. Preparar subtítulos legibles incluso sin sonido; el guion en `VOICEOVER.md` es referencia, no una obligación de sintetizar voz. Si hay material de voz y licencia explícita, integrarlo sin ocultar texto.
4. Si no hay audio autorizado, puede añadirse una **pista instrumental original sintetizada por código local** (sin música ajena, sin dependencias masivas ni servicios de pago), solo si la calidad es comercialmente aceptable. Niveles suaves, sin clipping, inicio/final con fade, sincronización sencilla. De lo contrario, entregar master silencioso con subtítulos y registrar `sin audio`.
5. Agregar una sola miniatura comercial 1080×1920 aprovechando la composición o un still, sin generar numerosas variantes.

### C. Prueba, QA y MP4 final EN ESTE MISMO TURNO

1. Ejecutar pruebas de timeline y preflight de assets. Regenerar cinco PNG de control para frames **36, 315, 465, 615 y 870**. Añadir muestras justo antes/después de los seis cambios de escena: 89/90, 239/240, 389/390, 539/540, 689/690, 809/810 (se pueden renderizar a menor escala para ahorrar CPU).
2. Usar Studio o prueba equivalente para examinar animaciones y UI a escala móvil. Corregir overflow, textos cortados, paneles microscópicos, contraste insuficiente, capas superpuestas, desapariciones abruptas y flashes. Si no hay herramienta de inspección visual de imágenes disponible, registrar esa limitación de forma honesta.
3. Renderizar **una prueba corta** de 5 segundos a escala 0.5 mediante el CLI local de Remotion (ejemplo orientativo: `--frames=0-149 --scale=0.5 --codec=h264`, ajustar a flags compatibles con versión instalada). Verificar que se reproduce. No repetir renders completos para ajustes superficiales.
4. Si pasan preflight y prueba, renderizar el **MP4 completo** usando CLI Remotion instalado, formato H.264, `yuv420p`, 1080×1920, 30 fps, 900 fotogramas (~30 s) y AAC si contiene audio. Ejemplo base desde `marketing/video-migapos/`:
   ```powershell
   .\node_modules\.bin\remotion.cmd render src/index.jsx MigaPOSPromo30 out/migapos-promo-30s.mp4 --codec=h264 --pixel-format=yuv420p --crf=19 --concurrency=2 --overwrite
   ```
   Reutilizar el navegador Chrome/Edge usado en `render-review.mjs` con `--browser-executable`/`--chrome-mode` si el CLI lo requiere; adaptar flags a la versión local y la máquina. No usar el comando de ejemplo sin comprobar sus parámetros.
5. Verificar el archivo realmente creado: existencia, bytes no cero, duración alrededor de 30 s, 1080×1920, 30 fps, codec, ausencia de tramas negras inesperadas, primera escena y CTA final; audio sin saturación si se generó. Usar `ffprobe` si está disponible, o métodos locales equivalentes; no declarar QA aprobado sin pruebas ejecutadas.
6. No bloquear todo el cierre por una pista de voz externa. Si hay imposibilidad técnica comprobada de generar el MP4, mantener el prototipo y producir un informe con error reproducible exacto y comando siguiente (sin fingir éxito).

### D. Entrega lista para publicación (sin subir ni publicar)

Guardar en `marketing/video-migapos/`:

- `out/migapos-promo-30s.mp4` — candidato final.
- `out/review/frame-{036,315,465,615,870}.png` y `out/thumbnail.png` — revisión y portada.
- `docs/REVIEW_PACKET.md` — **máximo 45 líneas** con base local, cambios realizados, pruebas y resultados, ruta final, si tiene audio o es silencioso, licencias, riesgos residuales.
- `docs/PROGRESS.md` — **máximo 300 palabras** y estado del proyecto.
- `docs/QA-FINAL.md` — matriz de checks (timeline, 5 PNG auténticos, privacidad, móvil, transiciones, audio, render, metadatos) con PASS/FAIL + evidencia.
- `docs/COPY-REDES.md` — copy corto para TikTok y Facebook Reels, CTA «Solicita una demostración», hashtags prudentes, sin inventar enlaces ni precio.
- `README.md` — instrucciones reproducibles para regenerar capturas/preview/render usando únicamente la instalación local. Agregar script `render:final` y `verify:final` si ayudan y no introducen dependencias innecesarias.

**Definición de hecho:** no basta con que Studio compile. Debe existir un MP4 verificable y los archivos de QA/copy. No publicar ni hacer commit. Si no es posible alcanzar un requisito, documentar el fallo real y entregar lo máximo seguro posible.

## 4. Criterios de aprobación del propietario

- El gancho es visualmente interesante desde el primer segundo y muestra MigaPOS, no una intro genérica.
- En 30 s se reconocen ticket, stock por sede, reportes y caja; no se falsean funciones ni valores.
- Los textos son legibles en un teléfono y quedan fuera de los controles habituales de redes sociales.
- El audio (si existe) es original/autorizado y no molesta; el video funciona sin sonido.
- El logo se distingue y el CTA está al menos los últimos tres segundos.
- No hay material sensible, falsa aprobación de un arqueo ni claims sin demostrar.
- Los 900 frames están renderizados en formato compatible para TikTok/Facebook y el MP4 abre correctamente.

## 5. Comunicación ChatGPT ↔ propietario ↔ Codex

1. Codex prepara el **MP4 candidato** y el paquete de revisión; no usa GitHub.
2. El propietario inspecciona el MP4 y sube aquí el archivo final o los cinco PNG para auditoría visual. Puede publicar manualmente SOLO el código, docs y tests de la rama a GitHub y compartir el SHA.
3. ChatGPT revisa los archivos visibles de GitHub y los medios adjuntos; solo se hará una **segunda ronda de Codex** si hay defectos puntuales. Nadie fusiona con la rama de producción.

**Nota licencia Remotion:** la página oficial indica licencia gratuita para individuos y organizaciones de hasta tres personas, con condiciones; verificar elegibilidad antes del uso comercial final. https://www.remotion.dev/docs/license/pricing . La elegibilidad organizativa no se deduce de este plan.

## 6. PROMPT ÚNICO DE EJECUCIÓN

```text
Actúa como director creativo SaaS, motion designer y desarrollador senior de React/Remotion. Workspace: C:\Proyectos\MigaPOS. En este turno quiero TERMINAR un candidato publicable del short MigaPOS de 30 s, no fragmentarlo en nuevos hitos.

Lee y ejecuta `marketing/video-migapos/docs/PLAN-CIERRE-VIDEO-PROMOCIONAL-MIGAPOS.md`. El código existente de Remotion y el Hito C ya fueron auditados, NO rehagas el análisis del negocio ni el storyboard. La rama `marketing/video-promo-migapos` YA EXISTE. Verifica la rama/HEAD/status local, preserva cambios existentes y trabaja allí.

Prohibido usar cualquier operación remota de GitHub/Git, o comandos `gh`; NO hagas pull, fetch, push, clone, commit, merge, reset, stash ni deploy. No toques frontend productivo, Firebase ni datos reales. La skill Remotion remota es OPCIONAL; NO intentes instalarla ni detenerte por su ausencia: ya tenemos Remotion instalado y funcionando.

Ejecuta de forma autónoma el ciclo completo: verificar que las cinco capturas demo auténticas existen (regenerarlas solo con fixture aislado si falta), impedir fallback de recreación silenciosa en el máster, refinar animaciones/transiciones/legibilidad móvil, resolver audio con material original local y legal si es viable, validar 7 escenas/900 frames/subtítulos/zonas seguras, generar prueba corta, corregir fallos y renderizar un solo máster H.264 1080x1920 a 30 fps en `marketing/video-migapos/out/migapos-promo-30s.mp4`.

Crear/actualizar `docs/QA-FINAL.md`, `docs/COPY-REDES.md`, `docs/REVIEW_PACKET.md` y `docs/PROGRESS.md` dentro del proyecto de video. Preparar portada y 5 stills. Verificar duración/codec/archivo real y registrar las pruebas ejecutadas, sin afirmar resultados no obtenidos. No publiques el video. Si existe un bloqueo real, conserva los entregables alcanzados y documenta la causa exacta, pero continúa con todas las tareas seguras.

Usa tokens con disciplina: lectura selectiva, cero reinstalaciones innecesarias, una prueba corta y un único render final después de QA, sin imprimir logs largos. Termina con máximo 15 líneas: rama y HEAD, mejoras realizadas, checks PASS/FAIL, ruta del MP4 y tamaño, audio sí/no, rutas de portada/QA y cualquier bloqueo. No pidas autorización para tareas seguras. Responde en español.
```
