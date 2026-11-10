# MigaPOS — Plan V3: video comercial explicado, móvil y narrado

**Fecha:** 2026-11-10  
**Workspace:** `C:\Proyectos\MigaPOS`  
**Rama local objetivo:** `marketing/video-promo-migapos` (no crear, borrar ni cambiar de rama)  
**Último commit observado en GitHub:** `4fe454956b3233a4c2470c9e760483ec2118ab1f` (verificar HEAD LOCAL antes de trabajar; lo local es la fuente de verdad)  
**Documento operativo:** `marketing/video-migapos/docs/PLAN-MIGAPOS-V3-MARKETING-VOZ-Y-ATENCION.md`  
**Salida V3 aislada:** `marketing/video-migapos/brag-output-v3/`  
**Objetivo principal:** explicar visualmente las funciones comerciales importantes con una voz española clara y un foco visual estable. Conserva V1 y V2 sin modificaciones.

## 1. Evidencia: auditoría del MP4 que proporcionó el propietario

Archivo analizado `brag.mp4`, duración de contenedor **21.013 s**; video H.264 **1080×1920, 30 fps, 630 cuadros** y audio AAC. No se aprecia locución; la V2 tiene una pista instrumental sintetizada localmente, según `brag-output-v2/REVIEW_V2.md` y `src/index.jsx`.

| Segundos | V2 muestra | Deficiencia comercial |
|---|---|---|
| 0–2.57 | Hook, teléfono con POS | No identifica rápidamente al dueño del negocio ni un dolor específico |
| 2.57–8 | Ticket y total | Una sola función consume más de un cuarto del video |
| 8–12 | Stock por sede | Pasa rápido, se aprecia más la animación que el beneficio |
| 12–16.5 | Reportes | Desplaza mucho contenido sin explicar filtros ni lectura de datos |
| 16.5–18.5 | Repetición del ticket | Repetición que quita tiempo a otras funciones |
| 18.5–21 | Cierre de marca | CTA breve, sin explicación hablada |

**Diagnóstico de atención:** la interfaz móvil animada, los títulos arriba y las cifras/etiquetas abajo compiten por la visión. No es solo una cuestión de palabras por segundo: hay que mirar en diferentes puntos antes de comprender qué cambió. Música, cambios de ángulo y desplazamiento aceleran la sensación de fugacidad. El video actual se parece a un anuncio de lanzamiento de producto, pero el objetivo de esta V3 es una **demostración de ventas para propietarios de tiendas, panaderías y pastelerías**.

**Conservar:** identidad Galaxy morado/azul, teléfono, gestos y captura del fixture aislado, logo, cámara y la calidad de animación conseguida. **Cambiar:** relato, encuadres, duración, fijación de atención, cobertura funcional, guion hablado y audio final sin música para permitir que el propietario la agregue en edición.

## 2. Investigación que cambia el diseño

- Mayer y Moreno describen el **efecto de modalidad** en aprendizaje multimedia: narración sobre animación puede reducir la carga del canal visual frente a explicar todo mediante texto en pantalla. No es una promesa de rendimiento publicitario ni una regla universal. Referencia: https://cmapspublic2.ihmc.us/rid%3D1KXP7KR7M-8N27KG-1FNL/mayer_moreno_2003.pdf
- Nielsen Norman Group: el movimiento periférico atrae la mirada y puede interferir con la tarea visual principal; animar para señalar **un cambio significativo**, no como decoración constante. Referencias: https://www.nngroup.com/articles/animation-usability/ y https://www.nngroup.com/articles/animation-purpose-ux/
- TikTok recomienda captar la atención en los primeros segundos, mantener texto legible dentro de zonas seguras y usar voz para explicar beneficios. Suelen funcionar mejor anuncios mucho más breves; **el recorrido V3 completo será una pieza orgánica/demostrativa**, de la cual convendrá extraer después una versión corta para publicidad pagada. Referencias: https://ads.tiktok.com/business/en/guides/video-advertising-guide y https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads-reach-frequency

