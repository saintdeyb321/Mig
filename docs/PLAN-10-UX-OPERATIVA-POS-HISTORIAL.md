# MigaPOS — PLAN 10
## Refinamiento UX operativo Galaxy Nebula: POS e Historial de Ventas

**Tipo:** refactorización visual/UX acotada. **Estado:** por ejecutar. **Base auditada:** `fix/migapos-production-readiness` en `40cd2cccc13ab1b7b3c0b635568e9958c6b71da0` (5 nov 2026). **Prioridad:** experiencia diaria del vendedor, legibilidad y ahorro de espacio; no altera operaciones de negocio.

> **Gobernanza innegociable:** el propietario controla exclusivamente Git, GitHub, commits, ramas, merges, publicación y Firebase. Codex SOLO trabaja en archivos locales, ejecuta pruebas locales permitidas y reporta resultados. **Prohibidos `git` y `gh` incluso de lectura, APIs/conectores GitHub, scripts que los invoquen, deploy y accesos a datos reales.** Mantener la skill UI/UX Pro Max ya instalada; no reinstalar ni descargar herramientas sin autorización.

## 1. Intención y alcance

Dos **módulos principales**:
1. **Punto de Venta (POS):** hacer del catálogo y del ticket el centro de trabajo. Reducir cabecera, avisos excesivos y espacios muertos; carrito siempre utilizable, incluso en vista global solo lectura, caja cerrada y pantallas bajas. Dentro de este módulo se refinan **apertura/cierre de caja y resumen de arqueo**, que son diálogos dependientes del POS.
2. **Historial de Ventas:** tarjetas legibles, contraste jerárquico y menor altura de la zona de exportación Excel; ver tickets antes sin recorrer bloques de texto innecesarios. No suprimir estados financieros ni controles de anulación.

**Dependencia visual transversal limitada:** `AppLayout`, `BottomNav` y tokens de tema para mejorar sidebar, espaciado y paleta de estas dos vistas sin rehacer el resto del producto. Otros módulos fuera de alcance salvo regresiones estrictamente producidas por un token compartido.

**Referencias visuales del propietario:** la vista actual con sidebar violeta, cabecera de POS y aviso de lectura sobredimensionados contrasta con la referencia deseada: catálogo a la izquierda y carrito ocupando la altura útil a la derecha, sin tarjeta superior. En Historial, se quiere una barra discreta de exportación y tarjetas de movimientos rápidamente visibles. Los ejemplos de modales de caja muestran textos cortos, montos dominantes y diferencia codificada por color; sus detalles solo se expanden a demanda.

## 2. Diagnóstico técnico constatado (leer antes de editar)

- `frontend/src/modules/POS.jsx`: `<PageHeader />` general, alertas en flujo normal, `<section aria-label="Catálogo de productos">` y `<aside aria-label="Ticket">`. `branchStatus.isReadOnly` protege vista global/inactiva. No manipularlo. `usePOS` y `useCashRegister` manejan ventas/caja; no editarlos.
- `frontend/src/index.css`: `#main-content:has(> .pos-workspace)` crea altura fija; `.pos-ticket*` reparte scrolls. El aviso de solo lectura en la parte superior puede reducir la superficie útil; calcular altura real sin superponer controles.
- `frontend/src/modules/pos/TicketParts.jsx`: cabecera, items con `overflow-y-auto`, total y `pos-ticket-actions` fuera del scroll; preservar esa estructura. El ticket ya es importante, **no volver a dejar el CTA fuera del viewport**.
- `frontend/src/modules/SalesHistory.jsx`: cabecera tipo `PageHeader` y rejilla `xl:grid-cols-2 3xl:grid-cols-3`. En anchos reales tras sidebar puede limitarse a dos tarjetas pese a caber tres; evaluar por anchura disponible y densidad.
- `frontend/src/modules/sales-history/SaleHistoryCard.jsx`: representa `rejected`, `draft_offline`, `uncertain`, `voidPending`, `voided` y confirmado. **No mezclar estos estados ni tratar un borrador como ingreso**.
- `frontend/src/App.jsx`: en pestaña `history`, si `isAdmin`, se muestra `ExportSales` **encima** de `SalesHistory`. No suprimir exportación ni cambiar autorización por rol.
- `frontend/src/modules/ExportSales.jsx`: `consent` local y varios párrafos siempre visibles; `handleExport` llama al hook `useExportSales`. Simplificar la superficie **sin cambiar** `useExportSales`, el alcance/limitaciones de consulta, el tratamiento de errores, el límite de peticiones, ni los resultados financieros.
- `frontend/src/modules/CashRegisterModals.jsx`: `CashCountSummary` muestra apertura, cobros, anulaciones, contado, resultado y detalles. `hasUnverifiedDisbursements` o `expectedAmount < 0` hace **provisional** el cuadre; no se puede afirmar una falta real sin verificar salidas.
- `frontend/src/layouts/AppLayout.jsx` + `frontend/src/BottomNav.jsx` + `frontend/src/index.css` + `shared/styles/theme.css`: navegación y tokens ya existentes. Conservar visibilidad por roles mediante `getSessionModules(user)`.

