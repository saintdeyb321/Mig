# MigaPOS P22 — Actualizaciones confiables y UX móvil de Personal/Productos

**Base auditada:** `fix/migapos-production-readiness`, commit `89f8b7d31f31200dabb790cecdbf5ff66f4452ea` (2026-11-15). Codex debe verificar la rama local antes de actuar, respetando cambios no confirmados.

## Alcance estricto

Una corrección cohesionada: (A) actualizar PWA con acción visible y útil, sin perder trabajos locales; (B) retirar enlaces legales del header del cajero; (C) normalizar responsive de Personal y Productos; (D) arreglar CI. Sin Firestore Rules, índices, documentos legales/hashes, permisos, suscripciones, lógica transaccional de POS/caja/contratos, nuevas dependencias ni nuevo hosting. Una señal de estado de borrador de solo lectura es admisible si hace falta para demostrar que una actualización no perderá operaciones.

## A — PWA: diagnóstico, especificación y estados

Archivos auditados:
- `frontend/src/components/ReloadPrompt.jsx`
- `frontend/src/App.jsx`
- `frontend/src/features/pwa/registerPwa.js`
- `frontend/src/features/pwa/updateRegistration.js`
- `frontend/src/features/pwa/localUpdateSafety.js`
- `frontend/public/pwa-update-worker.js`
- `frontend/vite.config.js` y `scripts/check-build.mjs` (solo si es indispensable)

**Defecto comprobado:** `ReloadPrompt.jsx` en sesión autenticada muestra aviso pero solo «Más tarde»; no ofrece «Actualizar ahora». La activación está condicionada por `isLogin`, por lo que un usuario que mantiene el POS abierto no dispone de un camino manual directo. `pwa-update-worker.js` correctamente rechaza activar si hay más de un cliente MigaPOS: NO eliminar este control.

**Decisión:** mantener `registerType: 'prompt'`, un único registro de SW y un solo coordinador de actualización. NO usar `autoUpdate`/`skipWaiting` generalizados. El registro debe comprobar al iniciar, reconectar, volver a primer plano y a intervalos prudentes (compartiendo limitador). No generar lecturas a Firestore.

Implementar máquina de estados explícita y visible: `idle` / `checking` / `waiting` / `blocked` (razón distinguible: conexión, pestañas, datos locales, formularios/operaciones, login Google, error del SW) / `activating` / `error` / `done`. Puede adaptarse a la arquitectura actual sin nueva librería.

**Botón funcional:** mostrar «Actualizar ahora» cuando `registration.waiting` existe tanto en login como en sesión autenticada (nunca un botón decorativo/inactivo sin explicar por qué). Su `onClick` debe revisar en ese momento: online, existencia del SW waiting, múltiples clientes, estado local IndexedDB, acciones no terminadas, y señales de formularios/carrito/contratos/operación activa que realmente existan en el proyecto. Si NO se puede confirmar estado seguro, bloquear explicando el motivo y permitir reintentar; no recargar ni descartar. No forzar cierre de sesión ni la pérdida de estado. Si no existe forma fiable de demostrar que una vista autenticada está libre de borradores/carrito y operaciones en curso, no aplicar desde ella: indicar terminar la operación y actualizar desde el login, en vez de asumir que es seguro. Si hay sesión de POS con operación en curso, ofrecer «Más tarde» y una instrucción para finalizarla. Automatizar solamente en login inactivo/seguro, no en POS.

Al aceptar: prevenir doble clic y concurrencia con popup de Google; usar protocolo `MIGAPOS_ACTIVATE_UPDATE` existente; observar `controllerchange` o activación validada; recargar **una sola vez** únicamente cuando nuevo SW controle la página (o semántica equivalente realmente comprobada). Implementar timeout recuperable; conservar IndexedDB y cachés de datos de negocio. El botón «Reintentar» debe estar presente y habilitado en estados recuperables, tras cerrar otra pestaña y resolver pendientes; una vez seguro debe volver a comprobar y actualizar. Revalidar estado real, no depender de un `issue` anterior o de `navigator.onLine` sin actualización React.

Conservar el bloqueo de `pwa-update-worker.js` para múltiples clientes, y no eliminar sistemas de respaldo/PWA. Revisar si basta con ciclo de SW; un `version.json` independiente solo si se justifica y cubre con pruebas, no introducir comprobaciones redundantes ni bucles.

**Compatibilidad:** versiones ya instaladas pueden requerir una recarga/cierre inicial; no prometer actualización silenciosa universal en todos los navegadores. Corregir sin llamar `indexedDB.deleteDatabase`, `caches.delete` global ni `unregister` indiscriminado.

## B — Cabecera cajero

