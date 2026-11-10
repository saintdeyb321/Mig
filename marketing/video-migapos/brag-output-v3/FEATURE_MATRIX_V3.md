# Funcionalidades demostradas

El recorrido usa componentes reales de MigaPOS en Chrome móvil, a 390 × 844 CSS px y DPR 2, con sesión sintética de dueño. Los valores proceden del fixture Plan 09 ampliado exclusivamente en la caché de V3. Las acciones de escritura están bloqueadas.

| Capítulo | Pantalla y rol del recorrido | Captura y comprobación | Mensaje y límite |
|---|---|---|---|
| Ticket | POS, dueño en sede operativa. `frontend/src/modules/POS.jsx` y `pos/TicketParts.jsx`. | Sí. Buscar «Pan artesanal», añadir, abrir ticket, aumentar a dos. El total cambió de S/ 5,00 a S/ 10,00. | Prepara y revisa antes de cobrar. El cobro queda fuera. |
| Catálogo | Categorías y Productos, dueño. `CategoryManager.jsx`, `ProductCatalog.jsx`. | Sí. Categorías demo, búsqueda por nombre, desaparición del otro resultado y disponibilidad visible. | Organiza productos y consulta existencias. Los resultados provienen del mock. |
| Sedes | Selector de sucursal y Productos, dueño. `components/BranchSelector.jsx`, `ProductCatalog.jsx`. | Sí. Centro → Norte y stock 100 → 24 para el mismo artículo demo. | Consulta stock por sede. Dos sedes sintéticas. |
| Pedidos | Gestión de pedidos. `modules/contracts/ContractManager.jsx`. | Sí. Se verificaron los filtros En curso, Por cobrar y Cerrados. | Revisa estados de pedidos. No se registraron pedidos, cobros ni cambios. |
| Agenda | Agenda VIP. `AgendaManager.jsx`. | Sí. Buscar «Almendra» dejó un contacto ficticio y retiró el otro. | Consulta clientes frecuentes. Contactos sin números reales. |
| Historial | Historial POS, dueño. `SalesHistory.jsx` y `sales-history/SaleHistoryCard.jsx`. | Sí. Fecha, estado de venta sintética y diálogo real «Productos del ticket». | Consulta tickets anteriores. No se anula ni imprime. |
| Reportes | Dashboard gerencial, dueño. `Reports.jsx`. | Sí. Cuatro botones seleccionados. Tarjeta de tickets y gráfico con valores demo. | Consulta el período. El cambio de datos está sembrado en el mock, sin lecturas reales. |
| Exportación | Informes del negocio, dueño. `ExportSales.jsx`. | Sí. Se eligieron Informe visual (PDF) y Detalle Excel y se verificaron sus botones. | PDF se prepara para imprimir o guardar en el navegador. Excel descarga el detalle. Se comprobaron los controles, sin iniciar impresión ni descarga. |
| Caja | Resumen de conteo, dueño. `CashRegisterModals.jsx`. | Sí. Referencia calculada, contado y aviso «Por revisar». | Compara los importes. La conciliación queda provisional. |
| Personal | Personal, dueño. `UserManagement.jsx`. | Sí. Cajera demo, sede Norte, turno 08:00–16:00 y ficha de acceso abierta. | Consulta roles, sedes y turnos. No se guardan cambios. |
| Configuración | Configuración, dueño. `Settings.jsx` y `BranchManager.jsx`. | Sí. Razón social demo y panel de sucursales abierto desde Configuración. | Consulta datos comerciales y sucursales. Sin guardar ni afirmar facturación automática. |
