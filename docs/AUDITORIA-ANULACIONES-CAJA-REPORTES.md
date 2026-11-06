# MigaPOS · Auditoría de anulaciones, caja y reportes

**P12-10 · 6 de noviembre de 2026**

## Resumen ejecutivo

El neto Yape / Plin puede ser negativo con registros válidos. El reporte suma cobros digitales y contramovimientos confirmados dentro del período elegido. La venta Spark entra por fecha de confirmación y su anulación por fecha de compensación. Si el cobro original quedó fuera del rango y las compensaciones del rango superan los cobros digitales, el neto resulta negativo. La cifra describe movimientos contables del período. Por sí sola no permite saber cuánto dinero hay en una cuenta digital ni si se ejecutó un reembolso. El dashboard ya etiqueta la cifra como neto contable. La ausencia de un desglose visible dificulta explicar el signo. [Lecturas del reporte](../frontend/src/features/reports/infrastructure/sessionReportReads.js), [Agregación](../frontend/src/features/reports/domain/reportTotals.js), [Dashboard](../frontend/src/modules/Reports.jsx)

El arqueo separa el componente digital del efectivo. Una anulación 100 % digital deja intacta la referencia de efectivo. Una compensación con componente en efectivo sí reduce esa referencia, aunque la entrega de dinero siga sin acreditar. El cierre Spark es operativo y guarda la conciliación pendiente. La recomendación es mostrar primero el desglose por canal y separar después la referencia contable del efectivo contado y del eventual desembolso verificado. [Cálculo de caja](../functions/src/cash-register/domain/cashTotals.js), [Cierre Spark](../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js)

**Alcance.** Inspección estática del código y las Rules locales. El caso observado no se contrastó con registros del negocio, un ticket concreto ni el estado publicado. Los ejemplos usan importes hipotéticos. La auditoría no modifica transacciones, cálculos, persistencia ni Firestore.

## Flujo y puntos de control

1. **Solicitud.** El Historial solicita el motivo de 5 a 1000 caracteres. `anularVentaConfirmada` aplica el bloqueo de operación y llama a `voidSaleTransaction`, que requiere conexión y capacidad Spark. `voidRecovery.submit` conserva el intento cifrado por cuenta, negocio, sede y ticket. Una confirmación perdida se recupera consultando el recibo original. Un intento definitivamente rechazado solo puede volver a escribir mediante acción explícita y después de comprobar la ausencia del recibo. [Historial](../frontend/src/modules/SalesHistory.jsx), [Hook](../frontend/src/features/sales/hooks/useSalesHistory.js), [Entrada transaccional](../frontend/src/features/sales/infrastructure/saleTransactions.js), [Recuperación](../frontend/src/features/sales/application/voidRecovery.js)
2. **Autorización.** `saleVoid` y `saleContext` exigen ticket confirmado con protocolo atómico 2, negocio y sede de origen, licencia vigente y caja propia abierta en esa sede. Un cajero debe estar asignado a la sede y cumplir el turno validado por Rules. Para las cajas nuevas, la vigencia de diez horas se comprueba con `request.time`. El responsable y `sessionId` de la compensación corresponden al turno que ejecuta la anulación, aunque la venta pertenezca a otro turno. [Repositorio POS](../frontend/src/features/sales/infrastructure/posVoidRepository.js), [Apertura Spark](../frontend/src/features/cash-register/infrastructure/sparkCashRepository.js), [Rules](../firestore.rules)
3. **Escritura atómica.** La transacción crea `pos_voids/{saleId}` con autoridad `pos-compensation`, importes con signo, motivo, ítems y fecha del servidor. Repone las unidades en el stock de la sede e incrementa `posStockVersion`. Los documentos `pos_void_groups` y las Rules enlazan los cambios de inventario al mismo recibo. El ticket original se conserva y el recibo de compensación es inmutable. Un recibo del mismo ticket, autor y motivo puede reconocer la operación existente. Otro motivo o autor genera conflicto en el reintento. [Repositorio POS](../frontend/src/features/sales/infrastructure/posVoidRepository.js), [Verificación del recibo](../frontend/src/features/sales/domain/posVoidReceipt.js), [Rules](../firestore.rules)
4. **Proyecciones.** Historial relaciona ticket y recibo y distingue evidencia en caché de confirmación del servidor. Las notificaciones del dueño proyectan el recibo y advierten que no acredita un desembolso. El hook invalida la caché de reportes de la sede y la vista global al confirmar o verificar la anulación. El dashboard y Excel leen movimientos por período, mientras el cierre los lee por turno. [Historial reciente](../frontend/src/features/sales/hooks/useRecentSales.js), [Notificaciones](../frontend/src/features/notifications/infrastructure/notificationQueryRepository.js), [Invalidación](../frontend/src/features/reports/application/reportResource.js), [Excel](../frontend/src/features/reports/application/salesWorkbook.js), [Caja](../frontend/src/features/cash-register/infrastructure/cashRegisterRepository.js)

