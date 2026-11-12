# MIGAPOS — P17-RC | Finalización de caja por vencimiento, jornada de 14 horas y CI

**Repositorio local de trabajo:** `C:\Proyectos\MigaPOS`  
**Rama objetivo:** `fix/migapos-production-readiness` (el propietario la selecciona y administra Git)  
**Repositorio de referencia:** `https://github.com/saintdeyb321/Mig.git`  
**SHA P17 auditado en GitHub:** `4051fb78abbeda9c1dadf80480f47dfc96d238f0` (2026-11-12).  
**CI de ese SHA:** `https://github.com/saintdeyb321/Mig/actions/runs/43268414644` — FAIL en impresión PDF P14, no en pruebas de Rules ni en POS móvil.

> Este documento es una especificación técnica y una auditoría del commit remoto. Codex debe inspeccionar el árbol **local actual** antes de modificarlo: los cambios sin publicar pueden ser diferentes. Ninguna afirmación de este documento sustituye las pruebas sobre el código local y los emuladores.

## 1. Decisión funcional definitiva del propietario

Cuando una caja alcance su tiempo máximo:

1. **Termina su vigencia operativa automáticamente a la hora límite**, sin aceptar ni atribuir cobros posteriores a ese `sessionId`.
2. Queda registrada como **«Cierre por vencimiento · sin arqueo»**, no como cierre manual ni conciliación confirmada.
3. El dinero contado por el cajero permanece **no declarado** (`null`), al igual que la diferencia física; nunca simular `0`.
4. Las ventas y pagos confirmados permanecen vinculados a su negocio, sede, caja, usuario, medio de pago y sello temporal; ninguna nueva caja los hereda.
5. El dueño observa en la campana un aviso único por caja con sede, responsable, vencimiento, fondo inicial, referencia de efectivo esperado **solo si los cobros se han verificado** y vínculo a la auditoría.
6. El cajero que abre el siguiente turno **no debe ver un botón de desbloqueo o de «recuperación»**. Solo debe abrir caja normalmente indicando el fondo nuevo. Toda regularización transaccional necesaria debe ser implícita y segura.
7. El sistema conserva una acción de revisión o diagnóstico exclusivamente ante estados ambiguos, inconsistencias de datos, fallo de red o pendientes locales; no se presenta permanentemente.
8. El dueño sigue pudiendo cerrar manualmente una caja **vigente** de un cajero desde la sede correspondiente, incluso cuando terminó el horario del cajero, sin que se necesite usar la cuenta del empleado.

**Nueva duración propuesta:** **14 horas para nuevas cajas**, por defecto. Ejemplo: apertura 08:00 → vencimiento 22:00 (hora Lima). Una caja abierta de 10 horas antes de la actualización conserva su plazo ORIGINAL de 10 horas. No modificar ni reinterpretar históricos por desplegar la versión nueva.

## 2. Ejemplo contable obligatorio

Supuesto de Sede Principal, caja 08:00–22:00, sin anulaciones, retiros u otros cobros:

- Fondo inicial: **S/ 100.00**.
- Ingresos POS en efectivo confirmados de esa caja: **S/ 50.00**.
- Ingresos digitales Yape/Plin de esa caja: **S/ 10.00**.
- **Efectivo esperado de referencia: S/ 150.00** (`100 + 50`).
- Digital registrado: **S/ 10.00**, fuera del efectivo físico en caja.
- Efectivo contado: **No declarado**; diferencia de caja: **No calculable**.
- Estado auditado: **Cierre por vencimiento · sin arqueo**.

La «referencia de efectivo» **no es ganancia neta**, no acredita que existan S/150 físicos, ni es arqueo. Con contratos cobrados en efectivo, anulaciones, compensaciones, egresos u otros movimientos, aplicar **las mismas reglas contables firmadas que ya usa `calculateCashTotals`** y explicar sus límites. Una compensación contable no demuestra devolución física; si no hay evidencia completa, mostrar **«Referencia pendiente de verificar»**, nunca inventar un saldo.

El propietario puede coordinar físicamente con el cajero y revisar la información; si necesita una declaración tardía, deberá existir un flujo separado y auditado (no editar silenciosamente la caja original). El usuario puede exportar Excel para su propio análisis, pero **editar el archivo descargado no modifica el libro confiable ni constituye una conciliación en Firebase**.

## 3. Hallazgos concretos de la auditoría P17 de GitHub

### 3.1 Finalización de caja existente

