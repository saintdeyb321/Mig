# MigaPOS — V4 correctiva: video legible, responsive y animado

**Fecha:** 2026-11-10  
**Workspace:** `C:\Proyectos\MigaPOS`  
**Rama esperada:** `marketing/video-promo-migapos`  
**Referencia remota auditada:** `20474ee61c44ac0bf7d1600f46cf5b7f90516f2d` (la versión LOCAL sigue siendo fuente de verdad).  
**Origen:** `marketing/video-migapos/brag-output-v3/`  
**Destino nuevo:** `marketing/video-migapos/brag-output-v4/`  
**Estado:** instrucción de corrección, sin cambios aplicados al equipo local por ChatGPT.

## 1. Diagnóstico probado, no repetir auditorías generales

Se inspeccionó el MP4 subido `master-voice.mp4`: H.264, 1080×1920, 30 fps, 105 segundos y AAC. Su contenedor es vertical correcto; los defectos proceden del tratamiento editorial y del recorte.

1. **Pérdida de interfaz:** V3 toma capturas de 390×844 CSS px y las coloca en una pantalla de 762×1032 px, manteniendo una escala de 762/390. Así solo caben `1032/(762/390) ≈ 528` de los 844 px originales: ~37 % de la altura queda fuera del marco cada vez. Código: `brag-output-v3/src/index.jsx` (`screenWidth`, `screenHeight`, `cropHeight`, `cropTop`) y `src/style.css` (`.screen`, `.phone`).
2. **Animación insuficiente:** V3 compone fotos fijas enumeradas en `timeline.boards`, genera un JPEG por estado y **repite esos JPEG** durante su duración en `render.mjs` (`visualTrack`). El `reveal` solo anima un borde de foco durante pocos fotogramas. Eso es un pase de capturas, no un demo móvil fluido.
3. **Foco fragmentado:** títulos arriba, dispositivo al centro, subtítulos al pie y borde resaltado compiten entre sí. En algunos estados se magnifica demasiado poco el módulo; las operaciones no resultan legibles en teléfono.
4. **Cobertura editorial equivocada:** `frontend/src/modules/AgendaManager.jsx` existe, pero `frontend/src/App.jsx` y `BottomNav.jsx` de la rama auditada no lo ofrecen como módulo de navegación principal. El fixture puede renderizarlo de forma directa; no implica que el cliente tenga esa ruta. **Eliminar la escena y el claim de Agenda VIP.** Reemplazarlos por un flujo actual de Contratos/Pedidos (filtros y estado) o extender Historial, siempre respaldado por UI vigente.
5. **Lo reutilizable:** capturas con fixture sintético, voz Kokoro local, guion salvo la mención de Agenda VIP, branding Galaxy, lógica de roles, exportaciones PDF/Excel diferenciadas y cuidado con la conciliación de caja.

## 2. Objetivo de la V4

Obtener **un único master narrado revisable** de ~105–120 s, vertical 1080×1920/30 fps, demostrando el producto real de forma legible en teléfonos. Se prioriza claridad comercial, no duración fija. Preservar V1, V2 y V3 sin sobrescribir masters ni fuentes. No publicar automáticamente ni abrir producción/Firebase. Sin música: el propietario la agregará manualmente.

## 3. Reglas visuales obligatorias

**Dos modos de cámara, no uno solo:**