## 3. Principios UX aplicables (convertir en pruebas)

- **Jerarquía / información primero:** productos + ticket primero; advertencias e instrucciones secundarias compactas pero accesibles.
- **Prevención de errores:** advertencias bloqueantes nunca desaparecen ni se convierten en una insignia ambigua; avisos críticos accesibles por teclado/lector de pantalla.
- **Estado del sistema visible:** distinguir `solo lectura`, `caja cerrada`, `turno vencido`, `sin red`, `pendiente`, `confirmado`, `anulado`, `rechazado`.
- **Divulgación progresiva:** mostrar el resultado y acción principal, y situar cálculo detallado, notas de consulta o advertencias largas en detalles de fácil acceso; no esconder consentimiento/reglas realmente obligatorios.
- **Consistencia y reconocimiento:** botones estables, iconos Lucide, alineación común y colores semánticos; evitar emojis decorativos en indicadores críticos.
- **Densidad equilibrada:** densificar información sin reducir áreas táctiles, contraste o visibilidad del foco.

## 4. Sistema visual Galaxy Nebula — no pastel

**Dirección cromática**: morado profundo predominante en sidebar/marca, transición suave entre ciruela e índigo con toques discretos de azul estelar. Las superficies de trabajo serán blanco lavanda/niebla clara, **no blanco puro repetido ni pastel deslavado**. Un solo gradiente de marca, no un gradiente por cada tarjeta.

**Referencias orientativas (no imponer sin auditoría de contraste):**

| Rol | Tono sugerido | Uso |
|---|---|---|
| Cosmos profundo | `#1D163C` | Base del sidebar |
| Nebulosa oscura | `#35215D` | Transición y secciones del sidebar |
| Violeta marca | `#6543CE` | Acción primaria/activo |
| Azul estelar | `#315ECE` | Contraste secundario y enlaces, con moderación |
| Lila luminoso | `#AA8BFF` | Glow sutil, detalles no textuales |
| Lienzo perla | `#F3F2FA` | Fondo del workspace |
| Superficie | `#FCFBFF` | Tarjetas y paneles |
| Borde frío | `#DADBED` | Separaciones |

- Recalibrar **tokens semánticos existentes** y variables de compatibilidad, sin renombrarlas ni afectar impresión/reportes.
- Gradiente de sidebar de **baja frecuencia espacial**, sin franjas exageradas ni negro uniforme; sombras suaves y contraste suficiente (`WCAG AA` textos/controles, foco visible).
- Colores de caja/estado **semánticos**: verde = coincidencia/confirmado; rojo = diferencia real negativa/error; ámbar = revisión o información provisional. El violeta no puede anular esas señales.
- Evitar fondos de productos huecos grisáceos con demasiada superficie visual; diferenciar foto/sin foto con placeholder elegante sin reducir precio/stock.

## 5. Fases de implementación

### P10-00 — Baseline e inventario (local)

1. Leer archivos afectados, los tests UX/Spark ya existentes y el documento de diseño PLAN 09.
2. Inventariar vistas: POS dueño en sucursal activa, dueño en vista global, cajero, caja cerrada, turno vencido, sin red y carrito lleno/vacío; Historial con varios tickets, anulaciones, borradores y error de consulta.
3. Registrar medidas y capturas **antes**: altura útil de POS, posición del CTA, altura del bloque Excel, cantidad de tickets visibles sin scroll, distribución del menú.
4. Verificar disponibilidad de skill UI/UX Pro Max local; **usarla, no reinstalarla**. No agregar dependencias.

### P10-01 — Sidebar y calibración Galaxy Nebula

