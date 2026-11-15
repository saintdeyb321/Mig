# MIGAPOS — P21 | Integración legal definitiva + doble confirmación en activación

**Objetivo:** terminar el onboarding legal de MigaPOS para nuevos dueños y cajeros, con **dos casillas desmarcadas en «Activar mi cuenta»**, documentos completos consultables en enlaces públicos, aceptación comprobable en Firestore y ninguna lectura obligatoria en un modal extenso. Corregir las pruebas y dejar el build de producción listo **sin desplegar**.

**Referencia de auditoría remota:** `saintdeyb321/Mig`, rama `fix/migapos-production-readiness`, SHA `854b146` (15-11-2026). **La copia local contiene cambios posteriores que GitHub NO refleja**: tiene Términos 1.1 editados, `frontend/public/legal/privacidad-1.0.txt` sustituido por su política final, y Rules/SHA ajustados manualmente. **La copia local es la fuente prioritaria.** Antes de tocar un archivo comprobar `git branch --show-current`, `git status --short`, `git diff -- ...` y contenido efectivo; nunca `reset`, `checkout --`, `pull` a ciegas ni restaurar el SHA histórico.

## 0. Decisiones cerradas: NO debatir ni redactar

1. **No redactar, resumir ni modificar jurídicamente ningún documento.** Conservar los **bytes exactos** del actual `frontend/public/legal/terminos-1.1.txt` y `frontend/public/legal/privacidad-1.0.txt`; son los textos seleccionados por el propietario. Si un archivo no existe, está vacío o contiene placeholders de borrador, **reportar bloqueante**, no generar texto imaginado. El usuario no quiere Términos 2.0 ni otro TXT para esta entrega: usar **Términos 1.1 actuales + Privacidad 1.0 actual**. Ajustar el validador que antes exigía `terms.version !== legacyTerms.version` para permitir este lanzamiento inicial, manteniendo *todas* las comprobaciones de contenido y SHA.
2. El primer check significa **«He leído y acepto los Términos y Condiciones de MigaPOS (v1.1)»**. El segundo, **«He leído la Política de Privacidad de MigaPOS (v1.0) y conozco el tratamiento de mis datos»**: constancia de información, **no consentimiento global para marketing u otros fines autónomos**. Ambos independientes y siempre inicialmente en `false`.
3. Ambos textos se consultan en pestaña nueva mediante `/legal/terminos` y `/legal/privacidad`, accesibles antes de iniciar sesión, con render completo, sin botón «Descargar», sin checkbox premarcado y **sin exigir scroll/lectura del modal**. Verificar `fetchLegalText()` (bytes + SHA) antes de activar, con mensajes de error y reintento; jamás computar aceptación por abrir un enlace.
4. El Libro de Reclamaciones es **un enlace externo**, no un módulo ni una colección Firestore. Reutilizar el Google Form existente `https://docs.google.com/forms/d/e/1FAIpQLSfobnWtfvGtFoDqeDMGcIQvFmBOpKdYkCFmyfA4rlzkHMAtKg/viewform?usp=publish-editor`. No afirmar en código ni informe que ya cumple todas las exigencias legales de un Libro virtual: el propietario debe verificar constancia, numeración y acceso público. Mostrar enlace discreto en *Información legal* de Ajustes y en el pie de login. Gmail de soporte/ARCO `deyvidparionaramos@gmail.com`.
5. Proyecto Firebase existente `migapos`, Firestore `(default)`, Hosting `migapos-peru`, ruta `/legal/*`, Google Auth, React. No crear dominio, servicio, Función, dependencia, colección nueva (reutilizar `users/{uid}/legal_acceptances/{id}`), nuevos listeners o consultas periódicas. No tocar POS, tickets, contratos, stock, caja, cuotas de sedes, PWA/offline ni facturación.
6. **Sin commit, push ni deploy** por Codex. Preparar resultado PASS y pasos manuales separados para Rules primero y Hosting después; no afirmar publicación de Rules solo porque el archivo local coincide.

