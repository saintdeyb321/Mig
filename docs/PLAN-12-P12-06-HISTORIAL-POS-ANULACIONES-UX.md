# MIGAPOS — PLAN 12 / P12-06
## Corrección visual estricta: historial de ventas, carrito POS y anulación

**Fecha:** 2026-11-05  
**Estado:** Pendiente de implementación y aceptación visual del propietario  
**Alcance:** Presentación React/Tailwind; sin cambios de lógica financiera, permisos, consultas, persistencia ni operaciones remotas.

## 0. Contexto y objetivo

La implementación P12-00…P12-05 no alcanzó la calidad visual requerida. Las capturas aportadas por el propietario tienen prioridad frente a soluciones inventadas por Codex. No se proporcionarán imágenes a Codex: este documento traduce la referencia visual a instrucciones comprobables.

**Objetivo:** recuperar la legibilidad, densidad, limpieza y simetría de las tarjetas clásicas de MigaPOS, incorporando la identidad Galaxy Nebula sin fondos grises opacos, información técnica expuesta ni modales desproporcionados. Las operaciones actuales no se reemplazan.

### Problemas visibles confirmados en las capturas

1. Historial actual: contenido suelto y amontonado; fecha, estado, forma de pago, sucursal e importe no tienen una jerarquía clara. Las tarjetas crecen desigualmente por bloques técnicos y motivos largos.
2. Los IDs completos de ticket y de responsable contaminan la vista. Debe mostrarse **solo el nombre de la sede**, p. ej. «Sede secundaria», no el documento ni UUID; tampoco es útil mostrar IDs de usuario.
3. Tarjetas anuladas: se perciben como tarjetas normales con un párrafo extenso. Deben indicar inequívocamente la anulación, sin confundir compensación contable con devolución real de efectivo.
4. Modal de anulación: actual excesivamente ancho, cabecera oscura y botones asimétricos; la operación destructiva requiere semántica roja, legibilidad y foco evidente.
5. El POS no colorea de forma coherente las opciones Efectivo/Yape–Plin/Mixto.
6. Fondo general demasiado plomizo/gris. Se pide crema pastel **claro**, de poco croma y buen contraste, no una capa gris-violeta opaca.

## 1. Límites arquitectónicos (obligatorios)

### Se permite modificar

- `frontend/src/modules/sales-history/SaleHistoryCard.jsx`
- `frontend/src/modules/SalesHistory.jsx` **solo** composición/diálogo/presentación, sin cambios de hooks ni handlers financieros.
- Componentes puramente visuales del selector de pago POS —buscar el componente real, previsiblemente `frontend/src/modules/pos/PaymentParts.jsx` y su consumidor en `POS.jsx`; cambiar clases y estructura, no comportamientos.
- `frontend/src/shared/styles/theme.css` y `frontend/src/index.css` **solo** tokens de presentación y estilos acotados.
- Primitivas visuales compartidas **solo si es imprescindible**, garantizando que no cambien otros módulos por accidente.

### Se prohíbe modificar

- Repositorios Firestore, Rules, índices, Functions, Firebase Hosting, autenticación, permisos, sesiones, límites Spark.
- Lógica de cobro, pago mixto, validaciones, confirmación, stock, anulación, restitución de inventario, compensaciones, recibos, contabilidad, estados offline o reconciliación.
- Los datos almacenados `saleId`, `userId`, `branchId` y las trazas: **se ocultan en la tarjeta, jamás se eliminan del modelo o la operación**.
- Hooks y dominios financieros; queries, caché, observadores, configuración y dependencias.
- Git, GitHub, `gh`, API/conectores GitHub, ramas, commits, pull, push, deploy.
- Pruebas, lint, build, Chromium, emuladores, scripts release, capturas automatizadas. La aceptación manual y validaciones las hace el propietario después.

## 2. Sistema visual preciso

### 2.1 Tonos y roles (referencia, ajustar con tokens existentes)

| Rol | Color orientativo | Aplicación |
| --- | --- | --- |
| Fondo aplicación crema | `#FCFAF7` o `#FBF9F5` | Canvas principal; nunca gris plomo |
| Superficie de tarjeta | `#FFFFFF` o `#FFFEFC` | Cards y modal, muy legible |
| Superficie secundaria | `#F8F7FB` | Resumen/detalle sin grandes paneles grises |
| Texto principal | `#181B34` | Encabezados, montos, acciones |
| Texto secundario | `#5B6478` | Metadatos, explicaciones cortas |
| Línea sutil | `#E8E3EC` | Divisores accesibles |
| Efectivo verde | `#118560` | Franja/tipo pago positivo |
| Yape / Plin violeta | `#7840CB` | Franja/tipo pago digital |
| Mixto azul | `#2E65D8` | Franja/tipo pago mixto |
| Anulación rojo | `#D63D4A` | Semántica destructiva y anulación |
| Galaxy Nebula | índigo/violeta oscuro actual | Solo marca/sidebar; no usar como cabecera de modal destructivo |

