# MigaPOS P29 v2 — Cuadre, notificaciones y anulaciones en Excel

**Auditoría cerrada · 16/11/2026 (Lima).** Repo `saintdeyb321/Mig`, rama `fix/migapos-production-readiness`, **HEAD verificado `17ee038025409f648fc7e8e0a3ad526ec4e0862a` (P28)**. Sustituye cualquier instrucción anterior para este problema. Objetivo: **cero falsas incidencias de caja cuando la diferencia calculada es S/ 0.00; cancelaciones visibles al dueño, notificaciones con severidad correcta y estados de anulaciones legibles en Excel**, sin tocar la autoridad financiera.

## 1. Diagnóstico comprobado (NO volver a auditar)

| Archivo / función | Evidencia y causa |
|---|---|
| `functions/src/cash-register/domain/cashTotals.js` → `calculateCashTotals` | `expectedCash = openingAmount + posCash + contractCash + posCompensationCash`. Los `refund` de contrato se restan por canal; los de Yape/Plin no reducen efectivo. `hasUnverifiedDisbursements` se activa si existen compensaciones POS o reintegros de contrato sin `physicalDisbursementVerified`. **Es una falta de evidencia de desembolso, no una diferencia en el arqueo.** |
| `frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js` → `preview`, `close` | `difference = declaredAmount - expectedCash`; `requiresOwnerReview` se enciende por compensaciones aunque la diferencia sea 0. Guarda `closeEstimate.authority = 'client-estimate'`, `reconciliationPending = true`. **No está autorizado presentarlo como conciliación final**. |
| `frontend/src/modules/CashRegisterModals.jsx` → `CashCountSummary`, cierre de turno | `provisional = hasUnverifiedDisbursements || expectedAmount < 0` y se evalúa *antes* de `difference === 0`: muestra «Por revisar» aunque ambas cifras coincidan. El textarea aparece por `hasUnverifiedDisbursements` incluso con diferencia cero. |
| `frontend/src/features/contracts/infrastructure/sparkContractsRepository.js` → `cancel` | Reversión de pagos confirmada por transacción, un documento `payments` tipo `refund` por canal y actualización del contrato (`status:'cancelado'`, `cancelOperationId`, `voidedBy`, `voidedAt`, `voidReason`). **Son reversos contables, no constancia de entrega real de efectivo.** El contrato cancelado mantiene `contractNumber` y `clientName`, pero `paidByMethod` queda en cero; NO usar `total` como importe devuelto. |
| `frontend/src/features/notifications/infrastructure/notificationQueryRepository.js` | `subscribeUnreadNotifications` del dueño observa `pos_voids`, `cash_sessions` cierres/vencimientos, **no contratos anulados**. `projectFinancialNotice('cash-close')` crea avisos por cuadre provisional, incluso si su diferencia es cero. El marcador de leído ya es por `sourceType + sourceId + uid`. |
| `frontend/src/components/NotificationBell.jsx` | Todos los cierres reciben `noticeStyles.cash` (amarillo) aunque la diferencia sea negativa. Solo `pos-void` usa rojo. Además imprime `S/ -25.30` junto a «Faltante», en lugar de magnitud positiva. |
| `firestore.rules` → `financialNoticeRead` | Solo admite `pos-void`, `cash-close`, `cash-expiry`: una nueva fuente `contract-cancel` **no se podrá marcar como leída** sin un cambio limitado de reglas. |
| `firestore.indexes.json` | No contiene índice para cancelaciones ordenadas por `voidedAt` con filtro `businessId` y `status`. **Agregar uno específico antes de publicar este flujo.** |

### Semántica obligatoria

- **Conteo coincide** significa `difference === 0` con números finitos y referencia calculable; **no** significa que un reembolso haya sido entregado físicamente ni que la conciliación final esté certificada.
- La anulación comercial y el comprobante del desembolso son hechos distintos. **No eliminar ni modificar `hasUnverifiedDisbursements`, `requiresOwnerReview`, `closeEstimate`, `reconciliationPending`, saldos negativos, reglas de cierre ni ledger.**
- Si `expectedAmount < 0`, es `NaN`, es no finito, hay operaciones sin respaldo o `difference` no es calculable, nunca presentar «Coincide» por conveniencia.
- **No crear eventos de caja** por devoluciones; el dueño verá **avisos propios de anulaciones**. Una diferencia de efectivo auténtica sigue apareciendo como faltante/sobrante.

## 2. Cambios de ejecución exactos

### A. Modal de cierre · `frontend/src/modules/CashRegisterModals.jsx`

