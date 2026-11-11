# MigaPOS · V4 móvil

El proyecto usa Chrome local, CSS ya compilado en `frontend/dist` y Remotion/FFmpeg de la carpeta padre. Las grabaciones de 780 × 1688 vienen del fixture Plan 09 a 390 × 844 CSS y DPR 2. Los clics pasan por la navegación móvil del rol dueño. Para composición, Remotion renderiza el timeline completo a 30 fps. Los clips de las acciones se reproducen con `OffthreadVideo` y las pausas se montan con la captura del estado comprobado.

## Reproducción

Desde esta carpeta, con la caché de voz de V3 disponible. Si hay que recuperar los 25 fragmentos originales, copiar los `.npy` de `../brag-output-v3/.cache/lines/` y `voice-lengths.json` a las rutas homólogas en V4. El script de voz sintetiza únicamente la nueva frase de pedidos.

```powershell
$env:MIGAPOS_TEST_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node capture.mjs
python voice.py
python assemble.py
node render.mjs preview
node playback.mjs
.\contact.ps1 -Mode preview
node render.mjs final
.\contact.ps1 -Mode final
```

`script.json` contiene la locución editable, `assemble.py` los puntos de montaje y `src/` el teléfono, el acercamiento y los subtítulos. Los archivos `narration-v4.wav` y `subtitles-v4.srt` acompañan al máster. La edición limpia reutiliza la pista de video con sus subtítulos quemados.

El modelo Kokoro ONNX `ef_dora` se reutiliza de la caché de V3 en modo de lectura. La fonemización es `es-419` y la velocidad de síntesis es 1,0. La ficha del modelo declara Apache-2.0. [Modelo y licencia](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
