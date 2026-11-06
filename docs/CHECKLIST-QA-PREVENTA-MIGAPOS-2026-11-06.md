# MigaPOS — Checklist de simulación y aceptación antes de vender

**Versión auditada:** `fix/migapos-production-readiness` / `08fb405ad51df13a627c60b7ae3f3f6f262f26ab` (6 nov 2026).

**Situación al redactar:** GitHub Actions para ese commit FALLÓ en `tests/ui-security.test.mjs`: 76/77 comprobaciones Spark pasan; la prueba de inventario conservador de documentos Markdown rechaza archivos nuevos del proyecto. La ejecución se detiene antes de IndexedDB, build, pruebas PLAN 09 y certificación. La rama `main` todavía apunta a `6ca437bf` (versión anterior, CI verde en su propio commit). Este checklist NO acredita la versión nueva para producción sin un CI completo y verde para el SHA exacto.

**Diagnóstico para validar:** `aggregateReport` suma contadores `voidedOrders` de los registros de ventas y también contabiliza eventos `pos_voids`. El flujo Spark actual escribe la compensación en `pos_voids` y deja la venta original confirmada, por lo que el recuento ordinario puede cuadrar; sin embargo, si conviven registros marcados `voided` y una compensación para la misma venta, puede duplicarse el contador. Añadir una prueba de regresión dirigida antes de certificar casos históricos/migrados. La primera fase del PLAN 13 presenta cobros, compensaciones, reembolsos contables y netos, pero NO registra desembolsos reales verificados.

## Ficha de ejecución

- **Fecha:** _____________________
- **Evaluador:** _____________________
- **Commit SHA completo:** _____________________
- **URL / ambiente:** _____________________
- **Proyecto Firebase / businessId de pruebas:** _____________________
- **Sucursal principal de pruebas:** _____________________
- **Sucursal secundaria de pruebas:** _____________________
- **Usuarios de prueba (roles, sin contraseñas):** _____________________
- **Respaldo verificado (ruta / fecha):** _____________________
- **Límite de lecturas/escrituras consultado antes del test:** _____________________

**Estados:** `[ ]` por ejecutar · `PASS` pasó · `FAIL` no pasó · `BLOCKED` impide continuar · `N/A` no aplica (con justificación). Para cualquier FAIL anotar pasos, importe, evidencia, SHA y estado de red.

> **Seguridad:** Usar idealmente proyecto Firebase de ensayo separado y datos falsos. No usar clientes reales ni dinero real en las simulaciones. Si se usa la base ya publicada, tomar respaldo verificable, trabajar solo con una sede/cuenta de pruebas claramente delimitada y NO borrar manualmente transacciones, compensaciones o movimientos del ledger para “limpiar”. No desplegar Rules/índices por una prueba UX. La preview del frontend puede seguir conectada al backend productivo si se compila con credenciales de producción.

## BLOQUE 0 — Puertas de entrada (obligatorio antes de simular)

- [ ] `P0.1` Confirmar SHA del frontend que estás ejecutando y de GitHub. **PASS:** misma revisión; no mezclar build antiguo con nuevas reglas o informes.
- [ ] `P0.2` Corregir de forma explícita la lista de documentos permitidos en `tests/ui-security.test.mjs` para los `.md` realmente autorizados; no comentar ni desactivar el test. **PASS:** comprobación Spark UI verde.
- [ ] `P0.3` Ejecutar el workflow completo de `Verify MigaPOS` sobre el SHA exacto. **PASS:** todas las etapas, incluidos Rules, Chromium/IndexedDB, lint, build, UX y certificación, en verde.
- [ ] `P0.4` Ejecutar prueba dirigida de **mismo ticket con `voided` histórico + `pos_voids`**. **PASS:** una anulación cuenta una vez, sin doble ajuste monetario ni doble decremento de productos.
- [ ] `P0.5` Tener respaldo y procedimiento de recuperación comprobable; anotar datos y configuraciones activas. **PASS:** se puede recuperar un entorno de prueba sin sobrescribir negocio real.
- [ ] `P0.6` Confirmar que Firestore Rules, índices, roles y configuraciones de la instancia probada coinciden con el código autorizado. **PASS:** no hay lectura incorrecta ni 403 por índice ausente.

