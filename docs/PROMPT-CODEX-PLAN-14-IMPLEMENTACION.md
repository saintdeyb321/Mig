# MIGAPOS — PROMPT TÉCNICO PARA CODEX — PLAN 14

Actúa como arquitecto senior React 19 + Vite 7 + Tailwind 4 + Firestore Spark, experto en contabilidad operativa de POS, transacciones idempotentes, impresión HTML y reportes financieros multitenant.

## Documentos obligatorios

1. `docs/PLAN-14-CAJA-VENCIDA-INFORMES-PDF-EXCEL.md` (seguir íntegramente).
2. `docs/CIERRE-EXCEL-UX-RESULTADOS.md` (módulo XLSX ya corregido).
3. `docs/PLAN-13-FASE-04-DIAGNOSTICO-CONCILIACION.md` y `docs/PLAN-13-RESULTADOS-QA-AUTOMATIZADA.md` cuando existan (límites históricos).

## Misión 0: inspección breve, sin Git

Localiza en el árbol del proyecto los lectores de caja, repositorios Spark, `firestore.rules`, pantalla POS/Caja, `cashAuditRows`, `salesWorkbook`, `sessionReportReads`, `aggregateReport`, `useReports` y `printDocument`. Confirma las rutas actuales sin asumir que son idénticas a las de GitHub. Identifica exactamente el candado vencido y la validación de diez horas en Rules.

## Misión A: CORREGIR la caja vencida sin perder integridad

Implementa una transición recuperable para `cash_sessions` Spark cuya duración máxima de **10 horas desde la apertura** haya vencido, independientemente de si la cuenta original era de dueño o de cajero.

**NO** afirmar que ya existe una política de 10 horas de **inactividad**: hoy se trata de una ventana rígida de turno. La inactividad real exige un rediseño adicional de actividad financiera atómica que no debes improvisar. Documenta esta diferencia en el informe y en la UI.

Reglas:

- La hora autorizante es `request.time`, no el reloj local.
- Tras vencer, un dueño o cajero **activo y autorizado para la sede** podrá recuperar el turno **con confirmación explícita** y abrir una caja nueva sin heredar montos.
- El turno viejo pasa a `expired_unreconciled` con evidencia de quién lo recuperó y cuándo; contado REAL y diferencia deben ser nulos/no declarados. No crear diferencias S/0 ni balances ficticios.
- Respetar `businessId`, `branchId`, `userId` original, `openedAt`, ingresos y documentos ya guardados.
- Cambiar el candado de forma atómica/idempotente; revisar `getAfter()` y los límites de Rules. Si no se puede autorizar el esquema seguro bajo Spark, **no fingir reparación**; entregar un diagnóstico acotado y dejar la función bloqueada.
- La nueva caja recibe `openingAmount` introducido explícitamente y tiene ID y horario independientes. No mover ventas antiguas a ella.
- Proteger dos pestañas/usuarios concurrentes, pérdida de conexión, resultado incierto, sesión antigua sin protocolo, cajero de sede ajena, licencia y cuenta inactiva.
- No confiar en `setTimeout`, TTL, Cloud Functions ni Gmail para autoridad de vencimiento.
- Añadir pruebas de Rules y repositorio que simulen caja abierta hace 5 días, borde de las diez horas y recuperación por un cajero distinto del original dentro de la misma sede.

**Autorización de código:** sí puedes proponer e implementar **cambios locales de `firestore.rules`** y repositorio estrictamente necesarios, con tests en `demo-migapos`. **No publicarlos** ni desplegar. Antes de aconsejar publicar exige PASS de Rules y transacción; si Java/emulador falta, deja ese bloque en `BLOCKED`.

## Misión B: corregir significado del historial de cajas

Refactoriza `cashAuditRows` y su presentación en `salesWorkbook`:

- Separar explícitamente `APERTURA`, `CIERRE MANUAL`, `VENCIMIENTO SIN ARQUEO`.
- Cambiar columna «Fecha Cierre» por «Fecha y hora del movimiento»/equivalente.
- Distinguir fondo inicial, referencia estimada, dinero realmente contado, diferencia y estado.
- Una apertura con S/ 100 NO es «Contado Real S/ 100»; un turno vencido sin arqueo NO tiene diferencia S/ 0. Emplear `null` en el modelo; texto informativo solo en celdas de presentación.
- Conservar fecha America/Lima, responsable, sede, explicación y validez de otras hojas.

## Misión C: informe PDF gerencial, no reemplazar Excel

Usa las lecturas `sessionReportReads` y el dominio `aggregateReport` existentes para construir un **ViewModel compartido** de resumen con datos y etiquetas de completitud/autoridad. Los resultados financieros de Dashboard, PDF y XLSX deben concordar exactamente.