Separar el estado del **conteo** de la señal `hasUnverifiedDisbursements`. Orden de decisión:
1. Referencia inválida, negativa o diferencia no calculable → «Referencia de caja por verificar» (warning; mantener los bloqueos existentes; no fingir igualdad).
2. `difference < 0` → **«Faltan S/ X.XX»**, superficie y borde **rojo pálido/rojo**.
3. `difference > 0` → **«Sobran S/ X.XX»**, superficie y borde **crema/ámbar**.
4. `difference === 0` → **«El conteo coincide»**, **verde**, aunque haya anulaciones contables; línea «El efectivo contado coincide con la referencia calculada». No llamarlo «conciliación verificada».

El formulario «Observaciones para el dueño» solo por diferencia monetaria real / anomalía no calculable que ya exija explicar; **no solo** por `hasUnverifiedDisbursements` con cero. Conservar `required` para faltante o sobrante y los requisitos de `close()`. Si hace falta indicar devolución no verificada, poner **nota discreta exclusivamente dentro de «Ver detalle del cuadre»**, sin alerta principal ni formulario forzado: «Los ajustes contables se revisan por separado; no demuestran entrega de efectivo». Mantener la altura adaptable P27 y controles accesibles.

### B. Nueva notificación para cancelación de pedido · `notificationQueryRepository.js`

**Reutilizar proyección inmutable existente, sin Cloud Functions y sin insertar alertas financieras desde el navegador.** Agregar UNA fuente owner-only a `sources`, `['contract-cancel','contracts','voidedAt', NOTIFICATION_LIMIT]`, pero usando consulta **especializada** con `where('businessId','==',businessId)`, `where('status','==','cancelado')`, `orderBy('voidedAt','desc')`, `limit(NOTIFICATION_LIMIT)`; no reutilizar la query genérica sin filtro de estado. Los contratos cancelados hace tiempo pero anulados hoy deben aparecer. Validar registro `sparkContractVersion === 1`, `status === 'cancelado'`, `voidedAt` verificable, `voidedBy`, `cancelOperationId`, negocio y sede; `sourceId = contract.id` estable. No consultar `payments` uno por uno ni emitir avisos duplicados por cada método.

**Atención:** `projectFinancialNotice()` actualmente descarta cualquier fuente sin `source.userId` al principio. Un contrato tiene `voidedBy` pero NO `userId`: mover esa validación por tipo para que `contract-cancel` utilice `voidedBy`, conservando la validación `userId` de las otras fuentes. En `projectFinancialNotice('contract-cancel',...)` devolver **un aviso rojo por contrato**, título «Pedido cancelado», referencia comercial (`contractNumber`), sede, responsable (`voidedBy`), fecha exacta Lima (`voidedAt`) y motivo (`voidReason`) como texto seguro. Mensaje corto: «Pedido anulado. Revisa los reembolsos registrados; el registro no confirma que el cliente haya recibido el dinero». **No mostrar S/ total del pedido como monto reembolsado**; no inventar importe: este documento no guarda monto efectivamente entregado. Mantener `authority:'evidence-projection'`, `readMarker`, ID `read_contract-cancel_<contract.id>_<ownerUid>`, deduplicación, límite de 30 y verificaciones de snapshot confirmado. Para cajeros NO abrir este stream adicional.

**Marker security:** en `firestore.rules` ampliar SOLO `financialNoticeRead` para `'contract-cancel'`; resolver `source` desde `/contracts/{sourceId}` en esa rama; exigir `source.businessId == currentBusiness()`, `source.sparkContractVersion == 1`, `source.status == 'cancelado'`, `source.voidedAt is timestamp`, `source.cancelOperationId is string`, además del resto de condiciones idénticas owner/read-marker/ID seguro. No permitir que un cliente cree un aviso arbitrario. Otras reglas de pagos, caja, contratos y POS intactas.

**Índice mínimo:** añadir a `firestore.indexes.json` índice COLLECTION `contracts`: `businessId ASC`, `status ASC`, `voidedAt DESC`, `__name__ DESC`, siguiendo el estilo ya usado. La operación deberá poder consultarse sin error `failed-precondition`; anotar que **se requiere publicar índice y reglas antes de habilitar el frontend en producción**. Si el entorno del repo impone especificación distinta, preservar nomenclatura oficial de Firestore, sin crear índices de más.

### C. Colores y lenguaje de campanita · `NotificationBell.jsx` y `projectFinancialNotice`