## BLOQUE 1 — Accesos, permisos, aislamiento entre negocios

- [ ] `A1` Iniciar sesión como dueño, cajero y usuario inhabilitado. **PASS:** cada uno ve solo módulos autorizados; deshabilitado no opera.
- [ ] `A2` Cambiar entre dos sedes. **PASS:** catálogo, stock, caja, tickets, contratos y reportes respetan la sede seleccionada.
- [ ] `A3` Abrir “Vista global” como dueño. **PASS:** permite consultar pero no vender ni alterar la caja sin seleccionar sede.
- [ ] `A4` Intentar anular/modificar un ticket de otra sede con rol cajero. **PASS:** denegación tanto de interfaz como de Firestore Rules.
- [ ] `A5` Probar dos empresas de prueba distintas. **PASS:** no se cruzan datos, caché, históricos ni archivos exportados.
- [ ] `A6` Cerrar sesión, iniciar otra empresa y usar atrás/recargar. **PASS:** ningún dato anterior aparece, tampoco por persistencia local.

## BLOQUE 2 — Inventario y catálogo

- [ ] `I1` Crear producto de prueba a S/ 10 con stock 5 en sede A y 2 en sede B. **PASS:** stock separado.
- [ ] `I2` Vender 2 unidades en A. **PASS:** queda stock 3 en A y 2 en B; no decremento doble.
- [ ] `I3` Agregar producto agotado o cantidades superiores a existencia. **PASS:** operación rechazada antes de confirmar.
- [ ] `I4` Registrar productos sin foto, con foto y con nombres largos. **PASS:** el carrito y catálogo no se desbordan.
- [ ] `I5` Verificar que un producto perecedero anulado no se trate automáticamente como vendible sin procedimiento operativo aprobado. **BLOCKED para venta real si la devolución no apta repone stock automáticamente sin inspección/merma.**

## BLOQUE 3 — Venta POS y caja: escenario de conciliación A

**Preparación:** realizar en **una sucursal y un solo turno**, con caja vacía de otras operaciones y sin gastos. Para evitar confusiones, guardar captura del saldo inicial. Los importes de las operaciones de abajo son independientes de las pruebas I1-I5, o deben realizarse en datos/sesión reiniciados de prueba.

- [ ] `V1` Abrir caja con **S/ 100.00**. **PASS:** una sola sesión abierta y el modal desaparece después de la confirmación; F5 no vuelve a abrirla.
- [ ] `V2` Venta en efectivo **S/ 20.00**, recibido **S/ 50.00**. **PASS:** ticket por S/ 20, vuelto S/ 30, aumento físico neto S/ 20.
- [ ] `V3` Venta Yape/Plin **S/ 30.00**. **PASS:** ticket registrado digitalmente y no altera el efectivo físico.
- [ ] `V4` Venta mixta **S/ 20.00**, S/ 8 efectivo + S/ 12 Yape. **PASS:** ambas partes suman S/ 20 y se informan por canal.
- [ ] `V5` Crear pedido de prueba y registrar anticipo **S/ 15.00 en Yape** (sin incluir pago del saldo). **PASS:** pago de pedido se contabiliza una sola vez en Yape, no como ticket POS.
- [ ] `V6` Ir a Reportes, seleccionar la fecha/ámbito correctos y refrescar según política de caché. **Esperado:** POS S/ 70; cobros de pedidos S/ 15; **ingreso neto S/ 85**; efectivo neto S/ 28; digital neto S/ 57. *Estos son netos comerciales, no saldos bancarios.*
- [ ] `V7` Conciliar dinero físico: **S/ 100 fondo + S/ 20 venta efectiva + S/ 8 por mixto = S/ 128.00**, sin otros movimientos. **PASS:** contado S/ 128 y diferencia S/ 0 bajo condiciones idénticas.
- [ ] `V8` Cerrar y volver a abrir sesión de prueba cuando corresponda. **PASS:** cierre del turno anterior queda inmutable; no se duplica saldo inicial ni se reabre el mismo registro.