### Reglas prácticas de foco (heurísticas editoriales, no leyes neurológicas)

1. **Un objetivo visual por instante.** En cada escena, primero orientar (aprox. 1 s), después mostrar una acción (aprox. 1–2 s) y mantener el resultado estable y legible (preferiblemente >= 3 s, ajustado por complejidad).
2. El titular es **una etiqueta breve de 2–5 palabras**, situada junto al elemento relevante o en un único anclaje constante. No simultanear grandes títulos arriba, cifras abajo, subtítulos en movimiento y scroll del teléfono.
3. La **voz explica el beneficio**, la pantalla muestra **la evidencia**, el subtítulo refleja el audio de manera accesible. No tres mensajes distintos a la vez.
4. Mantener el teléfono casi fijo durante la lectura; hacer zoom **al control que se toca o al resultado**. Movimientos suaves de cámara solo para cambiar de tarea; menos tilt/rotación mientras se lee.
5. Subtítulos siempre en la misma zona segura, máximo dos líneas y fragmentados por pausas reales, sin tapar el control, total o gráfico. Probar con guías de TikTok y Facebook sobre el video final.
6. Evitar desplazamientos de 1300 px continuos: navegar a la función, mostrar el filtro, seleccionarlo y **detenerse** para que se comprenda. Por escena, preferir un cambio probado de estado.
7. Al renderizar para lectura, hacer prueba en un móvil real o a tamaño físico equivalente y pausar en muestras de cada capítulo. Una miniatura de escritorio no aprueba legibilidad.

## 3. Alcance: los módulos reales que hay que enseñar

**Comprobados en la rama publicada a nivel de código**, no todos con prueba visual aislada: `frontend/src/App.jsx`, `BottomNav.jsx`, `modules/POS.jsx`, `ProductCatalog.jsx`, `CategoryManager.jsx`, `BranchManager.jsx`, `modules/contracts/ContractManager.jsx`, `SalesHistory.jsx`, `Reports.jsx`, `ExportSales.jsx`, `CashRegisterModals.jsx`, `UserManagement.jsx`, `AgendaManager.jsx` y `Settings.jsx`.

| Área comercial / módulo | Demostración visible requerida | Afirmación permitida, con matiz |
|---|---|---|
| POS + ticket | Buscar producto, añadirlo, cambiar cantidad, total antes del cobro | «Prepara el ticket y revisa el total» (NO simular cobro real) |
| Productos y categorías | Buscar producto; navegar entre categorías; mostrar existencias | «Organiza tu catálogo» |
| Sedes e inventario | Cambiar sede de demostración; mostrar stock distinto por sede si fixture lo sustenta | «Consulta existencias por sede»; no afirmar sucursales ilimitadas |
| Pedidos / contratos | Mostrar vista de pedidos y filtro por activos/deudas/historial; estado demo | «Da seguimiento a tus pedidos» |
| Agenda VIP/clientes | Buscar cliente ficticio, vista de contactos | «Consulta tus clientes frecuentes» |
| Historial POS | Lista de tickets ficticios con fecha/estado | «Revisa tus ventas anteriores» |
| Reportes | Seleccionar filtros Hoy/Semana/Mes/Año; mostrar tarjeta de tickets y gráfico | «Consulta resultados por período» |
| Exportación | Elegir `Informe visual (PDF)` y `Detalle Excel` en `ExportSales.jsx` | PDF **se prepara para impresión / Guardar como PDF en navegador**, Excel **descarga `.xlsx`**; no llamar a ambos descarga directa |
| Caja | Ver referencia esperada, contado y resultado | «Compara montos al cierre»; si sale «Por revisar» conservarlo, no asegurar conciliación |
| Personal | Lista empleados demo, rol, sede asignada, turnos | «Administra accesos y turnos»; solo rol dueño demo |
| Configuración | Datos comerciales, pestaña Sucursales, preferencias | «Configura los datos del negocio»; no hablar de facturación SUNAT automática |

