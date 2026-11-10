# MigaPOS móvil · V2

Desde esta carpeta, usar la instalación de Remotion del proyecto audiovisual padre y los binarios FFmpeg que incluye. La captura usa el CSS ya compilado en `frontend/dist`, Chrome instalado y el fixture Plan 09.

```powershell
$env:MIGAPOS_TEST_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:MIGAPOS_VIDEO_CHROME = $env:MIGAPOS_TEST_BROWSER
node capture.mjs
node render.mjs preview
# Revisar preview.mp4 antes de renderizar a resolución completa.
node render.mjs final
```

`capture.mjs` genera las tres tomas de navegador y las coordenadas de los toques. El fixture usa CSP, un proxy de denegación, un perfil temporal, Firebase simulado y guardas de escritura. La captura falla si un control no se puede tocar, el total difiere o aparece una solicitud externa. Los desplazamientos se muestrean sobre el DOM real del fixture.

`render.mjs` valida las tomas, sintetiza la pista, ejecuta Remotion y comprueba los MP4 con FFmpeg y FFprobe. La preview es de 270 × 480. El máster incluye `brag.jpg` y seis fotogramas en `review/`. La portada corresponde al fotograma inicial.

La copia completa de Brag está en `C:\Proyectos\MigaPOS\.agents\skills\brag-main\skills\brag`. Si se necesita la ruta canónica, el propietario puede copiarla completa con PowerShell, incluyendo sus referencias y assets.

```powershell
Copy-Item -LiteralPath 'C:\Proyectos\MigaPOS\.agents\skills\brag-main\skills\brag' -Destination 'C:\Proyectos\MigaPOS\.agents\skills\brag' -Recurse
```
