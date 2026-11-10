# Prompt de inicio para Codex — Video promocional MigaPOS V3

Actúa como **director creativo publicitario**, **especialista en atención visual y narración comercial**, **motion designer** y **desarrollador senior de React/Remotion**.

**Proyecto local:** `C:\Proyectos\MigaPOS`  
**Rama existente:** `marketing/video-promo-migapos`  
**Plan obligatorio:** `marketing/video-migapos/docs/PLAN-MIGAPOS-V3-MARKETING-VOZ-Y-ATENCION.md`

He visto la V2 completa. Mejoró la animación, pero **no vende ni explica bien MigaPOS**: dura 21 segundos, distrae la mirada entre títulos y móvil y omite módulos clave. **No quiero otra versión acelerada con títulos que desaparecen**. Debe enseñar, con tiempo para entender, las funciones relevantes para propietarios de tiendas, panaderías y pastelerías.

**LEE EL PLAN V3 Y EJECÚTALO COMPLETO.** No hagas una auditoría general ni reescribas otro plan. Reutiliza los materiales de `brag-output-v2/`, la skill Brag ya presente como referencia editorial y el Remotion ya instalado como motor audiovisual. La Brag estándar exige videos de 15–25 s; **no fuerces esa limitación** en la demostración larga y no dependas de Hyperframes ausente.

**Meta:** producir la nueva V3 en carpeta independiente `marketing/video-migapos/brag-output-v3/`, aproximadamente **105 segundos**, 1080×1920 a 30 fps, con **locución española natural y sincronizada**, demostraciones móviles reales desde fixture aislado y subtítulos. No incluir música: el propietario pondrá su pista en edición manual.

**Requisitos obligatorios:**

- Un único foco visual por instante. Mantén estable el teléfono mientras se explica una acción; enfoca un botón, filtro o resultado, sin animaciones que obliguen a mirar tres lugares a la vez. Titulares breves, subtítulos fijos y pausas para observar.
- Cubrir POS/ticket, productos y categorías, inventario y sucursales, pedidos/contratos, agenda de clientes, historial de ventas, reportes con filtros Hoy/Semana/Mes/Año, las opciones PDF y Excel, caja, gestión de empleados con roles/turnos y configuración. Demostrar **acciones y resultados** verificables, no solamente nombres de módulos.
- Mostrar los controles de exportación correctos: **PDF se prepara para imprimir/guardar como PDF desde el navegador y Excel descarga el archivo**. No inventar facturación SUNAT, cierre de caja certificado, sedes ilimitadas ni prestaciones de planes que no estén probadas.
- Capturar todo con datos ficticios y las mismas barreras del fixture Plan 09 (Firebase simulado, proxy/CSP, navegación aislada). Nunca tocar producción ni usar cuentas/clientes reales.
- Crear y sincronizar el diálogo comercial por escenas a partir de `SCRIPT_V3.md`, usando las frases base del plan. Primero probar **una frase de 8–12 segundos** con voz natural; preferir Kokoro local en español si el equipo lo permite y resulta natural. Como alternativa, usar solo audio que yo proporcione con licencia o solicitar mi autorización antes de usar ElevenLabs/servicios de pago. No instales modelos pesados sin medir disco. No uses voz extranjera que pronuncie mal el español. **No uses la pista musical de V2.**
- Ajustar tiempos a la duración real de la locución; no acelerar voz ni hacer cambios de módulo a mitad de frase. Crear `narration.wav` y `subtitles.srt`; producir `master-voice.mp4` (sin música) y `master-clean.mp4` para edición, más miniatura y copia de publicación.
- Realizar QA: still por capítulo, preview a resolución reducida **con locución**, verificación en tamaño móvil, safe zones de TikTok y Facebook, una corrección final y render 1080p. No declarar el video listo si falta la voz autorizada o la prueba de legibilidad.

**Protecciones:** No modificar V1 ni V2, ni `frontend/`, `functions/`, Firebase, reglas, índices, datos reales o entornos productivos. No crear ramas, commits, `push`, `pull`, `fetch`, `clone`, `gh`, `merge`, `reset`, `deploy` ni autenticación GitHub. No introducir claves en el repositorio ni ejecutar compras o suscripciones.

**Consumo de tokens:** lee solo las fuentes indicadas en el plan y los módulos necesarios. Reutiliza captura, navegador, dependencias y código comprobado. No volver a instalar Remotion ni lanzar docenas de renders experimentales.

**Al finalizar:** crea/actualiza `FEATURE_MATRIX_V3.md`, `SCRIPT_V3.md`, `QA_V3.md` y `REVIEW_V3.md` con pruebas, rutas locales, voz usada, duraciones, licencias, carencias reales y pasos de reproducción. Entrega el MP4 si es posible; si surge un bloqueo externo para la voz, avanza con todo el resto sin fingir que está finalizado y explica qué acción mínima depende del propietario.

**Trabaja de manera autónoma en las tareas seguras hasta terminar una versión completa para revisión. Responde en español, con un resumen conciso de entregables y bloqueos.**
