# Revisión · MigaPOS V2

Rama `marketing/video-promo-migapos`, HEAD local `24df9df`. La V2 se mantiene en esta carpeta. Brag aportó la rúbrica, el storyboard, el brief y la entrega. Remotion fue el motor de composición. El diagnóstico local de Hyperframes devolvió `ENOTCACHED`.

| Control | Evidencia |
|---|---|
| Móvil real | Fixture Plan 09 renderizado en Chrome a 390 × 844 CSS px y DPR 2, sin desbordamiento horizontal. Tres tomas de pantalla completa a 780 × 1688. |
| Acciones | Tres toques CDP registrados en los controles reales. Añadir Pan artesanal, abrir el drawer y aumentar a dos unidades. Las aserciones confirmaron S/ 5.00 y S/ 10.00. |
| Desplazamiento | 360 px en inventario y 1.339 px en reportes, muestreados en el DOM real. Chrome no ejecutó esos gestos como desplazamientos nativos en modo headless. Se reprodujo el movimiento del scroller por fotograma y se verificaron disponibilidad y gráfica. |
| Aislamiento | Perfil temporal, CSP, proxy de bloqueo, mocks de Firebase y funciones de venta que rechazan escrituras. La captura comprobó cero solicitudes externas. Los datos y el rótulo son demostrativos. |
| Sonido | Pista original generada con osciladores, sin samples ni narración. Los acentos se sincronizan con el registro de toques y los desplazamientos. |
| Preview | [270 × 480](preview.mp4). Los 630 fotogramas decodificaron completos. Se inspeccionaron seis momentos al 25 % de escala. Audio de −18,54 LUFS y −7,55 dBTP. |
| V1 | SHA-256 del máster sin cambios. La composición y los recursos V2 se mantienen separados. |
| Máster | [brag.mp4](brag.mp4), 7.416.381 bytes. H.264 yuv420p, 1080 × 1920 a 30 fps, 630 fotogramas, pista de video de 21,000 s y contenedor de 21,013 s. Render y verificación en 112,6 s de reloj. |
| Reproducción | FFmpeg decodificó los 630 fotogramas. Luma mínima 36/255, sobre el umbral negro de 16. Inspección de los seis fijos codificados al 25 % de escala. |
| Mezcla final | AAC estéreo a 48 kHz, −18,54 LUFS integrados y −7,55 dBTP. |
| Portada | [brag.jpg](brag.jpg), 1080 × 1920, extraída del primer fotograma del máster. |

El [README](README.md) reproduce captura, preview y máster, y documenta cómo copiar la skill a la ruta canónica sin autenticación. [Storyboard](brag-plan.md), [brief](composition-brief.md) y [copy para redes](share-copy.txt).

Fotogramas del máster [0](review/frame-000.png), [54](review/frame-054.png), [157](review/frame-157.png), [318](review/frame-318.png), [454](review/frame-454.png) y [612](review/frame-612.png). La revisión a escala de teléfono se hizo sobre la imagen codificada. La reproducción en un teléfono físico y la superposición de controles de cada red quedan para la aprobación del propietario.