- `frontend/src/features/cash-register/infrastructure/sparkCashRepository.js`: `finalizeExpired` escribe `expired_unreconciled`, `expiredAt`, `recoveredAt`, `recoveredBy`, libera el candado en una transacción; todavía verifica `durationHours === 10` y suma `36000` segundos.
- `frontend/src/features/cash-register/hooks/useCashRegister.js`: calcula expiración exclusivamente para 10 horas; intenta finalizar cuando el módulo está activo, visible y conectado; no existe proceso servidor periódico.
- `frontend/src/modules/CashRecoveryStatus.jsx`: aún expone «Finalizar turno vencido»; según el producto objetivo deberá desaparecer del camino normal.
- `frontend/src/features/notifications/infrastructure/notificationQueryRepository.js`: deriva notificación de la evidencia de `cash_sessions` al observar `recoveredAt` y validación de 10 horas; al cerrar la página no hay un aviso «push» generado en el instante del vencimiento.
- `frontend/src/features/cash-register/infrastructure/sparkCashClosingRepository.js`: `inspectExpiry` obtiene importes del turno con lectores acotados, pero no certifica arqueo ni puede garantizar un agregado firmado sin confianza de servidor.
- `frontend/src/features/reports/application/cashAuditRows.js`: ya distingue vencimiento y confirmación, pero la terminología y fórmulas se deben revisar al pasar a 14 horas.

### 3.2 Reglas y restricciones

- `firestore.rules`: la regla `saleContext` bloquea nuevos cobros cuando `request.time >= openedAt + 10h`; las reglas de apertura, cierre, finalización independiente, recuperación histórica y candado incluyen comparaciones exactas de 10 h.
- `firestore.indexes.json` y catálogo de consultas: P17 añadió I51/I52; su estado **real** en Firebase producción no ha sido comprobado por este auditor. Mantenerlos y verificarlos manualmente antes de publicar las Rules.
- **No cambiar solo la constante de React**: duración, timestamps, validación de Rules, reporte, notificación, contratos/pagos y pruebas deben usar un contrato temporal coherente.

### 3.3 Regresión real CI del SHA P17

En GitHub Actions `43268414644`:

- **PASS:** 78/78 pruebas Rules y transacciones, build/lint, P09, P10-06 en Chromium Ubuntu (incluido 320×640), y otras pruebas financieras.
- **FAIL:** `tests/excel-export.browser.test.mjs:438`, en `inspectPage` alrededor de línea 483. Caso: **«PDF con 8 incidencias y 8 mm menos de altura disponible»; obtenido 2 páginas, esperado 1**.
- La certificación de release no se generó. Resolver el fallo real, sin reducir aserciones, suprimir incidencias ni ocultar información financiera. Mantener 0, 1, 6 y 8 incidencias visibles según la política existente, así como auditoría XLSX completa.

## 4. Limitación arquitectónica innegociable: Spark no es un programador de eventos

**Firestore Rules no ejecuta escrituras por el mero paso del tiempo.** El vencimiento lógico puede ser exacto y verificable por `request.time`; el registro físico del cambio de estado, liberación del candado y emisión/materialización del aviso **no se puede garantizar a las 22:00 si ningún cliente ni proceso de servidor está ejecutándose**.

Dos modos posibles, **sin fingir equivalencia**:

### Modo A — Implementación prioritaria sin cambiar Firebase Spark