## Impacto por método

| Venta original de S/ 100 | Compensación en `pos_voids` | Referencia de efectivo del turno que anula | Reporte en el día de anulación |
| --- | --- | --- | --- |
| Efectivo | Total −100, efectivo −100, digital 0 | Baja S/ 100 | Neto POS y neto efectivo bajan S/ 100 |
| Yape o Plin | Total −100, efectivo 0, digital −100 | Efecto de S/ 0 | Neto POS y neto Yape / Plin bajan S/ 100 |
| Mixto con S/ 40 en efectivo y S/ 60 digital | Total −100, efectivo −40, digital −60 | Baja S/ 40 | Neto POS baja S/ 100. Neto efectivo baja S/ 40 y digital S/ 60 |

El desglose usa el método original y calcula el componente digital por diferencia en céntimos. `voidCashPayments` proyecta cada componente negativo como fila de cálculo con ID por ticket y método. Esa proyección se consume en memoria al calcular caja, con `physicalDisbursementVerified: false`. Reportes consume el recibo de `pos_voids` directamente. Así el movimiento mixto descuenta cada componente una vez. [Repositorio POS](../frontend/src/features/sales/infrastructure/posVoidRepository.js), [Proyección para caja](../frontend/src/features/sales/infrastructure/posVoidQueryRepository.js), [Agregación](../frontend/src/features/reports/domain/reportTotals.js)

## Caja física y cierre

- `calculateCashTotals` estima el efectivo con fondo inicial, componente efectivo de ventas, neto efectivo de pedidos y compensación POS en efectivo. Mantiene un `digitalTotal` separado. Si se anula una venta de un turno anterior, la compensación se computa en el turno que la ejecuta. El turno anterior conserva su cierre. La referencia puede quedar negativa si la compensación en efectivo supera los fondos y entradas registrados del turno. [Lectura por sesión](../frontend/src/features/cash-register/infrastructure/cashRegisterRepository.js), [Cálculo](../functions/src/cash-register/domain/cashTotals.js)
- La presencia de una compensación POS marca `hasUnverifiedDisbursements`, incluso para una anulación digital con efecto cero en efectivo. El resumen muestra «Por revisar» si hay desembolsos sin verificar o referencia negativa. El cierre recalcula una estimación antes de liberar el candado, pide observación cuando hay diferencia y persiste `closeEstimate` con `authority: 'client-estimate'` y `reconciliationPending: true`. `closed` con diferencia cero sigue siendo un cierre operativo. Excel conserva la conciliación pendiente al proyectar ese cierre. [Resumen de caja](../frontend/src/modules/CashRegisterModals.jsx), [Repositorio de cierre](../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js), [Auditoría de cajas en Excel](../frontend/src/features/reports/application/cashAuditRows.js)

## Diagnóstico de Yape / Plin negativo

