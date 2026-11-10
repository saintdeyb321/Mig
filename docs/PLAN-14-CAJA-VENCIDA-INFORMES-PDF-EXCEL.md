# MIGAPOS — PLAN 14: Recuperación segura de caja vencida + informes gerenciales PDF/Excel

**Fecha:** 9 de noviembre de 2026 · **Producto:** MigaPOS · **Base inspeccionada:** `fix/migapos-production-readiness`, commit `c8219a8bb482cbbfefd4fd6be090dd8ee48e1c8e` («Correccion Excel»). La carpeta local podría contener cambios posteriores; inspeccionarla sin utilizar Git/GitHub.

**Objetivo comercial:** terminar los dos problemas que afectan directamente al primer piloto: una caja vencida durante días que bloquea la sede, y reportes que contienen cifras correctas pero no comunican claramente su significado a los propietarios.

**Decisión de arquitectura:** 1) recuperar un turno vencido mediante una operación autorizada, atómica e idempotente, **sin inventar dinero contado**; 2) ofrecer un **informe gerencial en HTML imprimible/guardable como PDF** y conservar **Excel como detalle auditable**, ambos basados en una **única proyección financiera verificada**; 3) medir lecturas reales antes de afirmar capacidad para 20 negocios.

---

## 1. Hechos comprobados en el repositorio

- `frontend/src/features/cash-register/infrastructure/sparkCashRepository.js` crea `cash_sessions/{sessionId}` y `active_cash_sessions/{hash(businessId,branchId)}`; las sesiones Spark incluyen `durationHours: 10` y `openedAt` con hora del servidor.
- `firestore.rules`: `cashOpening` y `newCashLock` exigen el candado y la sesión nueva; `saleContext` restringe **hora del servidor < openedAt + 10h**; `cashClosing` solo permite un cierre con `declaredAmount` numérico y `closeEstimate`; `releaseCashLock` solo acepta `closed` o `closed_with_discrepancy`; `active_cash_sessions` no permite actualizar el candado. **Vencer el turno no libera el candado.**
- `frontend/src/features/cash-register/hooks/useCashRegister.js` muestra `isExpired` calculado por reloj local e impide operaciones, pero no desencadena recuperación financiera. `createSession` en `cashRegisterRepository.js` también bloquea por `findOpenSession` si existe turno anterior.
- `frontend/src/features/reports/application/cashAuditRows.js` mezcla filas de apertura y cierre bajo **«Fecha Cierre»**, presenta `openingAmount` como **«Contado Real»** y usa «Pendiente» donde no hay un conteo de cierre. Esto induce a errores de interpretación.
- `frontend/src/features/reports/infrastructure/sessionReportReads.js` reutiliza lecturas por negocio/sede/período mediante `resources.read`, con TTL de 2 minutos (hoy/semana) y 15 minutos (mes/año). El PDF debe **reutilizar estas lecturas**, no crear otro lector independiente.
- `frontend/src/features/reports/domain/reportTotals.js` dispone de la conciliación monetaria por canal y recibos de anulación. El caso histórico `voided` con anulación en períodos distintos sigue documentado como pendiente; **no esconderlo en PDF**.
- `frontend/src/features/reports/application/salesWorkbook.js` usa `xlsx-js-style`, exporta hojas de resumen y detalle por sede. Se mantienen los Excel existentes y se mejora su vocabulario y legibilidad sin sustituir el motor.
- `frontend/src/shared/printing/printDocument.js` ya tiene impresión con iframe aislado, CSP y eliminación de scripts/atributos peligrosos. **Reusar/extender con cuidado**, sin relajar CSP. Este sanitizador **elimina SVG**, así que no diseñar gráficos PDF confiando en iconos Lucide/SVG dentro del HTML de impresión.
- `frontend/src/config/runtimeCapabilities.js`: `cloudFunctions: false`, `cashReconciliation: false`, `offlineSync: false`. No prometer cierre programado remoto, conciliación automática ni ventas offline sincronizadas.

## 2. Política de vencimiento: no confundir tres conceptos

**A. Límite actual obligatorio:** 10 horas **desde apertura**. Ya está aplicado por Rules. Un cajero activo durante diez horas también debe abrir un turno nuevo. **Implementar primero recuperación automática asistida de ese estado**.

