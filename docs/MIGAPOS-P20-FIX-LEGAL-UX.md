# MigaPOS — P20-FIX: documentos legales sin descarga y fuera de navegación

**Base verificada:** `fix/migapos-production-readiness`, commit `c3dcd0c` (14/11/2026). **Alcance:** corregir P20, NO rehacerlo. **Dos vistas:** Términos v2.0 y Privacidad v1.0. Mantener el Hosting `migapos-peru` y rutas `/legal/terminos`, `/legal/privacidad`.

## 0. Completar antes de aprobar para producción

El propietario debe completar/confirmar en los documentos legales existentes, sin inventar:

- Proveedor: nombre/razón social, RUC, domicilio legal/fiscal y correo de soporte.
- Privacidad: correo ARCO efectivo, inventario de datos/proveedores, región y transferencias internacionales reales, criterios verificables de retención/exportación y respuesta a bajas.
- Comercio: precio y periodo de suscripción, IGV/comprobante, política de renovación, cancelación y reembolsos, límites por sucursal y soporte.
- Reclamos: canal efectivo y Libro de Reclamaciones cuando corresponda; confirmar URL.
- Revisión legal peruana y autorización explícita del titular para publicar ambos textos.

**STOP:** sin esos datos/revisión, dejar estado `legacy`, NO publicar versiones 2.0/1.0 ni simular que la política está aprobada. El objetivo no autoriza publicar un texto con marcadores `[PENDIENTE]` ni promesas técnicas no verificadas. Para mostrar PRIVACIDAD ÍNTEGRA en producción hay que resolver esos campos y activar la publicación, no maquillar `privacy: null` con un título.

## 1. Cambios exactos de interfaz

1. **Eliminar el control «Descargar texto vX» del modal**: en `frontend/src/features/legal/LegalDocuments.jsx`, borrar `Download` del import y el enlace `<a ... download>...` dentro de `LegalDocumentDialog`. **No eliminar** los archivos `/legal/*.txt`, el render del contenido, la validación SHA-256 (`fetchLegalText`), las versiones, la accesibilidad ni los archivos históricos. No reemplazar el botón por otro.
2. **Mover enlaces a Ajustes**: eliminar `LegalLinks` del sidebar `frontend/src/layouts/AppLayout.jsx` y los ítems legales de `frontend/src/BottomNav.jsx` (incluidos «Más» móvil). En `frontend/src/modules/Settings.jsx`, agregar una sola tarjeta discreta **«Información legal»**, al final, con dos enlaces visibles «Términos y condiciones» y «Política de privacidad». Usar `legalRoutes` y `legalTitles`; navegación a las rutas existentes, sin abrir nuevos sitios ni descargar nada. **Mantener los enlaces antes de iniciar sesión** en `frontend/src/modules/Auth.jsx`. No romper el acceso a las reglas de uso para cajeros sin permiso de Ajustes: agregar un enlace pequeño en su área de cuenta/perfil, fuera del menú principal, o un mecanismo igual de accesible sin crear otro módulo. No duplicar ítems en sidebar.
3. **Política íntegra, sin mensaje de pendiente**: la causa es `frontend/src/features/legal/publication.js` (`state: 'legacy', privacy: null`). Una vez aprobados los dos textos definitivos, crear `frontend/public/legal/terminos-2.0.txt` y `frontend/public/legal/privacidad-1.0.txt`; publicar ambos como `approved` con SHA-256 calculados sobre bytes UTF-8/LF y `provider` real, sincronizar los mismos hashes/versiones en `firestore.rules`. Reutilizar `docs/MIGAPOS-TERMINOS-v2-BORRADOR.md` y `docs/MIGAPOS-PRIVACIDAD-v1-BORRADOR.md`, transformando SOLO el contenido jurídico aprobado a texto completo, sin encabezados internos de borrador, instrucciones para desarrolladores, notas de fuentes ni placeholders. El modal de Privacidad debe desplegar **sus 12 apartados completos**, igual que Términos despliega sus 20 apartados.
4. **No cambiar** `App.jsx` más de lo indispensable, ni modificar POS, caja, contratos, stock, cálculo de licencia, cupos, cobros o tickets. No volver a añadir nombre del cajero al ticket. No rehacer el diseño Nebula ni añadir rutas, dominios, Firebase Functions o bibliotecas.