- Reducir huecos no funcionales entre marca, notificación, identidad, selector y navegación; alinear iconos y textos y mantener una retícula de espaciado coherente (4/8/12/16/24 px).
- Separar visualmente identidad, cambio de sede y grupos de módulos sin tarjetas decorativas excesivas. Sidebar debe mantener scroll propio si se reduce altura, y cerrar sesión accesible.
- Mantener jerarquía de navegación, selección activa, orden y permisos actuales; **no introducir nuevas rutas**.
- Reemplazar degradado plano/pastel por ciruela-violeta-índigo más orgánico, sin sacrificar legibilidad. Estados hover/foco/activo consistentes.
- La edición de tokens es mínima y requiere pruebas rápidas de regresión en vistas no objetivo que consuman dichos tokens.

### P10-02 — POS: área de trabajo prioritaria

**Escritorio (>=1024 px):**
- Cambiar el `PageHeader` del POS por **cabecera compacta de módulo** (título, estado de caja, acción contextual de cerrar caja) sin gran tarjeta ni descripción repetitiva. Conservar título `<h1>`/semántica y acciones existentes.
- Vista global: un aviso compacto, legible, no intrusivo, por ejemplo **«Vista global · Solo lectura. Elige una sucursal para vender.»**. Conservar la restricción de edición y facilitar localizar el selector; no convertirlo en mero color sin texto. Si hay error grave de red/seguridad, conservar un mensaje completo accesible.
- Composición de dos columnas: catálogo flexible a la izquierda y **ticket visible y lleno de altura útil** a la derecha, con ancho coherente. El ticket no debe quedar desplazado por márgenes/cabeceras; no usar offsets fijos que fallen con avisos.
- Catálogo con scroll propio cuando la altura del workspace es limitada; filtros y búsqueda visibles o fácilmente accesibles, sin tapar productos.
- Ticket con cabecera, lista scrollable, total, métodos de pago y CTA. **Total + acción siempre visibles** con muchos ítems. Permitir scroll independiente de pago solo si la altura realmente lo exige. El panel no aumenta con los ítems ni queda hueco exagerado que desplace el cobro.
- El ancho usado por el carrito no debe sacrificar innecesariamente las tarjetas del catálogo. El estado solo lectura no puede añadir un bloque que reduzca sustancialmente la altura del ticket.
- Paleta: precio/stock legibles; selección de categoría y de pago distinguible por color **y forma/texto**.

**Móvil/tablet:**
- No forzar dos columnas; acceso flotante al ticket por encima de bottom nav y safe-area, sin colisión con teclado o acciones.
- Drawer con cabecera, items, total, pago y botón principal visible; contenidos y valores conservados al abrir/cerrar cuando no cambian usuario/sucursal.

**Prohibido tocar:** `usePOS`, `useCashRegister`, cálculo de total, stock, estados de caja, validaciones, `handleCheckoutClick`, `processSale`, confirmación de recibo, `isReadOnly`, límites de operación o idempotencia.

### P10-03 — Cierre de caja: simplicidad en primer nivel, detalle bajo demanda

**Pantalla 1: apertura:** título «Abrir caja», una frase breve, importe inicial como campo grande; Cancelar / Abrir caja. Mantener `step="0.01"`, validaciones, límite de 10 horas y estados busy.

**Pantalla 2: conteo:** «¿Cuánto efectivo contaste?», instrucción corta «Cuenta billetes y monedas; escribe el total», campo grande y acciones «Volver»/«Siguiente». Sin tecnicismos de backend en el primer nivel.

**Pantalla 3: confirmación:** presentar 3 datos fáciles de escanear:
- **Referencia calculada** (o «Dinero esperado» solamente si `!provisional`).
- **Dinero contado**.
- **Resultado**: «Coincide», «Faltan S/ …», «Sobran S/ …», o «Por revisar» si la diferencia no es confiable.

Usar fondo suave, énfasis del importe, color semántico y un mensaje de una línea. Para diferencia no nula, mantener **observación obligatoria de al menos 5 caracteres**; si hay anulaciones/salidas dudosas, explicar brevemente «Hay anulaciones/devoluciones por verificar; el cuadre es provisional» y pedir revisión al dueño, sin afirmar un faltante real ni una devolución física realizada.

