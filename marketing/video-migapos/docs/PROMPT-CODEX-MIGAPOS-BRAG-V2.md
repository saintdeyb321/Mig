# Prompt único — MigaPOS Video V2 inspirado en Brag

Trabaja como director creativo de marketing de aplicaciones móviles y desarrollador senior de UI/video. La primera versión de nuestro anuncio MigaPOS se rechazó creativamente: no quiero mejorar un carrusel de capturas, sino **un nuevo comercial que muestre una experiencia móvil viva**, como el tutorial de la skill `/brag`.

**Workspace:** `C:\Proyectos\MigaPOS`  
**Rama:** `marketing/video-promo-migapos` (no crear otra).  
**Plan obligatorio:** `marketing/video-migapos/docs/PLAN-MIGAPOS-VIDEO-V2-BRAG-MOVIL.md`.

**Lee primero el plan y ejecútalo en un solo encargo.** No rehagas los planes de V1 ni una auditoría total de repositorio. La app está hecha en React/Vite, la identidad es Galaxy azul-violeta, y ya existe un fixture aislado con datos sintéticos en `tests/plan09.fixture.jsx` y el sistema de capturas de V1.

### Dirección que manda sobre las herramientas

Crear un video de 20–22 segundos, 1080×1920, 30 fps, con el móvil **como protagonista**. Mostrar un flujo real de MigaPOS con acciones visibles: añadir producto al carrito, ver el total cambiar, consultar inventario de la sede y reportes. Animar toques y desplazamientos **solo** donde correspondan a interacciones comprobadas de los componentes reales. Mostrar una interfaz MÓVIL responsive a 390×844 / 393×852 con datos ficticios; no recortar una vista de escritorio fingiendo que es móvil. Logo oficial. Textos cortos. Audio comercial autorizado, si existe, y SFX discretos. Estética de anuncio de app premium estilo Apple, con acentos Galaxy contenidos. No imitar literalmente los diseños de otras marcas.

### Motor / skill del tutorial

La skill auténtica es `https://github.com/latent-spaces/brag`, modo **`/brag --full --format vertical --tone app-store --duration 21`**, respaldada por Hyperframes. Usa su flujo de nueve preguntas → `brag-plan.md` → `composition-brief.md` → composición → `npx hyperframes check` → preview → MP4/portada/copy.

**No utilices comandos de GitHub ni intentes autenticaciones.** Comprueba si `.agents/skills/brag/SKILL.md` ya está disponible. Si falta, identifica el método manual de copiar `skills/brag/` desde el ZIP oficial que descarga el propietario; nunca lo sustituyas afirmando que la skill está instalada. Si ya está, úsala. Verifica FFmpeg y `npx hyperframes doctor`. Docker NO es necesario en el modo local y está prohibido instalarlo. Si el flujo Brag/Hyperframes no es viable por un bloqueo real, usa la misma dirección de arte móvil en el Remotion local existente, **en una nueva composición V2**, indicando claramente que es el fallback. No abuses de instalaciones o intentos fallidos.

**Seguridad y alcance:** no alterar frontend productivo, Firebase, Firestore, ventas, índices, reglas, backend ni producción; no usar datos reales; conservar V1 intacto. La salida debe quedar separada en `marketing/video-migapos/brag-output-v2/`. Git solo lectura local, sin commits ni comandos remotos. Tú no publicas nada.

**Trabaja hasta lograr un candidato MP4** si las herramientas están presentes. Verifica la imagen en tamaño móvil, sincronización, ausencia de cortes, que no haya UI inventada sin rótulo, la música y sus licencias, y `ffprobe`. Entrega `brag.mp4`, `brag.jpg`, `share-copy.txt`, plan/brief y `REVIEW_V2.md`. Si hay impedimento externo o falta la skill, avanza toda la producción segura y deja el único bloqueo real especificado, sin prometer éxito inexistente.

Al finalizar: máximo 12 líneas en español con ruta y tamaño del MP4, duración, audio, cinco hallazgos QA, archivos modificados y cualquier permiso/instalación que deba ejecutar yo.
