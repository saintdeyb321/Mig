# MigaPOS · Recorrido móvil V3

El proyecto es independiente de V1 y V2. Reutiliza Remotion y FFmpeg del proyecto padre y el patrón de captura de V2. Brag se usó como referencia editorial para el recorrido, la jerarquía visual y la entrega.

## Reproducir

Ejecutar desde esta carpeta. Chrome local y `frontend/dist` ya compilado son requisitos de captura.

```powershell
$env:MIGAPOS_TEST_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
python voice.py sample
node capture.mjs
python voice.py
python assemble.py
node render.mjs preview
node render.mjs final
```

`voice.py sample` escribe la prueba de pronunciación. `voice.py` genera las frases sin cambiar su velocidad. `assemble.py` ubica cada frase por muestras PCM y genera `timeline.json`, `narration.wav` y `subtitles.srt`. El WAV contiene voz y silencios editoriales. `render.mjs` usa Remotion para los encuadres y sus transiciones, y FFmpeg para extender las pausas visuales y verificar el archivo a 30 fps. El máster limpio reutiliza los píxeles y subtítulos quemados, sin pista de audio.

El capturador comprueba el viewport móvil, bloquea accesos externos y limita las acciones al fixture. La copia ampliada del fixture vive en `.cache`; producción y las pruebas originales se leen sin modificarse.

## Motor de voz local

Si hay que reconstruir la caché, descargar el modelo cuantizado y la voz pública `ef_dora`. Las dependencias se instalan en la caché de V3.

```powershell
New-Item -ItemType Directory -Path .cache/model -Force | Out-Null
python -m pip install --no-cache-dir --only-binary=:all: --target .cache/voice-deps kokoro-onnx==0.6.1
$modelBase = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main'
curl.exe --fail --location "$modelBase/onnx/model_quantized.onnx?download=true" -o .cache/model/kokoro.onnx
curl.exe --fail --location "$modelBase/voices/ef_dora.bin?download=true" -o .cache/model/ef_dora.bin
```

Se usa Kokoro v1.0 ONNX y eSpeak NG con fonemas `es-419`. El modelo y el conjunto de voces se distribuyen bajo Apache-2.0 según la ficha. La inferencia es local y los binarios quedan fuera de la entrega. [Modelo y licencia](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) · [Kokoro ONNX en PyPI](https://pypi.org/project/kokoro-onnx/0.6.1/)