Conservar escalas coherentes en Tailwind 4 y mapear clases **estáticas**, no concatenar utilidades dinámicas que Tailwind podría no detectar. No hacer gradientes intensos en las tarjetas. El color es señal funcional; no debe sustituir etiquetas de texto o iconografía. Verificar contraste por inspección de tokens y evitar texto pálido.

### 2.2 Criterios de densidad

- Tarjetas de 3 columnas en escritorio amplio, 2 en intermedio, 1 en móvil, sin overflow horizontal.
- El importe es el elemento visual dominante en la esquina superior derecha, fecha arriba a la izquierda.
- Cabecera compacta y uniforme; cuerpo con encabezado «Detalle del ticket» y renglones de cantidad, nombre y subtotal; pie fijo visualmente al fondo con nombre de cajero a la izquierda y acción a la derecha.
- Para listas extensas: 3–4 filas visibles según tamaño y acción «Ver más productos» en un **diálogo accesible** o contenedor interno limitado; nunca alargar una sola tarjeta hasta romper la rejilla. No truncar importes ni perder acceso a los ítems restantes.
- Razones de anulación: resumen de máximo dos líneas, y posibilidad de leer el texto íntegro mediante una interacción accesible que **no expanda la tarjeta del grid**. Si no existe razón, no inventar una.
- Las cards de la misma fila deben conservar altura visual alineada; evitar grandes espacios inferiores forzados por un ticket de varios ítems. `flex-col`, cuerpo flexible y `mt-auto` en footer donde convenga; no forzar alturas ridículas en móvil.

## 3. Historial: tarjeta comercial y estados

### 3.1 Tarjeta confirmada

**Cabecera:** fecha/hora humanizadas; importe `S/ xx.xx` arriba a la derecha; bajo fecha, nombre de sede (sin ID); badges de método de pago y estado solo si agregan significado, sin redundancias. Franja superior de **4 px** con color del **método de pago**:

- `efectivo` → verde.
- `yape`, `plin` → violeta.
- `mixto` → azul.
- método desconocido → neutro con etiqueta «Pago por revisar», sin atribuir cobranzas.

**Cuerpo:** encabezado breve y filas compactas; cantidades y subtotales alineados; detalle de método mixto en una banda dividida en dos segmentos diferenciados (efectivo verde, digital violeta), solo si `splitPayments` existe y es válido. Nunca recalcular ni alterar importes; formatear solamente.

**Pie:** avatar/icono discreto + `cashierName` humanizado o «Cajero no informado»; botón pequeño «Anular ticket» a la derecha solo si la lógica vigente ya autoriza la operación. No poner full-width destructivo ni cambiar disabled/loading.

### 3.2 IDs técnicos y metadatos

- Quitar de la **interfaz visible de tarjeta** el `saleId` completo, UUID y `userId`/«Responsable (ID)»; suprimir «Ver detalle del registro» si únicamente exponía esos metadatos.
- Mostrar **nombre de sede** obtenido de `businessBranches`, nunca `branchId` ni una cadena UUID por defecto. Si no se pudo resolver, mostrar «Sucursal no disponible» sin inventar nombre.
- Conservar IDs en `aria-label` si es útil para herramientas de soporte, y siempre en las propiedades internas, confirmación, consultas, trazabilidad y anulaciones. No registrar ni copiar identificadores gratuitamente al portapapeles.
- Mantener estado `draft_offline`, `rejected`, `uncertain`, `voidCheckPending` con semántica diferenciada. No convertir estados inciertos en venta cobrada.

### 3.3 Tarjeta anulada

**Prioridad visual del estado:** anulación real confirmada > método de pago. Borde/franja roja, chip rojo «VENTA ANULADA» y tratamiento visual más tenue del importe/productos sin anular legibilidad. Agregar una **marca diagonal decorativa «ANULADA»** sobria, dentro del cuerpo, que no invada fecha, importe, botones, lectores de pantalla ni renglones; `aria-hidden`, `pointer-events-none`, baja opacidad y `prefers-reduced-motion` sin animaciones.

- Mostrar el **motivo de anulación**, no un párrafo técnico repetitivo. Si es largo, resumen de 1–2 líneas y acción «Ver motivo» en diálogo accesible; no deformar altura.
- La compensación contable no prueba un reembolso físico: conservar la precisión necesaria en un texto secundario breve o ayuda contextual, sin afirmar que efectivamente salió dinero de la caja.
- El método de pago original permanece identificable por badge si corresponde, pero la franja roja prevalece para la anulación. Una venta anulada no muestra acción de anular nuevamente.
- No confundir anulación pendiente, verificación pendiente y anulación confirmada.

## 4. Modal de anulación: compacto, rojo, simétrico

