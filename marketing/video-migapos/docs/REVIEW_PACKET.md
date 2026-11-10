# Candidato final · MigaPOS

Rama local `marketing/video-promo-migapos` · HEAD `24df9df`. El plan de cierre estaba en `docs/` y se conservó. Los cambios de producción audiovisual están dentro de `marketing/video-migapos/`.

## Qué revisar

- Siete escenas Galaxy con movimiento por fotograma, transiciones suaves y foco ampliado para el total, el stock, el período y el arqueo. Caja conserva «Por revisar» y el carácter provisional.
- Cinco capturas auténticas del fixture aislado de Plan 09 con datos sintéticos. El máster requiere las cinco capturas y el logo original.
- Audio instrumental original generado por [score.mjs](../scripts/score.mjs), con fades y sin narración. [Registro de recursos](ASSETS-LICENSES.md).

## Entregables locales

| Archivo | Resultado |
|---|---|
| [Máster MP4](../out/migapos-promo-30s.mp4) | 5.701.417 bytes, H.264 yuv420p BT.709, 1080 × 1920, 30 fps, 900 frames, AAC estéreo |
| [Prueba de cinco segundos](../out/preview-5s.mp4) | H.264, 540 × 960, 30 fps. Decodificación completa aprobada |
| [Miniatura](../out/thumbnail.png) | 1080 × 1920, tomada del hook |
| [Copy para redes](COPY-REDES.md) | TikTok y Facebook Reels |
| [QA final](QA-FINAL.md) | Pruebas, evidencia y límites de revisión |

## Fotogramas de revisión

| Frame | Toma |
|---:|---|
| 36 | [Hook y ticket](../out/review/frame-036.png) |
| 315 | [Inventario](../out/review/frame-315.png) |
| 465 | [Reportes](../out/review/frame-465.png) |
| 615 | [Caja](../out/review/frame-615.png) |
| 870 | [Logo y CTA](../out/review/frame-870.png) |

`npm.cmd run check`, el preflight de capturas, la prueba corta y `npm.cmd run verify:final` pasaron. El máster decodificó los 900 fotogramas. Se inspeccionaron cinco encuadres a escala móvil simulada, doce muestras de corte y el primer y último fotograma codificados.

La aprobación, la comprobación en un teléfono con la interfaz real de cada red y la elegibilidad comercial de Remotion corresponden al propietario.

## V2 · Demostración móvil

- [Máster V2](../brag-output-v2/brag.mp4) de 21 s y 7.416.381 bytes. 1080 × 1920, H.264, 30 fps y AAC estéreo original. 630 fotogramas decodificados. El MP4 de la V1 conserva su SHA-256.
- [Portada](../brag-output-v2/brag.jpg), [preview](../brag-output-v2/preview.mp4), [copy](../brag-output-v2/share-copy.txt), [QA V2](../brag-output-v2/REVIEW_V2.md) e [instrucciones](../brag-output-v2/README.md).
- Brag aportó el flujo creativo. Remotion fue el motor local ante la ausencia de Hyperframes. El fixture móvil comprobó tres toques y dos desplazamientos del DOM con datos sintéticos.
