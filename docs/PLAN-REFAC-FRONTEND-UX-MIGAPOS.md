# MigaPOS — Plan de modernización UX/UI: Tailwind CSS v4 + Radix UI

**Estado:** EN IMPLEMENTACIÓN EN `refactor/ux-tailwind-v4` · aceptación manual pendiente
**Proyecto:** `saintdeyb321/Mig` · Firebase Spark · `migapos` / Hosting `migapos-peru`
**Base conocida:** `main@41dd809100a20fd2edbe345c63660e8fe5f52d10` (comprobar HEAD antes de iniciar).
**Objetivo:** sustituir progresivamente estilos CSS repetidos y componentes visuales improvisados por un design system coherente, accesible, responsive y mantenible, **sin alterar la lógica de negocio ni sus contratos**.

## 1. Decisión tecnológica

**Stack seleccionado**

- **Tailwind CSS v4**, con integración oficial `@tailwindcss/vite` en Vite 7: diseño mobile-first, utilidades responsive, estados, container queries y tokens con `@theme`. No introducir la configuración antigua de Tailwind v3 (`@tailwind base;`, PostCSS/config JS) salvo necesidad demostrada.
- **Radix UI Primitives**: usar *solo* los paquetes necesarios para `Dialog`, `AlertDialog`, `DropdownMenu`, etc. Sin estilos impuestos; accesibilidad, portal, manejo de foco y teclado. Verificar versiones compatibles con React 19 y el lockfile actual antes de instalar.
- **Componentes UI internos** en `frontend/src/shared/ui/` (o directorio compartido ya existente, sin duplicarlo). Utilizar composición, props estables y variantes pequeñas; evitar copiar largas cadenas de utilidades en cada módulo.
- **`lucide-react` opcional** para iconografía consistente si realmente reduce la mezcla actual de emojis/iconos; instalar solo si se utiliza en la migración. No añadir frameworks UI completos, frameworks de routing ni gestores de estado nuevos.
- Utilizar `clsx` o función `cn()` mínima para componer clases; añadir `tailwind-merge` solo si se demuestra conflicto real entre variantes de utilidades. Evitar dependencias redundantes.

**Fuentes:**
- https://tailwindcss.com/docs/installation/using-vite
- https://tailwindcss.com/docs/theme
- https://www.radix-ui.com/primitives/docs/components/dialog
- https://www.radix-ui.com/primitives/docs/components/alert-dialog

**Advertencia:** Tailwind no garantiza por sí solo una interfaz responsive o accesible. Es obligatorio rediseñar las estructuras de layout y las interacciones, no hacer una sustitución mecánica CSS → `className`.

## 2. Diagnóstico basado en la captura y el código

1. `AppLayout.jsx` incluye una tarjeta permanente con el estado técnico de Spark, consumiendo espacio en todas las vistas. Reubicar detalles generales en Ajustes/Ayuda, no eliminar los avisos que sean relevantes para una operación.
2. `POS.jsx` renderiza `products-section`, un `<p role="status">` y `cart-section` como tres hijos del `.pos-grid`; el CSS de escritorio espera **dos columnas**. El párrafo desplaza el ticket abajo. **Corregir primero.**
3. `styles/pos.css`, `styles/layout.css` y `styles/BottomNav.css` usan alturas fijas/viewport, ocultamiento de overflow, z-index arbitrarios y selectores globales que provocan conflictos responsive.
4. `AppLayout.jsx` y `BottomNav.jsx` emplean `<nav>` anidados en móvil. Hay navegación extensa y repetida.
5. `POS.jsx`, `CashRegisterModals.jsx`, `CategoryManager.jsx`, `SuperAdmin.jsx`, formularios de contratos, etc. acumulan estilos inline, tamaños fijos, JSX extenso y modal/overlay implementado varias veces.
6. `index.css` importa multitud de hojas globales, algunas solapadas: `variables.css`, `base.css`, `components.css`, `layout.css`, `pos.css`, `history.css`, `settings.css`, `reports.css`, `users.css`, `exportSales.css`, `BottomNav.css`, `products.css`, `loaders.css`, `maintenance.css`, `auth.css`, `notificationBell.css`, `termsModal.css`, `contracts.css`, `contractsModals.css`, `contractCancelModal.css`, `contractFormModal.css`.

