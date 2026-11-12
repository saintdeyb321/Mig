# P17-RC · Caja de 14 horas, vencimiento e informes

## Comportamiento

- Las aperturas nuevas guardan `openedAt` del servidor y `durationHours: 14`. Los turnos de 10 horas conservan su duración. Los registros sin duración siguen siendo legibles y requieren revisión si carecen del protocolo verificable de candado.
- Firestore Rules permiten cobrar únicamente antes de `openedAt + durationHours`. En el límite bloquean cobros POS, anticipos, pagos y reembolsos de pedidos, compensaciones y el cierre manual con conteo. El dueño conserva el cierre manual de un turno vigente de su cajero aunque el cajero esté fuera de horario.
- POS y Contratos muestran «Cierre por vencimiento · sin arqueo» al alcanzar el límite local calculado. Al pulsar «Abrir caja», la transacción comprueba el candado, registra la finalización anterior y abre una caja independiente con su propio fondo. Un reintento ambiguo conserva el ID de apertura y comprueba el servidor. La regularización puede ocurrir antes si el dueño consulta la sede con conexión. Los pendientes cifrados siguen disponibles y los pendientes detectables en el dispositivo pueden impedir la regularización hasta su comprobación.
- El vencimiento conserva el fondo y los movimientos en su turno original. `expiredAt` es la hora límite y `recoveredAt` es la confirmación de la escritura. El efectivo contado y la diferencia permanecen sin declarar y sin calcular. En Spark, con todos los dispositivos desconectados, el corte financiero rige en servidor y la escritura queda pendiente. Una escritura y un aviso a una hora exacta sin clientes conectados requerirían un servicio programado, fuera de este plan.
- La campana del dueño muestra observaciones de vencimiento lógico por separado de la confirmación en Firestore. Ambas usan la misma identidad del turno. El acuse se habilita cuando hay evidencia materializada y no modifica la caja. El detalle consulta solo el turno seleccionado y enlaza con los informes de auditoría.

## Informes y evidencia

El ejemplo de una caja de S/ 100 con S/ 50 POS en efectivo y S/ 10 por Yape se reimportó desde Excel con S/ 150 de referencia de efectivo y S/ 10 digitales. El PDF usa las mismas cifras. La referencia usa el agregador existente, conserva el signo de las compensaciones y mantiene el dinero contado como «No declarado» y la diferencia como «No calculable». Una compensación contable no acredita una devolución.

Las exportaciones reutilizan los datos del período. La referencia queda pendiente si falta evidencia de finalización, algún conjunto de movimientos precede la confirmación o el período no cubre todo el turno. La auditoría separa la hora de vencimiento y la de confirmación. El detalle de la campana puede revisar una caja de principio a fin sin depender del período exportado.

La composición de impresión concentra contexto y montos en dos columnas y reduce espacios verticales en encabezados, tablas e incidencias. Conserva los textos, los importes y las seis incidencias visibles. Excel conserva las ocho incidencias del escenario denso.

## Lecturas y escrituras

| Flujo | Resultado local o límite |
| --- | --- |
| Reemplazo atómico | 8 lecturas directas y 3 escrituras en el repositorio, medidas sin reintento. La preconsulta canónica de producción añade 1 lectura del candado. P17 ya empleaba 8 y 3 en el reemplazo explícito. |
| Finalización y apertura separadas | 2 lecturas y 2 escrituras para finalizar. El flujo de repositorio acumuló 7 lecturas y 4 escrituras al abrir después. La preconsulta de una sede sin candado revisa también como máximo 1 caja abierta para detectar históricos. |
| Campana | Se conserva la consulta de hasta 10 finalizaciones confirmadas y su acuse. Al abrirla, una consulta adicional de hasta 10 cajas abiertas candidatas del negocio. Las observaciones lógicas no escriben documentos. El detalle solicita 1 caja y hasta 500 filas por fuente (ventas, pagos y compensaciones), con centinela y cancelación entre páginas. |
| PDF y Excel | Sin nuevas consultas para calcular referencias. La búsqueda de aperturas retrocede 14 h en lugar de 10 h con los mismos índices. Eso puede aumentar los documentos o páginas en esa consulta. En las fixtures de exportación hubo 4 lecturas lógicas en frío y 0 al volver a abrir el PDF. Excel solicitó 1 lectura de auditoría de pedidos cuando había referencias faltantes. |

Las cifras de transacción miden llamadas SDK en la prueba de presupuesto. La facturación de Spark puede incluir mínimos de consulta, lecturas internas de Rules, índices y reintentos. El límite de 10 candidatos de la campana puede omitir turnos en negocios con más sedes. La auditoría por período permite revisarlos.

## Archivos modificados

