# Registro de recursos y licencias

| Recurso | Procedencia y uso | Estado |
|---|---|---|
| Logo MigaPOS | [Configuración de marca](../../../frontend/src/config/brand.js). [Logo_MP.png](../../../frontend/public/img/Logo_MP.png) es el original. | [Copia audiovisual](../public/assets/brand/Logo_MP.png) verificada con SHA-256 idéntico. Se usa el emblema con una máscara suave en el cierre. |
| Paleta y nebulosa | [Tema local](../../../frontend/src/shared/styles/theme.css) y [Plan 09](../../../docs/PLAN-09-REFAC-UX-GALAXIA-MIGAPOS.md#L124). Gradientes y halos originales, generados dentro de la composición. | Sin imágenes de stock. Aplicar el fondo alrededor de los recortes para conservar el color de la UI. |
| Pantallas de MigaPOS | Fixture Plan 09 de `5dfe311`. [Script de captura](../scripts/capture-demo.mjs) y [evidencia](FEATURE_EVIDENCE.md). | Cinco recortes de los componentes reales con datos sintéticos. Dos estados de ticket, inventario, dashboard gerencial y resumen de caja. El ticket compacta su espacio vacío y el reporte omite widgets ajenos al encuadre. Las tomas usan el rótulo «Datos de demostración». |
| Tipografía | El tema declara Inter con fuentes de sistema como respaldo. Usar la pila local de sistema en el prototipo. | Sin archivo de fuente distribuido. Si se incorpora Inter para el máster, archivar el archivo y la licencia de esa distribución. |
| Voz y música | [Guion original](VOICEOVER.md) y [síntesis local de la pista instrumental](../scripts/score.mjs). | El candidato usa audio original generado por osciladores, sin samples, melodías copiadas ni narración. |