No borrar esos archivos en bloque: auditar uso de clases, estilos impresos, estilos de terceros y dependencias antes de retirarlos.

## 3. Límites absolutos: preservar el producto Spark

**No tocar** Firestore Rules, índices, `functions/**`, repositorios de Firestore, autorización, licencias, lógica financiera, cálculos, dominio, hashes/idempotencia, ventas, caja, pagos, contratos, permisos de usuarios, `offlineDB`, Dexie, cifrado, PWA/Workbox, scripts de release, `.env*` ni datos reales.

- Conservar los hooks funcionales (`usePOS`, `useCashRegister`, `useContracts`, `useSuperAdmin`...) y sus contratos. Si se extrae JSX a componentes nuevos, solo deben recibir estado/eventos vía props; **no crear lógica financiera nueva ni efectos paralelos**.
- Mantener el límite visible de **máximo dos productos distintos por venta**; no habilitar `saleVoid`, `offlineSync`, `cashReconciliation` ni servicios Functions/Storage.
- Mantener estados de venta confirmada vs. pendiente, caja abierta/cerrada, cierre con conciliación pendiente, deudas, validación, roles, permisos, impresión y Excel.
- No cambiar semántica de botones críticos: doble clic no debe disparar pagos duplicados, modales no se cierran durante operaciones protegidas, errores no borran formularios.
- No cambiar Firebase real, no desplegar y no crear/eliminar información de negocio.
- Preservar archivos/colas locales y no borrar IndexedDB/cache de la PWA de usuarios reales.

## 4. Arquitectura de presentación propuesta

```text
frontend/src/
  shared/
    ui/
      Button.jsx / IconButton.jsx
      Card.jsx / Badge.jsx / Alert.jsx
      PageHeader.jsx / EmptyState.jsx / LoadingState.jsx
      FormField.jsx / Input.jsx / Select.jsx
      Dialog.jsx / ConfirmDialog.jsx / Drawer.jsx
      DropdownMenu.jsx      (si se necesita)
      index.js
    styles/
      theme.css             (@theme y tokens, una fuente de verdad)
      app.css               (@import 'tailwindcss', base ligera y capas)
      print.css             (solo impresión/salida comprobantes)
  layouts/AppLayout.jsx
  BottomNav.jsx
  modules/...               (vistas compuestas con shared/ui)
```

**SOLID aplicado con criterio en React:**
- **S**: vistas orquestan interacción; `shared/ui` renderiza; hooks existentes ejecutan operaciones; repositorios/domino permanecen intactos.
- **O**: variantes de Button/Card/Badge por props/configuración, no `if` repetidos y CSS copiado.
- **L**: componentes cumplen su API y semántica (un Button respeta `disabled`, `type`, refs y eventos).
- **I**: props pequeñas y especializadas; evitar mega-componente con flags de todos los módulos.
- **D**: componentes visuales dependen de estado/callbacks recibidos; nunca importan Firebase directamente.

Preferir composición a jerarquías de clases, hooks nuevos solo para comportamiento genuinamente visual, y evitar abstraer elementos que aparecen una sola vez sin ventaja clara.

**Tailwind y CSS legado:**
- Integrar Tailwind mediante plugin de Vite sin romper React/PWA ni el orden de imports.
- Definir tokens en `@theme` con nombres semánticos coherentes: superficies, texto, bordes, primario, violeta de sidebar, éxito, advertencia, peligro, foco, sombras y radios. Respetar marca existente.
- Evitar que CSS no estratificado del legado prevalezca silenciosamente sobre Tailwind; migrar por módulo y aislar/remover selectores antiguos solo cuando dejen de usarse.
- No crear un enorme archivo nuevo de `@apply` que reproduzca todo el CSS heredado. Usar primitivas UI y utilidades estáticas legibles.
- No construir clases Tailwind dinámicamente (`bg-${color}-500`) sin variantes estáticas explícitas; deben sobrevivir a la generación de CSS.
- Mantener CSS especializado cuando corresponda: `@media print` para ticket, interop PWA/third-party y animaciones realmente complejas. Documentar residuos y evitar estilos globales redundantes.

## 5. Fases de migración (una rama, checkpoints revisables)