Resolver severidad **por fuente y diferencia firmada**, no solo por `sourceType`:
- `pos-void` y `contract-cancel`: **danger**, `border-l-danger`, borde rojo y fondo `bg-danger-soft`, etiqueta «Anulación de venta» / «Pedido cancelado».
- `cash-close` con `metadata.difference < 0`: **danger** (faltante). Etiqueta «Falta efectivo», mostrar **`S/ abs(difference)`** en rojo.
- `cash-close` con `metadata.difference > 0`: **warning** (sobrante), `border-l-warning`, fondo crema, mostrar **`S/ difference`**.
- `cash-expiry` y cierres sin referencia calculable: **warning** con explicación específica, nunca «faltante» si no es computable.
- Cierre con **diferencia confiablemente calculada 0**: **NO producir incidencia**, independientemente de quién cerró o de anulaciones. Si `reconciliationPending === false` y `requiresFinancialReview !== true`, preferir `source.difference` finito (dato reconciliado); si todavía está pendiente, usar `closeEstimate.difference` solo con `authority:'client-estimate'`, identificado como estimación. Un `status:'closed_with_discrepancy'` contradictorio o diferencia no verificable no debe quedar silenciado. Los cierres normales permanecen en la auditoría; las cancelaciones tienen aviso separado.

Textos simples, hora con zona `America/Lima`, sede y responsable. No cambiar la apariencia de los avisos informativos neutros. Evitar presentar un cierre provisional como arqueo oficial. Preservar `markAsRead`, `markAllAsRead`, estado unread confirmado y marcado idempotente. No duplicar `amount` del pedido sin fuente real.

### D. Detalle Excel: anulaciones rotuladas **ANULADO** en rojo (solo presentación/exportación)

**Evidencia visual aportada:** en `Detalle_<sede>` una venta original posteriormente anulada aparece con **Estado `Anulada`** en gris, mientras la fila de compensación muestra **`Anulación registrada`** (también gris). Esto ocurre independientemente del medio de pago; hay que corregirlo también para operaciones **MIXTO (efectivo + Yape/Plin)**. El dueño debe reconocer de inmediato qué está anulado, sin confundirse entre el ticket original y el ajuste.

**Archivos precisos:** `frontend/src/utils/salesDataProcessor.js` (`processSales`, `groupedTicketRows`), `frontend/src/features/reports/application/salesWorkbook.js` (`columnOptions.Estado`, esquema) y, **solo si es imprescindible para el color**, `frontend/src/utils/excelHelpers.js`. Reutilizar la paleta `danger` roja y bordes negros existentes de P27/P28. **No añadir nuevas columnas ni tocar Firestore.**

1. En la hoja **`Detalle_<sede>`**, fijar la etiqueta visible **`ANULADO`** para el estado de (a) ticket POS original con anulación/compensación vinculada y (b) movimiento `COMPENSACIÓN POS` / `VENTA POS ANULADA`. No depende del medio de pago: efectivo, Yape, Plin y mixto se comportan igual. No sustituir `Movimiento`: debe seguir diciendo **`VENTA POS`**, **`COMPENSACIÓN POS`** o la variante histórica correspondiente para distinguir el origen del ajuste y evitar interpretaciones de dos devoluciones.
2. Caso histórico que se etiqueta hoy `Anulada · por revisar`: conservar la advertencia explícita como **`ANULADO · POR REVISAR`**, también en rojo, para **no presentar como comprobada** una anulación sin respaldo. No transformar documentos incompletos en anulaciones confirmadas.
3. Aplicar **a la celda Estado** borde negro `thin` y estilo `danger`: texto rojo intenso legible, fondo rojo muy pálido, negrita; mantener el resto del formato compacto, colores de productos, separadores y negativos de los subtotales. Los estados `Completada` permanecen verdes.
4. `groupedTicketRows` actualmente identifica totales de anulaciones mediante `movement.Estado.startsWith('Anulada')`. Adaptar esa condición para reconocer `ANULADO` / `ANULADO · POR REVISAR` mediante estado o **tipo de movimiento explícito**, sin alterar los totales: el ticket original ya anulado mantiene **TOTAL TICKET S/ 0.00** cuando exista compensación, y el ajuste mantiene **TOTAL AJUSTE negativo**. Ningún cambio en cantidad con signo, `Importe neto movimiento (S/)`, secuencia temporal o reconciliación financiera.
5. Evitar cambiar los textos o estados de las hojas **`Auditoría_Cajas`**, **`Estado_Pedidos`**, **`Auditoría_Pedidos`**, y los estados operativos en la base de datos. Limitar esta normalización al **detalle POS**.

