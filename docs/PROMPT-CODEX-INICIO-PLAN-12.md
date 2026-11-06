# PROMPT DE INICIO PARA CODEX — MIGAPOS PLAN 12

Actúa como arquitecto frontend senior experto en React 19, Tailwind CSS 4, Radix UI y diseño de interfaces POS/SaaS. Trabaja **directamente sobre el proyecto local que el propietario ya dejó preparado en `main`**. No gestiones Git ni GitHub.

## Referencia obligatoria

Lee `docs/PLAN-12-REFINAMIENTO-VISUAL-GALAXY-NEBULA.md` íntegramente. **Implementa las fases P12-00 a P12-05.** La skill UI/UX Pro Max puede consultarse localmente como guía, pero NO la reinstales, NO descargues nada y NO sustituyas la especificación por sus propuestas genéricas. No necesitas imágenes: la referencia visual está descrita en el plan.

## Lo que debe quedar implementado

**Historial de ventas:** recrea una tarjeta limpia y compacta como el MigaPOS anterior: fecha izquierda, importe grande derecha, ID y sede, detalle legible de productos, cajero abajo y «Anular ticket» pequeño a la derecha. La franja superior depende de **método de pago**: efectivo verde, Yape/Plin violeta, mixto azul; estado confirmado/anulado/pendiente conserva **badge semántico independiente**. En mixto, mostrar efectivo y digital separados solo si existen datos válidos. No romper acciones, permisos ni lectura de ventas.

**Loaders:** centra los indicadores de **pantalla de módulo** (incluido Suspense y pantallas que ocupen la vista) dentro del área útil. No agrandes loaders de diálogos, tarjetas ni pequeños controles.

**F5 y permisos:** elimina el banner visual transitorio «Confirmando el acceso…» de `AppLayout.jsx`, manteniendo intactas las validaciones de acceso y modo lectura. No ocultes errores reales ni advertencias de offline; si una verificación persiste, muestra un indicador discreto no alarmista.

**Paleta:** cambia canvas a blanco crema **muy tenue**, paneles luminosos, nav Galaxy Nebula morado profundo con reflejos sutiles azul/violeta, franjas finas y colores vivos usados con moderación. No quiero todo pastel ni todo blanco; contraste legible y navegación priorizada.

**Reportes:** compacta cabecera, conserva filtros de periodo y elimina únicamente el botón redundante «Actualizar período» y el renglón grande de pedidos. Mantén la actualización del hook y el reintento ante error. Mejora los KPI con franja azul, índigo, verde y violeta, conservando el nombre y valor **neto contable**, nunca «bruto» o «dinero disponible». Agrega debajo cuatro minitarjetas de pedidos Pendientes, Entregados, Cancelados y Con saldo usando exclusivamente `contractCounts` de `useReports`; el último valor es superpuesto y NO se suma a los demás. Mantén periodo y significado de datos. Mejora las cabeceras azul estelar, barras y Top 5 sin modificar cálculos ni consultas.

**Categorías y consistencia:** usa los tokens compartidos y franjas azules claras, sin perder funciones. Una pasada ligera de estilos a las vistas activas; no reescribas módulos ajenos ni el POS/carrito.

## Reglas absolutas de eficiencia

- PROHIBIDO cualquier comando Git/GitHub, incluso `git status`, `git diff`, `gh`, API o conectores. NO push, NO commit, NO deploy, NO Firebase.
- PROHIBIDO correr pruebas, lint, build, CI, Chromium, emuladores o tareas lentas. NO instalar paquetes ni generar capturas. El propietario verificará después.
- NO tocar Firebase, dominio financiero, reportes/Excel de datos, hooks de negocio, permisos, caché, IndexedDB, transacciones, configuración de producción ni dependencias.
- NO añadir consultas, listeners, temporizadores ni procesamiento costoso para el dashboard. Es UI de datos **ya disponibles**.
- NO reproducir archivos completos ni largos logs en la respuesta. NO crear otra auditoría ni entregar solo recomendaciones: **modifica el frontend ahora**.
- Si una propuesta visual choca con un guard, permiso o regla financiera, conserva la regla y ajusta únicamente su presentación.

## Entrega

Al finalizar, responde en 8–12 líneas: archivos editados, principales cambios visuales, confirmación de que conservaste estado financiero/permiso/cache y que **no ejecutaste Git, tests, build ni deploy**. Declara explícitamente: **«Pendiente de aceptación visual y validación del propietario»**.

Comienza ahora el PLAN 12.