**No promocionar `SuperAdmin` como función del cliente.** Los respaldos, licencias u opciones por plan, si existen, solo se muestran previa evidencia real y relevancia comercial. Si una pantalla nueva no puede demostrarse con el fixture aislado y datos sintéticos, preparar **representación fiel etiquetada «Recreación con datos de demostración»**, no inventar UI ni funcionalidad. Queda prohibido abrir Firebase de producción, efectuar cobros, gestionar empleados reales, imprimir con datos personales o ejecutar escrituras.

## 4. Formato y duración: explicar primero, captar después

**Máster V3 propuesto:** **105 segundos exactos** (3150 frames a 30 fps), vertical 1080×1920, H.264, **voz en español sin música**. Es un recorrido informativo para uso orgánico y envío a clientes interesados. No forzar este recorrido a los 15–25 s del workflow estándar `/brag`: su propio `SKILL.md` establece esa ventana y, con `--voice`, también limita el guion. Para esta V3 usar Brag **como guía de guion, movimiento y delivery**, y usar el **Remotion local** ya instalado como motor de composición. No reinstalar ni exigir Hyperframes (`ENOTCACHED` previamente).

**Versión comercial corta opcional:** recorte de 30–40 s con cuatro beneficios para campañas de alcance, derivado del máster y *solo después* de aprobar la V3 completa. No intentar comprimir todos los módulos en ese corte.

### Storyboard con narración base (105 s)

Las frases son un **borrador narrativo**, no una grabación validada. Codex debe ajustar silencios tras medir los audios generados, sin acelerar artificialmente la voz ni cortar palabras. Cada escena termina con una pequeña pausa visual; los tiempos pueden redistribuirse manteniendo ~105 s si la voz lo exige.

| Segmento | Tiempo | Foco único y acción | Diálogo tentativo |
|---|---|---|---|
| 1. Hook | 0–5 | Teléfono en POS, una operación visible | «¿Tu tienda necesita más control? Conoce MigaPOS.» |
| 2. POS | 5–15 | Añadir producto → cambiar cantidad → total estable | «Empieza en el punto de venta: busca productos, prepara el ticket, ajusta cantidades y revisa el total antes de cobrar.» |
| 3. Catálogo | 15–24 | Categoría → búsqueda → producto concreto | «Organiza tus productos por categorías y consulta las existencias de cada artículo.» |
| 4. Sedes | 24–33 | Selector de sede y cambio a stock de una sede demo | «Si tienes varios locales, cambia de sede y revisa el inventario que corresponde a cada una.» |
| 5. Pedidos + clientes | 33–44 | Pedidos, estados y agenda VIP demostrativos | «También puedes registrar pedidos, revisar sus estados y consultar la agenda de tus clientes frecuentes.» |
| 6. Historial | 44–52 | Un ticket anterior abierto desde historial | «El historial te permite encontrar ventas anteriores y revisar los tickets registrados.» |
| 7. Reportes | 52–64 | Mostrar Hoy → Semana → Mes; parar en gráfico / métrica | «En los reportes, cambia entre hoy, semana, mes o año. Observa los tickets, ingresos y la evolución de las ventas.» |
| 8. PDF / Excel | 64–74 | Selector PDF → Excel y botón correspondiente | «Cuando necesites compartir información, prepara un informe en PDF o descarga el detalle de movimientos en Excel.» |
| 9. Caja | 74–83 | Referencia, declarado y aviso de comparación | «Para el cierre, compara el dinero contado con la referencia de caja. Los ajustes pendientes quedan señalados.» |
| 10. Personal | 83–92 | Empleado demo, rol, sede y turno | «En Personal, administra empleados, define sus accesos, sedes asignadas y horarios de trabajo.» |
| 11. Configuración | 92–98 | Datos del negocio y acceso a sucursales | «Y desde Configuración, gestiona los datos de tu negocio.» |
| 12. CTA | 98–105 | Logo, teléfono estable, CTA de lectura clara | «MigaPOS, más organización para tu jornada. Solicita una demostración.» |

