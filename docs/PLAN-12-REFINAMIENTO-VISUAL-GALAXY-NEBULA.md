# MigaPOS — PLAN 12
## Recuperación de identidad visual, Historial y Dashboard Gerencial

**Base de revisión:** `main`, commit `6ca437bf2c4c29ffa169e6cc47c87e11c91d0cf2`, revisado el 05/11/2026.  
**Tipo:** refactorización **exclusivamente visual/presentacional**, sin despliegue.  
**Prioridad:** alta para UX comercial, sin afirmación de certificación funcional.  
**Propietario:** controla manualmente toda operación Git/GitHub y la prueba visual local.

## 0. Decisión de diseño

No rehacer MigaPOS, no reemplazar Tailwind 4/Radix UI, no instalar otra skill. Usar **UI/UX Pro Max ya instalada** únicamente como referencia de heurísticas, contraste, responsividad y jerarquía; las reglas de este documento prevalecen. La referencia visual es el **MigaPOS anterior** descrito en este plan: densidad moderada, tarjetas legibles, acentos vivos y poca interfaz decorativa. No entregar ni requerir imágenes a Codex: este documento es la especificación textual completa.

**Principio:** personalidad galáctica sin oscurecer la zona de trabajo ni producir un efecto pastel apagado. Fondo ligeramente crema, superficies claras, morado profundo en navegación, violeta/índigo/azul en acentos y verde reservado a semántica de efectivo/éxito donde corresponda.

## 1. Diagnóstico del código real

| Archivo | Hallazgo y decisión |
|---|---|
| `frontend/src/modules/sales-history/SaleHistoryCard.jsx` | La franja de color actual depende del estado (`success`, `warning`, `danger`), por ello un ticket Yape confirmado puede verse verde. Separar **método de pago** (franja + badge de pago) de **estado financiero** (badge de estado, textos y bloqueos). |
| `frontend/src/modules/SalesHistory.jsx` | Conservar orden, paginación/listado, importes, estados offline/anulación, permisos y acciones. Ajustar solo composición/densidad visual. |
| `frontend/src/modules/Reports.jsx` | Muestra «Actualizar período» junto a filtros y un párrafo grande de «Pedidos creados…». Retirar ambas piezas visibles; crear minidashboard de pedidos usando `contractCounts` ya calculados. |
| `frontend/src/modules/reports/ReportParts.jsx` | Tarjetas KPI, columnas y Top 5 ya existen. Refinar color, visualización y espacios sin modificar series, filtros o cálculos. |
| `frontend/src/shared/ui/States.jsx` + `frontend/src/App.jsx` | `LoadingState` tiene `min-h-48`, insuficiente para centrarlo dentro del área útil del módulo. Proveer variante de loading de **pantalla de módulo** para `Suspense` y vistas principales; no aumentar alturas de mini-loaders embebidos. |
| `frontend/src/layouts/AppLayout.jsx` | Un solo aviso engloba `!online || assisted`: el texto «Confirmando el acceso…» aparece brevemente tras F5. Eliminar ese **banner transitorio**; NO alterar estados, permisos ni bloqueo de operaciones. Mantener advertencias reales de conexión/fallo. |
| `frontend/src/shared/styles/theme.css` + `frontend/src/index.css` | `--color-canvas: #f3f2fa` y superficies actuales pueden sentirse apagados. Pasar a un crema blanco muy sutil con contraste púrpura/índigo; no cambiar los colores de riesgo ni romper tokens semánticos. |
| `frontend/src/shared/ui/PageHeader.jsx`, `frontend/src/modules/CategoryManager.jsx` | La cabecera tipo tarjeta y componentes de categorías pueden suavizarse/reducirse, reutilizando primitives; no ampliar cabeceras ni quitar espacio funcional. |
| `frontend/src/modules/ExportSales.jsx` | El bloque Excel **ya es compacto**; no revertirlo a la tarjeta gigante antigua ni alterar la descarga. |

## 2. Sistema visual Galaxy Nebula — nueva calibración