## 1. Diagnóstico de problemas actuales (verificar en copia local)

- `InvitationOnboarding.jsx` solo activa cuenta; `onActivate()` sin confirmación. `useAuthManager.js` → `profileSession.js` → `acceptInvitation.js`: transacción actual crea `users/{uid}` y borra invitación sin evidencia legal.
- `App.jsx` abre `TermsModal.jsx` con documento extenso después de crear perfil. Ese orden debe cambiar; nuevos usuarios **no deben crear perfil sin evidencia versionada**.
- `frontend/src/features/legal/publication.js` en GitHub está en `state:'legacy'`, `privacy:null`; puede haberse editado localmente. La política no se muestra solo por existir el TXT. El validador rechaza archivos no registrados, que es correcto; **registrar el TXT, no quitar la guarda**.
- `firestore.rules`: `invitedProfile()` limita campos permitidos; `validLegalAcceptance()` presupone perfil existente mediante `currentUser()`; y `legalProfileUpdate()` protege usuarios preexistentes. Agregar un caso atómico **de primera invitación** sin abrir escrituras arbitrarias.
- El SHA de Términos que apareció en PowerShell fue `0f012fdb5bef0a04ec051701964852453b3cf62d804184840b03b86405dd4771`; **recalcular desde bytes actuales** por si cambió. Respetar Rules ya publicadas por el usuario y señalar si deben sincronizarse.
- Pruebas P20 del commit remoto aún esperan privacidad `null` y modal; deben adaptarse a publicación real **sin desactivar pruebas de seguridad**.

## 2. Manifiesto de publicación y validación

**Modificar** `frontend/src/features/legal/publication.js`:
- `legacyTerms` sigue siendo el documento actual 1.1, ruta `/legal/terminos-1.1.txt`, SHA-256 de bytes efectivos y fecha que realmente figure en él. `terms: legacyTerms`; no crear `terminos-2.0.txt` ni alterar contenido. `legalArchives` sin duplicados.
- `legalPublication.state: 'approved'` solo cuando ambos documentos pasan validación y se conoce el proveedor; `privacy: { version:'1.0', path:'/legal/privacidad-1.0.txt', sha256: SHA_DE_BYTES, dateLabel: fecha real }`.
- `provider` con nombre legal **Deyvid Alexander Pariona Ramos**, RUC **10735959811**, domicilio declarado **Av. Ramón Castilla S/N, Concepción, Junín, Perú**, `supportEmail` y `privacyEmail` ambos **deyvidparionaramos@gmail.com**, `complaintsRequired:true`, `complaintsUrl` del punto 0. **Verificar que nombre/domicilio coincidan con el TXT**, sin reescribirlo.
- `hasCurrentTerms` para dueños/cajeros requiere marcador firmado por ambas versiones y ambos SHA, no basta `hasAcceptedTerms:true` ni marcador que solo compruebe Términos. Conservar tratamiento especial de SuperAdmin y compatibilidad con perfiles históricos.

**Modificar** `frontend/config/validateLegalPublication.js`:
- Adaptar la condición `approved` que obliga a Términos distinto de 1.1: permitir 1.1 SOLO si es el mismo `legacyTerms` verificado (path + version + SHA) y privacidad 1.0 está publicada. No rebajar checks de proveedor, email, URL HTTPS, nombre, placeholders, listado exacto de archivos ni `sha256(Buffer)`.
- Verificar Rules contra `termsVersion:'1.1'`, `termsSha256:<actual>`, `privacyVersion:'1.0'`, `privacySha256:<actual>`. Si localmente ya están configuradas, reconciliar sin duplicar campos ni alterar hashes.
- Mantener `frontend/src/features/legal/LegalDocuments.jsx` / `fetchLegalText()` salvo cambios pequeños necesarios de enlaces, accesibilidad o estados. Mostrar doce apartados completos del TXT, no texto provisional. No regresar enlace de descarga.

## 3. Diseño exacto de activación nueva