`finishMetrics` calcula `digitalRevenue = posDigital + contractDigital`. La venta Spark suma por `confirmedAt` y la compensación resta por `occurredAt`, con días de Lima. Los reembolsos digitales de pedidos también pueden reducir el neto, a través de `payments`. Por ejemplo, una venta por Yape de S/ 100 confirmada ayer y anulada hoy aporta **−S/ 100** a Hoy. Si hoy hubo S/ 30 en cobros digitales y ningún otro movimiento, Hoy muestra **−S/ 70**. El rango de ambos días muestra **S/ 30**. En ese ejemplo la caja física recibe un efecto de S/ 0 por la anulación. [Ventas por período](../frontend/src/features/sales/infrastructure/salesQueryRepository.js), [Fechas](../frontend/src/features/reports/domain/reportPeriod.js), [Pagos de pedidos](../frontend/src/features/contracts/infrastructure/sparkContractsRepository.js), [Agregación](../frontend/src/features/reports/domain/reportTotals.js)

**Clasificación.** El signo es un resultado previsto del neto por fecha de movimiento. Hay una brecha de presentación y otra de evidencia. El KPI agrupa cobros y contramovimientos en una cifra y el recibo de anulación no confirma un reembolso externo. La inspección no atribuye el caso concreto a un doble descuento, a un error de suma ni a una salida física. Para identificar sus componentes se necesitan el período, la sede, la fecha de la venta y los movimientos confirmados por canal de ese rango. [Dashboard](../frontend/src/modules/Reports.jsx), [Resumen y detalle exportables](../frontend/src/features/reports/application/salesWorkbook.js)

## Riesgos de integridad y comunicación

| Riesgo | Control o límite observado |
| --- | --- |
| Repetir la anulación o devolver stock dos veces | El ID único, la transacción y los controles de Rules vinculan recibo e inventario. El intento local conserva el motivo y recupera el mismo recibo ante respuesta incierta. |
| Duplicar un reembolso real fuera de MigaPOS | El recibo identifica la compensación interna. El sistema no verifica una transferencia Yape/Plin ni una entrega en mano. La idempotencia del recibo solo protege los efectos registrados en MigaPOS. |
| Interpretar una diferencia provisional como faltante definitivo | Una devolución real pendiente de registrar puede separar el conteo físico de la referencia. Una venta o anulación también puede entrar entre la lectura para estimar y el cierre del candado. Las Rules validan la declaración y la coherencia aritmética, y el cierre guarda conciliación pendiente. |
| Comparar pantallas con ventanas distintas | Historial muestra el estado actual del ticket, el reporte agrupa por fecha de movimiento y caja agrupa por turno. Las lecturas de reporte se cargan por separado y pueden reflejar instantes distintos mientras se actualizan. |
| Duplicar una compensación al añadir un ledger | `aggregateReport` deduplica recibos y pagos por separado. Las filas proyectadas de caja no deben reingresar como un segundo movimiento contable. Cualquier modelo nuevo debe mantener una referencia canónica única por efecto y canal. |
| Leer el promedio POS como precio típico de un ticket nuevo | El numerador es el neto POS del rango, mientras el denominador cuenta tickets registrados. Una anulación de otro período puede reducir ese promedio e incluso volverlo negativo si hay tickets positivos en el rango. |

Referencias de los controles y límites. [Rules](../firestore.rules), [Recuperación](../frontend/src/features/sales/application/voidRecovery.js), [Cierre](../frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js), [Recursos del reporte](../frontend/src/features/reports/application/reportResource.js), [Agregación](../frontend/src/features/reports/domain/reportTotals.js)

## Opciones