- Reglas e índices en `firestore.rules`, `firestore.indexes.json`, `queryCatalog.js` e `INDICES-FIRESTORE-MIGAPOS.md`.
- Caja en `cashExpiry.js`, `cashExpiryTotals.js`, `localCashPending.js`, `useCashRegister.js`, `sparkCashRepository.js`, `cashRegisterRepository.js`, `cashQueryRepository.js`, `sparkCashClosingRepository.js` y `salesQueryRepository.js`.
- Interfaz en `POS.jsx`, `TicketParts.jsx`, `CashRecoveryStatus.jsx`, `CashRegisterModals.jsx`, `ContractManager.jsx`, `AppLayout.jsx`, `NotificationBell.jsx`, `notificationRepository.js` y `notificationQueryRepository.js`.
- Informes en `cashAuditRows.js`, `managementReportHtml.js`, `salesWorkbook.js` y `sessionReportReads.js`.
- Regresiones en `plan14.test.mjs`, `spark.rules.test.mjs`, `spark-financial.rules.test.mjs`, `plan17-cash.browser.{html,test.mjs}`, `cash-amount.browser.html`, `spark-startup.browser.test.mjs` y `ui-security.test.mjs`. `verify.yml` incorpora las regresiones de caja al paso Chromium existente.

## Verificación

| Control | Resultado |
| --- | --- |
| Node financiero, reportes, seguridad, backups y costos | **PASS · 197/197**. Incluye 10/14 horas, reemplazo con respuesta perdida, conteo de operaciones SDK y reimportación de referencias. |
| `npm run test:spark:rules` | **PASS · 79/79** en `demo-migapos`. El corte se ancló a un timestamp confirmado del emulador y se probó desde el límite. También se probó la caja de 14 h pasada la hora 10, la carrera de aperturas, el cierre del dueño fuera del horario del cajero, los rechazos financieros y el acceso directo a avisos. |
| Chromium Windows | **PASS · 8/8**. Incluye caja y reconexión, céntimos, POS 1280×560 y 320×640, descargas reales y reimportación Excel. Los casos PDF 0/1/6/8 dieron 1 página A4. Los casos 6 y 8 conservaron 1 página con 8 mm adicionales de margen inferior. La prueba mantiene las aserciones de paginación y los ocho registros de Excel. |
| `npm run lint --prefix frontend`, build y PWA | **PASS**. Build aislado para `demo-migapos`. El chequeo de PWA verificó 43 archivos locales, 2.92 MiB y carga diferida de Excel. |
| `npm run indexes:check` | **PASS**. 53 índices definidos, 33 requeridos por los patrones actuales y 0 hallazgos locales. Inventario remoto sin verificar. |
| Chromium Ubuntu y CI remota | **BLOCKED**. Ubuntu local carece de Chromium, navegador Playwright y Node disponibles. El resultado de Linux y el de CI del próximo SHA quedan pendientes. |

Para repetir las pruebas centrales, usar `node --test tests/plan14.test.mjs tests/plan14-read-cost.test.mjs tests/reports.test.mjs` y `npm run test:spark:rules`. Con el build local para emulador y un Chromium instalado, usar `node --test --test-concurrency=1 tests/plan17-cash.browser.test.mjs tests/cash-amount.browser.test.mjs tests/excel-export.browser.test.mjs tests/plan10-correction.browser.test.mjs tests/spark-startup.browser.test.mjs`.

Capturas de apertura en [1280×560](../.release/qa-p17-rc/p17-rc-visual/apertura-1280x560.png) y [320×640](../.release/qa-p17-rc/p17-rc-visual/apertura-320x640.png), [POS móvil](../.release/qa-p17-rc/p10-06-visual/after-pos-nombre-largo-320x640.png) y [PDF renderizado](../.release/qa-p17-rc/p17-rc-visual/pdf-8-incidencias.png). Datos sintéticos en todos los casos.

## Publicación manual del propietario

1. Verificar el emulador, Chromium Ubuntu y la CI del SHA exacto. Conservar una copia de las Rules realmente publicadas desde Firebase Console, con fecha y revisión de origen. Revisar el inventario activo de índices de `migapos`, base `(default)`.
2. Confirmar los índices I51 (avisos confirmados) e I52 (recogidas) y agregar I53 (vencimientos lógicos) si falta. Esperar a que esté listo. Revisar el conjunto activo antes de autorizar cualquier publicación de índices.
3. Coordinar la publicación de las nuevas Rules y luego Hosting `migapos-peru`. El frontend anterior intenta abrir con 10 horas y las Rules nuevas requieren 14 horas para nuevas aperturas. El frontend nuevo requiere las Rules nuevas.
4. Verificar con autorización del propietario la apertura, vigencia, cierre manual y reporte en el piloto. Para revertir una publicación una vez abiertas cajas de 14 horas, el conjunto de Rules de reversión debe conservar el corte de 10 y 14 horas y el aislamiento por sede.

La publicación queda pendiente de Chromium Ubuntu, CI y verificación del inventario desplegado.
