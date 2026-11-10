# MigaPOS — Video promocional V2: enfoque móvil con `/brag` + Hyperframes

**Preparado:** 10/11/2026  
**Workspace Windows:** `C:\Proyectos\MigaPOS`  
**Rama de trabajo:** `marketing/video-promo-migapos` (no crear otra rama).  
**Estado de referencia publicado, no necesariamente HEAD local:** `24df9dfa` sobre `5dfe311`.  
**Objetivo:** sustituir creativamente el anuncio anterior —sin borrarlo— por uno que demuestre la experiencia real del POS móvil como hace el tutorial de Brote.

## 1. Auditoría del tutorial proporcionado (127 segundos)

**00:16–00:40:** presenta `/brag` y el repositorio `https://github.com/latent-spaces/brag`. Explica que el agente lee el código, identifica el producto y sus momentos más interesantes.  
**00:44–00:52:** muestra la aplicación de café «Brote»: pantalla inicial y resultado de un pedido, ambos en formato teléfono.  
**00:52:** ejecuta `/brag --full --format vertical` en Claude Code. El modificador `--full` dirige al flujo clásico de Hyperframes, en lugar del flujo `brag-slim` automático de Claude Opus 5.5.  
**00:56:** enseña `brag-plan.md` con una historia y seis momentos: eliminar la fila, pulsar «Pedir ahora», elegir producto, personalizar, ver pedido listo y cerrar con marca.  
**01:00–01:28:** Hyperframes compone animaciones y música; muestra propuesta minimalista/estilo Apple y posibilidad de narración opcional.  
**01:28–02:07:** muestra MP4 final, portada y copy. El anuncio presenta producto dentro de un marco telefónico, acciones visibles y desenlace claro.

**Distinción fundamental:** el tutorial es una demostración editada de un proceso, no prueba de que `/brag` produzca siempre la misma calidad, ni de que todas las pantallas se capturen en vivo. La skill puede reconstruir UI a partir del código. En MigaPOS las reconstrucciones deben identificarse y jamás atribuir funciones que no existen.

### Flujo que documenta realmente la skill

1. Inspección selectiva del código → responde una rúbrica de nueve preguntas (identidad, promesa, gancho, mejor pantalla, duración, tono, recorrido real de usuario...).
2. `brag-plan.md`: ángulo creativo, gancho, 2–3 momentos, historia de uso, guion por segundos y audio.
3. `composition-brief.md`: brief concreto para Hyperframes con materiales de fuente, identidad, tiempos y limitaciones.
4. Composición con Hyperframes → `npx hyperframes check` → preview → render.
5. Exporta `brag.mp4`, `brag.jpg` (fotograma de portada) y `share-copy.txt`.