## 2. Fuente del contenido legal (NO redactar con Codex)

- Términos completos: `docs/MIGAPOS-TERMINOS-v2-BORRADOR.md`, secciones 1 a 20; completar campos por el propietario; revisión jurídica. Respetar alcance real: ticket administrativo, no facturación electrónica SUNAT; riesgos de terceros sin exoneración ilegal; POS offline y verificación manual de cobros; roles, privacidad, IP, pagos, suspensión y reclamaciones.
- Privacidad completa: `docs/MIGAPOS-PRIVACIDAD-v1-BORRADOR.md`, secciones 1 a 12; completar campos por el propietario; revisión jurídica. Cubrir: categorías de datos; finalidad/base aplicable; responsable y encargado; Firebase y transferencias internacionales; medidas de seguridad; plazos de retención reales; ARCO; incidentes; datos de trabajadores/clientes; menores e imágenes; IndexedDB y tecnologías; cambios de versión. **No publicar solo un resumen.**
- No equiparar «publicar aviso» con «obtener consentimiento» para todo tratamiento. Conservar registro de aceptación y archivo histórico; no afirmar que constituye firma digital certificada.

## 3. No romper el cierre técnico de P20

- `frontend/config/validateLegalPublication.js`, `frontend/src/features/legal/publication.js`, `scripts/check-build.mjs`: siguen comprobando texto íntegro, SHA, archivos y correspondencia con Rules. Los `.txt` siguen accesibles por URL aunque no tengan botón de descarga.
- El modo `approved` exige aprobación simultánea de términos y privacidad; si faltan datos, no forzar `approved` ni desactivar guardas. `termsVersion`, `termsSha256`, `privacyVersion`, `privacySha256` deben ser idénticos entre frontend y Rules; conservar historial y prueba de aceptación server-side.
- Migración a v2: validar acceso de usuarios preexistentes, reaceptación de dueño y cajero, intentos simultáneos/offline, y PWA anterior (no asumir que actualizar UI bloquea todas las escrituras desde clientes antiguos).
- Despliegue coordinado, cuando se apruebe: CI verde del SHA exacto; publicar Rules primero, luego Hosting existente. No modificar Rules ni desplegar desde Codex.

## 4. Pruebas mínimas (sin pruebas nuevas redundantes)

- Ajustar `tests/p20-legal.browser.test.mjs` y tests que esperaban `[download]`, `privacy: null`, versión 1.1 o links en sidebar; no borrar pruebas anti-XSS y permisos.
- Verificar antes y después del login: las dos rutas legales, texto **íntegro**, ningún botón/atributo de descarga, enlaces en Ajustes y ausencia en sidebar/«Más», ruta accesible para cajero, scroll a 320px y zoom 200%.
- Validar integridad SHA y rechazo de documento alterado, 84 reglas o la suite de Rules vigente, build/PWA/check:build, lint, regresiones P08/P18/P19 y del ticket sin `CAJERO:`.
- Documentar PASS/FAIL/BLOCKED brevemente en `docs/RESULTADOS-P20-FIX.md`. Si falta ficha/aprobación legal, dejar implementación visual lista pero marcar **BLOCKED publicación legal** en vez de presentar privacidad incompleta como definitiva.

## 5. Criterio de entrega y economía de tokens

Editar solo archivos necesarios, sin rediseñar arquitectura ni volver a investigar el marco legal. Antes de tocar el código, inspeccionar archivos relacionados actuales, NO volcar el repositorio. Reportar **solo**: archivos cambiados; PASS/FAIL; campos bloqueantes; SHA/CI si aplica. No commits, push ni deploy. No explicaciones largas.