- **Modo A · Teléfono completo:** captura móvil mostrada íntegra, con proporción nativa `390/844`. Usar `object-fit: contain` o cálculo equivalente sin estirar ni recortar. Diseñar su posición/escala dejando margen para marca y subtítulos. Propuesta inicial: pantalla visible de ~570×1233 px (misma relación), centrada, con bordes y subtítulos fuera de la pantalla. Adaptar por escena. El teléfono sirve para orientarse y confirmar que es la app real.
- **Modo B · Detalle protagonista:** transicionar con un **push-in** suave desde el teléfono al control concreto (ticket, filtro, stock, rol, PDF/Excel). Aquí se permite un recorte deliberado, PERO ha de presentarse como ampliación de detalle, no dentro de un marco que aparenta mostrar el teléfono entero. Mantener un contexto identificable, no cortar botones ni etiquetas esenciales. Regresar a vista completa al cambiar módulo cuando aporte claridad.
- La región de interés debe venir de los rectángulos DOM capturados para cada paso, normalizados a viewport y corregidos por scroll. No perseguir un control fuera del viewport con un rectángulo de foco vacío o parcialmente cortado.
- Zona segura editorial para plataformas: mantener títulos/CTA y subtítulos apartados de laterales y del borde inferior; comprobar con una plantilla de controles de TikTok/Facebook. Nunca poner texto comercial encima de un control del producto.
- **Una mirada:** al pronunciar un beneficio, la UI pertinente debe dominar el plano. Título de capítulo discreto/estable; cuando el espectador lee los subtítulos, no lanzar simultáneamente una segunda línea de texto largo ni movimiento de cámara llamativo.
- No mostrar tarjeta sin datos ni espacio blanco enorme durante varios segundos. Si se necesita abrir drawer/modal, animar apertura y terminar en una vista útil donde se vean cantidad, total y botones relevantes.

## 4. Motion: tomar lo mejor de V2 y mejorar V3

- No producir el master a partir de JPEG repetidos por estado. Renderizar **todos los frames animados** con Remotion o usar clips reales de navegador aislado con `OffthreadVideo`; no congelar la acción mientras se narra una secuencia de cambios.
- Usar `spring`/`interpolate` o keyframes para entrada y estabilización, desplazamientos guiados, crossfades dentro del teléfono, match-cuts y breves zooms sobre acciones. Mantener la animación **al servicio del foco**, sin parpadeos ni desplazamientos continuos mientras se explica un valor.
- En cada operación: **estado inicial → acción visible/tap/scroll → resultado visible → pausa para lectura**. Las pausas se sincronizan con la locución. Un cambio de pestaña no debe omitir el resultado.
- Considerar reutilizar el patrón de V2 (`OffthreadVideo`, toques CDP, gestos) para transiciones auténticas. Los clips deben provenir exclusivamente del fixture aislado, jamás de producción.
- Los 12 capítulos de V3 pueden reorganizarse; no hay que rehacer toda la narración si basta modificar una sección. Eliminar/regrabar la referencia a Agenda VIP y ajustar sus subtítulos y tiempos.

## 5. Cobertura comercial comprobada (para sesión demo de dueño)

1. **POS:** buscar, añadir, ver ticket, ajustar cantidad y total antes de cobrar (sin pulsar cobrar).
2. **Categorías y productos:** búsqueda y existencias.
3. **Sedes:** cambio por selector y stock contextual distinto por sede.
4. **Gestión de pedidos/contratos:** filtros En curso, Por cobrar, Cerrados; búsqueda y estados, sin guardar ni cobrar.
5. **Historial de ventas:** fecha, estado, artículos del ticket.
6. **Reportes:** filtros Hoy/Semana/Mes/Año; tarjetas y gráfica asociadas al período.
7. **Exportaciones:** `Informe visual (PDF)` significa preparar una vista para imprimir o **guardar como PDF desde el navegador**; `Detalle Excel` descarga el libro correspondiente. No afirmar que ya se descargó al solo elegir formato.
8. **Caja:** esperado/contado y **“Por revisar”** si existe conciliación provisional.
9. **Personal:** funciones de empleados, roles, sedes, turnos; no mostrar datos reales.
10. **Configuración/Sucursales:** datos comerciales y sección de sucursales. No afirmar facturación SUNAT automática.

Si un módulo o control no aparece por navegación legítima en `App.jsx`/`BottomNav.jsx` con el rol elegido, **no presentarlo como disponible** solo porque el fixture puede renderizar un componente heredado. Usar interfaz actual, capturas sintéticas y créditos “Datos de demostración”.

## 6. Audio, tiempos y subtítulos

- Reutilizar `voice.py`, `assemble.py` y el motor Kokoro ya disponible. No instalar otra skill ni servicios de voz nuevos.
- Mantener el guion probado, pero sustituir la línea “Agenda VIP” por un beneficio actual de Pedidos/Contratos y regenerar exclusivamente la locución y los subtítulos necesarios. Si la sincronización exige reconstruir la pista final, reutilizar el modelo local, sin síntesis o descargas repetidas innecesarias.
- Priorizar la locución como pista conductora; la imagen debe terminar la acción antes de que la voz pase al siguiente tema. Textos en pantalla: título breve de módulo y subtítulos de máximo dos líneas, sin saturación de rótulos.
- Evitar que el título cambie mientras suena aún la explicación del módulo anterior. No cortar clips a mitad de una acción. El CTA debe ser el **último** capítulo, no intercalado.