**`<details>` / «Ver detalle del cuadre»**, cerrado por defecto: apertura, cobros POS, cobros de contratos, anulaciones, posibles salidas o gastos **solo cuando esos conceptos estén realmente disponibles en `summary`**; no inventar montos ni sumar «gastos» inexistentes. Si no existe un campo de gastos verificable, explicar en detalle «Los gastos o entregas de dinero no registrados no forman parte de esta referencia; indícalos en observaciones» y mantener la advertencia sobre conciliación pendiente. Los movimientos electrónicos no equivalen a dinero físico entregado.

Pies de modal y botones nunca quedan ocultos; foco, teclado, error y `busy` preservados. **No cambiar** `calculateClose`, `confirmClose`, `cashAmount`, datos recibidos, nombres de campos del backend ni reconciliación.

### P10-04 — Historial: más tickets visibles y exportación compacta

- Cabecera más concisa con título y estado de actualización, sin tarjeta alta. Mantener advertencia «Los tickets sin cobrar no suman ingresos» visible pero discreta.
- Bloque **Excel en una banda compacta**: título corto/label, selector de período y botón «Descargar Excel». Texto explicativo secundario en «Detalles de exportación» (accesible y cerrado por defecto); no mostrar párrafos legales grandes en estado normal. Meta: **una fila en escritorio si hay ancho suficiente; dos filas en móvil**, sin ocultar `FirestoreQueryError` cuando exista.
- El checkbox actual `consent` es una confirmación local del componente. El propietario solicita eliminarlo por fricción. Antes de hacerlo, comprobar si hay obligación normativa/de producto/prueba de consentimiento separado; **si no la hay**, el clic explícito en «Descargar Excel» puede iniciar la consulta, acompañado de una leyenda corta «La descarga consulta los movimientos del período seleccionado». Si sí la hay, reemplazar la fricción por confirmación puntual accesible, **no saltarse el requisito**. Nunca generar descargas sin interacción explícita ni empezar nuevas lecturas automáticamente.
- No mostrar «Spark», diagnósticos internos ni detalles técnicos en el flujo normal; conservar la información técnica en un disclosure para administradores **solo en error**.
- Usar rejilla con columnas adaptativas por ancho de contenido real: aproximar 3 tarjetas en un escritorio ancho con sidebar cuando cada tarjeta mantenga un ancho legible (~300 px); 2 en tablet amplia; 1 en móvil.
- Tarjetas: cabecera fecha/hora, sede, importe prominente, método, estado, items legibles, acciones en pie. Reducir huecos blancos grandes; si una tarjeta contiene un ticket largo, permitir expansión de detalles, sin perder acceso a anular/revisar. **Nunca ocultar** el motivo financiero de `draft`, `uncertain`, `voidPending`, `rejected`, `voided` ni confundirlos.
- Diferenciación de métodos y estados con **badge + texto + icono** (no depender solo de color). Prohibido hacer de «Anular ticket» la acción primaria o activar la acción si el backend no la permite.
- Mantener la información completa de tickets y comprobantes accesible y las mismas operaciones de anulación/verificación. No truncar ID si se necesita para soporte; se puede mover a «Ver detalle».
- Errores/consistencia: no convertir banners de error de lectura en éxito aparente ni ocultar «revisión local».

### P10-05 — QA, regresión y evidencia

1. Lint, build/PWA y Node/UI/Chromium que ya funcionen localmente; sin acceso a producción. No ejecutar scripts que invocan Git ni entornos remotos.
2. Añadir pruebas UX focalizadas en `tests/` sin degradar ni borrar las anteriores: layout POS global/normal/offline, CTA visible antes de scroll y con 8+ ítems, caja cerrada, scroll de catálogo; caja con diferencia positiva, negativa, cero, **provisional**; Excel compacto y sin disparar consulta hasta el clic; tarjetas en escritorio/móvil, estado de anulaciones.
3. Revisar widths **320, 390, 768, 1024, 1280, 1440 px** y alturas **560, 700, 900 px**, teclado, zoom 200%, orientación horizontal y movimiento reducido. No scroll-x global, ni superposición de CTA/bottom nav.
4. Registrar comparativas antes/después de POS global, POS caja abierta/cerrada, historial con 1/3/10 tickets, Excel desktop/móvil, y cierre de caja en 4 estados. Guardar PNG localmente en `.release/p10-visual/` sin subirlos ni borrar resultados de fases previas.
5. Informe final **corto** en `docs/PLAN-10-RESULTADOS.md`: archivos modificados, cambios por fase, 8–12 capturas representativas, comandos ejecutados, pruebas PASS/FAIL, bloqueos y deuda pendiente. No declarar producción apta por capturas sintéticas.

