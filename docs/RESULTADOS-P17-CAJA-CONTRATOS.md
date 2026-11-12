# P17 · Caja vencida, avisos y contratos entre sedes

## Cambios implementados

- **Caja.** Un turno Spark de 10 horas pierde autoridad financiera a `openedAt + 10 h`, según `request.time`. Un cliente conectado y autorizado, con una sede física seleccionada en POS o Pedidos, puede confirmar el vencimiento. La transacción cambia el turno a `expired_unreconciled` y libera el candado canónico en el mismo commit. `expiredAt` guarda el límite efectivo y `recoveredAt` la hora de confirmación de Firestore. `recoverySessionId` se conserva nulo en la finalización independiente. El fondo original, el responsable y los movimientos permanecen asociados a su turno. Se conservan la lectura y el protocolo histórico de recuperación conjunta para clientes anteriores.
- **Recuperación.** POS y Pedidos comprueban el plazo al consultar, volver al módulo o recuperar la conexión. Hay una oportunidad de finalización por turno y reconexión; el reloj local actualiza la interfaz sin sondear Firestore. Pendientes financieros detectables en el dispositivo bloquean la finalización desde ese cliente y se conservan. Borradores nunca enviados no cuentan como cobros. Ante una respuesta ambigua, se comprueban turno y candado con lecturas de servidor. La interfaz ofrece «Comprobar estado» ante incertidumbre y deja de mostrar UUID. Abrir una caja nueva sigue siendo una acción separada con fondo y candado propios.
- **Cierre manual.** El dueño puede cerrar en una sede física activa el turno vigente de un cajero aunque haya terminado el horario de ese cajero. Quedan diferenciados `userId` y `closedBy`. Tras el vencimiento, Rules bloquea el conteo manual tardío en turnos de diez horas. Las sesiones históricas sin protocolo verificable conservan sus permisos históricos y requieren revisión para la finalización P17.
- **Campana y reportes.** La evidencia es el propio documento de caja finalizado. Se proyecta una tarjeta por turno y dueño con acuse por separado. Muestra negocio, sede, responsable, apertura, vencimiento, finalización y fondo inicial. El detalle bajo demanda usa ventas, pagos y compensaciones confirmados de la misma sede y turno. Presenta netos registrados y efectivo esperado como referencia. Si faltan permisos, datos o presupuesto, la tarjeta indica «Importes pendientes de verificar». En Excel y PDF se conserva el período del vencimiento y se distingue la finalización. Dashboard mantiene sus totales y explica dónde revisar la caja.
- **Contratos.** Rules limita el contrato completo a su sede de origen y al dueño del negocio. Un recojo en otra sede activa crea en la misma transacción una ficha con negocio, sede de origen, destino, código comercial y fecha de entrega. El cajero de destino consulta solo esa ficha, con servidor confirmado y al abrir el panel. Una reasignación cambia el acceso; la entrega o cancelación retira la ficha de destino conservando el documento. El pedido y todos sus importes mantienen su sede financiera original. La ficha no tiene una acción de entrega o escritura para el destino. Una sede destino inactiva pierde acceso. Se conserva el acceso de exportación temporal existente de SuperAdmin, sin autoridad operativa.
- **POS a 320×640.** Monto recibido y Vuelto comparten las filas de etiqueta y valor del grid. Así siguen alineados aunque una etiqueta ocupe dos líneas. El apilado queda reservado a un contenedor inferior a 11 rem. Se conservan importes, foco, desplazamiento de artículos y el botón Cobrar.

## Costos observados y límites

