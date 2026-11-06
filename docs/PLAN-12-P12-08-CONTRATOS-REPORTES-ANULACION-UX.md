# PLAN P12-08 — Corrección UX de Contratos, Reportes y flujo de anulación

## 1. Contexto

Luego de P12-07 todavía persisten problemas visuales y de flujo en varios módulos críticos. El objetivo de esta iteración es corregir **la presentación del bloque financiero de contratos**, **la carga visual del bloque de detalles**, **el límite de imágenes**, **el flujo de anulación que hoy muestra un modal intermedio innecesario** y **la expresividad visual de Reportes**, especialmente en el bloque de pedidos.

No se busca rehacer toda la app. Se busca una mejora puntual, coherente con la identidad **Galaxy Nebula** y con el estilo del antiguo MigaPOS: superficies claras, jerarquía evidente, separación visual por secciones y lectura rápida.

---

## 2. Problemas detectados

### 2.1 Contratos — sección “Finanzas y cobro”
Estado actual:
- El bloque financiero actual no replica la claridad del diseño objetivo.
- La composición se ve más “seca” y dispersa.
- El total, el saldo pendiente y las entradas no tienen la jerarquía deseada.
- El footer de acciones no termina de sentirse integrado visualmente.

Resultado esperado:
- Debe parecerse al patrón mostrado del antiguo MigaPOS:
  - superficie verde menta suave,
  - tres zonas claras: costos, resumen central del total y datos de cuota/método,
  - mensaje inferior de saldo pendiente en banda roja suave,
  - botones finales bien alineados, visualmente balanceados.

### 2.2 Contratos — detalle/logística
Estado actual:
- Las tarjetas de logística y detalles aún se sienten planas.
- Falta sensación de secciones vivas y diferenciadas.
- La zona de fotos todavía puede sentirse “seca” o demasiado básica.

Resultado esperado:
- Cada bloque debe tener un **encabezado interno con fondo suave**, ícono y numeración clara.
- Debe existir **separación intuitiva por color**:
  - logística: azul suave,
  - detalles: violeta/lila suave,
  - finanzas: verde menta suave.
- Puede usarse un **difuminado muy sutil** o degradado suave de superficie, siempre ligero y elegante.

### 2.3 Límite de imágenes por contrato
Estado actual:
- Se está mostrando o sugiriendo un máximo de 20 imágenes.

Resultado esperado:
- El máximo permitido debe volver a ser **4 imágenes por contrato**.
- Toda la UI, contadores, ayudas visuales y validaciones deben reflejar **4/4**.
- No debe quedar rastro del límite 20 en textos, etiquetas o ayudas.

### 2.4 Modal intermedio de “Comprobar anulación”
Estado actual:
- Tras intentar anular un ticket aparece un modal adicional (“Comprobar anulación”) que no aporta valor UX visible.
- Su existencia puede estar encubriendo o intentando manejar un caso de consistencia.

Resultado esperado:
- Antes de eliminarlo hay que **analizar su razón técnica**.
- Si solo existe para “revisar después” y no protege una operación crítica real para el usuario, debe eliminarse.
- El flujo deseado:
  1. usuario abre el modal principal de anulación,
  2. confirma la acción,
  3. el mismo modal entra en estado de procesamiento,
  4. cuando termina, se cierra y se actualiza el historial/notificaciones.
- Si hay una razón técnica legítima (idempotencia, reintento, verificación diferida), esa protección debe conservarse internamente sin obligar al usuario a ver un segundo modal innecesario.

### 2.5 Reportes — visual de tarjetas
Estado actual:
- El dashboard mejoró, pero aún puede sentirse plano.
- Las tarjetas KPI y secciones pueden ganar dinamismo.

Resultado esperado:
- Mejorar microinteracciones:
  - hover sutil,
  - realce al foco/selección,
  - sombras ligeras,
  - borde/acento más vivo.
- Sin exagerar animaciones ni volverlas pesadas.

### 2.6 Reportes — bloque de pedidos
Estado actual:
- Los cuatro estados de pedidos mostrados como mini tarjetas no son la representación más didáctica.

Resultado esperado:
- Sustituir o reformular el bloque de pedidos hacia una **visualización más gráfica y didáctica**.
- Propuesta preferida:
  - un gráfico simple que represente el estado de contratos/pedidos (pendientes, entregados, cancelados, con saldo),
  - puede ser barras, columnas o dona segmentada, siempre claro y fácil de leer.
- Debe ayudar al dueño a entender rápido la lógica operativa del período.
- No alterar los cálculos ni el origen de datos.

---

## 3. Objetivo de la iteración

Implementar una corrección visual y de flujo que deje:
- el formulario de contratos más elegante y parecido al objetivo visual,
- el límite de imágenes correcto en 4,
- el flujo de anulación más limpio,
- el dashboard de reportes más expresivo,
- y el bloque de pedidos presentado de forma más intuitiva.

---

## 4. Alcance funcional y visual

### 4.1 Contratos — formulario
Ajustar:
- `ContractFormModal.jsx`
- `ContractFinanceFields.jsx`
- primitivas visuales reutilizadas si hace falta (`SectionCard`, `DialogFooter`, etc.)

Cambios esperados:
1. **Finanzas y cobro**
   - Rehacer la composición del bloque para que se acerque al diseño de referencia:
     - columna izquierda: costo producto y costo delivery,
     - bloque central protagonista: total del pedido,
     - columna derecha: primera cuota y método de pago,
     - franja inferior: saldo pendiente / mensaje de estado.
   - Si el ancho no permite 3 columnas, debe degradar elegantemente sin romper jerarquía.