**Ajustes de guion recomendados:** sustituir el lenguaje genérico por beneficios concretos cuando la prueba visual lo permita; mantener tono peruano/latino profesional, cercano y natural, sin exageraciones. El logo puede estar siempre discretamente presente, sin requerir desplazamiento ocular.

## 5. Herramientas de voz: decisión realista

### Opción A — Libre/local, primera prueba: Kokoro TTS en español

- Brag tiene una opción `--voice` que invoca **Kokoro vía Hyperframes**, pero la vía estándar dura 15–25 s y Hyperframes no estaba disponible en V2. **No invocar `/brag --voice` esperando obtener el video completo**.
- Kokoro original y una versión ONNX distribuida bajo Apache-2.0 permiten estudiar una instalación **local aislada**; voces documentadas para español: `ef_dora`, `em_alex`, `em_santa`. Fuente: https://developers.google.com/edge/mediapipe/solutions/audio/text_to_speech/index y https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- Ruta posible: Python `kokoro` con `KPipeline(lang_code='e')` y eSpeak NG disponible; antes de instalar comprobar entorno/uso de disco. Otra vía es `kokoro-js`, **pero verificar compatibilidad real con español** y no asumirla por la lista general de voces. Referencia: https://github.com/hexgrad/kokoro/blob/main/kokoro.js/README.md
- Generar **solo una prueba de 8–12 s** con vocabulario: «MigaPOS, pedidos, caja, inventario por sede, Excel». Revisar pronunciación, naturalidad, acento y derechos de los componentes descargados. Si no suena bien, no producir 105 s con una voz robótica; reportar el bloqueo y pasar a B.

### Opción B — Naturalidad premium: skill oficial ElevenLabs `text-to-speech`

- Skill oficial: https://github.com/elevenlabs/skills (también plugin https://github.com/elevenlabs/plugin para Codex); generación de locución en español con voz seleccionada para Latinoamérica. Requiere internet y **API key** o conectar su servicio. No almacenar claves en Git, vídeos ni logs.
- Importante: **los derechos comerciales de ElevenLabs requieren plan de pago según su documentación de precios**; no utilizar audio del plan gratuito como anuncio comercial. Fuentes: https://elevenlabs.io/pricing y https://elevenlabs.io/docs/overview/administration/billing
- La cuenta, las credenciales, cualquier costo y su activación deben ser autorizados por el propietario. **Codex no debe contratar servicios ni instalar/configurar credenciales por su cuenta.** Si el propietario aporta WAV/MP3 autorizado, integrarlo sin depender del API.

### Mezcla y sincronía

- El usuario **añadirá la música manualmente**: **NO incluir la pista sintética anterior ni música nueva en el MP4 de la V3**. Exportar `master-voice.mp4` (voz + video, opcional SFX sutiles bajo voz) y `narration.wav` por separado. También `master-clean.mp4` SIN música ni narración, para edición si fuera necesario, y `subtitles.srt`.
- Generar locución **por segmento** (12 clips) o por frases con metadatos, medir duración efectiva con FFprobe y construir el timeline *a partir del audio real*. No comprimir ni acelerar la voz para obligarla a encajar en tiempos arbitrarios. Permitir pausas naturales (idealmente 0.3–0.7 s entre ideas) y ajustar duración del montaje tras escuchar. Si el audio total exige 110–115 s para sonar bien, priorizar comprensión y documentarlo.
- Subtítulos quemados opcionales y SRT; solo mostrar texto relevante en pantalla. Tratar siglas y palabras «MigaPOS», «Yape/Plin», «Excel», «PDF» con pronunciación revisada.
- Verificar sincronía por escenas: al hablar de un botón, el botón está visible; el resultado aparece antes de que termine la frase; ningún cambio de módulo a mitad de oración.

## 6. Instrucciones de implementación para Codex

