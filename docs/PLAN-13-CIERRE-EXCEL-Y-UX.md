# MIGAPOS — CIERRE DE PREPILOTO: EXPORTACIÓN EXCEL CONFIABLE + UX DEL PANEL

**Objetivo:** una única corrección focalizada antes de continuar las simulaciones comerciales.
**Referencia pública auditada:** `fix/migapos-production-readiness` en `4e037324f4b7f777806f1a7004af726e980e0a62` (verificar el contenido local, que puede ser más reciente; NO ejecutar Git).
**Prioridad:** P0 exportación funcional; P1 apariencia y accesibilidad del panel. **No es una nueva fase de arquitectura financiera.**

## 1. Evidencia del usuario

### Captura del sistema actual
- Barra de Excel blanca y muy plana: texto `Excel`, selector `Semana · detalle de tickets`, botón verde y `Detalles de exportación` sin una jerarquía visual clara.
- Error rojo: `No se pudo actualizar`, `No se pudo completar la consulta`; diagnóstico contiene `Failed to fetch dynamically imported module: http://localhost:5173/node_modules/.vite/deps/xlsx-js-style.js?v=...`.
- Ese texto **no es evidencia de fallo de una consulta Firestore**: primero falló la adquisición de un módulo JavaScript que Vite optimiza durante desarrollo.
- El error debe diferenciar importación/carga de la librería, fallos de lectura de datos, errores de conciliación del workbook y fallos de descarga.

### Referencia visual: MigaPOS antiguo
- Tarjeta separada de la página con borde redondeado y **franja verde esmeralda vertical a la izquierda**.
- Cabecera propia: `Exportar Reportes Contables`, icono grande de reportes y subtítulo `Descarga un Excel multi-hoja (Resumen, Ventas, Productos y Sucursales) listo para auditoría.`
- Debajo, **fila horizontal** con selector de período largo y botón verde «Descargar Excel» claramente primario.
- Superficie suave gris-azulada para selector; espacio suficiente, sombra tenue, todo legible y alineado.
- Actualizar este lenguaje a **Galaxy Nebula**: fondo cálido `--color-canvas`, superficies crema `--color-panel`, lavanda/índigo sutiles y protagonismo verde solo para exportación exitosa. No recrear el estilo antiguo literalmente ni saturar gradientes.

## 2. Hallazgos concretos del repositorio

- `frontend/src/features/reports/hooks/useExportSales.js` importa `xlsx-js-style` con `import('xlsx-js-style')` dentro de `Promise.all` junto con consultas a ventas/contratos/turnos/anulaciones.
- `frontend/vite.config.js` no declara `optimizeDeps.include` para `xlsx-js-style` y tiene VitePWA habilitado en modo dev (`devOptions.enabled: true`). Esto **no identifica por sí solo la causa**, que deberá verificarse con Network y consola; pueden intervenir caché preoptimizada, cambio de hash, 404/504/500, HMR o service worker.
- `frontend/src/modules/ExportSales.jsx` usa `FirestoreQueryError` para **todo** fallo de exportación, aunque la importación del módulo pueda haber fallado antes de leer Firestore.
- `useExportSales.js` marca `lastExport.current` antes de la carga y el bloqueo de 5 segundos sigue vigente incluso después de una falla; un reintento inmediato puede quedar rechazado.
- Las pruebas actuales de Excel verifican la librería importada de forma estática y el workbook, pero **no necesariamente prueban el flujo real de importación diferida en `npm run dev`** ni la descarga al pulsar el botón.
- Los reportes financieros y `buildSalesWorkbook` ya tienen invariantes y pruebas. **Preservarlos.**

## 3. Objetivos funcionales no negociables