- Reutilizar el `Dialog` Radix existente; **no** inventar modal casero ni quitar portal, overlay, trap de foco o Escape permitido.
- Tamaño de escritorio: `max-w-md` o alrededor de 440–500 px. Anchura móvil: viewport menos márgenes seguros; altura adaptable y scroll interno solo si el contenido realmente no cabe.
- Cabecera **blanca** con un acento/franja roja de 4–6 px arriba; icono de advertencia rojo/ámbar y título «¿Anular esta venta?» claro. Evitar cabecera completamente morada.
- Texto breve y exacto: «Se anulará la venta de S/ XX.XX y se restituirá el stock. El registro quedará marcado como anulado. La devolución física del dinero se revisa por separado». Solo mencionar efectos coherentes con el flujo vigente; **no** decir que dinero físico ya fue restado de caja.
- Campo `Motivo de anulación` etiquetado como obligatorio; mantener validación vigente (mínimo 5 caracteres, si aplica), `value`, handlers, error y disabled. Placeholder humano «Ej.: cliente desistió, error de cobro…».
- Botones **simétricos** de igual alto y ancho en escritorio: `Cancelar` (secundario) y `Sí, anular venta` (rojo). En móvil se pueden apilar si no caben, con tamaños consistentes; conservar busy/loading/foco.
- No mostrar identificadores técnicos en el modal. Si es fase de **verificar anulación ya intentada**, mantener mensajes y botones distintos; no invocar otra vez la operación.
- Mostrar separación clara entre cabecera, descripción, formulario y acciones; no crear bloques anidados innecesarios.

## 5. POS: selector de medios de pago

- Efectivo: botón verde; Yape/Plin: violeta; Mixto: azul. Estados seleccionados con relleno/tinte + borde definido; no seleccionados con borde neutro y **señal sutil del color de método**; deshabilitados mantienen contraste y semántica `disabled`.
- Tres acciones visualmente equilibradas en una fila cuando el ancho lo permita; en tamaños menores adaptar sin que el método se corte ni empuje el botón de cobro.
- Mantener `aria-pressed`/estado seleccionado, keyboard focus, callbacks, validaciones, importe, desglose, stock y estado de caja.
- Carrito: mantener lista con scroll interno independiente, total y CTA siempre accesibles. No introducir avisos técnicos permanentes ni aumentar espacios vacíos.
- Usar el mismo mapeo de colores de Historial para coherencia: efectivo verde, digital violeta, mixto azul. No pintar todo el carrito del método elegido.

## 6. Fondo y consistencia

- `--color-canvas`: tono crema pastel claro orientativo (`#FCFAF7`), contrastado con cards casi blancas.
- `--color-panel`: blanco o blanco cálido; `--color-subtle`: claro neutro con toque lila mínimo, **no** gris plomo.
- Limitar cambios a tokens existentes y estilos específicos; verificar mentalmente que sidebar morado, alertas y textos no pierdan semántica.
- No introducir bordes gruesos en todas las tarjetas ni sombras grandes. Evitar fondo homogéneo gris en toda la pantalla.

## 7. Secuencia de ejecución de Codex (sin comandos)

**P12-06-A** — Leer solo componentes implicados y skill ya instalada; identificar clases y handlers.  
**P12-06-B** — Ajustar tokens del fondo y mapear color por método.  
**P12-06-C** — Refactorizar tarjeta de historial, razón, nulos, estado mixto y anulada.  
**P12-06-D** — Refactorizar modal rojo, compacto y simétrico conservando callbacks y validación.  
**P12-06-E** — Ajustar selector de pago en el POS; alturas y accesibilidad.  
**P12-06-F** — Inspeccionar el código modificado sin ejecutar comandos de comprobación; entregar resumen y checklist de aceptación manual.

## 8. Aceptación manual del propietario (no ejecutar automáticamente)

1. Historial: tres tickets confirmados (efectivo, Yape/Plin, mixto) muestran franjas verde, violeta y azul, respectivamente.
2. Cada tarjeta muestra fecha, importe, sede como **nombre**, productos, cajero y acción pertinente; **no aparecen IDs ni UUID visibles**.
3. Tarjetas del mismo renglón se ven proporcionadas con 1, 4 y 8 ítems; se puede abrir detalle sin agrandar arbitrariamente una tarjeta del grid.
4. Mixto muestra suma de sus dos métodos sin alterarla ni afirmar que es otro tipo de pago.
5. Venta anulada: borde rojo y marca diagonal sobria «ANULADA», motivo visible/accesible, no permite volver a anular.
6. Venta pendiente, incierta y rechazada conservan avisos precisos y botones de verificación/revisión; no se disfrazan como venta confirmada.
7. Modal de anulación: ancho compacto, borde rojo, campo obligatorio y botones simétricos; no permite confirmar motivo insuficiente.
8. Modal con teclado funciona; enfoca el campo y devuelve foco al cerrar; scroll accesible en móvil.
9. POS muestra métodos verde/violeta/azul; cambiar entre ellos no modifica montos por sí solo ni tapa el CTA.
10. El fondo general es crema luminoso y cards claras; no aparecen gris plomo o texto pastel ilegible.
11. En pantallas pequeñas no hay overflow horizontal ni botones inaccesibles; se preservan los estados ocupados.
12. No hay cambios en Firestore, dominio, caché, Rules, hooks de operación ni API; no se han ejecutado Git/pruebas/build/deploy.

## 9. Entrega esperada

Solo cambios locales de frontend visual. Resumen breve con archivos modificados, decisiones de UI, restricciones respetadas y puntos que requieran aceptación manual. **No afirmar que las pruebas están aprobadas, porque no se ejecutarán por instrucción del propietario.**