## 6. Criterios de aceptación (obligatorios)

| ID | Criterio | Evidencia |
|---|---|---|
| AC10-01 | Sidebar mayoritariamente morado/índigo, elegante y legible, con espacios regulares | Captura desktop; foco/scroll propios |
| AC10-02 | POS sin cabecera grande ni aviso que acapare el viewport | Capturas global/sede/caja cerrada |
| AC10-03 | Ticket llena altura útil, total y CTA visibles sin scroll de página | Medidas DOM desktop/altura 560 px |
| AC10-04 | Catálogo y carrito tienen scroll independiente y no crecen por cantidad de ítems | Prueba con 8+ líneas y muchas tarjetas |
| AC10-05 | Vista global **solo lectura** clara y realmente bloqueada | Prueba de interacción; permiso intacto |
| AC10-06 | Cierre de caja es entendible en segundos: esperado/contado/resultado | 4 estados, textos cortos y colores correctos |
| AC10-07 | Estado provisional no anuncia faltante definitivo; detalle explica salidas/gastos sin inventar números | Pruebas de resumen/condicionales |
| AC10-08 | Historial muestra tickets antes de scroll innecesario; exportación compacta | Capturas y medidas de layout |
| AC10-09 | Exportar solo bajo clic explícito, conserva períodos, límites, errores y protección de scope | Tests de interacción; sin lecturas en mount |
| AC10-10 | Todos los estados financieros de tarjetas siguen distinguiéndose; botones autorizados por rol/sucursal | Pruebas de estado y control |
| AC10-11 | Accesibilidad WCAG AA esencial, targets adecuados, foco, Escape, lector de pantalla semántico y mobile safe areas | Checklist + pruebas DOM |
| AC10-12 | No se cambió código financiero, Firebase, IndexedDB, licencias, versiones, ni se hizo Git/deploy | Declaración de archivos tocados + evidencias de prueba |

## 7. Archivos permitidos / prohibidos

**Permitidos con justificación:** `frontend/src/modules/POS.jsx`, `frontend/src/modules/pos/{CatalogParts,TicketParts,PaymentParts}.jsx`, `frontend/src/modules/CashRegisterModals.jsx`, `frontend/src/modules/SalesHistory.jsx`, `frontend/src/modules/sales-history/SaleHistoryCard.jsx`, `frontend/src/modules/ExportSales.jsx`, `frontend/src/layouts/AppLayout.jsx`, `frontend/src/BottomNav.jsx`, `frontend/src/index.css`, `frontend/src/shared/styles/theme.css`; pruebas UX en `tests/*`, documentación PLAN 10. Cambios adicionales a UI compartida **solo** si se prueban todos los consumidores y resultan imprescindibles.

**Prohibidos:** `functions/**`, Firestore Rules e índices, `firebase.json`, `.firebaserc`, `.env*`, `frontend/src/features/**/{domain,application,infrastructure,hooks}/**`, hooks de POS/caja/ventas/exportación, autenticación, licencias, permisos, `offlineDB.js`, utilidades de sincronización, políticas de release, servicio worker, dependencies/lockfiles, skills, `package.json`, `.github/workflows/**` (no necesario para esta iteración). No tocar importes financieros, reglas ni protocolos. **Git y GitHub, cualquier comando o herramienta, completamente reservados al propietario**.

## 8. Entrega y límite de aceptación

Codex trabaja **directamente en el código local** y finaliza sin Git/GitHub ni publicación. El dueño examina el diseño, publica manualmente el commit y comparte enlace. ChatGPT audita los cambios reales y prepara correcciones si son necesarias. **CI remoto del commit 40cd2cc figura fallido por inicialización de Chromium en `backups.browser.test.mjs`; esta iteración visual no autoriza ignorarlo ni desplegar a producción.** Esa estabilización se gestionará aparte, sin mezclarla con cambios de UX.

Un despliegue de Hosting —nunca Rules/índices por este plan— solo se considera después de revisión visual y validaciones funcionales y release exigidas. Hasta entonces, usar pruebas locales/preview controlado sin acceso a datos de clientes.