### E1 — Identificar el fallo real (sin adivinar)
1. Reproducir el error con la app local en entorno de prueba (sin Firebase real), usando Vite y una cuenta/lector simulado si corresponde.
2. Inspeccionar qué petición falla en Network a `/node_modules/.vite/deps/xlsx-js-style.js?v=...`: URL final, código HTTP, tipo MIME, consola, Service Worker que intercepta si existe, y momento del fallo.
3. Contrastar navegador con recarga dura y arranque limpio de Vite usando parámetros ya disponibles (`npm run dev -- --force` es válido y no instala nada). No borrar datos de usuario, IndexedDB ni cachés globales de la app sin necesidad/evidencia.
4. Comparar `vite dev` con build local y `vite preview`: una compilación exitosa por sí sola **no prueba** que la importación diferida funcione bajo Vite dev.
5. Documentar causa demostrada. Si no es reproducible por depender de la caché de un navegador externo, preservar diagnóstico honesto y diseñar corrección conservadora verificable.

### E2 — Resolver carga de la librería de Excel de forma robusta
1. Aplicar el **cambio mínimo sustentado** por E1. Evaluar `optimizeDeps.include: ['xlsx-js-style']` si el fallo procede de optimización tardía o invalidación de dep en Vite; no añadirlo ciegamente si la evidencia señala otro origen.
2. Conservar *lazy loading*, de modo que Excel no se descargue durante el primer inicio de la PWA por defecto. Mantener reglas de `globIgnores` y caché diferida existentes para producción, salvo que una prueba demuestre que deben corregirse.
3. Respetar la compatibilidad de importación ESM/CommonJS de la librería (validar que la API `write`, `utils` existe); no sustituir librerías ni instalar dependencias.
4. No introducir un fallback que produzca XLSX vacío, parcial, inventado o con totales distintos. Ante error, **no descargar** y mostrar fallo concreto.
5. Definir un solo mecanismo de importación reutilizable, comprobable y aislado. No duplicar código de exportación ni importar todo el paquete de forma estática en el arranque.
6. Asegurar que URLs Blob se revocan, los nodos temporales se limpian, los controles se restauran y se descartan respuestas de otra identidad/sede. Si existe una limitación de descarga del navegador, informarla sin afirmar éxito.

### E3 — Reintentos y estados UX correctos
1. Separar fases en UI: **cargando módulo Excel**, **consultando movimientos**, **generando archivo**, **descargando** (si no hay fases técnicamente distinguibles, usar estados honestos sin inventar progreso).
2. Separar errores: `module-load`, `data-read`, `integrity`, `export/download`. Importar código antes de consultar o envolver promesas con contexto suficiente para identificar de manera fiable la fase; no asumir que todo rechazo de `Promise.all` proviene de Firestore.
3. En fallo de carga de XLSX, indicar `No se pudo preparar Excel` con texto útil: `Hubo un problema al cargar el generador de archivos. Intenta nuevamente; si continúa, recarga la página.` Ofrecer botón **Reintentar exportación** funcional y detalles técnicos expandibles para soporte.
4. Los errores `permission-denied`, límite de documentos y rechazo por conciliación mantienen su tratamiento bloqueante, sin crear archivos parciales ni confundir a usuarios.
5. **Resetear o evitar penalización del cooldown de 5 segundos tras fallos**; conservar protección de doble clic y bloqueo mientras la operación está activa. No reintentar descargas automáticamente o en bucle.
6. Nunca renderizar como mensaje principal una URL local interna ni mensajes sin clasificar; permitir detalle técnico acotado y seguro para diagnóstico.
7. Mensajes `role="alert"`/`role="status"` accesibles; foco lógico tras reintentos. Si se cambia el período, no mostrar error o éxito asociado a otro período.

### E4 — Excel correcto de extremo a extremo
Mantener exactamente lo que existe: filtros `hoy`, `semana`, `mes`, `todo`; alcance negocio/sede; hojas `Resumen_Financiero`, `Comparativa_Sedes`, `Productos_*`, `Auditoría_Pedidos`, `Auditoría_Cajas` y detalles condicionados a los datos/período. No inventar hojas vacías obligatorias.

