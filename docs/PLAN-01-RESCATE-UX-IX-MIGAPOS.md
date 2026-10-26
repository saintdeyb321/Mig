# PLAN 01 — Rescate visual y UX/IX de MigaPOS

**Estado:** propuesta de corrección, sin implementación ni merge.  
**Referencia:** `main@41dd809` (identidad visual heredada) frente a `refactor/ux-tailwind-v4@da777d2` (estructura Tailwind/Radix).  
**Alcance:** frontend visual e interacciones presentacionales; **no** dominio ni persistencia financiera.

## 1. Problema y objetivo

La migración Tailwind eliminó alrededor de 21 hojas CSS pero degradó la identidad visual previa, la jerarquía de los formularios, el contraste semántico y el carácter de las tarjetas, tablas y modales. Una reducción de líneas CSS **no es un criterio de éxito UX**. El objetivo es recuperar —y superar— la calidad visual del diseño histórico conservando los avances técnicos útiles de Tailwind y Radix.

**Referencia obligatoria del modal anterior de contrato:** cabecera violeta con icono y cierre; secciones numeradas con encabezados/acento violeta; campos visualmente trabajados; llamada de agenda cálida; bloque financiero verde diferenciado con importe principal; footer estable con Cancelar y Guardar de contraste elevado. Recrear este lenguaje visual moderno, no copiar ciegamente las hojas antiguas.

## 2. Reglas no negociables

- Preservar `usePOS`, `useCashRegister`, `useContracts`, `useAuthManager`, repositorios, estados financieros, Firestore Rules, índices, licencias, permisos, cola Dexie/IndexedDB, caché, PWA e impresión.
- No ocultar validaciones de negocio; no cambiar montos, contratos de datos ni handlers de pago.
- No confundir estética con accesibilidad: contraste, foco visible, teclado y modales bloqueados durante operaciones críticas.
- Reutilizar Tailwind v4, Radix, lucide y componentes `shared/ui`; no instalar otra biblioteca completa de componentes ni recrear 21 CSS globales.
- Mantener avisos legales y de operaciones críticas, pero **quitar párrafos técnicos permanentes** de las zonas de trabajo; ubicar detalles en Ayuda/Capacidades y mostrar alertas contextuales cuando bloqueen una acción.
- Sin despliegue, cambios de `.env`, datos reales ni merge automático.

## 3. Dirección de diseño — identidad MigaPOS

1. **Branding:** violeta profundo/índigo como base, acentos morados luminosos, azul primario; usar verdes, naranjas y rojos semánticamente. Evitar interfaz monocromática y gris constante.
2. **Superficies:** fondo neutro tenue; tarjetas blancas con borde ligero y profundidad; cabeceras de tarjetas más marcadas; grupos visualmente identificables.
3. **Tipografía:** jerarquía evidente (título, sección, etiqueta, ayuda y total). No usar todo en tamaños diminutos por densidad.
4. **Modales:** encabezado con icono y color, contenido amplio y desplazable, footer visible o sticky sin tapar controles, ancho adaptado al módulo y al dispositivo; cierre claro.
5. **Componentes:** variantes expresivas de `Button`, `Badge`, `Card`, `Alert`, `Dialog`, `Tabs`, `DataCard`, `SectionCard`, `MoneySummary`, `FormField`; no concatenar 30 utilidades Tailwind en cada vista.
6. **Estados:** loading/skeleton, vacío útil, validación, error, confirmación y progreso con apariencia consistente, sin confirmaciones falsas.
7. **Responsive real:** 320, 360, 390, 768, 1024, 1280, 1440+; sin overflow horizontal accidental, sin CTAs ocultos con teclado abierto, con safe areas, touch targets y scroll correcto.
8. **Diseño operativo:** navegación rápida, acciones primarias inequívocas, pago destacado, sidebar elegante, navegación «Más» que no esconda funciones críticas.

## 4. Ejecución por checkpoints

### UX-R0 — Fundamentos y modal de contratos como patrón de calidad

- Comparar `frontend/src/styles/contractFormModal.css`, `contractsModals.css`, `contracts.css`, `pos.css` y `layout.css` en `main@41dd809` con la versión actual.
- Recuperar en Tailwind los patrones visuales mejores (header, iconos, gradientes sutiles, elevación, tarjetas coloridas, bloques numéricos y CTA).
- Modernizar `shared/ui` con variantes y tokens semánticos de diseño; minimizar CSS residual solo a impresión/dinámicos.
- Primer resultado **tangible**: modal Nuevo Pedido completo (datos cliente, logística, descripción/fotos, finanzas y footer), legible y con el atractivo visual del anterior.
- Resolver los estados de foco, modales anidados (Agenda dentro de Nuevo Pedido), bloqueo de guardado y escape cuando aplique.
- No reintroducir «Max 4» si la fuente funcional declara `MAX_CONTRACT_IMAGES=20`.

### UX-R1 — POS, caja, navegación y pantallas frecuentes

- POS: catálogo y ticket claramente alineados; tarjetas de producto ricas, filtro de categoría, buscador, stock legible; panel de ticket contrastado; vuelto y métodos de pago diferenciados.
- Drawer móvil y barra inferior sin conflictos de stacking, teclado o scroll; diálogos de caja con identidad propia y resumen visual.
- Sidebar, navegación móvil y header coherentes con branding; iconografía consistente, estados activos diferenciables.
- Recuperar la claridad del layout original sin su CSS rígido y conflictivo.

### UX-R2 — Homogeneización visual del SaaS

- Contratos (listado/detalle/cancelación), agenda, catálogo, categorías, historial, reportes/Excel, ajustes, personal, sedes, SuperAdmin y login.
- Tarjetas y tablas de lectura rápida con estados semánticos; respuesta móvil sin tablas demasiado pequeñas ni scroll de toda la página.
- Eliminar estilos inline repetidos y duplicaciones reales; usar componentes cuando aporten coherencia, no abstracción innecesaria.
- Consolidar iconos, tamaños, radios, sombras, espaciados y mensajes; limpiar comentarios técnicos de UX sin borrar advertencias funcionales.

## 5. Criterios de aceptación manual (propietario)

- Comparación visual *antes/después* con el modal heredado y la captura aportada en conversación; no considerar terminado si sigue visualmente peor.
- Formulario de Nuevo Pedido impecable: cabecera diferenciada, secciones identificables, finanzas protagonistas, botones visibles, sin solapamientos.
- A 320/390 px: carrito y modales no desbordan; acciones visibles; teclado no tapa CTA; imágenes dentro del viewport.
- En escritorio: sidebar armonioso, POS de dos columnas, tablas/reportes legibles.
- Funciones originales presentes, foco restaurado, datos conservados si falla un guardado.
- Sin nuevas pruebas masivas. Comprobación de compilación (lint/build/diff-check), más recorrido visual/manual del propietario.

## 6. Entrega de Codex

- Continuar en `refactor/ux-tailwind-v4`; **no merge**.
- Commits por UX-R0, UX-R1 y UX-R2; sin refactorización de dominio ni infraestructura.
- Informar los cambios visuales concretos y CSS residual justificado. La aceptación estética corresponde al propietario y no se sustituye por CI verde.
- No cambiar el comportamiento de exportaciones, permisos, autenticación ni tickets en este plan: eso pertenece al Plan 02.
