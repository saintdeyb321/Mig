# PLAN P12-09 — Refinamiento visual de POS (carrito) y Contratos

## 1. Contexto

Luego de las iteraciones anteriores, todavía hay dos áreas que no transmiten la calidad visual del antiguo MigaPOS:

1. **El carrito / ticket del POS**
2. **Las tarjetas y secciones del módulo de Contratos**

El problema no es solo de color: también es de **jerarquía visual**, **espaciado**, **uso de superficies**, **agrupación de información** y **sensación general de producto terminado**.

El antiguo MigaPOS resolvía mejor estos puntos porque:
- distribuía el espacio del ticket con más intención,
- separaba visualmente bloques funcionales,
- usaba labels y badges con mejor aire,
- hacía que el bloque de cobro se entendiera rápido,
- y en contratos utilizaba superficies diferenciadas que ayudaban al cerebro a segmentar la información.

El objetivo de esta iteración es **imitar lo bueno del antiguo MigaPOS**, conservar la lógica nueva y dejar ambos módulos con una apariencia más profesional, clara y viva.

---

## 2. Problemas detectados

### 2.1 POS — carrito / ticket actual
Problemas visuales actuales:
- La versión nueva aún se siente más “seca” que la referencia antigua.
- Los labels y badges del ticket no están tan bien repartidos.
- El bloque de cobro no transmite la misma claridad visual.
- El área del total, el monto recibido, el vuelto y los métodos de pago aún puede verse más refinada.
- La distribución general no da la misma sensación de producto POS maduro.

Referencia de objetivo:
- El ticket antiguo muestra mejor distribución de:
  - cabecera,
  - contador de ítems,
  - lista de productos,
  - bloque total,
  - métodos de pago,
  - monto recibido,
  - vuelto,
  - acciones.

Resultado esperado:
- El carrito nuevo debe acercarse a ese patrón sin copiarlo literalmente, pero **sí replicando su lógica de jerarquía y distribución**.

### 2.2 POS — bloque de cobro y venta exitosa
Problemas detectados:
- El modal/pantalla de venta registrada puede seguir mejorándose.
- Los colores y acciones pueden sentirse menos refinados que el antiguo MigaPOS.
- El bloque de vuelto y las acciones finales deben verse más claros y elegantes.

Resultado esperado:
- Venta registrada / cobro exitoso con mejor jerarquía:
  - icono claro,
  - estado positivo,
  - total confirmado protagonista,
  - vuelto en bloque amigable,
  - acciones bien diferenciadas.

### 2.3 Contratos — tarjetas y secciones demasiado blancas
Problemas visuales actuales:
- El módulo de contratos sigue viéndose demasiado blanco/plano.
- Las tarjetas no se separan lo suficiente por color o tono.
- Cuesta percibir bloques distintos a primera vista.
- La interfaz no transmite suficiente riqueza visual.

Resultado esperado:
- Aplicar **superficies pastel suaves / difuminadas** para separar secciones funcionales.
- Cada tarjeta o bloque debe tener identidad visual clara, manteniendo legibilidad.
- El usuario debe entender más rápido qué parte corresponde a:
  - estado del pedido,
  - datos del cliente,
  - resumen financiero,
  - fecha de entrega,
  - acciones.

### 2.4 Contratos — tarjeta/listado de pedidos
Problemas actuales:
- Las tarjetas del listado siguen viéndose muy blancas y uniformes.
- Falta resaltar visualmente partes clave como:
  - estado,
  - total,
  - abono,
  - saldo o condición,
  - fecha de entrega,
  - CTA principal.

Resultado esperado:
- La tarjeta debe verse viva, segmentada y profesional.
- Deben utilizarse fondos suaves o paneles internos diferenciados.
- El CTA principal debe seguir siendo claro, pero sin pelear con el resto.

---

## 3. Objetivo de la iteración

Corregir la UI del carrito POS y del módulo de Contratos para que:
- el ticket y el bloque de cobro se vean mejor distribuidos,
- el módulo de venta luzca más cercano al antiguo MigaPOS,
- las tarjetas de contratos se separen por superficies y color,
- y la interfaz en general se sienta más “terminada”, atractiva y profesional.

---

## 4. Alcance de trabajo

### 4.1 POS — Carrito / Ticket de venta
Revisar componentes involucrados en:
- cabecera del ticket,
- contador de ítems,
- listado de productos,
- filas de cada producto,
- total a cobrar,
- selector de método de pago,
- campo de monto recibido,
- bloque de vuelto,
- botón cobrar,
- estados de ticket vacío,
- pantalla/modal de venta registrada.

Cambios esperados:
1. **Cabecera del ticket**
   - Mejor espaciado interno.
   - Badge de cantidad de productos más proporcionado.
   - Sensación más limpia y compacta.

2. **Lista de productos**
   - Mejor alineación entre nombre, precio unitario, cantidad y acción de quitar.
   - Separadores más finos y elegantes.
   - Menos sensación de “texto disperso”.