Pruebas mínimas:
- Descargar un archivo `.xlsx` real desde un **clic sobre la UI** (no solo invocar `buildSalesWorkbook` en Node), con el lazy import servido por Vite dev y luego por `vite preview`, usando fixtures aisladas.
- Verificar que el archivo es un ZIP/XLSX válido, se puede **reimportar**, nombre y hojas esperadas, cifras en soles y ausencia de fórmulas inyectadas desde texto de negocio.
- En un escenario de ensayo: cobros totales S/ 85.00 → después de compensación Yape S/ 55.00, efectivo S/ 28.00, digital S/ 27.00. También caso sin ventas y filtros de semana/mes/año.
- Cambio de sede/identidad o desmontaje de componente mientras se exporta: no descargar datos del contexto anterior.
- Comprobar un fallo de importación simulado y que reintentar ejecuta la carga de nuevo; comprobar fallo de lectura/403 y fallo de conciliación con **cero descarga**.
- PWA: confirmar carga diferida y camino sin conexión. Si no se ha descargado el módulo antes, el error offline debe ser explicativo, sin falsas confirmaciones.

## 4. Objetivos UX: volver al panel antiguo con Galaxy Nebula

### Diseño específico para `frontend/src/modules/ExportSales.jsx`

**A. Tarjeta exterior**
- `section` semántica con `aria-labelledby`, radio ~20–24px, borde lavanda tenue, sombra ligera, superficie blanco crema con un toque radial o gradiente *casi imperceptible*, y **banda lateral verde esmeralda 4–6px**.
- Diferenciarla claramente de `Historial de ventas` sin robar protagonismo al ticket POS.
- No usar bordes saturados en todo el contorno ni fondos blancos sin jerarquía.

**B. Encabezado**
- Icono `FileSpreadsheet` o similar en pastilla mint elegante con sombra mínima (preferir Lucide ya instalado).
- Título **`Exportar reportes contables`** con tipografía de ~19–22px, `text-ink` y peso fuerte.
- Subtítulo visible: **`Descarga un Excel con resumen financiero, movimientos, productos y sucursales para revisar tu negocio.`**
- Una etiqueta opcional `Excel multihoja` solo si no introduce ruido; preferir evitar badges decorativos.
- Header y controles como dos filas diferenciadas, no todo apretado en una sola línea.

**C. Fila de acción**
- Desktop >= 768px: grid `minmax(0,1fr) auto`, select ocupa el espacio restante, botón compacto pero generoso (~48–52px altura), ambos alineados verticalmente y sin scroll horizontal.
- Móvil < 768px: columna, selector y botón **ancho completo**, área táctil >=44px.
- Select con fondo gris azulado muy tenue (`bg-subtle`, `bg-stellar-soft/25`), borde suave, padding 12–14px, texto oscuro, `focus-visible` accesible. Opciones actuales sin cambios semánticos.
- Botón de exportación sólido verde esmeralda (token `success`) con icono descarga y hover sobrio; no inventar un verde externo a tokens.
- `Detalles de exportación` queda en una zona secundaria inferior, con disclosure ordenado, sin empujar controles ni mostrarse de manera invasiva.

**D. Errores y estados**
- Error debajo del formulario y dentro de la tarjeta: panel rojo/rosado **compacto**, con icono, título útil y un botón de reintento; detalles técnicos colapsados (solo cuando se expanden).
- No mostrar un error tipo “No se pudo actualizar” si falló un script de Excel.
- Éxito pequeño con icono confirmación; **solo cuando el navegador haya iniciado el proceso de descarga**, no cuando se genera el workbook, y sin afirmar que el archivo fue guardado en disco o abierto.

**E. Consistencia y regresiones**
- Mantener el módulo de historial de ventas, filtros, RBAC, registros y acciones sin cambios; no cambiar su compacidad <310px ni el POS.
- Probar 1440×900, 1024×768, 768×900, 390×844 y 320×560.
- Controlar saltos de línea del título, textos largos, zoom 125–200%, navegación con Tab, lector de pantalla, sin desbordamiento horizontal.
- Animaciones leves solamente para estados, respetando `prefers-reduced-motion`.

