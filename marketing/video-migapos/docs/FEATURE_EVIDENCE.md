# Evidencia de funcionalidades

Base local `1b5bea4`. Auditoría estática de cinco funcionalidades. Los cuatro mensajes seleccionados tienen respaldo en el código. Su comprobación visual y funcional con datos de demostración está pendiente.

| Mensaje comercial | Evidencia local | Acceso y prueba visual pendiente |
|---|---|---|
| **Prepara el ticket antes de cobrar.** | [POS](../../../frontend/src/modules/POS.jsx#L136) conecta catálogo y carrito. [Ticket](../../../frontend/src/modules/pos/TicketParts.jsx#L76) muestra productos, cantidades y total a cobrar. | Dueño o cajero en sede operativa y con caja simulada habilitada. Añadir un producto de prueba y ajustar su cantidad. Comparar el total antes y después, sin pulsar «Cobrar». |
| **Consulta el stock de tu sede.** | [Catálogo](../../../frontend/src/modules/ProductCatalog.jsx#L10) lee las existencias según la sede y [muestra búsqueda y resultados](../../../frontend/src/modules/ProductCatalog.jsx#L140). | Dueño. Buscar un producto y encuadrar «Inventario de la Sede» con su disponibilidad. Usar stock sintético y evitar formularios de edición. |
| **Revisa tus ventas por período.** | [Dashboard gerencial](../../../frontend/src/modules/Reports.jsx#L46) muestra controles del informe, «Tickets POS» y «Evolución de ventas». | Dueño. Mostrar un período demo ya cargado, su contador y la gráfica. Los valores corresponden a la simulación. |
| **Compara el efectivo al cierre.** | [Resumen de conteo](../../../frontend/src/modules/CashRegisterModals.jsx#L18) muestra dinero esperado o referencia calculada, dinero contado y resultado. [POS](../../../frontend/src/modules/POS.jsx#L151) condiciona el acceso al cierre según sede, sesión y permisos. | Dueño en la demo. Montar el resumen de caja del fixture y mostrar los dos importes. Si aparece «Por revisar», conservar el aviso. Evitar confirmar un cierre. |
| **Consulta tus tickets anteriores.** Reserva para la escena de reportes. | [Historial](../../../frontend/src/modules/SalesHistory.jsx#L50) lista ventas recientes y [la tarjeta](../../../frontend/src/modules/sales-history/SaleHistoryCard.jsx#L60) muestra fecha, estado e importe. | Dueño o cajero dentro de su alcance operativo. Mostrar una venta sintética confirmada. Si se usa, sustituir titular y locución por «Consulta tus tickets anteriores». |

Los permisos de navegación se comprobaron en [context.js](../../../frontend/src/core/session/context.js#L1) y [App.jsx](../../../frontend/src/App.jsx#L136).

## Capturas de demostración

- Reutilizar los componentes reales del [fixture del Plan 09](../../../tests/plan09.fixture.jsx#L120) con sus datos sintéticos y las sustituciones del [test de navegador](../../../tests/plan09.browser.test.mjs#L8). El [harness](../../../tests/helpers/browserHarness.mjs#L86) desactiva la carga de configuración y variables de Vite, sirve en loopback y limita la red del navegador aislado. Comprobar el bloqueo de salida y la resolución de los mocks al ejecutarlo.
- Limitar la sesión de captura a `pos`, `products`, `reports` y `cash-summary`. Usar `history` solo como reemplazo. Recortar encabezados con nombres, identificadores o contexto de cuenta. Rotular «Datos de demostración». Si el aislamiento falla, usar una recreación fiel rotulada «Recreación · datos de demostración».
- Excluir afirmaciones sobre operación offline garantizada, facturación SUNAT, integraciones de pago, ventas automáticas, plataformas o mejoras cuantificadas.