**B. Inactividad real de diez horas:** requeriría `lastFinancialActivityAt` **confiable** actualizado a la par de cada venta, pago, compensación y otros movimientos confirmados, y rehacer las condiciones de Rules. Actualizar el mismo candado en cada venta añadiría escrituras, conflictos concurrentes y consumo de cuota. **NO simular inactividad con clics, `localStorage`, estado del navegador o reloj cliente; NO ampliar las 10h actuales sin una implementación atómica y una auditoría separada.** Codex debe documentar la variante si se considera necesaria, no implementarla a ciegas.

**C. Cierre remoto exacto mientras nadie abre MigaPOS:** en Spark no hay un proceso servidor programado; no prometerlo. La recuperación se materializa **cuando una cuenta autorizada inicia la próxima operación**. `setTimeout` es informativo, no autoridad. Firestore TTL elimina documentos de forma diferida y no pertenece al cupo gratuito; está prohibido usarlo para borrar el historial de caja.

**Copy UX obligatorio:** «Turno vencido por límite de 10 horas», nunca «10 horas sin actividad» salvo que la variante B se implemente y valide de verdad.

## 3. Recuperación de caja vencida — contrato financiero

### 3.1 Estados y campos propuestos

- Estado actual: `open`.
- Estados de cierre manual existentes: `closed`, `closed_with_discrepancy`.
- Nuevo estado diferenciado: **`expired_unreconciled`** («Vencida · sin arqueo»), o un nombre único equivalente documentado. No hacerlo pasar por `closed` ni `closed_with_discrepancy` con diferencia 0.
- Datos a preservar: `id`, `businessId`, `branchId`, `userId` original, `cashierName`, `openedAt`, `openingAmount`, `openingNote`, `durationHours`, ventas y pagos de esa sesión.
- Datos nuevos mínimos, tipados y auditables: `expiredAt` lógico derivado de `openedAt + 10h` (solo si puede validarse desde datos servidor), `recoveredAt` con `serverTimestamp`, `recoveredBy` (UID de quien recupera), `recoveryReason: 'shift-time-limit'`, `reconciliationPending: true`, `declaredAmount: null`/ausente, `difference: null`/ausente y campo de versión/protocolo si es necesario. `closedAt` puede registrar cuándo se formalizó el vencimiento **solo si su semántica en todas las lecturas queda explícitamente definida**; no usar ese campo para hacer creer que hubo arqueo.
- Si se almacena `closeEstimate`, debe quedar **claramente como estimación no conciliada**. Una caja vencida puede no tener aún esa estimación; jamás inventar S/0, S/100, sobrante o faltante.
- El efectivo real de la caja antigua permanece **NO DECLARADO**. Diferencia **NO CALCULABLE**. El fondo inicial de la nueva caja lo introduce el operador y **NO se hereda** automáticamente del turno viejo.
- No editar registros de ventas, pedidos, anulaciones, inventario o cierres históricos para liberar el candado.

### 3.2 Regla de desbloqueo

Operación explícita «Recuperar turno vencido y abrir nueva caja», iniciada por dueño o cajero **activo y autorizado para la misma sede**. Cuenta Gmail/UID se usa como responsable, no como dueño del candado. El dueño debe poder intervenir en sus sedes según los permisos actuales; el cajero de otra sede no.

Precondiciones verificadas por **servidor y Rules**, nunca solo cliente:
1. Negocio, sede, licencia, actor y turno autorizado.
2. `active_cash_sessions/{branchLockId}` existe y apunta a `cash_sessions/{oldId}` del mismo negocio y sede.
3. Sesión antigua `runtime:'spark'`, `status:'open'`, `durationHours:10` y `request.time >= openedAt + duration(10,'h')`.
4. Nuevo ID único, apertura autorizada y fondo numérico válido. `newSessionId !== oldId`.
5. La sesión histórica sin protocolo Spark o fechas válidas **no se fuerza**: mostrar «Revisión administrativa necesaria» con motivo.

**Preferido:** una transacción Firestore que lea sesión antigua, candado, perfil y sede, cambie estado del turno antiguo, sustituya/libere el candado e inicie la nueva caja de modo consistente. El método exacto (`update` del lock o `delete`+`create` dentro de la misma transacción, y `getAfter`) debe determinarlo Codex a partir de las restricciones de Rules y sus pruebas en emulador. **No publicar un esquema imposible de autorizar con Rules.**

