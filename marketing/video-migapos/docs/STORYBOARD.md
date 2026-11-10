# Storyboard · MigaPOS 30 s

**Composición:** `MigaPOSPromo30` · vertical 9:16 · 1080 × 1920 · 30 fps · 900 frames. Rangos con inicio incluido y fin excluido.

**Concepto:** «Tu tienda, bajo control». El primer cuadro abre con el ticket y su total. La cámara recorre cuatro momentos de la jornada y termina en el logo con una sola llamada a la acción.

| Escena | Tiempo | Frames | Titular | Imagen y movimiento |
|---|---|---|---|---|
| Hook | 00:00–00:03 | 0–90 | Tu tienda, bajo control | Abrir en el POS con el ticket visible. Un acercamiento leve lleva la mirada al total mientras entra el titular. |
| POS | 00:03–00:08 | 90–240 | Prepara cada ticket | Desde el mismo encuadre, pasar de la fila del producto a su cantidad y al total actualizado. Mostrar solo la preparación del ticket. |
| Inventario | 00:08–00:13 | 240–390 | Consulta el stock por sede | Empatar la posición de la fila del ticket con una tarjeta de «Productos». Mantener visibles «Inventario de la Sede» y su indicador de disponibilidad. |
| Reportes | 00:13–00:18 | 390–540 | Revisa tus ventas por período | Encuadrar el período, «Tickets POS» y «Evolución de ventas». Sostener la gráfica para lectura. |
| Caja | 00:18–00:23 | 540–690 | Compara el efectivo al cierre | En «Revisa el conteo», pasar de la referencia al dinero contado. Conservar el estado que devuelve el fixture. |
| Montaje | 00:23–00:27 | 690–810 | Conoce MigaPOS | Tres recortes del ticket, inventario y reportes, uno a la vez, en los frames 690, 730 y 770. Anclar el titular para mantener la lectura. |
| CTA | 00:27–00:30 | 810–900 | Solicita una demostración | Logo oficial y halo nebular suave. Dejar el CTA visible durante los tres segundos. |

## Dirección visual

- Fondo azul noche `#15162F` como color del anuncio, con profundidad `#231638`, luz violeta `#8D58D8` y azul `#2D57D2` del tema local. Mantener los recortes de UI con sus superficies claras originales. Texto claro sobre fondo oscuro.
- Márgenes iniciales de 90 px a la izquierda, 180 px a la derecha, 180 px arriba y 350 px abajo para titulares, CTA y datos clave. Colocar los subtítulos dentro de esa caja, cerca de su borde inferior. Ajustar la zona en la prueba móvil. Titulares de 76–88 px y subtítulos de 46–50 px, hasta dos líneas.
- Mantener la UI legible con recortes de una tarea a la vez. Animar posición, escala y opacidad por frame con curvas suaves. Resolver los cambios dentro de los rangos de cada escena para conservar los 900 frames. Usar «Datos de demostración» en las capturas y «Recreación · datos de demostración» si se sustituye alguna.

## Primera revisión

Montar una composición con escenas independientes, textos y tiempos configurables. Usar un único fondo continuo y reservar la primera prueba para tres fijos: frame **36** (hook y ticket), **465** (período y gráfica) y **870** (logo y CTA). Revisar contraste, recorte, texto, rótulos y márgenes en formato móvil.

[Skill oficial de Remotion para escenas](https://github.com/remotion-dev/skills/blob/main/skills/remotion-markup/multi-scene-video.md)