1. Al crear caja se registra el `openedAt` del servidor y `durationHours=14` (o `expiresAt` **inmutable derivado por servidor/Rules**). Para cajas ya abiertas, usar su `durationHours=10` original.
2. En **cualquier lectura**, si la hora actual ≥ límite, la caja tiene **estado operativo efectivo de vencida**, aunque su documento no haya sido materializado todavía. Reglas bloquean cobros posteriores y toda vista/read-model calcula el estado sin atribuir autoridad a caché o reloj local.
3. Para abrir caja nueva, realizar una **transacción atómica e idempotente** que reconozca y finalice la sesión previa ya vencida, verifique candado, negocio, sede y usuario autorizado, y cree nueva caja/candado con **nuevo `sessionId` y fondo independiente**. Este paso es interno; el usuario solo pulsa **«Abrir caja»**. Si las Rules lo requieren, refactorizarlas con `getAfter`, preservando presupuesto de lecturas y 1.000 expresiones.
4. Si la caja está vencida y el dueño accede al módulo antes que el siguiente cajero, puede materializarse el cierre sin abrir otra caja; no debe existir un botón de desbloqueo que sea requisito del flujo ordinario. Si la primera operación no se confirma, mantener la UI bloqueada para cobros y permitir diagnóstico.
5. Para reportes y campana, **derivar automáticamente y de manera estable** el estado de vencimiento desde `openedAt+durationHours`, incluso antes de materializar la finalización, pero nunca afirmar que hubo una escritura o notificación servidor exacta a esa hora si todavía no se confirmó. Evitar duplicados usando identificador canónico `(businessId, branchId, sessionId, tipo)` y estado de acuse independiente.
6. Los importes ya quedan **guardados como movimientos confirmados**. Calcular referencias por lectura paginada bajo demanda filtrada por negocio/sede/caja/`occurredAt` (o confirmado en servidor) dentro de `[openedAt, expiresAt)`. Si la proyección es costosa, permitir resumen incremental transaccional solo cuando sea autorizable contra operaciones fuente, y declarar cualquier resumen no certificado como referencia provisional. No confiar en montos arbitrarios que escriba el navegador ni recalcular miles de tickets en cada render o al abrir la campana.
7. Una apertura que encuentra un candado vencido **no debe fallar por falta de un paso manual de recuperación**; debe ejecutar el protocolo transaccional seguro o mostrar error de verificación no destructivo (no una falsa apertura).
8. Si el navegador está **cerrado y no hay actividad**, el estado lógico ya venció, pero la materialización del documento y notificación queda pendiente de la siguiente actividad autorizada. El alcance y esta limitación deben ser visibles en la documentación de producción.

### Modo B — Requisito estricto de cierre físico y notificación exactamente al vencimiento

Requiere **ejecutor de confianza** (por ejemplo `onSchedule` de Cloud Functions + Cloud Scheduler, o arquitectura server-side equivalente), con idempotencia, filtros tenant/sede, reintentos, métricas y permisos IAM. Cloud Functions requiere pasar a **Blaze**; el propietario no ha autorizado cambio de plan/costos. No instalar, desplegar, encender facturación ni codificar la versión como ejecutable en producción sin aprobación independiente. Este modo será una **propuesta opcional**, no parte de la implementación Spark.

**Prohibido** simular cierre garantizado mediante `setTimeout`, Service Worker, pestaña oculta, `onSnapshot`, TTL, cliente anónimo, horarios del equipo o un endpoint público; ninguno sustituye un servidor confiable ni garantiza la escritura sin actividad.

## 5. Política de 14 horas y migración

- Introducir una **única función de dominio** para determinar `durationHours`, `expiresAt` y elegibilidad de cierre/apertura, validada por servidor y Rules.
- **Duración nueva exacta: 14 h**. La diferencia con horario del empleado es deliberada: un cajero puede tener jornada de 12–13 h sin cortar el turno a las 10 h.
- Los documentos abiertos bajo 10 h conservan 10 h, sin recalcular a 14 ni revivir sesiones ya vencidas.
- No agregar por lectura un campo `durationHours` a documentos históricos que no lo tenían; conservar política legacy explícita y fail-closed para casos no verificables.
- Asegurar hora Lima para presentación, pero usar timestamps UTC y `request.time` en autorización. Pruebas 08:00→22:00, 08:01→22:01, cruce de medianoche, en `expiresAt−1ms`, `expiresAt` y `expiresAt+1ms`.
- Revalidar cierres manuales **antes** del vencimiento, incluido dueño cerrando caja de cajero fuera de su horario. Después del límite no admitir un conteo retroactivo que se disfrace de arqueo puntual.
- Proteger firmas de apertura, reservas, transacciones, lecturas, índices, notificaciones y reglas de ventas/contratos frente a mezclas de 10 y 14 h.
- No variar la duración de una caja en curso a voluntad de cliente; las futuras configuraciones comerciales, si las hubiera, requieren protocolo nuevo y autorización firme.

## 6. Datos, campana y reportes

### 6.1 Fuente de verdad y cálculos

- `cash_sessions` conserva identidad/fecha/fondo/estado; `active_cash_sessions` conserva exclusión de caja activa; `sales`, pagos de contratos y compensaciones conservan hechos financieros.
- Usar **totales firmados en céntimos** y lógica existente `calculateCashTotals`; evitar sumar ventas brutas de forma incompatible con anulaciones y pagos mixtos.
- `efectivoEsperado = fondo + efectivoNetoRegistrado`, con limitaciones explícitas. `digitalNetoRegistrado` se muestra por separado y **no se suma al efectivo esperado**.
- `declaredAmount = null`, `difference = null`; **no** reutilizar `closed_with_discrepancy` ni presumir error de caja.
- Resolver cortes de fecha y consistencia con el timestamp de servidor, `sessionId` y `branchId`; movimientos del siguiente turno no pueden entrar en el anterior.
- Evitar documentos gigantes: consulta bajo demanda con paginación/budget/abort, señales de parcialidad y un evento canónico, pero no lecturas de toda la empresa por cada notificación.

