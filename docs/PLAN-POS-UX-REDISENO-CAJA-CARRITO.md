# MigaPOS — Plan único de mejora UX del POS (caja, carrito y cobro)

**Destino de trabajo:** `C:\Proyectos\MigaPOS`  
**Alcance:** interfaz del Punto de venta y sus pruebas visuales/regresiones asociadas.  
**Rama prevista para la publicación manual del propietario:** `fix/migapos-production-readiness`. **Codex no debe cambiar de rama ni ejecutar Git/GitHub.** Verificar de forma no destructiva la estructura local; si el árbol activo contiene marketing, no modificarlo ni intentar cambiarlo.  
**Objetivo:** mejorar jerarquía, contraste y segmentación del POS conservando los flujos y componentes actuales. Las capturas suministradas son referencias de lógica visual, **no** plantillas para copiar.

## 1. Diagnóstico UX y objetivo visual

La aplicación tiene una identidad reciente **Galaxy Nebula Cream**: crema/marfil claro, morado violeta para navegación y acentos, verde operativo, y tonos pastel. El POS debe conservarla. Problemas a corregir:

1. **Estados de caja poco distinguibles:** «Caja abierta» / tiempo restante y «Caja cerrada» se confunden con el fondo; «Cerrar caja» se percibe como botón neutro.
2. **Carrito visualmente plano:** encabezado, líneas del ticket, total, medios de pago, monto/vuelto y acción comparten demasiada superficie visual, dificultando el escaneo.
3. **Monto recibido y vuelto desaprovechan el ancho:** en efectivo el vuelto se coloca debajo del campo; debe estar a su derecha cuando el ancho lo permita.
4. **Responsividad y altura:** panel del carrito no debe crecer indefinidamente, empujar «Cobrar» fuera de pantalla ni perder el input enfocado.
5. **Contraste y foco:** cada estado ha de identificarse por texto, iconografía y fondo/borde (nunca solo por color).

**Secuencia visual deseada:** productos → ticket → total → forma de pago → monto/vuelto → acción principal.

## 2. Especificación de diseño

### 2.1. Estado de caja en cabecera

- **Abierta:** píldora con fondo verde menta visible y borde contrastado; texto «Caja abierta» y, cuando exista, tiempo restante sin inventar minutos ni cambiar el cómputo.
- **Acción «Cerrar caja»:** botón visualmente rojo/rosado con texto oscuro o rojo profundo de alto contraste, icono existente y estados hover/focus/disabled. Mantener confirmación, permisos y lógica.
- **Cerrada:** píldora salmón/rosada legible «Caja cerrada» que destaque sobre crema; conservar el CTA «Abrir caja para vender» donde ya existe.
- **Vencida / pendiente:** tono ámbar y mensaje basado en estado real, no simular que sigue abierta. No habilitar el cobro si el dominio lo prohíbe.
- En móviles, las acciones y estados deben poder reacomodarse sin superponerse con el título.

### 2.2. Carrito segmentado, sin cambiar la lógica

Mantener el mismo panel y componentes funcionales; introducir **separadores perceptibles** mediante superficies, padding, bordes suaves y jerarquía tipográfica:

1. **Encabezado del ticket:** lila/morado muy claro sobre la tarjeta marfil; nombre del bloque y contador visibles.
2. **Listado de productos:** panel claro de lectura; nombres, cantidades, precios y acciones distinguibles; es la única región que debe desplazarse en vertical cuando crece la lista.
3. **Total a cobrar:** franja verde menta pálida con monto destacado, alineación consistente y buen contraste.
4. **Métodos de pago:** zona propia, suavemente lila o marfil teñido, claramente diferente del fondo del carrito. Efectivo = verde, Yape/Plin = violeta, Mixto = azul/lila. Selección reconocible por borde, relleno, tipografía y accesibilidad.
5. **Monto recibido y vuelto:** misma sección, alineación y alturas coherentes; mostrar la cifra de vuelto (y sus estados) dentro de un bloque acotado.
6. **Acción principal:** pie delimitado y visible con «Cobrar» o «Abrir caja para vender» según las condiciones **existentes**.

Evitar paneles anidados con exceso de sombras, colores saturados y cambios globales que alteren Reportes o Historial. Usar variables CSS existentes o tokens de alcance POS; preservar sidebar violeta, fondo crema e identidad MigaPOS.

### 2.3. Monto recibido y vuelto

- En **Efectivo**, crear fila `grid` preferentemente **55/45 o 60/40**, input «Monto recibido (S/)» a la izquierda y bloque «Vuelto» a la derecha.
- Mantener una etiqueta asociada al input, validación monetaria, teclado apropiado, foco visible, número legible y valor de vuelto calculado por la **misma lógica actual**.
- No convertir el vuelto en input editable; no introducir cálculos alternativos o `Number`/redondeos que alteren lo existente.
- En ancho insuficiente, apilar solo si es necesario; priorizar que ninguna cifra ni botón se corte.
- **Yape/Plin y Mixto:** no forzar el esquema efectivo sobre otros flujos; respetar sus campos y estados reales, sin mostrar vuelto incorrecto ni perder el desglose mixto.