## BLOQUE 4 — Anulaciones y devoluciones (el más importante)

> **Regla:** una **anulación comercial** y la **entrega efectiva del dinero** son eventos distintos. La Fase 01 del PLAN 13 no acredita entregas reales. Cualquier operación que requiera devolución debe quedar bajo conciliación y control manual hasta que se implemente su registro verificable.

- [ ] `N1` Anular la venta Yape S/ 30 creada en `V3`, con caja propia y motivo válido. **PASS comercial:** aparece un solo evento `pos_voids` negativo S/ 30, historial muestra estado y motivo, sin duplicar stock ni contramovimiento.
- [ ] `N2` Consultar Reportes *del mismo día* tras `N1`. **Esperado sobre A:** cobros registrados por canales: efectivo S/ 28 y digital S/ 57; compensación digital **−S/ 30**; neto de efectivo S/ 28; neto digital **S/ 27**; neto general **S/ 55**. No afirmar que se efectuó un reintegro digital.
- [ ] `N3` Comprobar que la cantidad de anulaciones es **1**, no **2**, y que venta, compensación y stock no se cuentan dos veces. **BLOCKED si hay duplicación.**
- [ ] `N4` Doble clic y reintento de la misma anulación. **PASS:** un solo recibo de anulación, una única compensación y una reposición de stock como máximo.
- [ ] `N5` Repetir la anulación después de cortar/restablecer Internet. **PASS:** estado verificable o mensaje de resultado incierto; no repetir silenciosamente el débito ni el desembolso.
- [ ] `N6` Anular una venta POS en efectivo con pago aún NO devuelto físicamente. **PASS de seguridad:** resultado contable puede bajar; no se declara que el efectivo salió si no hay verificación. **Bloqueante de conciliación real** si el sistema la da por pagada.
- [ ] `N7` Anular una venta de ayer hoy (usar dos fechas reales controladas). **PASS:** reporte del día de anulación muestra contramovimiento negativo sin alterar el registro original; un neto Yape negativo puede ser legítimo y debe explicarse.
- [ ] `N8` Intentar anular con caja cerrada, usuario de otro negocio, cajero de otra sede o ticket histórico no compatible. **PASS:** error controlado y sin escrituras parciales.
- [ ] `N9` Anular una venta mixta y comprobar desglose por ambos canales. **PASS:** compensación de cada canal coincide con importes originales y suma total.
- [ ] `N10` Confirmar qué sucede con productos dañados, entregados o consumidos al anular. **BLOCKED para operación comercial general hasta definir merma/inspección o control auditado equivalente.**

## BLOQUE 5 — Contratos / pedidos

- [ ] `C1` Crear pedido de prueba: producto S/ 100 + delivery S/ 5 = **S/ 105**. **PASS:** total S/ 105.
- [ ] `C2` Registrar anticipo de **S/ 20** y verificar saldo **S/ 85**. **PASS:** comprobante y método correctos; sin duplicación por F5.
- [ ] `C3` Completar pago de S/ 85. **PASS:** estado pagado y saldo cero; suma de movimientos S/ 105.
- [ ] `C4` Cambiar estado a entregado. **PASS:** agenda, detalle, historial y dashboard actualizados.
- [ ] `C5` Subir 4 fotos de referencia; intentar una quinta. **PASS:** 4 aceptadas como máximo, aviso claro y sin carga de la quinta.
- [ ] `C6` Cancelar pedido distinto con anticipo Yape pendiente de devolver. **PASS contable:** reversión identificada como **reembolso contable**, no como devolución bancaria ejecutada.
- [ ] `C7` Probar contrato sin anticipo, entregado con saldo, cancelado, y pago parcial. **PASS:** estados claros y sin mensajes engañosos.
- [ ] `C8` Verificar que la política de devolución de anticipos exista y pueda auditarse antes de operar con clientes reales. **BLOCKED si una devolución aparece como efectuada sin evidencia.**

