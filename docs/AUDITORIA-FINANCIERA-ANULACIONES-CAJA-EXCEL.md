# MigaPOS — Auditoría independiente de anulaciones, caja, reportes y exportaciones Excel

**Fecha:** 6 de noviembre de 2026  
**Repositorio:** https://github.com/saintdeyb321/Mig  
**Revisión auditada:** `fix/migapos-production-readiness`, commit `77dd6f0547d43a7cdff146131408cb83d1ef636b`.  
**Tipo de revisión:** código publicado, documentación P12-10 y GitHub Actions. No es una conciliación con registros bancarios ni una prueba contra Firestore de producción.

## Resumen ejecutivo

**Conclusión:** No conviene forzar los saldos negativos a cero ni modificar el histórico; primero hay que separar tres planos que actualmente parecen uno: **(1) venta y anulación comercial**, **(2) movimiento efectivo de dinero por canal**, y **(3) obligación pendiente de reembolso**. La solución recomendada combina **desglose de cobros/compensaciones** (opción B) con **separación de dinero físico y digital** (opción C), conservando la aritmética firmada actual (opción A). Un ledger completo (opción D) sería una evolución posterior.

### Estado del repositorio y CI

- `main` está en `6ca437bf` y `fix/migapos-production-readiness` en `77dd6f05`, ramas divergentes al consultar. El informe de Codex `docs/AUDITORIA-ANULACIONES-CAJA-REPORTES.md` está publicado en la rama `fix`, no en `main`.
- CI del commit `77dd6f05` falló en `tests/ui-security.test.mjs`: lista permitida de Markdown no actualizada tras agregar documentación. No es una prueba financiera fallida, pero bloquea la certificación completa del commit.

## Evidencia de código auditada

1. `frontend/src/features/sales/infrastructure/posVoidRepository.js`: transacción de anulación POS única por `saleId`, con motivo, usuario, sesión de caja, compensación contable negativa por canal, reposición de stock por artículo y documentos auxiliares. El ticket original permanece; el intento puede verificarse si el resultado es incierto.
2. `frontend/src/features/sales/application/voidRecovery.js`: intención cifrada y relectura de recibo; evita repetir un efecto en situaciones inciertas.
3. `frontend/src/features/reports/domain/reportTotals.js`: `aggregateReport()` suma cobros y resta recibos de anulación por fecha de movimiento; divide importe por efectivo y digital y valida que los canales concilien con el neto. `refundCount` y `refunds` engloban compensaciones contables y movimientos de reembolso de contratos.
4. `frontend/src/features/reports/infrastructure/sessionReportReads.js`: dashboard y Excel utilizan lectores de ventas, pagos y compensaciones compartidos; no es una reconstrucción independiente desde otra verdad.
5. `frontend/src/features/reports/application/salesWorkbook.js` y `frontend/src/utils/salesDataProcessor.js`: Excel incluye `Resumen_Financiero`, comparativas y detalle semanal/diario; mes/año muestran resumen por días. Las compensaciones POS aparecen como `DEVOLUCIÓN POS` / `TOTAL DEVOLUCIÓN`, aunque el sistema no verifica pago al cliente.
6. `frontend/src/features/contracts/infrastructure/sparkContractsRepository.js`: cancelar un pedido genera automáticamente pagos negativos `type: 'refund'` por cada canal original y pone `paidByMethod` en cero. Es una reversión contable, no acreditación de reembolso real.
7. `functions/src/cash-register/domain/cashTotals.js`: el efectivo esperado se reduce por la parte en efectivo de compensaciones POS y por reembolsos de pedidos; marca desembolsos sin verificar. La devolución digital no resta caja física.
8. `frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js`: cálculo de cierre `client-estimate`, guarda `reconciliationPending: true`; una lectura previa puede diferir de eventos concurrentes posteriores.
9. `frontend/src/features/reports/application/contractLedgerReport.js`: la columna `Reembolso (S/)` surge de pagos negativos creados al cancelar, sin distinción de devolución física/electrónica comprobada.
10. `frontend/src/features/reports/application/cashAuditRows.js`: exportación de cierres reconoce conciliación pendiente.

## Interpretación correcta del saldo digital negativo

Ejemplo: una venta de **S/ 100 en Yape** confirmada ayer y anulada hoy. Hoy no hubo nuevas ventas digitales.

- **Ventas/cobros digitales registrados hoy:** S/ 0.
- **Compensación comercial reconocida hoy:** −S/ 100.
- **Neto contable por movimientos de hoy:** −S/ 100 (válido matemáticamente).
- **Devolución digital comprobada al cliente:** desconocida / no registrada con evidencia verificable.
- **Dinero real en Yape/Plin:** desconocido sin extracto/confirmación externa.
- **Efectivo de caja:** impacto directo S/ 0 si no hubo desembolso físico.