**Alternativa segura:** dos transacciones idempotentes (primero recuperación y liberación, luego apertura normal), con estados explícitos y protección ante otro usuario que gane la carrera. No dejar duplicadas sesiones abiertas ni un bloqueo de cinco días en caso de caída entre pasos. Documentar qué sucede si el segundo paso falla.

El mecanismo de recuperación **no sustituye el cierre con arqueo** si el turno sigue operativamente activo; antes de vencer, usar cierre manual actual. Tras vencer, si se dispone de dinero contado, habilitar revisión posterior con trazabilidad separada, sin reescribir la declaración original ni fingir un conteo automático.

### 3.3 Requisitos de integridad

- Roles y alcance por negocio/sede; denegar usuario suspendido, cajero ajeno, `global` y sesiones antiguas no verificables.
- Idempotencia ante doble clic, dos pestañas, reintento y pérdida de respuesta; verificar por ID con lectura servidor.
- Comprobación de tiempo únicamente por `request.time` en Rules (reloj de cliente solo para aviso).
- Bloquear ventas viejas y evitar que sus escrituras se registren en la caja nueva.
- No fabricar transacciones offline; `offlineSync` sigue desactivado.
- Si hay borradores locales `draft_offline` o `submitted_uncertain`, conservarlos para revisión; nunca migrarlos silenciosamente a la nueva sesión.
- Los candados de otras sedes y negocios no cambian.
- Lecturas de reapertura acotadas por documento/ID (sin barridos globales) y estado de carga claro; en caso de 403/cambio de cuenta se muestra error sin declarar liberado el candado.
- Todo cambio de Rules/índices necesario se prepara **solo localmente**, se somete a tests de emulador y se deja **pendiente de publicación manual**. No desplegar.

### 3.4 UI concreta

Banner de vencimiento en POS/Caja: «La caja de esta sede venció al alcanzar 10 horas desde su apertura. Aún no se declaró el dinero contado». Mostrar dueño original, hora de apertura y la de vencimiento (America/Lima), sin fingir hora de cierre.

Acciones:
- «Revisar turno anterior» (solo lectura).
- «Recuperar y abrir nueva caja» (confirmación; formulario de nuevo fondo inicial; explicación de no conciliado).
- «Reintentar comprobación» si el resultado es incierto.

Finalizado: tarjeta «Turno anterior: vencido, sin arqueo, pendiente de revisión» y «Nueva caja: abierta y confirmada», con IDs/fechas accesibles en detalle; CTA Cobrar solo habilitado cuando hay una caja nueva **confirmada por servidor**.

## 4. Corregir la hoja Auditoría_Cajas y las métricas

**Problema reproducible actual:** apertura con fondo S/100 aparece bajo `Fecha Cierre`, `Contado Real S/100` y estado `Pendiente de revisión`. Ese S/100 es **fondo declarado en apertura**, no dinero contado al final.

Nuevo esquema claro (permitir adaptar nombres conservando compatibilidad probada):

| Fecha/hora (Lima) | Tipo de movimiento | Sede | Responsable original | Realizado/registrado por | Fondo inicial | Referencia calculada | Efectivo contado | Diferencia | Estado de arqueo | Observación |
|---|---|---|---|---|---:|---:|---:|---:|---|---|
| 09/11 09:00 | Apertura | Principal | Ana | Ana | S/100 | — | **No aplica** | **No aplica** | Abierta | Fondo declarado al abrir |
| 09/11 19:00 | Vencimiento | Principal | Ana | Luis (recuperó) | S/100 | No conciliado / estimación marcada | **No declarado** | **No calculable** | Pendiente de arqueo | Límite 10h; recuperado después |
| 09/11 19:05 | Apertura | Principal | Luis | Luis | S/50 | — | **No aplica** | **No aplica** | Abierta | Nueva caja, independiente |
| 09/11 21:00 | Cierre manual | Principal | Luis | Luis | S/50 | S/80 (provisional si aplica) | S/80 | S/0 (declarada) | Cierre operativo / conciliación pendiente | Conteo registrado |

Las filas anteriores son **ilustrativas, no datos reales**. En código, los importes son numéricos cuando existen y `null` cuando no; en la presentación usar «No declarado», «No aplica», «Pendiente», nunca convertir un `null` a 0 ni hacer `Number(value ?? 0)` en arqueos.

Añadir pruebas de ordenación por fecha real, período que cruza medianoche, sedes, turnos sin cierre y compatibilidad con plantillas preexistentes. La apertura no es un «cierre pendiente»: representa un evento distinto. No confundir `expectedCash` de navegador con saldo certificado.

