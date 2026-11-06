# MIGAPOS — PROMPT DE INICIO P12-09

Actúa como arquitecto frontend senior especializado en React 19, Tailwind CSS 4, UX de sistemas POS, interfaces operativas y refinamiento visual de dashboards y formularios.

Vamos a ejecutar la iteración **P12-09 — Refinamiento visual de POS (carrito) y Contratos**.

Lee y aplica íntegramente:
- `docs/PLAN-12-P12-09-POS-CARRITO-CONTRATOS-VISUAL.md`
- este archivo `docs/PROMPT-CODEX-INICIO-P12-09.md`

## Objetivo
Corregir el diseño del carrito POS y del módulo de Contratos para acercarlos al nivel visual del antiguo MigaPOS.

Necesitamos:
- un carrito mejor distribuido,
- un bloque de cobro más claro y elegante,
- una pantalla de venta registrada más refinada,
- y contratos con tarjetas y secciones separadas por superficies suaves / difuminadas.

---

## Tarea 1 — Rehacer distribución del carrito POS
Debes revisar y mejorar el layout del carrito/ticket para que se parezca más a la lógica visual del antiguo MigaPOS.

Mejora:
- cabecera del ticket,
- badge de conteo,
- lista de productos,
- alineación entre nombre, precio unitario, cantidad y acción de quitar,
- separación entre bloques,
- densidad visual general.

La meta no es copiar literalmente, sino imitar la buena distribución del diseño de referencia.

---

## Tarea 2 — Refinar bloque de cobro
Debes mejorar:
- total a cobrar,
- selector de método de pago,
- monto recibido,
- bloque de vuelto,
- botón cobrar.

Requisitos:
- Efectivo, Yape/Plin y Mixto deben verse equilibrados.
- El estado seleccionado debe ser más intuitivo.
- El total debe ser protagonista.
- El vuelto debe verse como un bloque útil y amable.
- Todo debe tener mejor aire, mejor jerarquía y menos apariencia seca.

---

## Tarea 3 — Refinar venta exitosa / ticket registrado
La pantalla o modal de venta exitosa debe lucir más profesional.

Debes mejorar:
- iconografía,
- jerarquía de estado,
- total confirmado,
- bloque de vuelto,
- botones “Imprimir ticket” y “Nueva operación / Nueva venta”.

Debe acercarse más al espíritu del antiguo MigaPOS.

---

## Tarea 4 — Aplicar superficies diferenciadas en Contratos
El módulo de contratos sigue viéndose demasiado blanco y plano.

Debes:
- aplicar superficies suaves / pastel / difuminadas para separar secciones,
- dar identidad visual a bloques internos,
- conservar legibilidad excelente,
- evitar una interfaz seca o sin alma.

No uses gradientes exagerados. El difuminado debe ser sutil, elegante y funcional.

---

## Tarea 5 — Mejorar tarjetas/listado de pedidos en Contratos
Debes revisar las tarjetas del listado de contratos/pedidos.

Mejora:
- estado,
- total,
- abonado,
- panel financiero,
- fecha de entrega,
- CTA principal,
- distribución de acciones secundarias.

Usa paneles internos suaves para que el cerebro distinga mejor cada zona.

La tarjeta debe verse más atractiva, viva y profesional.

---

## Tarea 6 — Ajuste fino de consistencia visual
Al finalizar, revisa coherencia visual de:
- badges,
- bordes,
- hover,
- sombras,
- espaciados,
- jerarquía interna.

Debes mantener la identidad Galaxy Nebula:
- navegación morado profundo,
- superficies crema / blancas cálidas,
- acentos verde menta, violeta y azul.

---

## Restricciones absolutas
1. **No usar comandos Git/GitHub bajo ninguna circunstancia.**
   - Prohibido `git`, `gh`, APIs de GitHub, conectores, push, pull, status, diff, commit, branch, etc.

2. **No ejecutar pruebas ni verificaciones pesadas.**
   - No lint.
   - No build.
   - No tests.
   - No Chromium.
   - No emuladores.
   - No deploy.

3. **No modificar lógica de negocio.**
   - No tocar ventas, caja, contratos, inventario, pagos, Firebase, Firestore, permisos, persistencia o autenticación.
   - Solo corregir UI, layout y presentación visual.

4. **No instalar nuevas dependencias.**
   - Usa solo la arquitectura ya existente.

---

## Entrega final esperada
Cuando termines, responde únicamente con:

1. lista breve de archivos modificados,
2. resumen de cómo mejoraste el carrito POS,
3. resumen de cómo mejoraste el bloque de cobro,
4. resumen de cómo mejoraste la pantalla de venta exitosa,
5. resumen de cómo aplicaste difuminados/superficies en contratos,
6. confirmación explícita de que **no ejecutaste Git/GitHub, pruebas ni despliegues**.

No declares la app lista para producción.

Comienza ahora con la implementación completa de **P12-09**.
