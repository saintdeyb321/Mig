# PROMPT OPERATIVO · MIGAPOS P12-07

Actúa como arquitecto frontend senior experto en React 19, Tailwind 4, Radix UI, interfaces POS, accesibilidad y UX financiera.

## Orden de inicio

1. Lee íntegro `docs/PLAN-12-P12-07-UX-OPERATIVA-CAJA-NOTIFICACIONES-CONTRATOS.md`.
2. Analiza **solo** los archivos locales relacionados con el alcance (las capturas del propietario son referencia conceptual; no requieren que te enviemos nuevas imágenes).
3. Implementa P12-07-A a P12-07-F en el código local. **No te detengas en recomendaciones**.
4. No reinstales UI/UX Pro Max ni agregues dependencias. La especificación escrita manda sobre las sugerencias de la skill.

## Prioridades estrictas

### P1 — Bug real de apertura de caja

El propietario informa que, después de abrir caja, el modal no desaparece. Rastrea el cierre del modal, `openRegister`, el cambio de `currentSession`, el estado `showOpenModal` y la `key` del componente en POS; comprueba también la apertura iniciada desde Contratos. Corrige solamente el ciclo de estado/visibilidad si esa es la causa. No cierres anticipadamente: debe cerrarse **después de confirmación real**. No tolerar doble ejecución, falsos éxitos ni acciones huérfanas tras cambio de sucursal. Si requiere tocar lógica transaccional, reporta bloqueo en vez de alterarla.

### P2 — Colores del carrito

Efectivo: verde menta; Yape/Plin: violeta luminoso; Mixto: azul claro. Igual ancho y altura, jerarquía visual obvia; seleccionado claramente distinguible. Mantén el scroll interno del ticket y el total/botón Cobrar accesibles.

### P3 — Historial limpio, simétrico y con montos abajo

Cabecera: fecha, sede, estado. Productos en una sección legible. Al final del contenido, **bloque financiero con borde y fondo semántico** (verde/efectivo, violeta/Yape, azul/mixto) con total destacado y desglose para mixto. Footer: cajero y acción. Elimina UUID/UID de la vista principal; detalles técnicos solo bajo divulgación colapsada si son necesarios. Anuladas rojas, con motivo breve, sello legible y sin apariencia de ingreso vigente. Conserva pendientes, borradores y funciones de anulación.

### P4 — Notificaciones útiles

Card roja para anulación y sobrante por revisar, ámbar para faltante o descuadre provisional, verde para cierre coincidente y lavanda/azul para información general. Aplica color de forma fiable desde metadata/estado estructurado, no desde coincidencias frágiles de texto. Presenta monto, sede, responsable, fecha y motivo por secciones. Mantén marcada como leída y advertencias de compensación. No mostrar UUID en la superficie principal.

### P5 — Cuadre de caja entendible

Diferencia visual entre referencia calculada, dinero contado, resultado, detalle y observaciones. Resultado con color y palabra explícitos. «Ver detalle del cuadre» revela agrupaciones financieras sin alterar cifras ni reglas. Footer visible y simétrico; foco y scroll funcionales.

### P6 — Contratos ordenados

Cuatro secciones del formulario con acentos suaves distintos: cliente lavanda, entrega azul, detalles índigo/neutro y finanzas menta. Total resaltado, deuda visible, inputs legibles y botones finales centrados y equilibrados. El scroll queda en el cuerpo, no en el footer. No cambiar validaciones, fotos, montos ni comportamiento de pagos.

## REGLAS NO NEGOCIABLES

- **PROHIBIDO cualquier uso de Git y GitHub**, incluso de lectura: no `git`, no `gh`, no API o conectores GitHub, sin ramas, commits, push, merge o deploy.
- **No ejecutar pruebas, lint, build, Chromium, emuladores ni scripts de release.** El propietario realizará la aceptación manual y validaciones en otra etapa.
- No instalar skills ni dependencias. No generar imágenes ni capturas automatizadas.
- No modificar reglas, índices, servicios Firebase, transacciones, idempotencia, recibos, dominios financieros, autenticación, permisos, IndexedDB o caché.
- No introducir lectores/consultas/listeners extra de Firestore.
- Respetar estados ocupados, foco, semántica ARIA y prevención de dobles cobros.
- No rediseñar otros módulos ni borrar componentes existentes por simplificación estética.
- La rama de trabajo ya está preparada por el propietario en su PC. **No comprobarla**.

## Resultado esperado

Entrega cambios reales y limpios con un resumen final de máximo 15 líneas: archivos modificados, diagnóstico y solución del modal, mejoras por módulo, pendientes de revisión manual y confirmación de ninguna operación Git/GitHub, pruebas o despliegue. No declares la app lista para producción por una refactorización visual.

**Comienza P12-07 ahora.**