## 5. Informes: decisión PDF gerencial + Excel auditable

### 5.1 Qué necesita saber el dueño (en 1–3 páginas de PDF)

**Página 1 — Panorama del negocio:**
- Negocio, filtro de fecha, zona horaria America/Lima, sucursal o vista global, fecha de generación, responsable, etiquetas de alcance y completitud.
- Tarjetas de **cobros registrados**, **compensaciones/reembolsos contables**, **neto contable**, POS vs pedidos, canales efectivo y Yape/Plin.
- Tickets confirmados y anulados; total de pedidos creados/entregados y «con saldo» (cantidad; no valor monetario si el modelo no lo provee).
- Explicación visible: «Neto contable no representa dinero disponible ni beneficio neto»; devolución contable no equivale a reintegro efectuado.

**Página 2 — Sucursales y operación:**
- Comparativa compacta por sede con ventas netas, canales, anulaciones y pedidos cuando los datos existan; suma de sedes = global.
- Top productos (unidades e ingresos), con unidades/ingresos negativos explicados si existen compensaciones.
- «Alertas que requieren revisión»: caja vencida sin arqueo, caja con diferencia, devolución no verificada, registros históricos que impiden conciliación.
- No ocultar estados pendientes ni imprimir falsos ceros.

**Página 3 opcional — Caja y notas:**
- Arqueos resumidos, separación apertura/cierre/vencimiento, contados, referencias y diferencias con estado.
- Definiciones breves y trazabilidad: fuente, filtros, momento de extracción, si es estimación o confirmación.

**Nunca:** decenas de páginas con tickets individuales bajo el nombre «informe gerencial». Los tickets y líneas detalladas permanecen en Excel; el PDF puede contener un anexo opcional acotado, elegido explícitamente por el dueño.

### 5.2 Diseño visual y arquitectura PDF

- Reutilizar Galaxy Nebula (crema, índigo, morado y menta) en versión **print-friendly**: fondo principalmente blanco, barras y pequeños acentos, contraste alto, sin gradientes oscuros extensos.
- React sirve para vista previa del informe. Crear plantilla HTML de impresión segura con CSS `@media print`, `@page { size: A4; margin: ... }`, `break-inside: avoid`, cabeceras repetibles en `thead`, renglones no divididos, pie de página cuando sea viable y estado de página. Probar A4 y orientación adecuada.
- Reutilizar o extender `createPrintJob`/`usePrintJobs`; verificar que el iframe de impresión actual de **320 px** no recorte una hoja A4. Mantener sandbox, CSP y sanitización. El limpiador elimina SVG: usar texto, CSS y figuras CSS sencillas; no depender de Lucide SVG en impresión.
- **Primera entrega:** botón «Imprimir / Guardar PDF», que usa el diálogo nativo. No afirmar «PDF descargado» automáticamente.
- **PDF directamente descargable en siguiente etapa (si imprescindible):** evaluar `pdfmake` (JS, cabeceras de tabla repetibles y paginación), con presupuesto de tamaño y sin incorporarlo de momento. No añadir dependencias al proyecto sin decisión del propietario.
- UI al dueño con dos acciones separadas «Informe PDF» y «Detalle Excel». Alertas de limitación, datos incompletos y fallos de impresión con recuperación. No mezclar fallo de PDF con Firestore 403.
- Escape estricto de texto de negocio, de productos y usuarios; sin `dangerouslySetInnerHTML` con datos sin escapar; preservar CSP, sin CDNs externos.

### 5.3 Modelo compartido, sin números divergentes

Arquitectura propuesta:

```
Firestore (ventas, pos_voids, pagos, contratos, sesiones)
   └── sessionReportReads(resources, negocio, sede, período)
         └── normalización validada + aggregateReport / funciones existentes
               └── ReportViewModel inmutable (céntimos, estados, procedencia, límites)
                     ├── Dashboard
                     ├── Informe HTML → imprimir / Guardar PDF
                     └── Excel auditado (resumen + detalle por sede)
```

No hacer que PDF lea XLSX ni que XLSX lea PDF. Ambos deben proyectar la **misma evidencia financiera**, sin crear queries nuevas solo por el formato. Consultas de caja, si se requieren, deben estar acotadas, cacheadas por identidad y reutilizadas entre formatos. Usar `resources.read`, TTL y cancelación existentes; no inventar `daily_stats` como fuente de verdad: en Spark actual `daily_stats` no tiene escritor de cliente autorizado en Rules.