El signo negativo no demuestra un doble descuento. **Tampoco demuestra un reembolso.** La UI actual comunica la primera idea con mayor claridad que la segunda, pero Excel llama `devolución` a una compensación sin verificación de pago.

## Casos reales que debe soportar MigaPOS

| Caso comercial | Cómo debe afectar el reporte comercial | Cómo debe afectar el dinero real | Evidencia/estado indispensable |
| --- | --- | --- | --- |
| Venta en efectivo de S/ 20, anulada y reintegrada en el acto | Compensación comercial −S/ 20 | Efectivo −S/ 20 **solo cuando se confirma salida** | Motivo y responsable de devolución |
| Venta en efectivo anulada, devolución prometida mañana | Compensación comercial −S/ 20 | Sin salida hoy; obligación pendiente S/ 20 | Pendiente, fecha y responsable |
| Venta Yape de S/ 100 ayer, anulada hoy; todavía no se devolvió | Neto digital atribuido al origen puede mostrar −S/ 100 hoy | Saldo externo no se conoce; no presumir reembolso | Obligación digital pendiente S/ 100 |
| Venta Yape S/ 100 y devolución confirmada al mismo canal | Reversión comercial −S/ 100 | Salida digital real −S/ 100 en día de ejecución | Referencia de transacción y confirmación manual verificada |
| Venta Yape de S/ 100, pero negocio entrega S/ 100 en efectivo | Reversión comercial atribuida a Yape | Efectivo −S/ 100, Yape no tiene salida por refund | Canal de devolución **diferente** del canal original |
| Venta mixta S/ 40 efectivo + S/ 60 Yape; reembolso parcial | Reversión comercial según monto cancelado y política | Salidas reales por los canales efectivos usados | Desglose por canal, estado parcial |
| Anulación realizada por el turno siguiente | Contramovimiento con fecha de anulación | Salida física asociada al turno real de desembolso | Vínculo al ticket original, responsable y turno |
| Pedido especial con anticipo Yape, cancelado sin devolver | Reversión del ingreso del pedido según contrato | Obligación de devolver el anticipo, no salida comprobada | `refund` contable ≠ reembolso ejecutado |
| Producto perecedero devuelto en mal estado | Reversión comercial si procede | Igual que canal efectivo/digital realmente usado | **No reponer stock vendible automáticamente** sin política de inspección |
| Anulación por error con nuevo ticket correcto | Reversión del ticket erróneo y nueva venta | Diferencia de dinero según cobro/reembolso real | Vínculo de corrección, sin doble venta ni doble devolución |

## Riesgos importantes y severidad

**Alta — Reembolso contable etiquetado como devolución efectuada:** cancelación de contratos escribe movimientos `refund` sin prueba de desembolso. Afecta Excel `Auditoría_Pedidos`, el resumen y la lectura de usuarios. No es evidencia de corrupción de la base, sino confusión semántica potencialmente dañina.

**Alta — Efectivo esperado antes de acreditar entrega:** caja descuenta el componente efectivo de compensaciones aunque `physicalDisbursementVerified` sea falso. El cálculo es una referencia provisional, no necesariamente efectivo físico real. Conservar `reconciliationPending` y separar obligación, estimación y dinero contado.

**Alta — Stock POS siempre se repone:** `posVoidRepository.js` incrementa stock de productos al anular. Para pan/torta preparada o alimento deteriorado, la reposición indiscriminada puede aumentar stock vendible incorrectamente. Requiere decisión de negocio y modelo de merma, no solo color UX.

**Media — Excel y dashboard explican poco el signo:** el resumen incluye compensaciones, pero no expone por canal: cobros brutos, anulaciones, reembolsos de pedidos, neto. Mes/año resume sin hojas dedicadas a efectos de anulaciones. Las etiquetas `DEVOLUCIÓN POS` y `Reembolso` son demasiado definitivas.

**Media — KPI promedio POS:** `posAverageTicket` divide el neto del período (incluidas anulaciones de otros períodos) entre los tickets confirmados del mismo rango. Esto puede producir promedios engañosos o negativos. Requerir dos indicadores si importa: ticket medio de ventas originales y neto por movimientos.

**Media — Permisos de anulación:** el POS permite anular a `dueño` y `cajero` en la sede/caja habilitada, con Rules y transacción. Considerar aprobación del dueño para montos altos, devoluciones entre turnos o diferente canal.