### UX-TW-0 — Fundamentos y reparación inmediata del POS

- Crear rama `refactor/ux-tailwind-v4` desde `main` actualizado, sin pisar cambios ajenos.
- Instalar Tailwind v4/`@tailwindcss/vite`, Radix mínimo requerido y actualizar lockfile **únicamente en frontend**.
- Preparar theme, tokens, utilitario de clases y las primeras primitivas (Button/Card/Badge/Alert).
- Eliminar el párrafo técnico de dentro de `pos-grid`; asegurar exactamente dos hijos estructurales: catálogo y ticket.
- Retirar el banner técnico global de `AppLayout`, trasladarlo a Ajustes/Capacidades. Mantener alertas **contextuales** de operaciones y límites Spark.

### UX-TW-1 — Shell, navegación y layout universal

- Migrar `AppLayout`, navegación desktop, `BottomNav`, selector de sede y cabeceras con Tailwind.
- Desktop: sidebar estable; contenido fluido sin overflow horizontal. Tablet: diseño utilizable. Móvil: navegación con accesos principales y opción «Más» para secundarios; menú filtrado estrictamente por `getSessionModules`.
- Corregir HTML semántico, nav anidado, scrolls dobles, áreas de foco, safe areas y viewport móvil `dvh`.
- Unificar páginas con `PageHeader`, `PageContainer`, states de carga/error/vacío.

### UX-TW-2 — POS completo y flujos de pago

- Descomponer solo la presentación de `POS.jsx` en búsqueda/filtros, tarjetas, carrito, pago, status y recibo. No duplicar hooks ni dominio.
- Desktop: catálogo a la izquierda y ticket a la derecha en la misma fila; acciones de cobro siempre utilizables, nunca tapadas.
- Móvil: carrito en Drawer accesible; botón de acceso al carrito independiente del bottom nav; teclado virtual y scroll correctos.
- Estados visuales distintos para caja cerrada, stock insuficiente, carrito vacío, operación en curso, venta confirmada y pendiente.
- Mantener límites de venta, métodos de pago, importes/vuelto, QR, impresión y no doble envío.

### UX-TW-3 — Modales, drawers, confirmaciones y formularios

- Crear `Dialog` (Radix), `ConfirmDialog`/`AlertDialog` y `Drawer` usando los mismos tokens.
- Asegurar foco, tabulación, escape, vuelta del foco, títulos accesibles, portal y scroll interno. Controlar `onOpenChange` para impedir cierres durante submit crítico; conservar estado y errores en fallos.
- Migrar caja (abrir/cerrar), categorías, productos, contactos, personal, sucursales, contratos (formulario/detalles/cancelación/entrega), SuperAdmin, renovaciones, QR y términos cuando apliquen.
- Inputs `label`, validaciones accesibles, botones con `type`, estados pending, feedback inline. Conservar pasos y validaciones originales.

### UX-TW-4 — Resto de vistas y consolidación visual

- Migrar Historial/Excel, Contratos, Agenda VIP, Productos, Categorías, Reportes, Personal, Sucursales, Ajustes/backup, SaaS Admin, login, términos y errores.
- Listados responsive (tabla desktop, cards/scroll local móvil), estados consistentes y jerarquía visual.
- Evitar que el mensaje de capacidades Spark se repita permanentemente en las pantallas. Las advertencias críticas operativas siguen visibles.
- Reutilizar `shared/ui` sin crear dependencias circulares ni mover datos sensibles a estado global.

### UX-TW-5 — Limpieza CSS y entrega

- Revisar cada CSS legado y eliminar únicamente reglas/archivos sin referencias activas: `pos.css`, `layout.css`, `BottomNav.css`, `contracts*.css`, etc. Conservar CSS de impresión donde siga haciendo falta.
- Eliminar estilos inline estáticos, estilos globales con alta especificidad, clases duplicadas, `!important` injustificados y z-index improvisados.
- Conservar un inventario pequeño de CSS residual **y su motivo**. Reducir CSS duplicado sin maximizar artificialmente clases Tailwind ni usar `@apply` masivo.
- Inspección estática de imports, clases dinámicas y modales: evitar regresiones al retirar CSS.
- Listar los pasos de aceptación manual del propietario; no marcar vistas como comprobadas visualmente si no lo están.