### 2.4. Restricciones de layout

- El POS no debe desplazarse horizontalmente, incluso con nombres de productos largos, precios altos y muchos productos.
- El carrito mantiene un `max-height` coherente con el viewport; solo las líneas del ticket hacen scroll, con total, método de pago, campos y CTA accesibles.
- Respetar la barra del navegador y `100dvh`/zonas seguras cuando corresponda; no fijar alturas que corten la interfaz con zoom 125% o el teclado móvil.
- Probar expresamente **1280 × 560**, **1366 × 768**, **1440 × 900**, **768 × 1024**, **390 × 844** y **375 × 667**. Preferir captura real en Chromium si el entorno lo permite.
- Estado caja abierta/cerrada, carrito vacío / una línea / muchas líneas, efectivo con vuelto, pago insuficiente, digital y mixto. Comprobar el campo enfocado, tecla Tab y el botón de pago.

## 3. Límites de implementación

**Modificar solo lo estrictamente necesario:** componentes POS, estilos locales y, únicamente si es imprescindible, tokens compartidos de `frontend/src/shared/styles/theme.css` o `frontend/src/index.css`, revisando que no se alteren otros módulos. Ubicar las rutas reales antes de editar; `frontend/src/modules/pos/CatalogParts.jsx` es una referencia, no una autorización para reescribir el catálogo.

**Prohibido:** cambiar operaciones financieras, fórmulas de vuelto, Firestore, Rules, suscripciones, caché, persistencia IndexedDB, autenticación, permisos, stock, caja, contratos, reportes, PDF, Excel, tests para saltar aserciones o módulos promocionales. **Cero nuevas lecturas Firestore.** No instalar paquetes ni usar la red para nuevas dependencias.

**Reglas de Git/marketing:** no ejecutar `git`, `gh`, herramientas/conectores de GitHub, `checkout`, `switch`, `commit`, `push`, `merge`, `reset`, `stash` ni `deploy`. No tocar `marketing/`, `.agents/skills/brag-main/`, scripts de video ni renders. El propietario selecciona la rama y publica manualmente.

## 4. Plan de trabajo Codex

1. Inspeccionar componentes y estilos reales del POS. Mapear dónde se determina el estado de caja, el contenido del carrito, el método de pago, el campo recibido, el vuelto y el CTA. No duplicar lógica ni estados.
2. Implementar variaciones visuales mínimas, reutilizando diseño y componentes actuales.
3. Ajustar el layout para que el listado del carrito tenga desplazamiento independiente sin empujar resumen y cobro fuera del viewport.
4. Revisar accesibilidad: contraste WCAG AA para texto habitual, etiquetas y rol de controles, estados de foco, uso con teclado, `prefers-reduced-motion` si aplica.
5. Probar los estados del punto 2.4, especialmente 1280×560 y móvil; no cambiar validaciones existentes.
6. Ejecutar las pruebas relevantes ya disponibles (Node y Chromium del POS/cobro/P09/P10), lint y build/PWA. Si falta algún requisito local, informar BLOCKED sin instalar nada.
7. Entregar un resumen verificable: archivos modificados; diferencias antes/después; capturas o descripción de los seis tamaños probados; resultados PASS/FAIL/BLOCKED; límites y regresiones conocidas. No afirmar que se desplegó.

## 5. Criterios de aceptación

- Estado **Caja abierta**, **Caja cerrada** y botón **Cerrar caja** son inequívocos sobre el fondo crema y conservan sus comportamientos.
- Carrito dividido visualmente en **seis regiones** identificables sin convertirse en seis tarjetas pesadas independientes.
- Efectivo: **Monto recibido + Vuelto** uno al lado del otro a anchos adecuados; responsive sin recortes.
- Métodos de pago claramente segmentados con selección accesible; Yape/Plin y Mixto intactos.
- «Cobrar»/«Abrir caja para vender» no desaparecen con scroll, 1280×560 ni carrito largo.
- Respeta la paleta **crema/marfil + violeta vivo**; no regresa al gris opaco ni satura todo con azul.
- Operaciones, cifras, caja, permisos y lecturas Firestore se mantienen **sin cambios**.
- Ningún archivo de marketing modificado; ningún Git/deploy ejecutado por Codex.

## 6. Entrega

El propietario revisará las capturas, hará la aceptación visual y gestionará Git/Hosting personalmente. Codex no debe iniciar otra fase de rediseño fuera del POS.