## BLOQUE 6 — Historial, reportes y Excel

- [ ] `R1` Comparar filtros Hoy / Semana / Mes / Año para sede A y vista global. **PASS:** fecha Perú, sedes y sumas correctas.
- [ ] `R2` Exportar `Reporte_Hoy` después del escenario A, **antes de anular**. **PASS:** `Resumen_Financiero`: POS S/ 70, pedidos S/ 15, efectivo S/ 28, digital S/ 57, general S/ 85.
- [ ] `R3` Exportar nuevamente **después de `N1`**. **PASS:** compensación digital −S/ 30, neto digital S/ 27, neto general S/ 55. Los mismos importes deben aparecer en dashboard.
- [ ] `R4` Revisar las hojas detalladas por sede y movimientos. **PASS:** original y compensación POS no se convierten en una doble venta o doble devolución; referencias enlazables para auditar.
- [ ] `R5` Revisar `Auditoría_Pedidos`: el abono inicial, los pagos y `Reembolso contable (S/)` tienen fecha y signo correctos. **PASS:** nunca se declara devolución física o digital efectuada sin prueba.
- [ ] `R6` Validar sumas: neto efectivo + neto Yape/Plin = neto general; total sucursales = global; total diario = período. **PASS:** discrepancia máxima S/ 0.01 por redondeo, sin aceptar pérdida acumulada.
- [ ] `R7` Simular anulación de ayer hoy sin cobros digitales hoy. **PASS:** neto digital negativo visible y explicado, también en Excel.
- [ ] `R8` Comprobar una operación con pago mixto y una compensación. **PASS:** subcomponentes suman exactamente el movimiento firmado.
- [ ] `R9` Descargar Excel con datos que contengan `=`, `+`, `-` o `@` como texto en nombre/motivo; abrir en Excel. **PASS:** no ejecuta fórmulas ni vínculos no deseados.
- [ ] `R10` Probar período con más documentos que el límite configurado (solo con fixtures/local). **PASS:** error explícito, nunca un Excel parcial presentado como completo.
- [ ] `R11` Confirmar que los conceptos de ingresos **netos contables** no son etiquetados como efectivo en caja o saldo real de billetera.

## BLOQUE 7 — Caja y conciliación multitur­no

- [ ] `K1` Caja abierta, cierre con monto correcto. **PASS:** cierre único, saldo contado guardado.
- [ ] `K2` Caja con S/ 2 de faltante. **PASS:** diferencia y motivo exigido según reglas vigentes, sin esconder el faltante.
- [ ] `K3` Caja con S/ 5 de sobrante. **PASS:** diferencia indicada, revisión y responsable trazables.
- [ ] `K4` Anulación de ticket de turno anterior. **PASS:** no reescribe cierre anterior; queda efecto comercial fechado correctamente y conciliación del turno actual no presume devolución.
- [ ] `K5` Dos sesiones/dispositivos intentando abrir/cerrar misma caja. **PASS:** a lo sumo una sesión abierta autorizada y una operación final registrada.
- [ ] `K6` Exportar auditoría de caja y cotejar cierre, contado y discrepancias (sin convertir provisional en efectivo confirmado).

## BLOQUE 8 — Conectividad, caché, respaldo y dispositivos