### 5.4 Refactorizar EXCEL solo donde aporta claridad

**Mantener:** `Resumen_Financiero`, `Comparativa_Sedes`, `Productos_Global`, `Productos_Sedes`, hojas por sede, `Auditoría_Pedidos`, `Auditoría_Cajas` (según filtro/datos). No multiplicar hojas por caja, por día o por cajero.

**Cambiar presentaciones:**
- Resumen: primeras filas con etiquetas sencillas y los totales principales antes de detalles técnicos; diferenciar «Cobros», «Compensaciones», «Neto contable» y «Fondos/caja» en secciones.
- Detalle de tickets: encabezados claros «Fecha y hora», «Sucursal», «Responsable», «N.º de ticket», «Producto», «Cantidad», «Precio unitario», «Importe de línea», «Canal», «Estado», «Anulación», «Importe firmado»; evitar importes repetidos en filas por producto que se sumen indebidamente. Distinguir cabecera de venta de desglose de ítems con las relaciones ya existentes, sin generar filas inventadas.
- Pedidos: cobros reales registrados vs contramovimiento contable, saldo comercial y devolución física/digital **no verificada**. Separar significado de «Entregado», «Pagado», «Anulado».
- Caja: diferenciar apertura, cierre manual, vencimiento, arqueo declarado y conciliación pendiente.
- Formato `S/ #,##0.00`, fecha/hora de Lima, conteos enteros, negativos con signo, filtros, paneles o filas de aviso, anchos y freeze panes si la librería ya soporta estas opciones; Excel sin fórmulas inyectables desde nombres.
- Probar importación del XLSX y comparar contra `aggregateReport` en céntimos. Mantener exportación por sucursal y global.

## 6. Escalabilidad de Spark — 20 negocios × 100 ventas/sede/día

**Supuesto de capacidad solicitado:** 20 negocios × **2 sedes** × 100 ventas/día/sede = **4.000 ventas por día**, aproximadamente **120.000 ventas en 30 días**. Si fuese 1 sede por negocio: 2.000 ventas/día. Estos son **conteos de operaciones, no equivalencias automáticas de lecturas**.

Firestore Standard/Spark tiene **50.000 lecturas de documentos/día y 20.000 escrituras/día por proyecto** como cuota gratuita (pueden añadirse lecturas para validar Rules e índices). Si cada dueño de los 20 negocios descargara de cero todas las ventas del mes de dos sedes en el mismo día, el conjunto demandaría aproximadamente 120.000 documentos leídos, **antes** de pagos, anulaciones, sesiones, dashboard, Rules y otras consultas. Por tanto, **NO declarar aptitud para 20 negocios por el solo hecho de implementar PDF**.

**Otro límite ya existente:** `sessionReportReads` llama a `getSalesInPeriod(... maxRows: 10000)`. Con 2 sedes × 100 tickets diarios = **200 tickets/día por negocio**, un año tendría ~73.000 tickets: el informe anual basado en ventas individuales **supera claramente 10.000** (incluso unos 51 días de ese ritmo ya lo supera). Con una sede a 100 tickets/día, también supera el límite en algo más de 100 días. **No eliminar ni elevar ciegamente el límite para que el PDF anual funcione**; elegir un agregado diario validado, desglose por subperíodos con presupuesto y/o declarar explícitamente «resumen anual no disponible con el lector actual» hasta diseñar el escalamiento seguro. El botón «Año» de Excel y PDF no debe generar un resultado incompleto ni presentarlo como autorizado.

Optimización inmediata y autorizada:
1. Un solo conjunto de lecturas por `(identityKey,businessId,branchId,period)` reutilizado por Dashboard, PDF y Excel mientras sea válido. Cancelar al cambiar cuenta/sede; reintentar sin queries duplicadas; invalidar al confirmar operaciones.
2. Vista gerencial agregada en memoria desde datos **ya autorizados**; no cargar líneas adicionales para PDF.
3. Períodos grandes: límite explícito, aviso de coste, exportación solo si el rango puede certificarse; nunca truncar silenciosamente ni exponer informe parcial como definitivo.
4. Instrumentar contadores por operación: consultas, documentos recibidos, paginación, reglas estimadas, bytes, latencia y aciertos de caché. Probar escenarios 1/2 sedes y 20 negocios con **SDK simulado y emulador**. No enviar telemetría sensible ni hacer consultas remotas innecesarias.
5. Comparar el coste de abrir Dashboard y exportar ambos formatos con `warm cache` y `cold cache`. Objetivo funcional: **cero consultas adicionales por solo elegir el formato** si el snapshot necesario ya está cargado y vigente; las consultas explícitas de sesiones u otros datasets deben contarse y justificarse.