Archivo: `frontend/src/layouts/AppLayout.jsx`. La variable `cashierLegalLinks` actualmente se muestra dos veces (identidad sidebar escritorio y `.app-mobile-header`). Eliminar al menos su render móvil; como se solicitó que los links ya estén en Login, retirar ambas inserciones del shell del cajero para simplificar y conservar la pantalla de login pública y `/legal/terminos`, `/legal/privacidad`. No ocultar indicadores de sede, conectado, notificaciones o sesión. Eliminar imports/variables no utilizados. Ajustar el `ResizeObserver`/offsets existentes sin hacks de altura. No eliminar los enlaces de Ajustes para dueños ni el Libro.

## C — Responsive Personal y Productos

Archivos prioritarios:
- `frontend/src/modules/UserManagement.jsx`
- `frontend/src/modules/ProductCatalog.jsx`
- `frontend/src/shared/ui/PageHeader.jsx` (solo si un cambio compartido es imprescindible)
- `frontend/src/shared/ui/Button.jsx` (evitar cambios globales salvo defecto demostrado)

Diferencias verificadas: el botón de Personal tiene `className="w-full sm:w-auto"` dentro de `PageHeader`, y el de Productos `className="shrink-0"`; el header ya contiene un contenedor de acciones `w-full` en móvil. El filtro «Mostrar bloqueados» de Personal usa `flex` (se expande) y «Ver archivados» de Productos usa `inline-flex` (compacto). Alinear ambos filtros con el patrón compacto sin reducir la zona táctil. Dar a ambos headers un patrón coherente, preferiblemente el tamaño intrínseco compacto del botón de Productos, con altura táctil >=44px, sin cortes a 320/360/390/412/768px. No sacrificar título/descripción ni generar overflow horizontal.

En `UserCard` el footer usa `flex flex-wrap justify-end`, provocando botones de tamaños/saltos distintos. Crear rejilla estable a ancho estrecho (`grid-cols-2` para dos acciones, ancho coherente, gap y altura táctil) y disposición compacta para pantallas mayores. Caso de una acción (dueño sin deshabilitar o invitación pendiente): ocupar ancho lógico sin dejar hueco. Conservar `Editar`, `Deshabilitar`, `Habilitar`, `Cancelar invitación` y sus estados disabled. Mantener iconografía, badges y los datos correctos; títulos/correos largos deben envolver sin empujar fuera de la tarjeta. Productos conserva precio, stock, edición, imágenes y modales; alinear paddings/iconos/acción principal solo donde haya inconsistencia concreta, no rediseñar el catálogo.

En 320, 360, 390, 412 y 768px no debe haber scroll horizontal a nivel `document`, ni botones tapados por dock/teclado; tarjetas en `xl:grid-cols-2` deben tener alturas/acciones razonables sin superposiciones.

## D — CI: fallos existentes obligatorios

CI fallida en `https://github.com/saintdeyb321/Mig/actions/runs/43748880829` para `89f8b7d`, paso **P20 public legal documents and POS print privacy**:
1. `tests/p20-legal.browser.test.mjs:120`: inmediatamente tras volver `navigator.onLine`, el botón «Activar mi cuenta» aún no estaba habilitado (`false !== true`). Investigar transición de hook, fetch, componente y test; usar condición observable estable/reintento si solo es carrera de render, sin suprimir protección offline ni eliminar aserción de aceptación.
2. `tests/p20-legal.browser.test.mjs:213`: el test intentó hacer `.click()` sobre «Reintentar» inexistente. Ajustar comportamiento/estados/botón y probar reintento cuando otra pestaña impide aplicar SW. No saltar la prueba ni aceptar el fracaso.

Actualizar `tests/plan09.browser.test.mjs` (P19 actualmente exige links legales visibles en cabecera móvil y sidebar cajero), `tests/plan09.fixture.jsx` si aplica, `tests/spark-mode.test.mjs` y pruebas PWA/UX focalizadas. Añadir pruebas para botón manual autenticado seguro, bloqueo con operación local y otra pestaña, nueva versión en login, debounce de reintentos y limpieza de listeners. Probar layout real en Chromium con mobile viewport 320/360/390/412/768. Verificar que ninguna prueba se silenció.

## Validación y entrega

- Ejecutar pruebas focalizadas primero: `node --test tests/p20-legal.browser.test.mjs`, `node --test tests/spark-mode.test.mjs`, y `node --test tests/plan09.browser.test.mjs` (ajustar runner/navegador si precisa).
- `npm run lint --prefix frontend`, `npm run release:build -- --env production`, `npm run check:build`, `git diff --check`.
- Si es viable, ejecutar la batería CI completa o reproducir `verify.yml`. No deploy con CI roja.
- No alterar TXT ni SHA-256, Firestore Rules, índices ni datos reales. No hacer deploy ni push sin indicación.
- Salida Codex: máximo 12 líneas: archivos, decisiones del ciclo PWA, test PASS/FAIL, restricciones y estado de CI.