**Baja/operativa — Excel por período grande:** actualmente lee movimientos históricos individuales, con topes y falla sin exportar parcial; separación de hojas no debería introducir consultas adicionales. Proyectar desde los mismos datos ya descargados.

## Decisión recomendada — 3 vistas sobre una sola autoridad

### Vista A. Resultado comercial

`Ventas y cobros registrados` + `Compensaciones comerciales (negativas)` = `Neto comercial por período`.

- Preservar valores negativos cuando corresponda; nunca aplicar `Math.max(0, …)` para ocultarlos.
- Etiquetar por fecha de **movimiento** y ofrecer vínculo/fecha del ticket original.
- Separar POS y pedidos, luego efectivo/digital.
- No sumar una devolución real por segunda vez como gasto que reduzca ingresos: el efecto comercial ya está registrado.

### Vista B. Flujo real de fondos

`Saldo inicial/fondo` + `Entradas de efectivo comprobadas` − `Salidas efectivas verificadas` ± `Ajustes autorizados` = `Efectivo físico esperado`.

- Mostrar aparte saldo físico contado y diferencia.
- Mostrar transferencias digitales cobradas, devoluciones confirmadas, pendientes de verificación, pero **no afirmar saldo real de una billetera bancaria** sin integración/extracto.
- Registrar el **canal real de devolución**, que puede diferir del método original de la venta.

### Vista C. Obligaciones pendientes

`Compensaciones que requieren devolver dinero` − `Desembolsos acreditados` = `Pendiente por devolver`.

- Estados posibles: `NO_APLICA`, `PENDIENTE`, `PARCIAL`, `CONFIRMADO`, `INCIDENCIA`.
- Deben registrarse responsable, fecha, monto, canal y referencia/evidencia sin duplicar datos privados innecesarios.
- El dueño debe poder auditar, y montos altos requerir aprobación según política de negocio.

## Opciones y evaluación

| Alternativa | Esfuerzo | Riesgo de cambiar cálculos | Valor | Decisión |
| --- | --- | --- | --- | --- |
| A: conservar netos firmados y aclarar etiquetas | Bajo | Bajo | Evita confusión inmediata | Incorporar |
| B: desglosar cobros, anulaciones y reembolsos por canal en dashboard y Excel | Medio | Medio si no se reutiliza `aggregateReport` | **Muy alto** | **Prioridad 1** |
| C: distinguir caja física, cuentas digitales y devoluciones reales | Medio como presentación, alto como registro nuevo | Medio/alto | **Muy alto** | **Prioridad 1 semántica; registro después** |
| D: ledger tipado completo y conciliaciones formalizadas | Alto | Alto | Alto a escala | Posponer hasta definir modelo y migración |

**Decisión:** combinar A+B inmediatamente como siguiente fase técnica, y diseñar C antes de implementar nuevos registros. No agregar D por reflejo. Proteger registros históricos y evitar doble contabilización.

## Propuesta de presentación — dashboard

- Ingresos comerciales netos: S/ N (puede ser negativo y debe explicar por qué).
- Para cada canal: **Cobros registrados (+)**, **Compensaciones comerciales (−)**, **Neto atribuido (=)**.
- Indicador operativo separado: **Reembolsos por confirmar**, por importe, número y antigüedad.
- En caja: **efectivo esperado provisional** y **efectivo contado** junto con estado de conciliación.
- Al hacer clic en un importe: lista de movimientos con fecha, origen, método original y estado de devolución; sin UUID expuestos por defecto.

## Propuesta de presentación — Excel

Mantener hojas actuales y agregar desde los datos ya leídos:

1. `Resumen_Financiero`: por POS y pedidos, cobros brutos, compensaciones, neto; desglose por canal; período y hora de actualización; notas `neto contable ≠ dinero disponible`.
2. `Conciliacion_Canales`: día/sede/canal, cobros, compensaciones, neto atribuible; totales que reconcilien exactamente con Resumen y Dashboard.
3. `Compensaciones_POS`: fecha de venta, fecha de anulación, sede, referencia, motivo, valor y componentes originales, estado de devolución `NO_VERIFICADO` hasta existir evidencia explícita.
4. `Reversiones_Pedidos`: cancelación, adelantos compensados por método original, pendiente por reintegrar y estado real (si existe); no rotular como devolución realizada sin confirmación.
5. **Posterior:** `Desembolsos_Confirmados` cuando exista ledger propio de devoluciones físicas/digitales reales. Separar con claridad fecha, canal y responsable.