**Documentación primaria:** [Brag](https://github.com/latent-spaces/brag), [Skill principal](https://github.com/latent-spaces/brag/blob/main/skills/brag/SKILL.md), [Inspección](https://github.com/latent-spaces/brag/blob/main/skills/brag/references/step-1-inspect.md), [Plan](https://github.com/latent-spaces/brag/blob/main/skills/brag/references/step-2-plan.md), [Composición](https://github.com/latent-spaces/brag/blob/main/skills/brag/references/step-3-compose.md), [Hyperframes Quickstart](https://hyperframes.app/docs/1-startup/2-quickstart).

## 2. Diagnóstico del V1 de MigaPOS

No es un problema de compilación: el V1 de Remotion sí creó siete escenas y PNG, pero su dirección visual no convierte el uso del software en una historia. El centro eran recortes aislados de ticket, stock, reportes y caja con titulares largos. `DemoPanel.jsx` permite un *fallback* silencioso a recreaciones cuando falta una captura. El ambiente Galaxy ocupaba más atención que el producto y el primer montaje carecía de diseño sonoro.

**Cambio de estrategia:** primera prioridad = secuencia de uso del POS móvil, segunda = claridad visual, tercera = belleza, cuarta = efectos. No cambiar la app real para hacerla encajar en el anuncio.

## 3. Dirección creativa V2

- **Concepto:** «Tu tienda en movimiento». Mostrar la aplicación en un teléfono: producto → añadir al ticket → ver total; después una mirada rápida al stock y a los reportes. El POS hace algo visible, no solo aparece.
- **Duración:** 20–22 segundos (objetivo 21 segundos, 630 frames a 30 fps); **formato** 1080×1920, 9:16, MP4 H.264. Si el flujo real exige más segundos para leer, mantener dentro de 15–25 s.
- **Tono:** `/brag --full --tone app-store --format vertical --duration 21`, acompañado de dirección personalizada: «presentación de aplicación móvil premium, minimalismo cinematográfico, toques y scroll fieles a la UI; paleta nocturna azul-violeta Galaxy, sin saturar la pantalla».
- **Protagonista:** captura o reconstrucción fiel del responsive **real** de MigaPOS a 390×844 o 393×852 CSS px, DPR 2, dentro de dispositivo. No recortar una interfaz de escritorio y afirmar que es la versión móvil.
- **Identidad:** `frontend/src/shared/styles/theme.css` y logo de `frontend/public/img/Logo_MP.png`. Violeta oscuro/azul espacial como acentos y fondos sobrios; alta luminosidad y contraste dentro de la pantalla del teléfono.
- **Audio:** música y SFX con licencia comercial explícita, indicación de atribución y fuente. Voz **apagada por defecto**; el `--voice` de Brag utiliza Kokoro vía Hyperframes y es optativo, no debe forzarse. Que funcione incluso sin sonido.
- **Mensajes permitidos:** preparar ticket y revisar total, consultar productos/stock de una sede, consultar ventas por período. Nada de prometer SUNAT, offline garantizado, automatizaciones o conciliación certificada. Caja puede omitirse, porque el fixture del V1 indicaba «Por revisar».

### Storyboard de referencia (21 segundos)

| Tiempo | Acción **móvil** | Texto máximo | Sonido/movimiento |
|---|---|---|---|
| 0–2.5 s | Teléfono entra; POS visible desde el primer instante | «Tu tienda, en movimiento.» | Entrada breve, golpe musical suave |
| 2.5–7.5 s | Se toca producto de **demostración**, entra al carrito, aumenta cantidad; total cambia, fiel a estados del fixture | «Prepara cada venta.» | Toque, cambio real de cantidad, micro-SFX |
| 7.5–11 s | Vista **móvil** del catálogo, búsqueda y stock por sede | «Consulta tu inventario.» | Deslizar/scroll y enfoque de tarjeta |
| 11–15 s | Vista **móvil** de reportes, período y tickets/gráfico con datos sintéticos | «Revisa tus resultados.» | Cámara centra la métrica legible |
| 15–18.5 s | Montaje corto de las tres acciones anteriores; zoom out del teléfono | «Todo más organizado.» | Corte al ritmo, sin flashes |
| 18.5–21 s | Logo oficial y CTA | «Conoce MigaPOS» / «Solicita una demo» | Cierre musical y salida legible |

**Este storyboard es una propuesta, no una orden de inventar UI.** Si alguna vista responsive no resulta legible o usable, adaptarla al flujo REAL o reducir escenas; no modificar la producción para hacer el video.

## 4. Captura móvil auténtica, aislada y reutilizable

- Reutilizar `tests/plan09.fixture.jsx` y `tests/helpers/browserHarness.mjs`, ya utilizados para los PNG del V1. El script V1 está en `marketing/video-migapos/scripts/capture-demo.mjs` y aporta mocks de Firebase, CSP y bloqueo de salida.
- **Modificar solo scripts de marketing V2** para crear la nueva toma móvil. Usar `Emulation.setDeviceMetricsOverride` con viewport 390×844 o 393×852 y DPR 2; comprobar rendering, overflow, bottom nav, carrito/drawer, scroll y ausencia de tap targets ocultos. No falsificarlo usando solo el recorte 760×1250 del V1.
- Regenerar screenshots de los **estados** de una acción: producto disponible → agregado → cantidad y total actualizados. Si se anima el toque, que corresponda a un control realmente visible y a un resultado probado. Para navegación y reportes, capturar las pantallas verdaderas renderizadas con datos de prueba.
- No usar producción, Firebase real, cuentas reales, datos identificables ni ventas confirmadas. No instalar servicios de captura conectados a internet. Si falla aislamiento, recurrir a recreaciones con el rótulo «Recreación — datos de demostración».
- Si los componentes reales del fixture no reproducen adecuadamente el layout móvil, documentar el problema y usar una demostración ilustrativa fiel (sin alegar que es captura real), no forzar CSS del frontend.
- Nunca hacer `getStaticFiles()` con fallback silencioso para publicación: verificar los assets obligatorios antes del render y fallar de forma explícita si faltan.

## 5. Skill Brag y Hyperframes en Windows, SIN comandos GitHub desde Codex

**A. Revisar instalaciones existentes primero:** `node --version` (Node 24 ya documentado), `where.exe ffmpeg`, `where.exe ffprobe`, `where.exe chrome`, `where.exe msedge`, espacio en C:/D:, skill local en `.agents/skills/brag/`. No reinstalar Node ni Remotion.

**B. Instalación de `/brag` sin autenticación GitHub:**

- Ruta ideal si el propietario la autoriza y existe acceso público: `npx skills add https://github.com/latent-spaces/brag --skill brag` (no es comando `gh`, pero puede realizar descargas subyacentes; **no** repetirlo si falla o pide credenciales).
- Ruta sin descargas de GitHub desde Codex: el propietario descarga desde el navegador el ZIP público `https://github.com/latent-spaces/brag/archive/refs/heads/main.zip`, lo descomprime y copia íntegra la carpeta `skills/brag/` al workspace `C:\Proyectos\MigaPOS\.agents\skills\brag\`. No copiar solo `SKILL.md`; se requieren referencias y assets. Usar **copia real**, no symlink si Windows lo impide. No exponer tokens o claves.
- Preferir skills de Hyperframes obtenidas de su CLI oficial (`npx hyperframes skills`) cuando esté instalado. Leer únicamente habilidades/referencias necesarias para esta ejecución; no cargar el repositorio externo completo al contexto.

**C. Hyperframes:** `npx hyperframes doctor` y comprobar FFmpeg en PATH. **Docker es opcional** para render local y NO debe instalarse por este video. Usar `npx hyperframes check`, `preview` y `render` desde la carpeta de composición según CLI oficial. Si Hyperframes falla por razones de dependencias, documentar causa concreta y aplicar la MISMA dirección creativa móvil a Remotion ya instalado, en una composición V2 aparte; no insistir en descargas repetidas ni decir que se usó Brag si no fue así.

**D. Git local:** continuar únicamente en `marketing/video-promo-migapos`. Codex NO ejecuta `git push/pull/fetch/clone/ls-remote`, `gh`, autenticación, commits, merge, rebase, reset ni deploy. `git status`, `git diff`, `git branch --show-current` y `git rev-parse HEAD` son locales y sí se permiten. El propietario publicará cuando quiera.

## 6. Flujo de producción en un solo encargo

1. **Preflight breve:** confirmar rama/HEAD/estado, FFmpeg, skill, Hyperframes, recursos locales. Evitar la auditoría completa de MigaPOS y usar pruebas anteriores como base.
2. **Producción basada en código y usuario:** responder las nueve preguntas del método Brag, inspeccionando solo `frontend/src/modules/POS.jsx`, ticket/carrito, `ProductCatalog.jsx`, `Reports.jsx`, CSS móvil, fixture y marca; capturar las acciones móviles seguras.
3. **Plan y brief:** crear `brag-plan.md` y `composition-brief.md` concisos; mantener un solo concepto y recorrido con sentido.
4. **Composición:** producción V2 independiente en `marketing/video-migapos/brag-output-v2/`. **No sobrescribir** `marketing/video-migapos/src/`, `out/migapos-promo-30s.mp4`, proyectos previos ni fuentes originales.
5. **QA:** comprobar legibilidad REAL en previsualización a tamaño móvil, taps/scroll, duración, encuadre y zonas seguras; `npx hyperframes check` sin errores; extraer 4–6 stills y revisar la reproducción para detectar cortes; comprobar atribución de música y SFX.
6. **Render:** un render definitivo tras el preview; MP4, portada y copy. Si el skill genera primero `brag-output/` en la raíz por defecto, coordinar rutas y mover **solo archivos propios** a la carpeta de marketing sin sobrescribir nada; mantener rutas coherentes en el brief.
7. **Entrega:** `marketing/video-migapos/brag-output-v2/brag.mp4`, `brag.jpg`, `share-copy.txt`, `brag-plan.md`, `composition-brief.md`, `REVIEW_V2.md` con ruta, duración, resolución, tamaño, licencias y defectos residuales.

## 7. Gates de aprobación

- Debe verse **MigaPOS móvil auténtico** dentro del teléfono en la mayor parte del anuncio; no un dashboard genérico ni puro texto.
- Deben observarse **dos o tres cambios de estado** vinculados al usuario; no simples fotos con zoom. El beneficio central debe ser explícito sin depender de audio.
- Copys cortos y pantalla legible al reproducir el MP4 a 25–30 % de ancho. Ajustar si queda ilegible.
- El render final debe tener video reproducible y especificaciones confirmadas con `ffprobe`, sin fotogramas negros ni audio sin atribución.
- La carpeta nueva debe ignorar MP4, caches, perfiles, datos demo temporales y `node_modules` de Git. Evitar añadir media sensible a commits.
- El entregable es un **candidato a publicación**, no debe publicarse automáticamente. El propietario y ChatGPT revisarán el archivo MP4 adjuntado antes del GO final.

## 8. Consumo de tokens y límites

- GPT-6 Sol, intensidad Alta. Un solo encargo principal; no volver a leer el repositorio entero ni solicitar aprobaciones para acciones locales seguras.
- Leer máximo 8 archivos de código clave antes de filmar, salvo que una dependencia técnica real lo requiera. No copiar a la respuesta enormes archivos ni logs.
- No instalar Docker ni modelos de audio pesados. No repetir `npm install` ni renderizar 1080p repetidamente.
- Máximo una iteración de corrección visual automática; si el defecto persiste, describirlo para una revisión humana concreta.
- Ante acceso a GitHub bloqueado, ejecutar la vía manual, no intentar `gh auth` ni clones.

**Referencias:** [Brag](https://github.com/latent-spaces/brag), [Hyperframes](https://hyperframes.app/docs/1-startup/2-quickstart), [Render local (Docker opcional)](https://hyperframes.app/docs/3-guides/4-rendering).