### 6.2 Notificación al propietario

**Título:** `Caja finalizada por vencimiento`  
**Estado:** `Sin arqueo — requiere revisión`  
**Campos:** sede, responsable, apertura, vencimiento, fondo inicial, efectivo esperado (solo si verificado), Yape/Plin registrados opcionalmente y vínculo a auditoría.  
**Nota:** `El efectivo contado no fue declarado. Los importes son referencias de movimientos registrados; no acreditan dinero físico.`

- Notificación única por turno, visible **solo al dueño del mismo negocio** y no al cajero u otras empresas; se puede ver en vista global del dueño con la sede claramente indicada.
- No mostrar UUID técnicos, campos confidenciales innecesarios ni todo el libro financiero en la campana.
- Una notificación puede reflejar el **vencimiento lógico** en una consulta posterior. Distinguir hora límite de hora de confirmación de escritura para no insinuar actividad de servidor no ocurrida.
- Acuses de lectura idempotentes y no destructivos, sin permitir que otra sede o usuario manipule importes o borre evidencia.
- Contener el costo: límite de avisos, snapshot acotado, detalle por demanda y medición real de consultas y documentos; no escanear cajas/tickets históricos en cada render.

### 6.3 Auditoría de caja, PDF y Excel

- Etiqueta **«CIERRE POR VENCIMIENTO · SIN ARQUEO»** con énfasis cálido/ámbar, siempre legible en papel blanco/negro (no depender solo de color).
- Mostrar vencimiento, fecha de confirmación de la finalización si existe, usuario y sede, fondo inicial, efectivo esperado **verificado/provisional**, Yape/Plin registrado, efectivo contado `No declarado`, diferencia `No calculable`.
- No contabilizar la finalización como **nuevo ingreso**, venta, reembolso ni evento monetario adicional. Nunca duplicar ingreso entre ventanas día/turno ni entre sedes.
- Si el PDF por restricciones A4 solo muestra seis alertas, el Excel debe preservar las ocho incidencias del escenario QA y todas las aperturas pertinentes.
- Cuando el usuario descargue Excel y lo edite por su cuenta, queda fuera del libro contable autoritativo de Firestore; no habilitar la edición de exportados como mecanismo para reescribir caja.

## 7. Casos de seguridad y concurrencia obligatorios

Matriz mínima de pruebas, **con y sin navegador abierto**:

1. Caja nueva de 14 h; reglas admiten ventas antes y niegan ventas al alcanzar la hora límite.
2. Caja anterior de 10 h conserva su vencimiento; ninguna migración silenciosa.
3. Caja vencida sin nadie conectado: se observa **vencida lógicamente** y se documenta que no hubo escritura/aviso push garantizado.
4. Nueva apertura al día siguiente: una sola acción de «Abrir caja» ejecuta rollover seguro (si procede), sin botones de recuperación, nuevo fondo, nuevo `sessionId`.
5. Dos pestañas y dos usuarios intentan abrir simultáneamente: solo una caja nueva; la otra obtiene estado confirmado y no duplica cierre ni notificación.
6. Respuesta de commit perdida/reintento: verificación `getDocFromServer`; nunca segunda apertura o doble contabilización.
7. Cuenta del dueño cambia de sede y cierra manualmente caja **vigente** de cajero fuera de turno; la operación queda auditada con `closedBy` distinto de `userId`.
8. Caja vencida no admite cierre manual retroactivo con efectivo declarado inventado.
9. Sede A y B: apertura, vencimiento, ventas y aviso de A **no incorporan** operaciones de B; dueño ve ambos en global, cajero solo sus permisos.
10. Ventas POS efectivo/Yape/mixto + pagos de pedidos + anulaciones/compensaciones: desglose correcto y referencias no confundidas con efectivo físico.
11. Turno sin ventas, solo fondo inicial: referencia coherente; `declaredAmount=null`.
12. Datos locales cifrados pendientes en otro dispositivo: no dar por sincronizados; evitar pérdida, mostrar limitación y mantener corte de autoridad servidor.
13. Caja histórica sin campos de duración: lectura conservada, escritura nueva restringida a protocolo validado.
14. Campana: una sola incidencia por caja, acuse separado; límites y filtros del negocio; lecturas medidas.
15. PDFs 0/1/6/8 incidencias: una página A4, incluso con **8 mm menos** para 6 y 8 casos; no ocultar textos ni rebajar aserción.
16. Chromium Ubuntu P10-06 320×640 y 1280×560, sin perder foco, total ni Cobrar.
17. Scripts Firestore Rules en `demo-migapos`, incluidos límites de expresiones `1000`, `getAfter`, costos de lecturas y errores `permission-denied` esperados.
18. Índices I51/I52 + nuevos patrones: `npm run indexes:check` (o script equivalente) y checklist manual de índices publicados.
19. Node financiero, reporte PDF/XLSX, seguridad, plan17, lint, build/PWA y **CI remoto** del siguiente commit.