Propuesta de partida, **sujeta a legibilidad en el proyecto real**, no reemplazo arbitrario de todos los tokens:

| Función | Propuesta |
|---|---|
| Canvas cálido muy tenue | `#F9F8F5` o cercano; nunca crema amarillo intenso |
| Panel | `#FFFEFC` / `#FFFFFF` |
| Superficie contrastiva | `#F3F0FA` (violeta casi blanco) |
| Navegación | Degradado profundo `#231638` → `#352064` → `#3E2B78` con luces sutiles azules/violetas |
| Primario | `#6540CA`, hover `#512DAF` |
| Acento violeta | `#7B43D7` |
| Acento azul | `#356BE3` |
| Efectivo / positivo | `#138A65` y superficie muy suave verde |
| Yape / Plin | `#8641E6` y superficie lila pálida |
| Mixto | `#3478D8` y superficie azul pálida |
| Borde normal | Neutro templado, visible sin contraste exagerado |

Conservar alto contraste en texto e importes. Evitar enormes áreas violetas translúcidas. Preferir **franjas claras de 3–4 px**, sombras pequeñas y colores concentrados en acciones, indicadores y gráficos. No basar distinciones únicamente en color: acompañar con texto o icono.

## 3. Historial — comportamiento visual obligatorio

1. **Franja superior por pago**, en estado confirmado y cuando exista `s.payment` válido:
   - `efectivo` → verde.
   - `yape` / `plin` → morado (no verde).
   - `mixto` → azul.
   - otro/indeterminado → neutro, sin inventar método.
2. El **estado de operación** permanece independiente: `Venta registrada`, `Venta anulada`, `Sin cobrar`, `Por comprobar`, `Venta no realizada` y `Comprobando anulación` se distinguen con badge/texto e icono apropiados. Nunca pintar una operación incierta como confirmada solo por método de pago.
3. Cabecera compacta: **fecha a la izquierda, importe destacado a la derecha**, ID abreviado/legible y sucursal en segunda línea, badge del método de pago próximo al monto. No meter etiquetas en varias filas innecesarias.
4. Contenido: encabezado pequeño «Detalle del ticket», hasta tres productos visibles (o la cantidad existente conservando lógica), cantidades, nombres e importes por fila; el resto se expande. Bordes sutiles y fondo de contenido ligeramente diferenciado. No grandes bloques vacíos.
5. **Mixto:** cuando existan cifras verificadas, dos segmentos pequeños con `Ef: S/ …` y `Yape/Plin: S/ …`; suma y etiquetas deben derivar de los datos existentes, no ser recalculadas ad hoc. Si faltan datos, no inventar repartos.
6. Pie fijo dentro de la tarjeta (layout, no `position: fixed`): nombre del cajero a la izquierda y botón de anulación pequeño/discreto a la derecha, con las mismas condiciones de autorización, deshabilitación y confirmación actuales. No cambiar callbacks.
7. En desktop, tres tarjetas por fila cuando el ancho útil lo permita, igualando altura **solo donde sea razonable**; en tablet dos y en móvil una, sin grandes huecos. Si es preciso, ajustar `.history-grid`.
8. No alterar los estados offline, verificación de anulaciones, devolución física, navegación ni carga de datos.

## 4. Cargas de módulos y banner F5

- Diferenciar cargas **globales**, **de módulo completo** y **embebidas**.
- En cambios de módulo `Suspense`, centrar loader y texto dentro de un área estable que use el alto útil visible de `main` (no `min-h-48`), preservando sidebar y barra inferior.
- Cargas de historial/categorías/reportes y `BranchGuard`: usar el mismo patrón cuando ocupan toda la vista; evitar que un spinner pequeño aparezca arriba a la izquierda. No crear alturas enormes dentro de cards o diálogos.
- `aria-busy`/`role=status`, texto breve, sin saltos de layout ni animaciones obligatorias para usuarios con movimiento reducido.
- **F5:** en `AppLayout.jsx`, si `assisted` representa verificación temporal, no mostrar el **banner amarillo de verificación**. El acceso seguirá en read-only y bloqueado hasta confirmación; si hace falta contexto visual usar un estado compacto no alarmista junto a indicadores existentes.
- **Importante:** mantener el banner o mensaje efectivo para **sin conexión real**, error de sesión persistente, denegación, sucursal no válida y protección financiera. No modificar hooks, guards o autorizaciones para «evitar el flash».