**Modificar** `frontend/src/components/InvitationOnboarding.jsx`:
- Mantener tarjeta Nebula actual: identidad Google, negocio y rol. Añadir dos `<Input type="checkbox">`/componente UI existente con labels anteriores, controles independientes, estado inicial false y enlaces semánticos `<a href="/legal/..." target="_blank" rel="noopener noreferrer">`.
- Habilitar botón «Activar mi cuenta» **solo** si: ambos checks marcados, ambos TXT accesibles y verificados por `fetchLegalText()`, usuario online, invitación disponible y no hay operación en curso. Mostrar loader, errores comprensibles y reintento. No guardar confirmación en localStorage ni automatizar checks. Compatible 320 px, zoom 200%, teclado y focus visible.
- `onActivate({ acceptedTerms:true, acknowledgedPrivacy:true })`: booleanos transitorios; **no** permitir elegir versión/hash desde UI.

**Modificar** `frontend/src/hooks/useAuthManager.js` y `frontend/src/core/session/profileSession.js`:
- Propagar objeto a `session.current.accept(ack)` y a `acceptInvite(firebaseUser, ack)`; preservar identidad, `needs-invite`, lectura de invitación y confirmación `getProfileFromServer`.
- Corregir la captura de errores actual de `profileSession.accept()` que absorbe fallos: el componente debe recibir el error o recibir un resultado explícito, y volver a permitir el reintento **sin liberar POS ni esconder la invitación**. Conservar la lógica anti-doble-click, cierre de sesión, expiración, reconexión y sesión verificada.

**Modificar** `frontend/src/features/users/infrastructure/acceptInvitation.js`:
- Validar en inicio: `user.uid`, email verificado y `google.com`, `legalPublication.state === 'approved'`, ambos checks en true, ambos documentos verificados por UI; fuente efectiva de versiones/SHA **solo de manifiesto importado**. No guardar un booleano cliente como evidencia suficiente.
- En **una sola `runTransaction`**: leer `users/{uid}` y `invites/{email}`; validar invitación (correo, rol, tenant, estado y asignación); crear `users/{uid}` con perfil autorizado y marcador `legalAcceptance`; crear `users/{uid}/legal_acceptances/{id}` con UID, businessId, role, `termsVersion`, `termsSha256`, `privacyVersion`, `privacySha256`, `acceptedAt: serverTimestamp()`; borrar invitación. Ninguna de esas operaciones puede confirmar de manera parcial.
- Crear ID de evidencia una vez **fuera** de callback reintentable para evitar duplicados (mismo ID en reintentos). No crear perfil con `hasAcceptedTerms:true` en lugar de evidencia. Si ya existe perfil, no volver a activar ni borrar de nuevo invitación; delegar a la ruta de regularización.
- Compartir constructor puro de evidencia/marcador con `frontend/src/features/legal/acceptanceRepository.js` si reduce duplicación. Añadir `privacyVersion` y `privacySha256` a `legalAcceptanceMarker()` y a `hasCurrentTerms()` para que cambios futuros en privacidad exijan revalidación; mantener validación de ID 20 caracteres y propiedad `businessId`/rol/UID.

## 4. Reglas Firestore: cierre real de seguridad

