# Progreso · 10 de noviembre de 2026

**Rama local.** `marketing/video-promo-migapos` en `24df9df`. El plan de cierre estaba en `docs/PLAN-CIERRE-VIDEO-PROMOCIONAL-MIGAPOS.md` y se conservó. Se reutilizaron Remotion 4.0.542, Chrome local y FFmpeg 7.1.

**Montaje.** Siete escenas Galaxy de 900 frames, subtítulos más grandes, zoom por fotograma, transiciones atenuadas y valores destacados. Se reutilizaron los cinco PNG sintéticos del fixture Plan 09. El render exige capturas reales y decodificables. Caja conserva «Por revisar». Pista instrumental original generada localmente, sin voz.

**Entregables.** [MP4 candidato](../out/migapos-promo-30s.mp4) codificado y verificado. Pesa 5.701.417 bytes y contiene video H.264 BT.709 yuv420p de 30 s, 1080 × 1920 a 30 fps y audio AAC estéreo. Se decodificaron los 900 frames y se inspeccionaron gancho y CTA del archivo codificado. También están disponibles la [prueba de cinco segundos](../out/preview-5s.mp4), [miniatura](../out/thumbnail.png), cinco PNG, doce muestras de corte y [copy para TikTok y Facebook](COPY-REDES.md).

**Reanudar.** Consultar [QA-FINAL.md](QA-FINAL.md) y [REVIEW_PACKET.md](REVIEW_PACKET.md). El propietario revisa en su teléfono las zonas seguras reales, confirma elegibilidad comercial de Remotion y aprueba el candidato. Los comandos de reproducción están en [README.md](../README.md).

**V2 móvil.** [Máster Brag](../brag-output-v2/brag.mp4) independiente de la V1, 21 s, 1080 × 1920, 30 fps, 7.416.381 bytes. Flujo creativo de Brag con Remotion local. Tres toques sobre el POS real del fixture, dos desplazamientos del DOM móvil y música original. FFmpeg decodificó 630 fotogramas. [Portada](../brag-output-v2/brag.jpg), [QA](../brag-output-v2/REVIEW_V2.md) y [reproducción](../brag-output-v2/README.md). V1 conservada con el mismo SHA-256.