## 5. Reportes — Dashboard Gerencial + Dashboard Pedidos

### 5.1 Parte superior limpia

- Cabecera compacta de `Dashboard gerencial`, icono agradable y selector Hoy / Esta semana / Este mes / Este año en la misma banda.
- Eliminar botón visible `Actualizar período` y el renglón grande `Pedidos creados en el período…`.
- Mantener `refreshReport` en el hook y la capacidad de actualización automática. **No desactivar el manejo de errores/reintentos:** el error de consulta debe mantener una acción para reintentar. Puede mostrarse la fecha `Actualizado ...` discreta si ayuda.
- La nota financiera «informe histórico, no saldo de caja» debe conservarse de forma sucinta (etiqueta pequeña y/o divulgación), sin bloquear visualmente el panel. Conservar `Alcance de este informe` accesible y no suprimir advertencias importantes.

### 5.2 KPI principal (existente)

Conservar su **semántica exacta**: Ingresos **netos**, Tickets POS, Neto contable en efectivo, Neto contable Yape/Plin. No llamarlos «ingresos brutos» ni «efectivo disponible» si son netos contables. Tarjetas de fondo claro, borde superior azul/índigo, negro-índigo, verde y violeta, icono y cifra protagonista. Subtexto compacto. Reducir párrafos largos; dejar limitaciones técnicas en ayuda accesible.

### 5.3 Dashboard de pedidos (nuevo, UI-only)

Debajo del KPI principal y antes de gráficos, agregar una sección compacta **«Pedidos»** con cuatro minitarjetas/indicadores:
- **Pendientes** = `contractCounts.pending`.
- **Entregados** = `contractCounts.delivered`.
- **Cancelados** = `contractCounts.cancelled`.
- **Con saldo** = `contractCounts.withDebt`.

Los valores proceden **exclusivamente de `useReports`**; no nuevos repositorios, `onSnapshot`, `getDocs` ni cálculos financieros. No sumar los cuatro números: **«Con saldo» puede superponerse** con otros estados. El alcance es «pedidos creados en el período, según su estado actual», no conteo global de toda la historia ni movimientos ocurridos ese día. Si la UI representa esto de modo breve, incluir alcance en un tooltip/ayuda. Mantener 4 columnas desktop, 2 tablet, 2 o 1 móvil según disponibilidad.

### 5.4 Gráficos y top productos

- Mantener `chartData` y `topProducts` tal cual, sin refetch ni agregados de datos nuevos.
- Realzar cabeceras de los dos paneles con un **azul estelar vivo pero elegante**, barras azules, ceros discretos y filas Top 5 con indicadores de color por posición.
- Evitar barras que sugieran ventas donde hay 0; mantener negativos/devoluciones discernibles y no cambiar escalas/cálculos.
- Que estos dos paneles puedan verse **sin desplazar varias pantallas llenas de textos o cajas de explicación**.

## 6. Categorías y consistencia de módulos

- Ajustar el canvas global y primitives compartidas (`Card`, `PageHeader`, bordes, sombras, botones) **sin romper POS, modales ni carrito**.
- `CategoryManager`: tarjetas legibles, nombre y estado visibles, franja clara azul/índigo, editar fácil de encontrar; mantener archivo/activación/filtros.
- Revisar visualmente en el código las demás pantallas activas (POS, Contratos, Historial, Productos, Agenda, Ajustes, Sucursales, Admin, Reportes) para que compartan **tokens**, no para refactorizarlas funcionalmente ni reescribir cada pantalla.
- No extender cabeceras grandes y no oscurecer formularios o tablas de lectura prolongada.