**Modificar solo los helpers legales necesarios en `firestore.rules`**, sin reestructurar el resto:
- `legalPublication()` anclar exactamente cuatro valores calculados: Términos 1.1 y Privacidad 1.0 con sus hashes actuales; conservar la forma válida para `validateLegalPublication()`.
- `invitedProfile(userId)`: permitir marcador `legalAcceptance` SOLO si `getAfter()` del documento de evidencia *nuevo* del mismo UID/negocio/rol/versiones/hashes coincide, la invitación válida del mismo email fue consumida en **la misma transacción** y la licencia/negocio siguen autorizados; los campos de perfil permitidos siguen limitados a los autorizados más ese marcador.
- `validLegalAcceptance(userId,id)`: separar **(a) alta nueva con invitación** de **(b) usuario existente**, manteniendo comprobación exacta de claves, ID, `request.auth.uid`, negocio/rol, `acceptedAt == request.time`, versión/hash fijados por Rules y `getAfter()` del perfil con marcador íntegro. Para nueva alta no usar `currentUser()` sobre un perfil que aún no existe; verificar contra invitación, autenticación y perfil `getAfter()` con reglas anti-sustitución. Prohibir modificación, borrado y listado de evidencias como ahora.
- `legalProfileUpdate(userId,data)`: adaptar comparación de marcador a incluir PRIVACIDAD además de términos; mantener transacción atómica para perfiles preexistentes. `legacyTermsUpdate()` debe mantener ruta SuperAdmin y rechazar bypass por owner/cajero una vez publicado.
- No ampliar `allow create users` ni `allow update` de otros módulos. Validar límites `get()/getAfter()` de Rules y no crear consultas adicionales por sesión. Si Rules del último despliegue están cambiadas, reportar diferencia y **no autopublicarlas**.

## 5. Cuentas ya existentes y SuperAdmin (sin relectura de modal)

- **Crear o reutilizar** una tarjeta compacta, p. ej. `frontend/src/components/LegalAcceptanceCard.jsx`, con dos checks + enlaces, **sin texto legal largo ni modal**. `frontend/src/App.jsx` la muestra únicamente cuando un perfil dueño/cajero *existente* aún no tiene evidencia vigente. Bloquear el POS hasta confirmar servidor; reutilizar `useAcceptTerms.js` → `userRepository.acceptTerms` → `recordLegalAcceptance` y el mismo manifiesto/versiones; no crear perfil o invitación de nuevo.
- SuperAdmin conserva su acceso y aceptación histórica de 1.1. Si necesita aceptar por primera vez, usar una UI compacta coherente con su mecanismo legacy, **no** imponerle evidencia por `businessId:platform-admin` que Rules prohíben para dueño/cajero. No introducir bloqueo irreversible del SuperAdmin.
- `frontend/src/components/TermsModal.jsx`: retirar de login obligatorio (y eliminar solo si no hay otros usos); mantener funciones de consulta en `LegalDocuments` públicas.
- `frontend/src/core/session/accessState.js` / `useAuthManager`: conservar status `offline-assisted` solo para perfiles previamente aceptados y válidos; jamás mostrar POS a nuevo perfil sin evidencia. No aumentar listeners ni usar caché como prueba legal.

## 6. Enlaces de consulta y UX

- `frontend/src/modules/Auth.jsx`: antes de login mostrar Términos, Privacidad, Libro (external), Soporte (mailto) con `LegalLinks`; texto limpio, sin abrir modal al iniciar sesión. No requiere login para leer documentos.
- `frontend/src/modules/Settings.jsx`: tarjeta existente «Información legal»: mostrar Términos, Privacidad, Libro y Soporte; eliminar `documentsOnly` si corresponde; no duplicar en sidebar ni `BottomNav`.
- Para cajeros sin Ajustes conservar acceso desde área de cuenta existente `AppLayout.jsx` y móvil, sin introducir un nuevo módulo legal. Validar enlaces `target=_blank`/noopener y estilos de responsive.
- No crear formulario de reclamos dentro de POS. `complaintsUrl` enlaza al Google Form conocido; solo publicar como canal efectivo tras prueba de envío y copia realizada por propietario.

## 7. Pruebas imprescindibles y no-regresión