| Operación | Antes | P17 |
| --- | --- | --- |
| Turno vencido sin abrir otro | 0 lecturas/escrituras para finalizar, porque no existía transición independiente | 2 lecturas y 2 escrituras en la transacción. Ante commit ambiguo, 2 lecturas adicionales de servidor. Un reintento confirmado hace 2 lecturas y 0 escrituras. |
| Finalización y apertura nueva | 8 lecturas y 3 escrituras en el repositorio de recuperación conjunta | 7 lecturas y 4 escrituras de repositorio en dos transacciones. La apertura conserva la comprobación previa del módulo. El observador del candado y la comprobación de disponibilidad reutilizan las consultas existentes. |
| Avisos | Sin proyección de vencimiento | 1 consulta escuchada solo por dueño, hasta 10 turnos recientes y hasta 10 acuses adicionales por consulta inicial. 0 escrituras al proyectar, 1 escritura por marcar un aviso como leído. |
| Detalle de importes del turno | No disponible en campana | 1 lectura de sesión y 3 lectores por sede/sesión. Páginas de hasta 200, máximo 500 filas por fuente más un centinela. Hasta 1.504 documentos recuperados en el peor caso antes de rechazar por límite. 0 escrituras. |
| Ficha de recojo | 0 lecturas/escrituras de ficha, con contrato completo accesible por SDK desde otras sedes del negocio | 0 consultas si el panel está cerrado. Al abrir: 1 listener, máximo 51 documentos por snapshot para presentar 50 y avisar de límite. Alta/reasignación añade 1 escritura de ficha; retirada añade hasta 1 lectura de ficha y 1 escritura. Pago ordinario y pedidos de la misma sede o domicilio conservan su libro sin escrituras de ficha. |

El conteo de repositorio se mide con los espías de SDK en `tests/plan14.test.mjs`. Excluye consultas del módulo, lecturas dependientes de Rules, intentos internos y facturación real. Las Rules verifican el tiempo, perfil, licencia y sede, los documentos antes/después del candado y la consistencia contrato/ficha. La prueba con 101 fichas confirmó el centinela de la consulta. El emulador confirmó que una lectura de detalle excluye otra sede y otro turno, con S/20 de POS en efectivo, S/5 de compensación, S/6 de pedidos, S/30 digitales y S/31 de referencia con fondo de S/10.

## Validación

| Control | Resultado |
| --- | --- |
| Node de ventas, Reportes, P09, P13, P14, seguridad Spark y backups | **PASS 162/162**, incluida la comparación de costos P17 y la reimportación XLSX con conciliación por sede. |
| Firestore Rules y transacciones en `demo-migapos`, Java 21 | **PASS 78/78**. Incluye candado, concurrencia, respuestas ambiguas, notificación y acuse, cierre del dueño fuera del horario del cajero, recojo, intento directo desde otra sede/negocio, 101 fichas y devolución con tres medios. |
| Chromium Windows | **PASS 9/9** entre las dos ejecuciones finales. P10-06 completó 537 comprobaciones y 53 capturas. Validó 320×640, 390×844, 1280×560 y el caso de ancho de pago reducido, conservando las aserciones anteriores. P17 confirmó la reconexión con un pendiente cifrado preservado. |
| PDF, XLSX y P16 | **PASS** dentro de los controles Chromium anteriores. PDF A4 con 0, 1, 6 y 8 incidencias, XLSX con auditoría íntegra, alta/reintento de SuperAdmin y respaldo cifrado con resumen parcial. |
| Lint, build/PWA e inventario de índices | **PASS**. 43 archivos de precaché únicos, 2,92 MiB. 52 índices locales, 32 requeridos por patrones actuales y cero hallazgos. |
| Chromium Linux y CI remota | **BLOCKED**. Ubuntu WSL está disponible, pero no tiene Chromium ni Node Linux instalados. GitHub Actions queda pendiente del commit del propietario. |

La primera prueba cruzada con anticipo alcanzó el límite de 1.000 expresiones de Rules. Se eliminaron evaluaciones repetidas sin cambiar las comprobaciones de identidad, destino ni igualdad de la ficha. La regresión completa volvió a pasar. La fixture nueva de reconexión se volvió a ejecutar tras corregir la normalización de su ruta en Windows.

Logs locales: [Node](../.release/qa-p17/node-verified.log), [Rules](../.release/qa-p17/rules-verified.log), [Chromium](../.release/qa-p17/chromium.log) y [reconexión P17](../.release/qa-p17/chromium-cash-verified.log). El log Chromium conserva el fallo inicial de sintaxis de la fixture, resuelto en la ejecución focalizada.

## Evidencia visual local