- Añade dos acciones «Informe PDF» y «Detalle Excel» sin realizar nuevas consultas por solo cambiar de formato.
- Construye informe gerencial HTML imprimible/guardable como PDF en A4 (1–3 páginas usuales): resumen ejecutivo, cobros/compensaciones/neto por canal, POS/pedidos, comparativa de sucursales, top productos, cajas vencidas/revisión, notas de alcances.
- Emplea Galaxy Nebula en impresión (blanco crema, índigo, morado y menta discretos), encabezados claros, tablas cortas, sumas alineadas, tipos de movimiento inequívocos, nota visible «neto contable ≠ saldo físico ni beneficio».
- Reutiliza `shared/printing/printDocument.js` y conserva sandbox/CSP/sanitización. Ojo: el sanitizador elimina `<svg>`. No añadir código externo, CDN ni nuevas dependencias. Comprueba A4, márgenes, saltos, encabezados de tablas, PDF en blanco y negro y errores de impresión.
- La acción inicial es **«Imprimir / Guardar como PDF»** (diálogo del navegador). No fingir descarga PDF directa.
- Conservar XLSX por sede, global y hojas de auditoría, y mejorar vocabulario/jerarquía de los detalles sin añadir hojas redundantes.

## Misión D: coste y rendimiento medibles

Para 20 negocios, 2 sedes por negocio y 100 tickets por sede/día, calcula el volumen de documentos y **mide** lecturas/consultas del código real para un mes, una semana y hoy, **e incluye año y el límite real de 10.000 tickets por lectura**; compara caché fría vs caliente y PDF/XLSX consecutivos. El informe anual de una empresa con 2 sedes y ese volumen superaría ~73.000 ventas/año: no subir el límite ciegamente, no truncar, y marcar BLOCKED hasta que exista una agregación confiable o presupuesto de lectura aprobado.

- No agregar `getDocs` para cada página o componente de informe.
- Reusar snapshots por identidad, empresa, sede y período, invalidando al cambiar contexto o tras operación confirmada.
- No agregar agregados diarios persistentes ni modificar la escritura de ventas sin un diseño separado de integridad y Rules. `daily_stats` no es una fuente Spark fiable por defecto.
- No prometer que 20 negocios caben en 50.000 lecturas/día si las exportaciones mensuales completas pueden consumir 120.000 lecturas de ventas por sí solas.
- Un 403, resultado incompleto, límite excedido o conflicto histórico debe bloquear la certificación del PDF/Excel, no convertir el dato faltante en cero.

## Misión E: pruebas y reporte

Crea/registra pruebas:

- `cash-expiry` con emulador Rules y transacciones (límite, idempotencia, roles, sedes, concurrencia, nueva caja).
- `cashAuditRows`: apertura S/100, expiración 5 días, caja nueva S/50 + venta S/20 y cierre.
- PDF impresión (Chrome local): render A4, mínimo 2 escenarios con 1/2 sedes, sin scripts ni fugas de datos; verificar texto/totales y saltos de página.
- Excel: reimportar XLSX, hojas por sede sin duplicados, comparación con PDF/ReportModel.
- Coste: instrumentación en pruebas con datos sintéticos, documentar lecturas estimadas y operaciones reales del SDK emulado.
- Suites existentes de Spark, Rules, P13, Excel export, P09/P10-06, lint, build/PWA sin rebajar controles.

Entrega `docs/PLAN-14-RESULTADOS-CAJA-INFORMES.md` con **PASS/FAIL/BLOCKED/MANUAL**, archivos, pruebas, escenarios, lecturas/tiempo, límites y lista precisa de Rules que el propietario deberá publicar **manualmente** tras validar todo.

## Prohibiciones absolutas

- No ejecutar Git/GitHub (`git status`, `git diff`, `gh`), APIs/conectores, push, commit, branches, merges.
- No ejecutar despliegues, publicar Rules, índices o Hosting; no leer ni escribir Firebase de producción.
- No instalar dependencias, Java, navegadores, generadores PDF, PDFMake ni Cloud Functions.
- No modificar fórmulas de dinero, anulaciones, inventario o pedidos para conseguir un PASS.
- No registrar el efectivo contado si el operador no lo declaró; no suponer que expiración equivale a conciliación.
- No declarar listo para vender si queda un fallo financiero relevante o la transacción de recuperación no supera Rules.

## Entrega final de Codex

1. Diagnóstico del candado viejo y definición inequívoca del timeout.
2. Flujo implementado o bloqueo técnico justificado, incluyendo transacción/Rules locales.
3. UI y exportación de caja aclaradas con casos reales.
4. Informe gerencial imprimible y Excel detallado preservado.
5. Pruebas de seguridad, montos, PDFs y costes de Firestore.
6. Riesgos comerciales restantes y veredicto de piloto; no de lanzamiento masivo.

Empieza por **Misión A**, validando Rules en el emulador antes de avanzar a la Misión C.
