# MigaPOS · Video promocional

`MigaPOSPromo30` es una composición vertical de 1080 × 1920 a 30 fps. Contiene siete escenas, subtítulos y una pista instrumental sintetizada localmente.

```powershell
npm.cmd run check
npm.cmd run studio
```

Studio indica la dirección local en la consola. Los comandos de cierre usan Remotion, Chrome y los binarios FFmpeg incluidos en la instalación local.

## Capturas y revisión

```powershell
$env:MIGAPOS_TEST_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:MIGAPOS_VIDEO_CHROME = $env:MIGAPOS_TEST_BROWSER
npm.cmd run capture
```

Regenerar las capturas únicamente cuando hagan falta. El capturador reutiliza la compilación CSS local de `frontend/dist` y el fixture de Plan 09. El harness usa un perfil temporal, loopback y un proxy que bloquea la salida del navegador. El script añade una política CSP y sustituye Firebase y las operaciones de venta. Solo interactúa con el carrito sintético. Se ajusta el espacio vacío del ticket y se omiten widgets ajenos a la toma de reportes dentro del navegador de pruebas.

Los cinco recortes se guardan en `public/assets/demo/`. Studio usa recreaciones rotuladas si faltan. Los renders exigen capturas reales y decodificables. El logo original queda en `public/assets/brand/`.

## Candidato final

```powershell
npm.cmd run check
npm.cmd run check:assets
npm.cmd run review
node scripts/verify-video.mjs preview
# Inspeccionar la prueba y los cortes antes de codificar el máster
npm.cmd run render:final
npm.cmd run verify:final
```

`review` genera `out/preview-5s.mp4`, cinco PNG, 12 muestras de corte y `out/thumbnail.png`. `render:final` genera `out/migapos-promo-30s.mp4`. Ambos generan la pista WAV con `scripts/score.mjs`. Git excluye capturas, WAV generado, salidas, cachés y dependencias.

Los límites de las escenas y los frames de revisión viven en `src/timeline.mjs`. Los subtítulos están en `src/captions.json`. El [paquete de revisión](docs/REVIEW_PACKET.md) documenta el resultado de esta iteración.