## 7. Implementación con pocas iteraciones

1. Comprobar `git status --short`, rama, espacio libre, y leer **solo** V3 (`src/index.jsx`, `src/style.css`, `render.mjs`, `capture.mjs`, `timeline.json`, `script.json`, documentación y V2 donde resulte útil). No buscar de nuevo todo el repo.
2. Crear `brag-output-v4/` reutilizando assets y código sin copiar `node_modules` ni masters. Crear componentes separados `PhoneFull`, `FeatureSpotlight`, `FocusMotion`, `Chapter`, `Caption` y un único modelo de escenas. Corregir proporciones y geometría a nivel de diseño.
3. Sustituir el generador de secuencias de imágenes repetidas por renderización continua de Remotion o clips de UI reales. Minimizar paquetes nuevos.
4. Regenerar solo tomas nuevas/defectuosas: ticket con total visible, reportes con filtros y gráfica, PDF/Excel, caja, personal, pedidos y sedes. Validar viewport 390×844 **y una segunda medida móvil** como 360×800; ambos deben carecer de overflow horizontal de la app. No es necesario mostrar ambos tamaños en el anuncio.
5. Hacer **una preview completa** a 540×960 (o equivalente) con voz, y una tira visual de controles a inicio/medio/final de cada módulo. Revisar todas las transiciones y que ninguna funcionalidad se pierda por recorte. Corregir; luego realizar un único máster a 1080×1920.
6. Generar `master-voice-v4.mp4`, `master-clean-v4.mp4` (sin voz ni música, subtítulos conservados o explicar si se ofrece versión editable), `cover-v4.jpg`, `QA-V4.md`, `REVIEW-V4.md`, `SCRIPT-V4.md`, más fuentes editables y assets necesarios. Los videos/binarios quedan ignorados por Git.

## 8. Gates de aceptación — NO entregar “PASS” solo porque FFmpeg termina

- **Relación del teléfono:** viewport íntegro visible en Modo A, sin stretch y sin recorte oculto. Fórmula: `ancho/alto ≈ 390/844`. En Modo B, recorte explícito como detalle y acción completa en cuadro.
- **Legibilidad:** captura final de cada capítulo leída a tamaño de teléfono; tamaño de datos relevantes suficiente; sin encabezados, totales, filtros, campos o botones importantes recortados; evitar modales que superan contenedor.
- **Animación:** comprobar vídeo completo en movimiento, no solo stills. Transición antes/después, focalización y pausa de cada acción; la voz y el resultado deben coincidir.
- **Comercial:** solo módulos del flujo de navegación actual; cero “Agenda VIP” como funcionalidad disponible, cero ventas reales, cero promesas de PDF automático, 100 % offline o facturación electrónica sin evidencia.
- **Técnico:** resolución, fps, número de cuadros, audio, decodificación; sin congelaciones involuntarias, franjas negras o flashs; salida reproducible. QA técnico y QA visual son columnas independientes.
- **Privacidad:** fixture con mocks, bloqueo de red externa y funciones financieras deshabilitadas. Si falla el aislamiento, detener captura, no improvisar.
- **Control de cambios:** todo en rama local actual y `marketing/video-migapos/brag-output-v4/`. No `push`, `pull`, `fetch`, `clone`, `gh`, `commit`, `merge`, despliegues ni cambios en `frontend/`/Firebase. El propietario gestiona GitHub.

## 9. Entrega final de Codex

`REVIEW-V4.md` debe incluir: rama/HEAD local, árbol sucio, módulo y prueba de navegación, origen de cada captura, lista de defectos V3 corregidos, resultado de QA visual/motion/audio, rutas de MP4 y previews y limitaciones concretas. Resumen al usuario de máximo 15 líneas. Si el problema visual persiste, **no afirmar que el video está listo para vender**; entregar el mejor candidato y explicar las incidencias.