2. **Logística de entrega**
   - Encabezado interno más vivo.
   - Inputs alineados, más aire, más coherencia espacial.

3. **Detalles del pedido**
   - Mantener la descripción a la izquierda y fotos a la derecha cuando el ancho lo permita.
   - Tarjeta de fotos más atractiva, clara y consistente.
   - Mostrar contador correcto y ayuda compacta.

4. **Acciones finales**
   - Botones bien centrados y equilibrados.
   - El CTA principal debe dominar visualmente sin invadir.

### 4.2 Imágenes por contrato
- Restaurar `MAX_CONTRACT_IMAGES = 4` o el valor equivalente real del flujo.
- Revisar:
  - validación,
  - contador,
  - mensaje de ayuda,
  - grid de miniaturas,
  - lógica de carga.

### 4.3 Flujo de anulación
Revisar:
- modal principal de anulación,
- modal o estado secundario de “Comprobar anulación”,
- hooks/acciones de anulación y notificaciones posteriores.

Cambios esperados:
- eliminar el modal intermedio si es prescindible para la UX,
- dejar un solo flujo de anulación con estado de carga,
- proteger idempotencia y consistencia si corresponde, pero de forma interna.

### 4.4 Reportes
Revisar:
- `Reports.jsx`
- `ReportParts.jsx`
- cualquier componente auxiliar de KPIs o gráficos.

Cambios esperados:
1. **KPI principales**
   - hover/focus/active suaves,
   - mejor sensación de tarjeta viva,
   - resalte más claro del color de cada KPI.

2. **Bloque de pedidos**
   - convertir el resumen en visualización gráfica más didáctica.
   - Si ya existe un sistema de gráficos reutilizable, usarlo.
   - Si no existe, mantener una implementación sencilla y consistente.

---

## 5. Restricciones obligatorias

1. **No usar comandos Git/GitHub.**
   - Prohibido `git status`, `git diff`, `git add`, `git commit`, `git push`, `gh`, API GitHub o cualquier conector relacionado.
   - El propietario hará toda la gestión manual.

2. **No ejecutar pruebas ni validaciones pesadas en esta iteración.**
   - No correr lint.
   - No correr build.
   - No correr tests Node/Chromium/Spark.
   - No correr deploy.

3. **No cambiar lógica financiera ni persistencia.**
   - No alterar cálculos de contratos, saldo, caja, ventas, anulaciones, reportes ni Firestore.
   - Solo corregir presentación y, si aplica, el flujo visible del modal innecesario.

4. **No introducir dependencias nuevas.**
   - Trabajar con React/Tailwind/componentes ya existentes.

5. **Mantener la identidad Galaxy Nebula.**
   - Sidebar morado profundo.
   - Superficies internas claras, cálidas y suaves.
   - Acentos morados, azules y verdes pastel.

---

## 6. Fases P12-08

### P12-08-A — Rehacer “Finanzas y cobro” en Contratos
- Reestructurar la sección para que visualmente se acerque a la referencia aprobada.
- Dar protagonismo al total y dejar el saldo pendiente claramente separado.

### P12-08-B — Refinar logística y detalles del pedido
- Dar más alma visual a estas secciones.
- Mejorar ritmo espacial, cabeceras internas y composición.

### P12-08-C — Restaurar límite máximo de 4 imágenes
- Corregir textos, validaciones, contador y UI de carga.

### P12-08-D — Simplificar el flujo de anulación
- Auditar la razón del modal “Comprobar anulación”.
- Si no aporta al usuario, eliminarlo del flujo visible.
- Conservar internamente cualquier protección técnica necesaria.

### P12-08-E — Mejorar dinamismo de Reportes
- Añadir microinteracciones visuales sutiles a KPIs y paneles.

### P12-08-F — Rehacer visualización de pedidos en Reportes
- Reemplazar tarjetas simples por una representación más gráfica y pedagógica.

---

## 7. Criterios de aceptación

Se considerará correcta la iteración si:

1. **Contratos**
   - El bloque financiero recuerda claramente al diseño objetivo.
   - No se ve “seco”, disperso ni plano.
   - Los botones finales se ven balanceados.

2. **Imágenes**
   - El límite visible y real vuelve a ser 4.

3. **Anulación**
   - Ya no aparece un modal intermedio innecesario para el usuario, salvo que técnicamente sea imprescindible y quede plenamente justificado.
   - El flujo se siente lineal y limpio.

4. **Reportes**
   - Las tarjetas tienen más vida visual.
   - El bloque de pedidos se entiende mejor mediante un gráfico o representación más didáctica.

5. **Restricciones**
   - No se ejecutaron comandos Git/GitHub.
   - No se ejecutaron pruebas, build ni despliegues.
   - No se alteró la lógica financiera.

---

## 8. Entrega esperada de Codex

Al finalizar, Codex debe reportar en texto:
- archivos modificados,
- si encontró o no una razón técnica real para el modal “Comprobar anulación”,
- cómo se resolvió el flujo,
- cómo quedó el límite de imágenes,
- cómo se rediseñó el bloque de finanzas,
- cómo se transformó el bloque de pedidos en Reportes,
- confirmación explícita de que **no ejecutó Git/GitHub, pruebas ni despliegues**.
