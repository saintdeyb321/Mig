# QA final · MigaPOS

Rama `marketing/video-promo-migapos`, HEAD local `24df9df`. Control realizado el 10 de noviembre de 2026. Directorio de ejecución `C:\Proyectos\MigaPOS\marketing\video-migapos`.

| Control | Resultado | Evidencia |
|---|---|---|
| Rama, espacio y dependencias | PASS | Rama esperada. El único archivo ajeno sin seguimiento al inicio era el plan de cierre en `docs/`. C: tenía 9,17 GiB libres y D: 540,31 GiB. Se reutilizaron Remotion 4.0.542, Chrome y FFmpeg 7.1. |
| Timeline y subtítulos | PASS | `npm.cmd run check` pasó 2 pruebas. Siete escenas contiguas, 900 frames, nueve cues y CTA en 810–899. |
| Cinco capturas y logo | PASS | FFprobe confirmó PNG y FFmpeg decodificó los seis archivos. Se reutilizaron los recortes del Plan 09. El preflight y la composición detienen un render que no pueda usar las capturas. |
| Privacidad y claims | PASS | Revisión de las capturas sintéticas de ticket, inventario, reportes y caja. Rótulo de demostración visible. Caja conserva «Por revisar» y «Cuadre provisional». Se trabajó con los recortes existentes. |
| Legibilidad móvil simulada | PASS | Inspección a 270 px de ancho. Titulares, subtítulos, cifras destacadas y CTA dentro de márgenes. La prueba con la interfaz real de las redes queda para el propietario. |
| Transiciones | PASS | Inspección de los doce PNG a escala 0,25 alrededor de los seis cortes. Se conservan el fondo continuo y la salida y entrada atenuadas. |
| Prueba corta | PASS | `node scripts/verify-video.mjs preview` decodificó 150 frames a 540 × 960 y 30 fps. H.264 4:2:0 de rango completo. AAC estéreo a 48 kHz, −19,7 LUFS y −9,2 dBTP. Duración del contenedor 5,013 s. |
| Fotogramas y miniatura | PASS | Cinco PNG y portada a 1080 × 1920. Doce muestras de corte a 270 × 480 en `out/review/cuts/`. |
| Render definitivo | PASS | Un render completo con Remotion. 184,6 s de reloj. [MP4 candidato](../out/migapos-promo-30s.mp4) de 5.701.417 bytes. |
| Metadatos y decodificación | PASS | `npm.cmd run verify:final` confirmó H.264, yuv420p, BT.709 de rango limitado, 1080 × 1920, 30 fps y 900 frames decodificados. Pista de video de 30,000 s y contenedor de 30,016 s. Luma mínima 37/255, por encima del umbral negro de 16. Se extrajeron e inspeccionaron el gancho inicial y el CTA final del MP4 codificado. |
| Audio del máster | PASS | AAC estéreo a 48 kHz. Medición FFmpeg de −19,96 LUFS y pico real de −7,37 dBTP. La fuente de 30 s empieza y termina con fundido. |

La pista se sintetiza en [score.mjs](../scripts/score.mjs) con osciladores, pulsos y acentos por escena. El candidato es instrumental. La aprobación del propietario, la revisión con los controles reales de TikTok y Facebook y la elegibilidad comercial de Remotion quedan pendientes.