## 8. Fases y no-regresiones

**Fase A: diagnóstico**: auditar código LOCAL actual, registro de caja, Reader, transacción de apertura y Rules, listeners de avisos, funciones monetarias, reportes, rutas de contratos y pruebas de P17. Identificar exactamente qué se podrá mejorar sin infraestructura nueva.

**Fase B: dominio temporal**: fijar vigencia de 14 h para NUEVAS cajas y semántica inmutable por sesión; hacer tests de borde/legacy.

**Fase C: UX y apertura transparente**: quitar «Finalizar turno vencido» del flujo común; regularizar internamente durante apertura, sin liberar locks sin una confirmación del servidor. Evitar estado zombie y bloqueo por inactividad.

**Fase D: informes y campana**: reflejar automáticamente expiración lógica, detalle bajo demanda con referencias verificables, fechas honestas y denominaciones intuitivas. No elevar una referencia calculada a saldo físico certificado.

**Fase E: CI**: resolver regresión concreta del PDF de 8 incidencias con reserva de 8 mm en Linux, sin sacrificar claridad; repetir suites.

**Fase F: documentación y verificación**: actualizar reportes, reglas, índices, UI, scripts y plan de publicación manual por el propietario. Dejar claro si existe el modo Spark (sin evento físico garantizado a hora exacta) o si un modo Blaze exige decisión posterior.

## 9. Restricciones obligatorias para Codex

- **No ejecutar comandos Git/GitHub** (ni `git status`), no cambiar ramas, no crear commits ni push, no publicar Firebase ni acceder a cuentas reales.
- Trabajar exclusivamente en `C:\Proyectos\MigaPOS`; el propietario publica las Rules/índices manualmente y gestiona Git.
- No instalar dependencias, no habilitar facturación, Cloud Functions programadas ni servicios adicionales.
- No modificar marketing ni audiovisuales.
- No borrar colecciones/ventas ni alterar datos reales.
- Mantener **fail-closed**, identidad/rol/licencia/negocio/sede y autoridad de servidor para cada escritura; cache/IndexedDB nunca otorgan permiso.
- No relajar controles financieros, índices ni tests; no esconder PDF, no cambiar el significado de `declaredAmount`, `difference` o `reconciliationPending` para fabricar un cierre confirmado.
- Minimizar lecturas y escrituras medibles; no añadir listeners globales a todas las cajas/tickets.
- No modificar contratos P17 salvo para conservar su compatibilidad con la nueva duración de caja; no rehacer permisos de recojo.
- Si un requisito estricto solo es posible con servicio programado, documentarlo como **bloqueado por Spark**; entregar la mejor versión implementable del Modo A, sin afirmar que es Modo B.

## 10. Entregables y condiciones GO / NO-GO

Dejar implementados los cambios locales necesarios y crear:

`docs/RESULTADOS-P17-RC-CIERRE-14H.md`

Debe contener: archivos modificados, nueva semántica de tiempo y migración, máquina de estados, referencias de caja, UX nueva, capturas desktop/móvil, pruebas reproducibles, medición de lecturas/escrituras con presupuestos, impacto en Rules e índices, modelo de notificación, lista de límites de Spark, despliegue seguro **solo como instrucciones para el propietario**.

**NO-GO** si: se aceptan ventas tras vencimiento, se cambia el plazo de cajas antiguas, se mezclan sedes o sesiones, se pierde un pago, la notificación fabrica saldo, hay apertura duplicada, las Rules permiten escrituras ajenas, el CI Linux continúa fallando o las Rules/índices publicados no coinciden con el frontend.

**GO para revisión y eventual despliegue** solo con emulador, Node, Chromium Ubuntu, exportaciones y CI del SHA exacto en verde; después, propietario publica índices/Rules y Hosting en orden seguro con pruebas controladas.