| Tamaño | P16, referencia | P17 |
| --- | --- | --- |
| 1280×560 | [Antes](../.release/qa-p16/p10-06-visual/after-pos-caja-carrito-1280x560.png) | [Después](../.release/qa-p17/p10-06-visual/after-pos-caja-carrito-1280x560.png) |
| 390×844 | [Antes](../.release/qa-p16/p10-06-visual/after-pos-caja-carrito-390x844.png) | [Después](../.release/qa-p17/p10-06-visual/after-pos-caja-carrito-390x844.png) |
| 320×640 | [Antes, en Windows](../.release/qa-p16/p10-06-visual/after-pos-caja-carrito-320x640.png) | [Después](../.release/qa-p17/p10-06-visual/after-pos-caja-carrito-320x640.png) |

## Archivos modificados

- `firestore.rules`, `firestore.indexes.json`, `frontend/src/core/firebase/queryCatalog.js`, `docs/INDICES-FIRESTORE-MIGAPOS.md` y este informe.
- `frontend/src/index.css`, `frontend/src/modules/POS.jsx`, `frontend/src/modules/CashRecoveryStatus.jsx`, `frontend/src/modules/Reports.jsx`, `frontend/src/components/NotificationBell.jsx`.
- `frontend/src/features/cash-register/hooks/useCashRegister.js`, `frontend/src/features/cash-register/infrastructure/{cashRegisterRepository,sparkCashRepository,sparkCashClosingRepository}.js`.
- `frontend/src/features/{payments/infrastructure/paymentRepository,payments/infrastructure/paymentQueryRepository,sales/infrastructure/salesQueryRepository,sales/infrastructure/posVoidQueryRepository,notifications/infrastructure/notificationQueryRepository}.js`.
- `frontend/src/features/reports/application/{cashAuditRows,managementReportHtml}.js`.
- `frontend/src/features/contracts/hooks/useContracts.js`, `frontend/src/features/contracts/infrastructure/{contractQueryRepository,contractRepository,sparkContractsRepository}.js`, `frontend/src/modules/contracts/ContractManager.jsx`, `frontend/src/modules/contracts/components/ContractPickupPanel.jsx`, `frontend/src/features/backups/infrastructure/backupRepository.js`.
- `tests/{plan14.test.mjs,plan10-correction.browser.test.mjs,plan17-cash.browser.html,plan17-cash.browser.test.mjs,spark.rules.test.mjs,spark-financial.rules.test.mjs,ui-security.test.mjs}`.

## Publicación manual y pendientes

- El propietario debe revisar los índices activos y crear los compuestos nuevos **I51** (`cash_sessions: businessId ASC, recoveredAt DESC`) e **I52** (`contract_pickups: businessId ASC, pickupBranchId ASC, deliveryDate ASC`) en `migapos`, base `(default)`, y comprobar su estado Habilitado. El emulador prueba la forma y permisos de las consultas; no certifica que estén habilitados en producción.
- Publicar manualmente `firestore.rules` de P17 después de esa comprobación y coordinar la actualización de Hosting con el frontend. Los cambios obligatorios son finalización y liberación atómica de caja, bloqueo del cierre manual vencido, acuse del aviso, restricción de contratos por origen y autorización de fichas. Un cliente anterior que intente crear o reasignar recojos entre sedes sin ficha recibirá un rechazo seguro.
- **Límite Spark.** Sin un navegador autorizado y conectado que atienda la sede, Firestore bloquea los cobros a las diez horas pero no escribe el cierre ni publica el aviso a esa hora. Un dispositivo tampoco puede comprobar pendientes cifrados que solo existen en otro. Los montos consultados nunca constituyen arqueo certificado. El recuento tardío necesitaría un protocolo separado.
- Los contratos anteriores a P17 no se migraron. Su sede de origen y el dueño mantienen la lectura; el destino obtiene una ficha solo tras una actualización logística válida. El cambio de Rules no puede retirar datos que un cliente ya descargó con permisos anteriores. Se preservó IndexedDB. La recogida confirma su entrega por el flujo de origen; autorizar a destino a confirmar físicamente exige un protocolo separado.
- **NO-GO de producción.** Faltan Chromium Linux, CI remota del commit que publique el propietario y confirmación de Rules e índices publicados. El trabajo y las pruebas usaron el repositorio local, fixtures y `demo-migapos`.
