# MigaPOS · Video promocional

`MigaPOSPromo30` es una composición vertical de 1080 × 1920 a 30 fps. El prototipo es silencioso y contiene las siete escenas y los subtítulos del guion aprobado.

```powershell
npm.cmd run check
npm.cmd run studio
```

Studio indica la dirección local en la consola. En una copia nueva, instalar primero con `npm.cmd ci --ignore-scripts --no-audit --no-fund` desde esta carpeta.

## Capturas y revisión

```powershell
$env:MIGAPOS_TEST_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:MIGAPOS_VIDEO_CHROME = $env:MIGAPOS_TEST_BROWSER
npm.cmd run capture
npm.cmd run review
```

La captura reutiliza la compilación CSS local de `frontend/dist` y el fixture de Plan 09. El harness usa un perfil temporal, loopback y un proxy que bloquea la salida del navegador. El script añade una política CSP y sustituye Firebase y las operaciones de venta. Solo interactúa con el carrito sintético. Se ajusta el espacio vacío del ticket y se omiten widgets ajenos a la toma de reportes dentro del navegador de pruebas.

Los cinco recortes se guardan en `public/assets/demo/`. Studio usa recreaciones rotuladas si faltan. El logo se copia del recurso local de marca y queda en `public/assets/brand/`. Los PNG de revisión se generan en `out/review/`. Git excluye capturas, salidas, cachés y dependencias.

Los límites de las escenas y los frames de revisión viven en `src/timeline.mjs`. Los subtítulos están en `src/captions.json`. El [paquete de revisión](docs/REVIEW_PACKET.md) documenta el resultado de esta iteración.