3. **Bloque financiero del ticket**
   - Total a cobrar muy legible.
   - Métodos de pago mejor equilibrados visualmente.
   - El método seleccionado debe sentirse claramente activo.
   - Monto recibido y vuelto mejor alineados.
   - El vuelto debe presentarse como bloque útil y amable, no solo como dato suelto.

4. **Ticket vacío**
   - Conservar simplicidad, pero con mejor proporción y aire.

5. **Venta exitosa / ticket registrado**
   - Composición más parecida al antiguo MigaPOS.
   - Total confirmado protagonista.
   - Vuelto mejor resaltado.
   - Botones finales con mejor ritmo visual.

### 4.2 Contratos — tarjetas y superficies
Revisar:
- listado de contratos/pedidos,
- tarjetas internas de resumen,
- bloques de estado,
- paneles financieros,
- chips/labels,
- CTA principal,
- zonas de fecha de entrega y resumen.

Cambios esperados:
1. **Separación de secciones por superficie**
   - Aplicar fondos suaves / pastel / difuminados según función.
   - No dejar todo blanco plano.
   - Mantener contraste y limpieza.

2. **Jerarquía visual**
   - Estado y badges mejor ubicados.
   - Datos importantes (cliente, total, entrega) mejor priorizados.
   - Subpaneles internos más evidentes.

3. **Panel financiero**
   - Total, abonado y estado deben agruparse mejor.
   - Debe sentirse como bloque interno destacado.

4. **Acciones**
   - Botones secundarios alineados y consistentes.
   - CTA principal claramente dominante, sin desbalancear la tarjeta.

---

## 5. Principios visuales obligatorios

1. **Imitar la lógica del antiguo MigaPOS**
   - No copiar de forma literal, pero sí reproducir:
     - mejor jerarquía,
     - mejores proporciones,
     - bloques mejor agrupados,
     - mejor uso del espacio.

2. **Galaxy Nebula refinado**
   - Sidebar morado profundo.
   - Superficies internas crema / blanco cálido.
   - Acentos verde menta, violeta y azul claro.

3. **Difuminados suaves y útiles**
   - El difuminado solo debe ayudar a separar secciones.
   - No usar gradientes exagerados.
   - Deben sentirse premium, no recargados.

4. **No contaminar la vista**
   - Menos texto inútil.
   - Más orden y agrupación.
   - Mejor escaneo visual.

---

## 6. Restricciones obligatorias

1. **No usar comandos Git/GitHub.**
   - Prohibido `git`, `gh`, API GitHub y similares.
   - El propietario hará la gestión manual.

2. **No ejecutar pruebas ni procesos pesados.**
   - No lint.
   - No build.
   - No tests.
   - No Chromium.
   - No emuladores.
   - No deploy.

3. **No cambiar lógica de negocio.**
   - No alterar caja, ventas, inventario, contratos, pagos, Firestore, persistencia ni autenticación.
   - Solo mejorar la presentación visual y layout.

4. **No instalar dependencias nuevas.**
   - Trabajar con la arquitectura existente.

---

## 7. Fases P12-09

### P12-09-A — Rehacer distribución del carrito POS
- Mejorar la composición general del ticket.
- Ajustar proporciones y alineación de información.

### P12-09-B — Refinar bloque de cobro
- Mejorar total, métodos de pago, monto recibido, vuelto y CTA.

### P12-09-C — Refinar pantalla/modal de venta registrada
- Mejorar jerarquía, claridad y armonía visual.

### P12-09-D — Aplicar superficies diferenciadas en Contratos
- Añadir separación por color suave / difuminado.

### P12-09-E — Mejorar tarjetas/listado de pedidos
- Reforzar paneles internos, bloques financieros y CTAs.

### P12-09-F — Ajuste fino de consistencia visual
- Revisar badges, bordes, sombras, hover y ritmo visual.

---

## 8. Criterios de aceptación

Se considerará correcta esta iteración si:

1. **POS**
   - El carrito se siente visualmente más cercano al antiguo MigaPOS.
   - El bloque de cobro está mejor distribuido.
   - Venta exitosa luce más pulida y jerárquica.

2. **Contratos**
   - Las tarjetas ya no se ven completamente blancas y planas.
   - Las secciones se separan intuitivamente por superficie/color.
   - La tarjeta de pedido/contrato luce más atractiva y mejor estructurada.

3. **Restricciones**
   - No se ejecutó Git/GitHub.
   - No se ejecutaron pruebas ni build.
   - No se alteró la lógica de negocio.

---

## 9. Entrega esperada de Codex

Al terminar, Codex debe informar:
- archivos modificados,
- cómo rehízo la distribución del carrito,
- cómo mejoró el bloque de cobro,
- cómo refinó la venta exitosa,
- cómo aplicó superficies diferenciadas en contratos,
- y confirmación explícita de que **no usó Git/GitHub, ni pruebas, ni despliegues**.