| Opción | Cambio propuesto | Beneficio | Impacto y cuidado |
| --- | --- | --- | --- |
| A · Conservar el neto firmado | Mantener los negativos y explicar que cada compensación afecta su fecha de registro. | Conserva trazabilidad, comparabilidad y totales vigentes. | Impacto bajo en etiquetas y ayudas. La composición del neto sigue siendo poco visible. |
| B · Separar cobros y contramovimientos | Mostrar por canal cobros confirmados, anulaciones POS, reembolsos de pedidos y neto derivado, tanto en pantalla como en Excel. | Explica cuándo y por qué el neto es negativo. | Impacto medio en agregación y presentación. Debe conservar las fechas, la deduplicación y los totales de hoy, semana, mes y año. |
| C · Separar caja física y canal digital | Mostrar fondo y efectivo contado, referencia contable de efectivo, desembolso acreditado si existe y neto digital en bloques distintos. | Distingue el dinero contado del resultado contable y de un posible reembolso. | Bajo impacto si solo se mejora la presentación. Registrar o conciliar desembolsos verificables exigiría un diseño separado de evidencias, permisos y reintentos. |
| D · Ledger de movimientos tipados | Identificar venta, compensación, reembolso, desembolso y ajuste como tipos explícitos vinculados al origen y al canal. | Facilita auditoría y proyecciones coherentes entre turnos y períodos. | Impacto alto en datos, Rules, compatibilidad e índices. Requiere estrategia para históricos, cuotas Spark y prevención de doble conteo durante una transición. |

## Recomendación

Aplicar **B primero** conservando los negativos de A. Mostrar el desglose por canal y usar la misma definición en Reportes y Excel. Aplicar **C en presentación** para separar referencia, conteo y desembolso sin atribuir movimientos físicos a los recibos actuales. Reservar D para cuando exista una decisión explícita sobre cómo acreditar reembolsos y ajustes reales.

Para evaluar ese cambio, comparar el neto actual con la suma de los nuevos subtotales en escenarios de mismo día, cambio de día o turno, efectivo, Yape/Plin y mixto. Incluir el reembolso de un pedido, el recibo perdido con reintento y un cierre concurrente. La comprobación debe conservar la identidad `neto efectivo + neto digital = ingreso neto` y distinguir el resultado operativo de la conciliación certificada.

## Plan 13 · Fase 01

Reportes y `Resumen_Financiero` de Excel usan el desglose de `aggregateReport`. Para cada canal se presentan los cobros de POS y pedidos, las compensaciones POS y los reembolsos contables de pedidos. El detalle Excel identifica los contramovimientos por su naturaleza contable. La fase utiliza los lectores existentes y conserva el alcance de cada exportación. [Agregación](../frontend/src/features/reports/domain/reportTotals.js), [Dashboard](../frontend/src/modules/reports/ReportParts.jsx), [Excel](../frontend/src/features/reports/application/salesWorkbook.js)

### Invariantes

- Por canal, `neto = cobros registrados + compensaciones POS + reembolsos contables de pedidos`. Los dos contramovimientos mantienen su signo. Yape y Plin se agrupan en el canal digital. Una venta mixta se divide según los importes registrados, incluido el desglose histórico con `plin`.
- Cada neto por canal coincide con la suma previa de netos POS y pedidos de ese canal. `neto efectivo + neto digital = ingreso neto`, con la misma política de céntimos. Se preservan el signo, los conteos de tickets y la definición vigente de promedio POS.
- Ventas Spark por `confirmedAt`, ventas históricas admitidas por `createdAt`, pagos de pedidos y compensaciones por `occurredAt`. Se mantienen los días de Lima, el filtro por negocio y sede, la exclusión de pendientes locales y el tratamiento previo de tickets históricos marcados como anulados.
- Un recibo POS y un pago se contabilizan una sola vez por su ID en su origen. Los subtotales no agregan una segunda transacción. El cierre y el inventario siguen usando sus flujos actuales. El desglose no presenta el neto como saldo de caja o de billetera.

### Validación pendiente del propietario