**Mejora de escala opcional y condicionada (NO implementar sin diseño de reglas):** materialización de resúmenes diarios por sede con actualizaciones atómicas e idempotentes al escribir ventas, pagos y compensaciones. En Spark actual `daily_stats` es de solo lectura para clientes y no se puede afirmar que represente los movimientos vigentes. Debe demostrarse su confiabilidad, su coste de escrituras, acceso de Rules, conflictos y doble contabilización antes de sustituir las lecturas históricas. Firestore `count()/sum()` puede reducir lecturas para métricas indexables concretas, pero no resuelve por sí solo compensaciones, productos, estados y sumas mixtas.

**Coste de Cloud Scheduler/Functions:** descartado por defecto en Spark; no prometer cierre remoto ni PDFs generados en servidor.

## 7. Plan de implementación recomendado, por prioridades

**P14-A — Caja segura (bloqueante para piloto):**
1. Pruebas que reproduzcan la sede bloqueada por caja Spark de hace 5 días.
2. Diseñar la transacción y reglas de recuperación; incluir dueños y cajeros de sede, incluso propietario de turno distinto; resolver concurrencia y fallos inciertos.
3. Implementar `expired_unreconciled`, liberación segura y nueva apertura independiente, sin arqueo ficticio.
4. Integrar UI, reglas, historial de caja y Excel de cajas.
5. Probar Rules + transacciones en `demo-migapos`, sin tocar producción. Si no puede garantizarse atomicidad, **bloquear la implantación y documentar un protocolo alternativo**.

**P14-B — Claridad y PDF gerencial (sin nueva persistencia):**
1. Crear contrato del ReportViewModel desde agregación existente.
2. Corregir significado de `Auditoría_Cajas` y de las columnas detalladas más confusas.
3. Añadir vista previa gerencial y «Imprimir / Guardar PDF», con 1–3 páginas y comparativas por sucursal.
4. Conservar Excel + verificar igualdad de netos por período/canal y alertas pendientes.
5. Medir consumo: no asumir que PDF evita las lecturas masivas históricas.

**P14-C — QA y gate comercial:**
- Node + Chromium + emulator Rules + lint + build/PWA + impresión HTML/PDF automatizada cuando sea posible; añadir suites bloqueantes a CI en una fase controlada.
- Prueba manual con dueño/cajero: 5 días vencido, recuperación, apertura y venta nueva, cierre manual de la nueva, Excel de caja, PDF del período, impresión A4.
- Separar «PASS local», «PASS CI por SHA», «BLOCKED» y «MANUAL». No dar GO por Build verde únicamente.

## 8. Matriz mínima de aceptación