**Modificar lo necesario** en:
- `tests/ui-security.test.mjs`: manifest aprobado, Términos 1.1 SHA vigente, Privacidad 1.0 12 secciones, rutas públicas, lista de assets, integridad anti-tampering y rechazo de proveedores/archivos incompletos. No exigir términos 2.0 ficticios al aprobar la primera publicación; conservar fixtures negativos con versiones distintas cuando validen escenarios futuros.
- `tests/p20-legal.browser.test.mjs` y fixture `tests/p20-legal.browser.html`: verificar 2 checks inicialmente vacíos y bloqueo hasta ambos; ninguna lectura modal obligatoria; enlaces que cargan texto íntegro; TXT modificado rechaza confirmación; documentos accesibles antes de login; teclado, móvil 320px y 200% zoom; roles owner/cashier y cuenta de prueba existente.
- `tests/spark.rules.test.mjs`: transacción **nueva** perfil+evidencia+consumo de invitación PASS; perfil sin evidencia, hash incorrecto, privacidad omitida, rol/tenant alterado, invocación no autorizada, invitación revocada, perfil existente falsificado, mutación/borrado/lista de evidencia, reintento concurrente y offline DENIED; registro de usuario preexistente PASS; SuperAdmin no bloqueado. Probar con Rules reales en emulador (no solo mock), incluidas regresiones de reglas financieras.
- `tests/session-recovery.test.mjs` y, si toca, `tests/p15-session.browser.test.mjs`: propagación de payload, errores, no duplicación de transacción, volver de `needs-invite` correctamente, reconexión sin aceptación falsa.
- `frontend/src/features/users/infrastructure/userRepository.js`, `frontend/src/features/users/hooks/useAcceptTerms.js`, `frontend/src/features/legal/acceptanceRepository.js`: tocar solo si es necesario para la ruta actual.

**Comandos** (usar scripts existentes; no instalar librerías):
```powershell
cd C:\Proyectos\MigaPOS
node --test tests/ui-security.test.mjs
npm run test:spark:rules
npm run release:check -- --env production
npm run release:build -- --env production
npm run check:build
node --test tests/p20-legal.browser.test.mjs tests/session-recovery.test.mjs tests/p15-session.browser.test.mjs
npm --prefix frontend run lint
git diff --check
```
Si una prueba falla, corregir causa, no editar aserciones para ocultar el fallo ni eliminar guardas. Ejecutar regresiones adicionales P08/P18/P19 y POS si cambios de sesión los afectan, sin tocar sus dominios.

## 8. Criterios de aceptación y entrega

1. El TXT de privacidad existente **permanece idéntico byte por byte**, con SHA correcto; Términos 1.1 actual también sin reescritura. Ningún nuevo documento legal redactado ni 2.0 artificial.
2. En primera activación hay dos checks desmarcados; sin ambos no se envía ninguna escritura. Con ambos, documentos verificados y conexión activa, ocurre exactamente una transacción y la cuenta entra una vez que el perfil se verifica en servidor.
3. Firestore Rules rechaza creación de perfil nueva sin evidencia legal y cualquier intento de falsificar documentos, marcas, versiones o ámbitos. Evidencia vinculada a **ambos** documentos, sin IP ni datos de dispositivo.
4. Perfiles antiguos sin aceptación vigente ven tarjeta ligera y no POS; perfiles conformes entran directamente; SuperAdmin sin regresiones. No aparece un modal legal largo forzado al iniciar sesión.
5. Antes y después de login, `/legal/terminos` y `/legal/privacidad` muestran textos completos; Ajustes expone links y Libro externo, sin ensuciar barra principal.
6. Checks de build, SHA, test de Rules y sesión **PASS**. Si falta verificación jurídica o de recepción de reclamos, informar como **bloqueante comercial**, NO maquillar cumplimiento técnico o afirmar que Google Form por sí solo satisface requisitos oficiales.
7. **Salida de Codex:** máximo 12 líneas: archivos modificados (agrupados), pruebas PASS/FAIL, hashes, bloqueantes reales y pasos manuales. No hacer commit, push, deploy. Reutilizar documentos existentes y evitar extensas explicaciones.

**Orden posterior de lanzamiento (manual, NO Codex):** revisión de cambios y documentación; guardar copia de Rules actualmente publicadas; commit/push; CI `success` del SHA preciso; publicar Rules de Firestore `(default)` antes de servir nuevo Hosting; luego desplegar el Hosting existente `migapos-peru` mediante el procedimiento de release validado y atestado del repositorio; verificar activación real de nueva cuenta y rutas legales. No publicar versiones mezcladas ni saltarse validaciones de `scripts/release.mjs`.
