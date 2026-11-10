# Revisión 2 · Hito C · MigaPOS

Rama local `marketing/video-promo-migapos` · HEAD `5dfe311`. `git status --short` registra el plan local y dos MD del video modificados, el nuevo proyecto audiovisual y los dos MD preexistentes sin seguimiento en `docs/`. `GO-NO-GO-P15-PRODUCCION.md` se conservó.

## Entrega

- `src/` contiene la composición Remotion de siete escenas, la estética Galaxy y los subtítulos. `public/assets/brand/` contiene la copia idéntica del logo oficial.
- `scripts/`, `package.json` y `package-lock.json` reproducen la comprobación, captura, Studio y revisión. [README](../README.md) contiene los comandos.
- [PROGRESS.md](PROGRESS.md) y [ASSETS-LICENSES.md](ASSETS-LICENSES.md) registran el avance y la procedencia. Se actualizó la regla de rama en el [plan local](../../../docs/PLAN-VIDEO-PROMOCIONAL-MIGAPOS-CODEX.md).

## Evidencia y verificación

- Los cuatro beneficios usan recortes del fixture aislado de Plan 09. El carrito muestra los totales de dos cantidades. El inventario muestra existencias por sede. El reporte encuadra el período, «Tickets POS» y la gráfica. Caja compara los importes y conserva «Por revisar».
- `npm.cmd run check` aprobado. Verifica siete escenas, 900 frames, nueve subtítulos y los puntos de revisión.
- `npm.cmd run capture` aprobado. Cinco recortes sintéticos con Firebase simulado y red de salida bloqueada.
- `npm.cmd run studio` compiló la composición. `npm.cmd run review` generó los cinco PNG a 1080 × 1920 con Chrome local.
- La inspección visual detectó un desbordamiento inicial a la derecha. Se corrigió y se revisaron de nuevo los cinco encuadres reducidos.

## Fotogramas locales

| Frame | Imagen |
|---:|---|
| 36 | [Hook y ticket](../out/review/frame-036.png) |
| 315 | [Inventario](../out/review/frame-315.png) |
| 465 | [Reportes](../out/review/frame-465.png) |
| 615 | [Caja](../out/review/frame-615.png) |
| 870 | [Logo y CTA](../out/review/frame-870.png) |

El prototipo es silencioso. Quedan pendientes la revisión de movimiento y zonas seguras en un teléfono y la decisión de audio. El máster sigue pendiente.

**Siguiente paso.** Revisar juntos los cinco PNG a tamaño móvil y recorrer la composición en Studio.