1. Confirmar `git branch --show-current`, `git rev-parse --short HEAD`, `git status --short`, espacio libre. No usar operaciones Git remotas; el propietario publicará los commits.
2. Abrir solo `brag-output-v2/src/index.jsx`, `timeline.mjs`, `capture.mjs`, `render.mjs`, `REVIEW_V2.md`, `frontend/src/App.jsx` y los módulos relevantes mencionados en la tabla. **No repetir auditoría general** ni instalar Remotion.
3. Crear `marketing/video-migapos/brag-output-v3/` con código propio, reusar utilidades que no alteren V2. Prohibido sobrescribir `brag-output-v2`, V1, el frontend, Firebase, reglas e índices.
4. Extender **fixture aislado de Plan 09** para mostrar rutas de POS, productos/categorías, sedes, pedidos, Agenda VIP, historial, reportes, export, caja, usuarios y ajustes con datos sintéticos. Reusar navegador/proxy/CSP/mocks; fallar si aparece acceso externo. Verificar cada acción visible; si hay UI muy estrecha, hacer un recorte de enfoque fiel dentro de la composición.
5. Preparar `FEATURE_MATRIX_V3.md`: **pantalla, evidencia/ruta, rol, captura demo sí/no, claim permitido, limitación**. No simular condiciones exitosas ni permisos no comprobados. Recordar `PDF` vía diálogo de impresión y `Excel` como descarga.
6. Producir `SCRIPT_V3.md` y `timeline.json` por escenas. **Primero generar audio de prueba** y comprobar naturalidad (local Kokoro si viable, o audio provisto). Si no hay voz aprobable, seguir con video y guion, pero **no llamar “máster narrado final” a una salida sin narración**.
7. Construir con Remotion ya instalado: teléfono móvil real con clips de demo aislada, overlays fijos breves, ralentizar desplazamientos, enfatizar controles y resultados; retener en pantalla 3–4 s los resultados complejos. Usar una sola línea narrativa por escena.
8. Renderizar 12 stills (uno por escena) y una preview de resolución reducida con audio. Analizar a tamaño de móvil, corregir legibilidad / CTA / superposición de controles de TikTok. **Una previsualización para QA y una versión final después de corregir**. No entrar en un ciclo indefinido de renders.
9. Exportar `master-voice.mp4`, `master-clean.mp4`, `narration.wav`, `subtitles.srt`, `cover.jpg`, `COPY-REDES.md` y `QA_V3.md` bajo `brag-output-v3/`. En caso de no tener voz autorizada, entregar previsualización, script y guía de integración, y marcar explícitamente la narración pendiente.
10. Reportar a propietario un paquete de revisión con rutas Windows, resultados reales de pruebas, duración/pistas reales, derechos/comprobación de licencias, faltantes y cómo abrir el MP4. Mantener el `.gitignore` para no subir modelos, voz con restricciones, renders, capturas o tokens.

## 7. Aceptación visual/comercial — NO entregar por solo compilar

- [ ] Cada uno de los 12 capítulos muestra claramente la funcionalidad indicada; no usar pantallas de relleno.
- [ ] Se entienden los cambios de cantidad, filtro, sede, formato y roles **sin tener que pausar**; sin texto importante simultáneo en zonas opuestas.
- [ ] Voz en español natural, sin errores de pronunciación, más pausas que la V2, sin corte de oraciones; subtítulos sincronizados.
- [ ] Se muestra explícitamente la selección de período de reportes y los dos formatos de exportación con su diferencia real.
- [ ] Gestión de empleados y accesos, historial, pedidos y sedes aparecen con el rol y los datos demo correctos.
- [ ] Caja conserva advertencias de conciliación; los ejemplos están marcados como demostración.
- [ ] El usuario añade música después; el máster no lleva música integrada.
- [ ] Revisión con guía de controles de redes, sin cortar CTAs ni subtítulos; no hay fuga de datos reales.
- [ ] FFprobe confirma tamaño, duración, códecs y audio; FFmpeg decodifica sin errores; el archivo se reproduce en un móvil.
- [ ] V1/V2 intactos y sin operaciones remotas ni deploy.

**Decisión editorial:** no intentar mostrar todas las funciones en el corto de 21 segundos. Un video que explica todo y otro corto para captar leads pueden convivir. Éste es el video demostrativo completo; un corte corto vendrá después si el propietario lo aprueba.