**Pruebas concretas:** en `tests/reports.test.mjs` y `tests/excel-export.browser.test.mjs` agregar/verificar una venta completada, venta anulada con compensación posterior y una **venta mixta anulada**. Afirmar `Estado === 'ANULADO'` para original y compensación; `Movimiento` sigue distinguible; celda de Estado con fondo `danger` y texto rojo; `TOTAL TICKET`/`TOTAL AJUSTE`, netos, signos y bordes negros idénticos. Actualizar únicamente aserciones antiguas de textos `Anulada` / `Anulación registrada` impactadas por este cambio. Sin reestructurar pruebas de otras hojas.

### E. Funciones **que NO deben tocarse** salvo fallo demostrado por test

`calculateCashTotals`, `sparkContractsRepository.cancel`, `sparkCashClosingRepository.close/preview`, `posVoidRepository`, `functions/src/cash-register/handlers.js`, reglas financieras de esos recursos. No simular reembolso físico, ni crear ventas compensatorias, ni cambiar reglas de saldo, ni usar una función nube nueva.

## 3. Casos de aceptación y pruebas (mínimas y precisas)

1. **S/100 anticipo en efectivo + cancelación S/−100 + ventas POS posteriores**; referencia 83.30 / contado 83.30 / diferencia 0; la pantalla **verde «El conteo coincide»**, sin observación exigida por anulación. El contrato cancelado genera **exactamente un aviso rojo** visible al dueño (aunque lo anulase el cajero); no afirma desembolso real de S/100.
2. Fondo S/100, reembolso contable de contrato S/−50 de otro turno, contado S/50 → referencia S/50, diferencia 0, verde. Si se contaron S/100 → **sobran S/50** (ámbar), no faltan; el ajuste sigue marcado como sin evidencia física cuando corresponda.
3. Referencia S/83.30 / contado S/70.00 → **faltan S/13.30**, rojo + observación requerida. Referencia S/83.30 / contado S/90.00 → **sobran S/6.70**, crema + observación requerida.
4. Conteo con referencia no verificable o negativa → no «Coincide», indicar cautela y respetar validación preexistente.
5. Cierre `cash-close` con diferencia válida 0 y `reconciliationPending=true` → **no campanita de incidencia**, tanto si lo hizo dueño como cajero. Cierre negativo sí rojo; positivo sí crema; vencimiento sin arqueo ámbar.
6. Anulación POS → roja; anulación de pedido con múltiples canales → **una** roja por contrato, motivo y hora Lima, sin falso importe reembolsado. «Marcar leída» persiste después de recarga y no se filtra entre tenants/usuarios.
7. Pruebas contra perfiles dueño, cajero y otro negocio: sin escrituras de avisos falsificados ni lecturas fuera de alcance. Cancelación de contrato antiguo anulada hoy debe figurar por `voidedAt`, no por `createdAt`.
8. Monitorización de cuota: solo **un stream acotado adicional para el dueño** (no N consultas de pagos por contrato ni nuevos listeners para cajeros); navegación y cierre del modal no duplican listeners. No aumentar lecturas con polling.
9. En `Detalle_<sede>` (incluido POS **mixto**), la venta anulada y su compensación tienen Estado **ANULADO**, celda **rojo pálido + texto rojo**; la anulación histórica sin evidencia se distingue **ANULADO · POR REVISAR**. Se mantienen la columna Movimiento, signos y totales: original con `TOTAL TICKET` 0 cuando corresponda; ajuste negativo en `TOTAL AJUSTE`. Un ticket válido sigue `Completada` verde.

Pruebas focalizadas: extender `tests/reports.test.mjs` y `tests/excel-export.browser.test.mjs` solo para anulaciones POS y exportación mixta; extender tests de proyección/notificaciones (puede añadirse `tests/financial-notifications.test.mjs` con `node --test`), integración visual de confirmación de caja y campanita (`tests/cash-amount.browser.test.mjs`, fixture existente o test específico), y permisos marcador owner-only en `tests/spark.rules.test.mjs` o archivo de reglas financiero que ya pruebe notificaciones. Ejecutar `node --test tests/cash.domain.test.mjs tests/financial-notifications.test.mjs` (si nuevo test), más pruebas específicas de Rules **solo si hay emulador ya disponible**. Usar las herramientas/scripts existentes, no instalar nada para esta fase. No ajustar tests para ocultar diferencias.

## 4. Contrato de entrega de Codex

Modificar únicamente los archivos detallados y pruebas directas; no expandir a módulos ajenos. **Sin comandos `git`, `gh`, GitHub, instalación de dependencias, commit, push, merge ni deploy**; preservar cambios locales P28. Salida final ≤12 líneas: archivos tocados, resultados exactos de pruebas, índice/reglas pendientes de publicar, limitaciones reales. Si algo no es verificable localmente, declarar NO EJECUTADO, nunca afirmar éxito.