## 5. Fuera del alcance: prohibiciones explícitas

- Nada de `git`, `gh`, APIs ni conectores de GitHub: tampoco `status`, `diff`, ramas o commits. Git lo gestiona el propietario.
- Sin deploy, escrituras o pruebas en Firebase real. Simuladores/fixtures y emuladores solo si ya están disponibles.
- No instalar paquetes, fuentes, Java, Chromium o herramientas.
- No modificar cálculos de caja, pagos, ventas, anulaciones, contratos, permisos, Firestore Rules, índices, stock o persistencia.
- No reescribir `buildSalesWorkbook` para “arreglar” un error de carga del paquete.
- No borrar PWA, capacidades offline, CSP, validaciones de seguridad, caché de usuario ni pruebas para hacer pasar esta iteración.
- No abordar conciliación histórica P13-05 en esta tarea: es un caso documentado aparte, no la causa de la URL rota de Vite.

## 6. Pruebas autorizadas

Sí ejecutar localmente las pruebas relevantes y procesos existentes: `npm run lint --prefix frontend`, build/PWA, suite Node de reportes/Excel, Chromium para exportación real en dev/preview, verificación de UI responsive y `npm run test:spark` si es necesario. No hacer instalaciones ni usar Firebase real. **Un PASS de build no reemplaza la prueba real del botón.**

Cobertura de aceptación:

| Caso | Esperado |
|---|---|
| DEV-01: importación diferida en Vite | El módulo se resuelve (HTTP/MIME válidos), sin error de `node_modules/.vite/deps` |
| DEV-02: primera descarga luego de abrir `npm run dev` | Archivo `.xlsx` válido generado desde UI |
| DEV-03: recarga, cambio de filtro, segunda descarga | Sin fallo por hash obsoleto y sin doble descarga |
| PROD-01: build + preview + importación diferida | Archivo válido, sin recursos externos no autorizados |
| ERR-01: módulo Excel no disponible | Error específico + reintento funcional; 0 archivos |
| ERR-02: falta de permisos o lectura de datos | Error de datos correcto; 0 archivos |
| ERR-03: datos no concilian, límite excedido | Error de integridad; 0 archivos |
| FIN-01: S/ 85 → S/ 55 | Libro reimportado concilia con Dashboard en céntimos |
| UX-01: desktop/móvil | Tarjeta inspirada en MigaPOS antiguo; sin recortes ni scroll horizontal |
| A11Y-01: tab/foco/lector de pantalla | Selector etiquetado, botón accesible, error anunciado y reintento usable |
| REG-01: P09/P10-06, seguridad, lint/build | Sin regresiones y sin bajar umbrales |

## 7. Entrega de Codex

Crear o actualizar `docs/CIERRE-EXCEL-UX-RESULTADOS.md` con:
1. causa raíz demostrada o hipótesis pendiente, indicando Network/status y dev/preview;
2. archivos modificados;
3. pruebas ejecutadas y resultados PASS/FAIL/BLOCKED;
4. nombre del XLSX de ensayo, hojas y totales comprobados;
5. límites y riesgos aún abiertos;
6. cómo reproducir con `npm run dev` en el equipo del propietario;
7. confirmación sin Git/GitHub, sin instalaciones, sin acceso a Firebase real ni deploy.

Agregar las rutas Markdown nuevas al allowlist de seguridad por coincidencia **exacta**, sin suavizarla. Evitar documentar datos personales o enlaces secretos. No afirmar “producción lista” hasta la aceptación manual del propietario.

**Criterio de cierre:** desde el botón del navegador el Excel debe descargarse y abrirse correctamente, y el bloque de exportación debe verse como una tarjeta autónoma, refinada y coherente con Galaxy Nebula. Si se demuestra un caso no reproducible, documentarlo sin fabricar un PASS.