## 7. Fases de trabajo (sin pruebas automatizadas en esta etapa)

**P12-00 — Lectura local rápida (sin comandos de Git):** identificar estilos y componentes mencionados. No ampliar auditoría técnica ni crear inventarios enormes.

**P12-01 — Paleta y superficie:** tokens Galaxy Nebula y ajustes compartidos mínimos.

**P12-02 — Historial:** franja por pago, importe, método, estados, contenido, cajero, botón y mixto.

**P12-03 — Carga / F5:** loaders centrados y desaparición del banner transitorio, guardas intactas.

**P12-04 — Dashboard:** cabecera más limpia, KPI visuales, dashboard de pedidos con datos existentes, gráficos y Top 5.

**P12-05 — Categorías / consolidación:** coherencia de tarjetas, espaciados, responsive y revisión manual *del propio código*, sin correr suites.

## 8. Límites estrictos de alcance

1. **Cero Git/GitHub:** no `git`, `gh`, APIs, conectores, lectura de ramas, commit, push, fetch, merge ni deploy; lo hace el propietario.
2. **Sin pruebas o tareas largas:** no `npm test`, `npm run lint`, `npm run build`, `firebase`, suites Chromium, CI, emuladores, capturas automatizadas, informes de cientos de líneas ni instalaciones. El propietario probará manualmente las pantallas tras subir los cambios.
3. No descargar imágenes ni intentar abrir las capturas del usuario en el entorno Codex. Trabajar únicamente con esta descripción textual.
4. No modificar hooks de negocio, transacciones, repositorios, Firestore Rules/índices, licencia, permisos, operaciones POS, reportes de datos, Excel, IndexedDB ni autenticación.
5. No modificar números, semántica financiera ni condiciones de riesgo. No introducir nuevas lecturas o listeners.
6. Reutilizar componentes actuales y Tailwind v4, sin nuevas dependencias.
7. Evitar código de UI duplicado; crear pequeñas abstracciones presentacionales solo donde aporten claridad.
8. No mentir sobre verificaciones: esta fase se entrega como **implementación pendiente de aceptación visual y pruebas posteriores**.

## 9. Criterios de aceptación manual del propietario

- [ ] Tickets confirmados con franjas: verde efectivo, morado Yape/Plin, azul mixto; anulados/pendientes muestran estados correctos.
- [ ] Fecha, importe, ID/sede, cajero, productos y anulación se leen inmediatamente, sin espacios muertos grandes.
- [ ] Tickets mixtos muestran desglose fiel a los datos cuando está disponible.
- [ ] Loading de módulo centrado; otros indicadores pequeños no se agrandan indebidamente.
- [ ] Al presionar F5 no hay aviso amarillo «Confirmando el acceso» parpadeante; operaciones siguen bloqueadas mientras falta autorización.
- [ ] Si realmente no hay red o existe fallo, el aviso de seguridad sigue disponible.
- [ ] Canvas cálido discreto, nav morado profundo, contraste y franja de tarjetas consistentes.
- [ ] Reportes sin botón redundante de actualizar ni línea grande de pedidos.
- [ ] Se ven cuatro KPI principales, cuatro cifras de pedidos y debajo gráficos/Top 5; sin consultas Firestore nuevas.
- [ ] Pedidos con saldo no se suman al total de pendientes/entregados/cancelados por superposición.
- [ ] Se preservan filtros, estados de errores, permisos, anulaciones y semantics financiera.
- [ ] En móvil no hay desbordes horizontales ni botones imposibles de pulsar.

## 10. Entrega Codex esperada

Resumen **de 8–12 líneas** con archivos editados, cambios principales, qué se dejó intacto y **«No ejecuté Git, pruebas, build ni despliegue»**. El propietario publicará en `main`, inspeccionará la UX y decidirá el siguiente ciclo de correcciones. La auditoría técnica PLAN 11 seguirá siendo una tarea separada; este PLAN 12 no autoriza desplegar ni certifica rendimiento.
