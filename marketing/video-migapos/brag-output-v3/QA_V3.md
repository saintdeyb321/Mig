# QA · MigaPOS V3

Rama `marketing/video-promo-migapos`, HEAD local `4fe4549`. Ejecución del 10 de noviembre de 2026. C: tenía 8,78 GiB libres al inicio. D: tenía 540,31 GiB. Se reutilizaron Chrome, Remotion 4.0.542 y FFmpeg del proyecto audiovisual.

| Prueba | Estado | Evidencia |
|---|---|---|
| Captura y privacidad | PASS | Aserciones por capítulo en `capture.mjs`. Viewport de 390 × 844 y DPR 2 sin desbordamiento horizontal. Fixture Plan 09, CSP, proxy de bloqueo, Firebase sustituido, guardas de escritura y cero solicitudes externas. |
| Cobertura comercial | PASS | [Matriz](FEATURE_MATRIX_V3.md). Se comprobaron estados reales de componentes con respuestas sintéticas. En exportación se verificaron formatos y botones, sin enviar a impresión ni iniciar descargas. |
| Prueba de voz | PASS técnico | [Muestra de 9,43 s](voice-sample.wav). Kokoro `ef_dora`, `es-419`, CPU local, 24 kHz. El fonemizador produjo `mˈiɣa pˈos`, `ˈeksel` y `pˈe ðe ˈefe` para MigaPOS, Excel y PDF. La dicción y naturalidad quedan pendientes de escucha perceptual. |
| Derechos de la voz | PASS documental | Modelo y pack de voz de la distribución ONNX con licencia Apache-2.0. Binarios y modelos fuera de Git. [Ficha y licencia](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) |
| Duración y sincronía | PASS | 26 cues de máximo dos líneas, colocados por muestras PCM y ajustados a fotogramas. 66,731 s de frases y 105 s de pista con silencios. Capítulos contiguos, con pausas visuales entre tareas. |
| Preview con locución | PASS | 270 × 480, 105 s, 3150 cuadros decodificados. Luma mínima 28/255, −24,69 LUFS y −3,46 dBTP. Revisión de 12 fijos a 25 % de ancho. |
| Corrección visual | PASS | Tras la preview, el foco de la portada pasó al producto visible, el de Sucursales a la tarjeta correcta y el gráfico semanal a tres valores sintéticos. Se revisaron 12 fijos finales con guías editoriales a 270 px de ancho. |
| Máster narrado | PASS | 5.947.884 bytes, H.264 yuv420p BT.709, 1080 × 1920 a 30 fps. FFprobe dio 105,000 s para la pista de video y el contenedor. FFmpeg decodificó 3150 cuadros, con luma mínima 25/255 sobre el umbral negro de 16. |
| Audio final | PASS técnico | AAC mono a 24 kHz, −24,69 LUFS integrados y −3,46 dBTP. Voz y pausas como única fuente. La revisión auditiva de la dicción queda pendiente. |
| Máster limpio y portada | PASS | 5.055.790 bytes. FFprobe verificó una sola pista H.264 y 3150 cuadros. Portada extraída del primer fotograma. |
| Aprobación en dispositivo físico | PENDIENTE | La revisión se hizo a escala de teléfono simulada. Falta comprobar la superposición de controles de TikTok y Facebook en un teléfono físico. |

La codificación y la verificación finales tomaron 86,34 s de reloj. Chrome avisó que una pestaña ya estaba cerrada al limpiar la sesión. El comando terminó con código 0 y los dos archivos pasaron sus comprobaciones. La única fuente de audio del candidato es la locución. El máster limpio conserva los subtítulos quemados y elimina la pista de audio.

El original cuantizado mide 92.361.116 bytes y su SHA-256 es `FBAE9257E1E05FFC727E951EF9B9C98418E6D79F1C9B6B13BD59F5C9028A1478`. La voz `ef_dora.bin` mide 522.240 bytes y su SHA-256 es `F66EC66BD295ACB18372E37008533A9A3228483CCD294E7538D5D9294AC9A532`.
