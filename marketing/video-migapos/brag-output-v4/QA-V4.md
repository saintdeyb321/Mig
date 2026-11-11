# QA visual y técnico · MigaPOS V4

Rama local `marketing/video-promo-migapos`, HEAD `20474ee`. Pruebas del 10 de noviembre de 2026.

| Control | Resultado | Evidencia |
|---|---|---|
| Origen y privacidad | PASS | Fixture Plan 09 con perfil temporal, CSP, proxy de bloqueo y Firebase sustituido. Captura con cero solicitudes externas. |
| Navegación del dueño | PASS | POS, Contratos e Historial en barra principal. Productos, Categorías, Reportes, Personal y Ajustes desde «Más». Informes se muestra dentro de Historial y Caja se abre desde POS. |
| Responsive | PASS | Captura a 390 × 844 CSS con DPR 2. Se verificó también ancho de documento 360 a 360 × 800 en ocho pantallas. |
| Acciones verificadas | PASS | Búsqueda, cantidad y total, stock por sede, tres filtros de pedidos, diálogo del historial, cuatro períodos, dos formatos de exportación, arqueo provisional y ficha de personal. Datos y respuestas sintéticos. |
| Exportación | PASS de interfaz | Se comprobaron selector, opciones y botones. PDF se prepara para guardar desde el navegador y Excel corresponde a descarga. La captura llega hasta la selección de formato. |
| Voz y guion | PASS técnico | 25 fragmentos PCM reutilizados y una nueva frase de 2,773 s. La SRT y los cambios de módulo se calculan por muestras de la locución. La pista solo contiene voz y pausas. |
| Relación del teléfono | PASS geométrico | Modo completo 390/844, validado sobre el viewport. El acercamiento usa rectángulos del DOM con el scroll aplicado. |
| Preview y revisión visual | EN CURSO | El render se verifica antes de codificar el máster. |
| Másteres | EN CURSO | Pendientes de codificación y verificación definitiva. |
