# PROMPT DE INICIO — MIGAPOS P12-06

Eres un arquitecto frontend senior en React 19, Tailwind CSS 4, Radix UI y UX para puntos de venta.

El resultado visual de PLAN 12 todavía **NO está aprobado**. Debes corregir la interfaz local sin inventar un diseño distinto al especificado. El propietario publicó referencias antiguas; **no recibirás imágenes**: las instrucciones completas están aquí:

`docs/PLAN-12-P12-06-HISTORIAL-POS-ANULACIONES-UX.md`

**Lee íntegramente ese plan y ejecuta P12-06-A a P12-06-F ahora.** Consulta la skill UI/UX Pro Max *ya instalada* solo si ayuda a aplicar buenas prácticas; no instales ni descargues nada. El plan y las decisiones explícitas del propietario prevalecen sobre recomendaciones genéricas de skills.

## Cambios concretos

1. **Historial de ventas:** recupera tarjetas simétricas, compactas, claras y legibles. Franja **verde para efectivo**, **violeta para Yape/Plin** y **azul para mixto**. Fecha izquierda, monto destacado derecha, nombre de sucursal sin ID, filas de productos y subtotal, cajero y botón pequeño de anulación en el pie. Desglose mixto en dos segmentos verdes/violetas. No mostrar el `saleId`, UUID, `userId`, ni panel «Ver detalle del registro» con información técnica. Conservar todos los IDs y datos internamente para operaciones y trazabilidad. No perder acceso a más de 3–4 productos: usar un detalle accesible que no deforme el grid.
2. **Tarjetas anuladas:** usar **rojo** para franja/estado, badge «VENTA ANULADA» y sello diagonal decorativo «ANULADA» de baja opacidad sin ocultar contenido. Fecha y total se mantienen legibles. Mostrar motivo de forma breve y permitir ver motivo completo sin agrandar la tarjeta. No volver a ofrecer anulación. Mantener diferenciados borrador, rechazo, incertidumbre y verificación pendiente.
3. **Modal de anulación:** reutilizar el Dialog existente. Diseño **compacto y blanco con franja superior roja**, icono de advertencia, título «¿Anular esta venta?», explicación corta y exacta, textarea etiquetado y obligatorio. **Dos botones simétricos:** «Cancelar» y «Sí, anular venta» rojo. Conserva los handlers, validaciones, estado busy y foco. Nunca afirmar que una compensación contable acredita la devolución física de dinero. En modo verificar anulación, no repetir la operación.
4. **Carrito POS:** botones Efectivo verde, Yape/Plin violeta y Mixto azul; seleccionados y no seleccionados distinguibles, foco visible, layout equilibrado y responsive. No cambiar el pago ni los cálculos, solo presentación. Respetar scroll de artículos, total y cobro visibles.
5. **Fondo general:** eliminar el aspecto gris plomo. Ajustar tokens `canvas`, `panel`, `subtle` hacia **crema pastel luminoso** y tarjetas casi blancas, con contraste legible y sidebar Galaxy Nebula morado profundo conservado.

## Restricciones inviolables

- **No ejecutar Git ni GitHub**: tampoco `git status`, `git diff`, `gh`, APIs o conectores; no crear ramas, commits, push, merge ni deploy.
- **No ejecutar pruebas, lint, build, Chromium, emuladores, validaciones largas o scripts release**. El propietario se encargará de probar y publicar.
- No instalar dependencias, no descargar skills ni generar capturas automatizadas.
- No modificar lógica financiera, permisos, consultas Firestore, caché, IndexedDB, Rules, Functions, stock, anulaciones, recibos, contratos, autenticación o estados offline.
- No suprimir motivos ni avisos de incertidumbre. Oculta los identificadores técnicos **solo en la presentación**; nunca los borres de datos, funciones o auditoría.
- No refactorices módulos ajenos ni hagas cambios globales innecesarios.

## Forma de trabajo

Inspecciona únicamente los componentes de historial, modal de anulación, controles de pago POS y tokens pertinentes; modifica los archivos locales directamente. Reutiliza componentes compartidos y clases Tailwind **estáticas**. No reescribas módulos enteros si basta un ajuste. Optimiza tokens: sin largos reportes, sin volcar archivos, sin narrar cada paso.

**Entrega solo:** archivos modificados, cinco mejoras principales, restricciones respetadas y aspectos pendientes de aceptación visual. Declara expresamente que no ejecutaste Git/GitHub, pruebas, build ni deploy.

**Comienza inmediatamente P12-06 y termina la implementación de todos sus puntos.**