- [ ] `O1` Refrescar F5 con caja abierta, 5 productos en ticket y usuario autenticado. **PASS:** interfaz coherente y sin duplicar operación.
- [ ] `O2` Desconectar red durante guardado de venta; reconectar. **PASS:** resultado inequívoco o recuperación verificada, sin tickets ni stock duplicados.
- [ ] `O3` Probar transiciones entre módulos y dos pestañas. **PASS:** no hay listeners multiplicados visiblemente ni datos de la sede anterior.
- [ ] `O4` Simular error `permission-denied` en ambiente aislado. **PASS:** no se muestran saldos cacheados de una cuenta no autorizada.
- [ ] `O5` Revisar navegación y POS a 360, 390, 768, 1024 y 1440 px, y con teclado. **PASS:** carrito, cobro, modales y navegación utilizables sin scrolls rotos.
- [ ] `O6` Imprimir ticket físico/PDF y comprobar monto, método, vuelto, fecha, sede, estado de anulación y datos comerciales que correspondan.
- [ ] `O7` Validar respaldo y restauración en entorno aislado. **PASS:** se preservan tickets, compensaciones, usuarios, contratos y cierres.
- [ ] `O8` Verificar lecturas/escrituras/cuotas Firestore antes/después de ejecutar pruebas con 2 usuarios simultáneos. **PASS:** sin crecimiento anormal; registrar números reales.

## BLOQUE 9 — Prueba de capacidad para futura venta a 10–20 negocios

- [ ] `E1` Crear empresas y sucursales de ensayo aisladas (no cuentas reales) con perfiles representativos.
- [ ] `E2` Ejecutar ventas y reportes en simultáneo sin cambiar la empresa activa de otro usuario. **PASS:** aislamiento y latencia aceptables.
- [ ] `E3` Medir lecturas por sesión POS, por apertura de historial, por exportación diaria y por reporte mensual. Registrar lecturas **reales** desde Firebase o instrumentación y no estimarlas a ojo.
- [ ] `E4` Estimar consumo diario para 10 y 20 negocios con tráfico observado y margen de seguridad; no asumir que una simulación de 2 negocios prueba 20.
- [ ] `E5` Revisar límites Spark, índices, datos voluminosos, estrategias de paginación, monitoreo de errores y procedimiento de soporte/recuperación.

## Criterio de salida: GO / NO-GO

**Para un piloto técnico con datos de prueba:** se puede avanzar antes de la venta si hay respaldo, aislamiento y se documentan los casos pendientes, sin dinero real ni usuarios finales dependientes.

**Para vender a clientes operando dinero real: TODOS deben ser verdaderos:**

- [ ] CI completo en verde en el commit exacto que se publica.
- [ ] Cero fallos críticos de permisos, aislamiento, doble venta, doble anulación o stock.
- [ ] POS, caja, contratos, dashboards y Excel concilian con el escenario A y con una anulación de turno anterior.
- [ ] Política implementada y verificada para devoluciones reales y obligaciones pendientes, incluido canal de devolución y evidencia; no tratar contramovimiento contable como pago acreditado.
- [ ] Política fiable para stock devuelto/merma de perecederos.
- [ ] Procedimiento de backup/restauración, soporte e incidentes confirmado.
- [ ] Privacidad, condiciones comerciales, responsabilidades fiscales y documentación de usuario revisadas.
- [ ] Despliegue autorizado y smoke test del entorno publicado finalizados.

## Tabla para registrar incidentes

| ID de prueba | PASS / FAIL / BLOCKED | Valor esperado | Valor observado | Evidencia / captura / log | Prioridad | Acción |
| --- | --- | --- | --- | --- | --- | --- |
| Ej. R3 | | Neto Yape S/ 27 | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |

**Decisión final:** ☐ Piloto de datos de prueba aprobado ☐ No aprobado ☐ Venta comercial autorizada (requiere todos los criterios GO)

**Responsable y fecha de aprobación:** __________________________________________
