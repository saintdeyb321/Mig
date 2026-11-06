# MIGAPOS — PROMPT DE INICIO P12-08

Actúa como arquitecto frontend senior especializado en React 19, Tailwind CSS 4, UX para sistemas POS, dashboards operativos y formularios transaccionales.

Vamos a ejecutar la iteración **P12-08 — Corrección UX de Contratos, Reportes y flujo de anulación**.

Lee y aplica íntegramente:
- `docs/PLAN-12-P12-08-CONTRATOS-REPORTES-ANULACION-UX.md`
- este archivo `docs/PROMPT-CODEX-INICIO-P12-08.md`

## Objetivo
Debes corregir los problemas visuales y de flujo todavía presentes en:
- el formulario de contratos,
- el bloque “Finanzas y cobro”,
- el bloque de logística y detalles,
- el límite de imágenes por contrato,
- el modal intermedio de comprobación de anulación,
- y el dashboard de reportes, especialmente el resumen de pedidos.

## Instrucciones de ejecución
Implementa todas las fases **P12-08-A** hasta **P12-08-F**.

---

## Tarea 1 — Contratos: rehacer “Finanzas y cobro”
Corrige el diseño de la sección financiera para que se aproxime al formato objetivo del antiguo MigaPOS:

- superficie verde menta clara,
- inputs bien alineados,
- bloque central protagonista para el total,
- bloque de 1ra cuota y método de pago claramente separado,
- franja inferior para el saldo pendiente o estado financiero,
- composición limpia, elegante y fácil de escanear.

No dejes la versión actual seca ni plana.

Debes trabajar especialmente sobre:
- `frontend/src/modules/contracts/components/ContractFinanceFields.jsx`
- y lo que haga falta en el modal/formulario para que el bloque respire mejor.

---

## Tarea 2 — Contratos: logística y detalles
Revisa:
- `frontend/src/modules/contracts/components/ContractFormModal.jsx`
- y cualquier componente visual reutilizado.

Debes:
- mejorar el encabezado interno de “Logística de entrega”,
- mejorar “Detalles del pedido”,
- dejar la sección de fotos más viva, agradable y clara,
- usar superficies suaves y separación visual intuitiva,
- mantener un ligero difuminado o degradado muy sutil si ayuda a separar bloques,
- conservar excelente legibilidad.

La sensación general debe ser más atractiva y menos fría.

---

## Tarea 3 — Restaurar máximo 4 imágenes por contrato
Esto es obligatorio.

Ahora la UI muestra un máximo incorrecto alto. Debes:
- restaurar el máximo real a **4 imágenes**,
- corregir el contador visual,
- corregir el texto de ayuda,
- corregir cualquier validación relacionada,
- corregir cualquier mensaje que mencione 20.

No deben quedar rastros del límite anterior.

---

## Tarea 4 — Auditar y simplificar el flujo de anulación
Hay un modal intermedio tipo “Comprobar anulación” que aparece después de intentar anular.

Tu trabajo es:
1. analizar si existe por un motivo técnico real,
2. si solo contamina la UX, eliminarlo del flujo visible,
3. dejar que el modal principal de anulación permanezca en carga/procesamiento hasta resolver la acción,
4. cerrar el modal al terminar y refrescar la UI,
5. conservar internamente cualquier protección de idempotencia o seguridad si fuese necesaria.

**Importante:**
- no rompas la lógica financiera,
- no dupliques anulaciones,
- no alteres inventario, caja ni persistencia.

Solo simplifica la experiencia del usuario.

---

## Tarea 5 — Reportes: tarjetas con más vida visual
Mejora el dashboard de reportes.

Debes:
- añadir hover sutil,
- mejorar foco o active state si aplica,
- realzar suavemente el color propio de cada tarjeta,
- usar sombras ligeras y bordes más agradables,
- mantener buena performance y sobriedad.

No vuelvas el dashboard recargado.

---

## Tarea 6 — Reportes: convertir pedidos en una visualización más gráfica
El resumen de pedidos actual mediante mini tarjetas puede mejorar.

Debes crear una representación más didáctica de los estados de contratos/pedidos del período:
- pendientes,
- entregados,
- cancelados,
- con saldo.

Prefiere una visualización gráfica simple y clara:
- barras,
- columnas,
- dona,
- o una variante equivalente ya compatible con la arquitectura actual.

Debe ayudar al dueño a entender mejor el estado del negocio de un vistazo.

No cambies el origen de datos ni los cálculos.

---

## Restricciones absolutas
1. **No usar comandos Git/GitHub bajo ninguna circunstancia.**
   - Prohibido `git`, `gh`, APIs de GitHub, conectores, push, pull, status, diff, commit, branch, etc.
   - El dueño hará todo eso manualmente.

2. **No ejecutar pruebas ni verificaciones pesadas en esta iteración.**
   - No lint.
   - No build.
   - No tests.
   - No Chromium.
   - No Spark.
   - No deploy.

3. **No modificar lógica de negocio crítica.**
   - No tocar cálculos financieros.
   - No tocar persistencia.
   - No tocar Firebase/Firestore/Rules.
   - No tocar autenticación ni permisos.
   - No alterar el dominio de caja, ventas o pagos, salvo el flujo visible del modal innecesario.

4. **No instalar nuevas dependencias.**
   - Usa lo ya existente en el repositorio.

5. **Mantén la identidad Galaxy Nebula.**
   - Navegación morado profundo.
   - Superficies internas crema / claras / pastel.
   - Acentos morado, azul y verde.

---

## Entrega final esperada
Cuando termines, responde únicamente con:

1. lista breve de archivos modificados,
2. resumen de cada mejora aplicada,
3. causa encontrada del modal “Comprobar anulación” y decisión tomada,
4. confirmación de que el máximo quedó en 4 imágenes,
5. explicación de cómo quedó el bloque de pedidos en reportes,
6. confirmación explícita de que **no ejecutaste Git/GitHub, pruebas ni despliegues**.

No declares nada como producción lista.

Comienza ahora con la implementación completa de **P12-08**.