Preservar los topes existentes, sanitización de Excel, filtros por negocio/sede, deduplicación, decimales en céntimos y fallo total ante lectura incompleta. No introducir nuevas lecturas para el desglose.

## Fases sugeridas

### F13-00 — Especificación e invariantes financieras (sin tocar datos)
- Decidir formalmente si las compensaciones con fecha actual se atribuyen al período del movimiento; mantener histórico sin reescritura.
- Precisar glosario: anulación, compensación, obligación, devolución, conciliación, stock.
- Definir tratamiento de anulación parcial, merma, canal de devolución distinto, cierre de turno y factura/boleta fiscal.

### F13-01 — Dashboard y Excel transparentes
- Extraer el desglose a **una función pura común**, alimentada por los mismos registros actuales que `aggregateReport`.
- Agregar subtotales sin cambiar el neto existente ni sus Rules.
- Reetiquetar `DEVOLUCIÓN POS` como `COMPENSACIÓN / ANULACIÓN POS` cuando no esté acreditada entrega.
- Tests de reconciliación entre dashboard y Excel: mismo input y periodo -> mismos totales.

### F13-02 — Modelo de obligación de reembolso, independiente de venta/cancelación
- Diseñar ID de obligación único por origen, estados tipados, múltiples devoluciones parciales, canal real, responsable y prueba; proteger idempotencia/autorización con Rules/transacción.
- No convertir los recibos existentes en pagos realizados. Históricos sin evidencia = `NO_VERIFICADO` o `PENDIENTE_DE_REVISION`, no `CONFIRMADO`.

### F13-03 — Arqueo físico y conciliación
- Incorporar a la referencia física únicamente desembolsos acreditados, pero mantener proyección contable anterior para comparación/migración.
- Soportar distintos turnos y bloqueo de operaciones concurrentes; conciliación del dueño separada del cierre operativo.

### F13-04 — Política de stock perecedero y pruebas extremas
- Decidir entre devolución a stock vendible, merma, inspección y sin retorno físico. Nunca reponer automáticamente como consecuencia inevitable de una compensación.
- Simular 10–20 tiendas sobre datos aislados y límites de lecturas/escrituras.

## Matriz mínima de pruebas antes de aprobar cambios financieros

1. Venta y anulación mismo día (efectivo, Yape, Plin, mixto); netos correctos.
2. Venta ayer y anulación hoy; neto negativo legítimo y explicación visible.
3. Anulación hoy sin reembolso ejecutado; saldo comercial cambia, flujo real no cambia, deuda de devolución queda pendiente.
4. Devolución parcial; pendiente disminuye exactamente una vez.
5. Devolución digital pagada en efectivo; el canal real de salida es efectivo.
6. Anulación de venta de caja cerrada ejecutada en nuevo turno; no reescribir el cierre anterior.
7. Doble clic, reintento tras pérdida de red, lectura incierta, dos dispositivos; operación idempotente.
8. Pedido con adelanto Yape cancelado: Excel **no debe afirmar desembolso** sin evidencia.
9. Producto perecedero que no puede volver a venderse; stock no debe crecer sin inspección.
10. Excel resumen/detalle/canales igual a las cifras de dashboard, en hoy/semana/mes/año y todas las sedes.
11. Emisión de comprobante fiscal cuando aplique: proceso fiscal independiente o vinculado a nota de crédito emitida válidamente.

## Aspecto fiscal (Perú)

Una anulación interna del POS no sustituye necesariamente la emisión de una nota de crédito electrónica cuando existe una factura o boleta electrónica que deba rectificarse. Fuente oficial: https://cpe.sunat.gob.pe/tipos_de_comprobantes/nota_de_credito . La validación normativa y del régimen tributario se hará por separado, con asesoría contable.

## Restricciones para la siguiente intervención con Codex

- No ejecutar Git/GitHub ni despliegues: el propietario gestiona ramas y publicación.
- **No modificar aún** transacciones, Rules, datos históricos ni contratos/caja financieros sin aprobar F13-00.
- Para implementar cambios financieros posteriores sí serán obligatorias pruebas unitarias, integración con emuladores y CI, aunque en fases exclusivamente visuales se hayan omitido.
- Separar claramente cambios de **presentación** de cambios de **semántica financiera**.

## Dictamen

La arquitectura actual tiene controles positivos de idempotencia y conciliación aritmética. El bloqueo actual es **semántico y operativo**: un ingreso neto firmado puede leerse como saldo disponible, y la reversión contable puede confundirse con dinero realmente entregado. También hay un riesgo de stock en productos perecederos. La decisión preferida es **A+B+C escalonadas**, sin imponer una nueva arquitectura ledger completa de entrada.