| Escenario | Resultado esperado en Reportes y Excel |
| --- | --- |
| Venta y anulación en el mismo período, por efectivo, Yape, Plin y mixto | Cobro y compensación aparecen por separado. El neto del ticket es cero y el mixto conserva ambos componentes. |
| Venta Yape de S/ 100 ayer, anulación hoy y S/ 30 de nuevos cobros digitales | En Hoy se muestran S/ 30, −S/ 100 y un neto digital de −S/ 70. En un rango que incluya ambos días, el neto de esos movimientos es S/ 30. |
| Cancelación de un pedido con anticipo digital o reembolso mixto histórico | La salida contable aparece solo en reembolsos de pedidos y conserva el método original. El detalle y la auditoría Excel no dan por acreditado un desembolso. |
| Recibo POS y pago duplicados, reintento y cambio de sede o negocio | Cada ID entra una vez. Los datos de otra sede o negocio quedan fuera cuando el alcance los excluye. El total global coincide con la suma de sedes del mismo negocio. |
| Ventana vacía, compensación de S/ 0.01 y mixto histórico con `plin` | Ceros explícitos, signo y céntimos legibles, y el mismo desglose en las rutas detallada y resumida. |
| Hoy, semana, mes y año con los mismos datos de origen y alcance | Las ocho cifras por canal coinciden entre pantalla y `Resumen_Financiero`. Las comparativas y los resúmenes diarios conservan los mismos netos. Excel mantiene celdas numéricas y formato de cantidad para los conteos. |
| Históricos no regularizados, lectura interrumpida o cierre concurrente | Se conservan los errores y avisos vigentes. El desglose no vuelve definitiva una lectura parcial ni certifica un cierre. |

Los controles existentes de reportes y la fixture visual se adaptaron al nuevo desglose. La ejecución y la revisión de un Excel generado quedan pendientes. [Controles de reportes](../tests/reports.test.mjs), [Fixture visual](../tests/plan09.fixture.jsx)

### Diseño pendiente del registro verificable de devoluciones

Separar tres entidades. El **contramovimiento comercial** es el recibo POS o de pedido actual. La **obligación** registra el importe elegible para devolución, con origen estable y desglose original. El **desembolso** registra una devolución parcial o total con su canal real, importe en céntimos, responsable, sede, turno si afecta efectivo, fecha de ejecución y referencia de evidencia. Por ejemplo, un cobro Yape puede dar origen a una devolución en efectivo. El contramovimiento sigue atribuido a Yape y la salida acreditada corresponde al efectivo.

- Identificar cada obligación por negocio, tipo e ID de origen. Identificar cada desembolso por comando idempotente y proteger el saldo restante de forma atómica. La suma de desembolsos acreditados no puede superar la obligación. Un reintento recupera el mismo resultado.
- Distinguir `NO_APLICA`, `PENDIENTE`, `PARCIAL`, `CONFIRMADO` e `INCIDENCIA` a partir del saldo y la evidencia disponible. Los históricos sin evidencia quedan pendientes de revisión. Un desembolso registrado como acreditado debe conservar quién lo verificó, la referencia mínima y la fecha. Evitar adjuntar datos bancarios sensibles.
- Separar permiso de anular del permiso de acreditar fondos. Definir aprobación para montos altos, cambio de canal y devoluciones entre turnos. Los ajustes posteriores se registran como contramovimientos trazables. Una salida acreditada reduce la obligación y afecta el flujo real una vez. El neto comercial ya incorpora la reversión original.

### Política pendiente de stock devuelto

Registrar la decisión por línea y cantidad, vinculada al ticket y a la sede. Distinguir producto no entregado con custodia confirmada, producto retornado pendiente de inspección, retorno vendible, merma y producto no devuelto. Los perecederos quedan fuera del stock vendible hasta que una inspección autorice su reincorporación. Liberar una unidad que nunca salió requiere confirmar que sigue bajo custodia.

La futura reincorporación debe ser idempotente y atómica con el ajuste de stock. La suma por línea no puede superar las unidades originales. Cada crédito de stock vendible actualiza `posStockVersion` una vez. Antes de aplicar la política a un histórico, conciliar el recibo de anulación con la reposición que ya ejecutó el protocolo vigente para evitar un segundo crédito. Esta fase conserva la reposición actual y deja pendiente decidir autorización, criterios de inspección y tratamiento de mermas. [Transacción POS vigente](../frontend/src/features/sales/infrastructure/posVoidRepository.js), [Rules vigentes](../firestore.rules)