## 6. Estándares de UX e interacción

- Diseño **mobile-first** y fluido, con layouts pensados para anchos 320, 360, 390, 768, 1024, 1280, 1440 y 1720 px; también zoom 200 %. Estos valores son una **guía para revisión manual del propietario**, no un encargo de generar screenshots/tests.
- Sin scroll horizontal de la página, sin botones inaccesibles y sin dependencias de hover en móvil.
- Modales con ancho y alto adaptativos; teclado virtual y safe areas; `prefers-reduced-motion`.
- Contraste y tamaño de controles suficientes, foco visible y navegación por teclado.
- Estados vacíos, cargas y errores recuperables; toasts complementan pero no sustituyen información persistente necesaria.
- Animaciones discretas; evitar grandes efectos de blur/sombra y componentes pesados que perjudiquen equipos de caja económicos.
- Mantener impresión del ticket separada del shell responsive; no aplicar `display:none` global que rompa media print.

## 7. Criterios de aceptación y validación solicitada

**No escribir nuevas suites de tests automatizados, fixtures, mocks, screenshots ni auditorías extensas en este encargo.** El propietario realizará el recorrido visual/funcional manual después. Codex debe invertir el tiempo en **implementar el rediseño**.

Comprobaciones técnicas mínimas de Codex:

1. `npm run lint --prefix frontend`.
2. `npm run build --prefix frontend` (verificar PWA y que Tailwind se incluya).
3. `git diff --check`.
4. Verificar imports y ausencia de errores evidentes en el código migrado, sin ejecutar suites históricas masivas.
5. Al añadir paquetes, comprobar compatibilidad y seguridad de dependencias afectadas, sin generar reportes extensos.

**Aceptación manual del propietario** (sin prometer que Codex la realizó): iniciar `npm run dev`, recorrer login, roles, POS, caja, pagos, contratos, modales, productos, categorías, historial, reportes, SaaS Admin y backups en escritorio/móvil. Confirmar que **no se tocó dominio ni se desplegó nada**.

## 8. Entrega y control de cambios

- Ejecutar las seis fases de forma consecutiva en rama `refactor/ux-tailwind-v4` con checkpoints A (0–1), B (2–3), C (4–5), commits pequeños y coherentes; **sin fusionar a `main` automáticamente**.
- Permitir cambios solo en frontend de presentación, Vite/config CSS y dependencias de frontend, más actualización de este plan/`MASTER-PLAN.md` si procede.
- No hacer refactor masivo del dominio para perseguir reglas SOLID; el objetivo es SOLID **en presentación**.
- Al cerrar, entregar SHA/branch, pantallas migradas, componentes compartidos, CSS eliminado/residual, dependencia añadida, lint/build/diff-check, riesgos y recorrido manual recomendado.
- Estado de la fase: **IMPLEMENTADA EN CÓDIGO, PENDIENTE DE ACEPTACIÓN MANUAL** hasta que el propietario confirme el comportamiento.

## 9. Prompt para Codex

El prompt operativo completo está incluido en la respuesta de ChatGPT que acompaña este documento. Este plan define decisiones y criterios; cualquier divergencia de Codex debe justificarse antes de sustituir el stack propuesto.


## Avance de implementación

Checkpoint A: Tailwind v4 mediante plugin oficial Vite, tokens semánticos violeta/azul, primitivas compartidas, sidebar desktop y navegación móvil «Más» filtradas por la sesión; selector de sede y notificaciones reutilizables. Banner técnico global trasladado a Ajustes/Capacidades; aviso operativo POS fuera del grid (dos paneles estructurales). CSS legado temporalmente aislado en capa `legacy` durante la sustitución; retirada final en checkpoint C. Sin cambios de hooks, repositorios, dominio, Firebase, PWA, impresión, persistencia ni `.env`. Sin pruebas nuevas o capturas; revisión visual pendiente del propietario.

Checkpoint B: POS dividido en catálogo, ticket, pagos y estados presentacionales; Drawer móvil y diálogos Radix para caja, catálogo, contactos, personal, sucursales, contratos, SuperAdmin, QR y términos. Los formularios permanecen montados durante el guardado y el cierre se bloquea mientras la operación está pendiente. Hooks y cálculos financieros conservados.