| ID | Caso | Esperado |
|---|---|---|
| C01 | Apertura hace 9h59m, sin vencimiento | No se recupera; se mantiene el candado |
| C02 | Apertura hace exactamente 10h; otra persona autorizada en la sede | Recuperación con `request.time` válida; nueva apertura independiente |
| C03 | Caja lleva 5 días `open` con `durationHours:10` | Antigua `expired_unreconciled`; contado/diferencia `null`; candado ya no bloquea nueva caja |
| C04 | Dos pestañas recuperan simultáneamente | Solo una transición efectiva; una caja nueva activa como máximo |
| C05 | Un cajero de sede B quiere recuperar la de sede A | Denegado; cero cambios |
| C06 | Usuario deshabilitado / otro negocio / vista global | Denegado por Rules; cero cambios |
| C07 | Caja histórica sin protocolo Spark | Bloqueada para revisión, sin liberación automática |
| C08 | Falla de red después del commit | Verificar por ID; no repetir escrituras ni duplicar sesiones |
| C09 | Vencimiento sobre medianoche / 5 días | Fechas Lima correctas, sin modificar cierre de turno anterior |
| C10 | Caja nueva empieza con S/50 después de caja vieja con S/100 | Nueva caja S/50, **no S/150**; venta S/20 => S/70 esperado (sin movimientos adicionales) |
| C11 | Anulación/devolución del turno viejo | No pertenece automáticamente a la nueva caja; respetar reglas de movimiento por sesión y compensaciones |
| R01 | Hoja Caja de apertura S/100 | Tipo APERTURA, contado «No aplica», diferencia «No aplica»; sin falso cierre |
| R02 | Hoja Caja de turno vencido | Tipo VENCIMIENTO, contado «No declarado», diferencia «No calculable» |
| R03 | Dashboard, Excel y PDF del mismo período | Neto idéntico en céntimos, canales idénticos, advertencias coherentes |
| R04 | 2 sucursales y global | Suma de sedes coincide con global, ningún dato de otro negocio |
| R05 | Anulación Yape de período anterior | Neto negativo permitido y explicado; no afirmar reembolso efectuado |
| R06 | Caso histórico `voided` fuera de rango | Bloquear certificación o advertir claramente; no imprimir resumen como conciliado |
| R07 | PDF A4 a 1–3 páginas | No corta tablas; título, fechas, sedes, totales, advertencias legibles |
| R08 | XLSX multihoja reimportado | Hoja por sede y detalle conservados; importe firmado no se suma dos veces |
| R09 | Datos vacíos / límites / 403 / offline | Estado honesto, sin PDF/XLSX parcial presentado como definitivo |
| R10 | 20 negocios × 2 sedes × 100 ventas/día | Benchmark de lecturas/bytes/tiempos, sin afirmaciones de consumo no medido |
| R11 | Mismo snapshot, PDF y Excel sucesivos | No duplicación injustificada de consultas; caché limitada por identidad y alcance |

## 9. Reglas de trabajo para Codex

- **Nunca** ejecutar comandos Git, GitHub, `gh`, APIs o conectores de GitHub, ni siquiera lectura (`status`, `diff`), ni push/commit/merge.
- **Nunca** desplegar Rules, índices, Hosting, Functions ni acceder/escribir Firestore real; proyecto de prueba `demo-migapos` en emulador cuando disponible.
- **No instalar** dependencias, Java, navegadores ni funciones programadas; aprovechar lo instalado.
- **Sí ejecutar** pruebas locales, lint, build y emuladores ya disponibles; si falta Java, dejar `BLOCKED` sin inventar resultados.
- **Sí preparar cambios locales de Rules** estrictamente necesarios para recuperación, con pruebas emulator-first; el propietario los revisa y publica manualmente tras PASS. Si no hay pruebas de Rules, no aconsejar habilitar recuperación en producción.
- No modificar totales, pagos, anulaciones, inventario o sesiones históricas para simular éxito; proteger la inmutabilidad financiera.
- Usar la skill local `.agents/skills/ui-ux-pro-max` si está disponible para estilo y tablas, y el `printDocument.js` existente para impresión segura. La guía externa [Anthropic PDF Skill](https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md) puede servir para **QA de PDF**, no es requisito ni autorización para instalar paquetes.
- No añadir 20 hojas por negocio ni nuevas consultas redundantes por formato. **PDF y Excel deben compartir datos**.
- No presentar «listo para producción» mientras la recuperación no esté validada bajo Rules y la aceptación manual no haya pasado.

## 10. Entrega de Codex

Crear `docs/PLAN-14-RESULTADOS-CAJA-INFORMES.md` con: archivo/función modificada, mapa de datos, reglas de cierre seguro, tabla de estados, pruebas (PASS/FAIL/BLOCKED), resultados de la simulación C01–R11, comprobación de PDF/Excel, comparativa de lecturas frío/caliente, notas de límites Spark, matriz de publicación manual, riesgos no resueltos y recomendación GO/NO-GO para primer piloto.

### Fuentes y referencias

- [Firestore transacciones / `getAfter`](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firestore cuotas gratuitas](https://firebase.google.com/docs/firestore/quotas)
- [Firestore precio y coste de Rules/consultas](https://firebase.google.com/docs/firestore/pricing)
- [Firestore TTL no inmediato](https://firebase.google.com/docs/firestore/ttl)
- [Cloud Functions programadas (requieren infraestructura de facturación)](https://firebase.google.com/docs/functions/schedule-functions)
- [CSS para imprimir / PDF del navegador](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing)
- [`print-color-adjust`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/print-color-adjust)
- [Firestore agregaciones `count/sum/avg`](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
- [`pdfmake`, alternativa futura](https://pdfmake.github.io/docs/0.3/)
