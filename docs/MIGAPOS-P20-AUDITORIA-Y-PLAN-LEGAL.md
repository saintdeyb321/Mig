# MigaPOS P20 — Auditoría legal y plan de adecuación (14/11/2026)

**Actualización normativa:** 14 de noviembre de 2026. **Rama/SHA inspeccionado:** `fix/migapos-production-readiness` / `f7db1c393cd46926d560fc7aa51137e3c0638880`.

## Hallazgos verificados del repositorio

1. `frontend/src/components/TermsModal.jsx` contiene el documento contractual incrustado en JSX (versión mostrada 1.1, fecha abril de 2026) y una sola casilla que afirma consentir términos **y tratamiento de datos**.
2. `frontend/src/config/brand.js`: `termsVersion: '1.1'`.
3. `frontend/src/App.jsx`: `user.hasAcceptedTerms !== true` es la única condición de versión. **Una aceptación antigua habilita la nueva versión sin reaceptación.**
4. `frontend/src/features/users/hooks/useAcceptTerms.js`: persiste aceptación mediante `acceptTerms(user.uid)` y recarga. No se observa aquí un mecanismo de archivo del texto exacto ni prueba independiente del clic.
5. `frontend/src/features/users/infrastructure/userRepository.js`, líneas 44-46: el perfil almacena `hasAcceptedTerms`, `termsAcceptedAt` (serverTimestamp) y `termsVersion`.
6. `firestore.rules`, `personalUpdate` (aprox. líneas 171–181): la versión solo se comprueba como cadena, no se ata al documento legal vigente. Un usuario puede escribir sus propios campos de aceptación, aunque no modificar identidad ni negocio mediante esa regla.
7. No se encontró un archivo independiente de Política de Privacidad o un DPA en el árbol de archivos bajo nombres de privacy/privacidad/terms/legal. El modal dice que existe una política, pero no aporta enlace al texto accesible.
8. Contradicciones y riesgos en el modal actual: exoneración total por Firebase/terceros; renuncia absoluta por caja/personal; eliminación irrecurrible tras 60 días de mora (sin comprobar implementación); límite contractual de 12 meses sin excepciones explícitas; jurisdicción incondicionada Huancayo; aceptación de privacidad fusionada.
9. El sistema usa roles `dueño` y `cajero` y la invitación al personal; separar consentimiento del contratante con potestad de representación y acatamiento de normas de uso por empleados.
10. El sistema usa Google/Firebase, datos locales en IndexedDB y fotografías de contratos; las fotografías P18 están fuera del alcance de algunos respaldos. Las garantías del texto deben reflejar lo realmente probado.
11. **Ticket POS y privacidad del personal (solicitud del propietario):** `frontend/src/utils/receiptTemplate.js`, línea 110 del SHA auditado, imprime el campo `cashierName` como `CAJERO: Nombre Apellido` en el ticket destinado al consumidor. `frontend/src/features/sales/hooks/usePOS.js`, línea 193, incorpora `cashierName` al objeto de venta para trazabilidad. `tests/ui-security.test.mjs`, líneas 53–59, exige actualmente que el nombre aparezca en el HTML del ticket. La medida solicitada es **suprimir exclusivamente la exposición externa**, sin borrar ni alterar la identidad del responsable en registros, auditorías, permisos o controles de caja. Mostrar el nombre no demuestra por sí solo una infracción legal automática; su supresión es una medida prudente de minimización de datos.

## Marco legal de referencia (verificar con abogado peruano)

- Código Civil peruano (D. Leg. 295), art. 1328: no son válidas cláusulas que excluyan/limiten responsabilidad por dolo, culpa inexcusable ni obligaciones de orden público.
- Ley 29571, arts. 49–51: prohíbe cláusulas abusivas cuando hay relación de consumo; la protección puede llegar a microempresarios bajo condiciones específicas, no presumir que todo B2B queda fuera.
- Ley 29733 y DS 016-2024-JUS (vigente desde 31/03/2025): transparencia, roles responsable/encargado, seguridad, incidentes, registro de bancos, transferencias y derechos ARCO.
- Ley 32495 (11/11/2025) y D. Leg. 1729 (12/02/2026), según ámbito y vigencia aplicable: Libro de Reclamaciones y atención digital accesible; evitar diseños coercitivos.
- D. Leg. 822, protección de software y límites legales de uso.

Fuentes oficiales o institucionales:
- https://busquedas.elperuano.pe/dispositivo/SE/2349653-1
- https://www.gob.pe/institucion/anpd/pages/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales
- https://busquedas.elperuano.pe/dispositivo/NL/2457203-1
- https://busquedas.elperuano.pe/dispositivo/NL/2486266-3
- https://consumidor.gob.pe/libro-de-reclamaciones/
- https://www.sat.gob.pe/TransparenciaV3/Portals/0/Docs/NormasOtrasEntidades/DECRETO_LEGISLATIVO_295_v5.pdf

## Plan técnico mínimo

**Fase 0 — requisitos no inventables**: confirmar RUC/razón social/domicilio/contactos; canales legales; planes y facturación del SaaS; alcance real de exportación, conservación y borrado; proveedores y regiones de datos; diseño de Libro de Reclamaciones según ley y modelo comercial. Obtener revisión de asesoría legal peruana.

**Fase 1 — contenido**: instalar documentos versionados independientes para Términos, Privacidad y Anexo de tratamiento de datos; destacar advertencias POS (no SUNAT, QR no acredita pago), offline, baja, datos, seguridad y responsabilidad proporcionada. Mantener histórico de versiones inmutables junto a la release. Sin afirmaciones absolutas. No poner texto comercial en JSX.

**Fase 2 — aceptación**: solo el representante/propietario acepta condiciones de contratación por el negocio; el personal acepta reglas de uso y recibe aviso de privacidad. No confundir el booleano `hasAcceptedTerms` con conformidad a cualquier versión futura. Comparar versión vigente y persistida; incluir checksum SHA-256 del texto publicado, fecha-hora servidor, UID, negocio y documento/versión por separado, con protección de datos. No registrar IP u otros identificadores extra sin necesidad y base legal.

**Fase 3 — reglas/seguridad**: elegir estrategia compatible con Firestore Spark para limitar las versiones aceptables y el alcance de edición a la cuenta propia. Probar con emuladores que no se pueda aceptar una versión inventada, falsificar otro usuario ni alterar evidencia histórica; revisar autorizaciones del superadmin. Si se necesita cambiar Rules, entregar archivos y pruebas para publicación **manual** posterior del propietario, nunca desplegarlas automáticamente.

**Fase 4 — UX legal**: modal cómodo para móviles (320px y teclado nativo), resúmenes claros y texto íntegro legible, enlace descargable/accesible a cada documento, casillas separadas para aceptación contractual y consentimientos opcionales. Ninguna casilla premarcada; botón bloqueado hasta acción explícita. Footer público con Términos, Privacidad, identificación del proveedor y Libro de Reclamaciones aplicable, incluso antes del login. No usar consentimiento implícito por continuar navegando.

**Fase 4B — Minimización en tickets POS entregados al consumidor (P20-PRIV-TICKET):** `frontend/src/utils/receiptTemplate.js` genera el HTML de venta rápida y contiene la interpolación `${saleData.cashierName ? ...}` que imprime `CAJERO:` y el nombre. Quitar esa fila del HTML **para toda impresión y reimpresión POS**, incluso cuando la venta sea histórica, tenga `cashierName` registrado o haya sido borrador/pendiente. Mantener intactos el número/ID del ticket, fecha, negocio/sucursal, productos, importes, método de pago, notas/anulaciones y advertencias financieras existentes. No modificar los datos de venta ni quitar `cashierName`, `userId` o `cashierId` de Firestore, IndexedDB, caja, historial interno, registros ni reportes internos autorizados. No tocar los comprobantes de contratos ni generar documentos fiscales nuevos. Revisar todas las llamadas a `generateReceiptHTML` y rutas que compartan la plantilla.

**Prueba de regresión obligatoria para P20-PRIV-TICKET:** ajustar `tests/ui-security.test.mjs`, que hoy exige `CAJERO:`. Probar tanto con venta nueva como con venta histórica que incluye `cashierName` (incluido un nombre con caracteres especiales): el HTML impreso **no contiene el nombre ni la etiqueta `CAJERO`**; conserva los demás campos y las medidas anti-XSS. Probar impresión desde POS y, donde exista, reimpresión. No eliminar el test anti-XSS; actualizarlo para cubrir los campos que siguen impresos.

**Fase 5 — pruebas**: casos propietario nuevo, cajero invitado, perfil existente 1.1, version 2.0, actualización sin aceptación, sesión offline, pérdida de permisos, teléfonos 320/390px, zoom 200%, controles de soporte y privacidad, enlaces, accesibilidad y regresiones de ventas/licencias. No incrementar lecturas Firestore permanentes por el modal. Documentar pruebas en `docs/RESULTADOS-P20-LEGAL.md`.

## No-GO legal hasta que

- se hayan sustituido campos `[PENDIENTE]` por datos exactos;
- exista Política de Privacidad realmente accesible y mecanismo ARCO;
- se compruebe el mecanismo de reclamos exigible;
- roles, data inventory, transferencias y obligaciones de tratamiento estén documentados;
- no se prometa expiración/eliminación/soporte inexistente;
- abogado especializado en Perú valide términos, proveedor real y anexos;
- CI y pruebas de aceptación sean verdes antes de deploy.

**No modificar precios, eliminaciones, contratos financieros ni políticas de datos solo para «hacer coincidir» el texto. Primero comprobar la realidad y acordar condiciones.**


## Investigación y decisiones para lanzamiento — 14/11/2026

**Resultado jurídico operativo:** ninguna cláusula confiere «inmunidad»; la protección real combina contrato claro, condiciones comerciales precontratación, controles de datos y seguridad, canales efectivos de reclamo, límites razonables y evidencia de cumplimiento.

| Ámbito | Norma/guía contrastada | Implicación específica MigaPOS |
| --- | --- | --- |
| Exoneraciones | Código Civil, art. 1328 | No excluir dolo, culpa inexcusable ni obligaciones de orden público, incluso si interviene Firebase. |
| Protección del consumidor | Ley 29571, art. IV 1.2 y arts. 49–51 | La venta a microempresarios puede quedar protegida por reglas de consumo; las cláusulas abusivas no blindan al proveedor. |
| Libro de reclamaciones | Ley 32495 y orientación Indecopi | Cuando corresponda a plataforma/establecimiento, enlace visible, acceso gratuito, constancia, respuesta a reclamos en 15 días hábiles. No sustituir el Libro por un correo sin evaluación legal. |
| Venta y atención digital | D. Leg. 1729 (2026) | Facilitar canal digital eficaz para reclamos; evitar manipulación de interfaz y renovaciones coercitivas. |
| Protección de datos | Ley 29733 y D.S. 016-2024-JUS, vigente desde 31/03/2025 | Inventario, transparencia, medidas de seguridad, responsable/encargado, análisis de subencargados, incidentes; art. 34 establece notificación de ciertos incidentes en 48 h; el encargado comunica inmediatamente al responsable. |
| Bancos de datos | ANPD, información actualizada en 2026 | Inscripción cuando se es titular del banco; trámite gratuito y de aprobación automática. Evaluar flujos internacionales. |
| Derechos ARCO | ANPD | Acceso 20 días hábiles; rectificación/cancelación/oposición 10 días hábiles, bajo requisitos aplicables. |
| Firma/aceptación | Ley 27269 y marco civil | El clic autenticado puede ser evidencia de manifestación de voluntad, pero no presentarlo como firma digital certificada. Guardar texto/versiones y trazabilidad. |
| Software | D. Leg. 822, arts. 69–74 | Protege el software, con excepciones legales. Prohibir reventa/copia ilícita sin impedir derechos legítimos. |
| Fiscalidad | SUNAT | Separar la facturación que MigaPOS emite por el SaaS de los tickets administrativos que generan los negocios; no prometer emisión de CPE SUNAT dentro del POS. |
| Infraestructura | Firebase Docs | Repositorio indica `nam5` para Firestore (EE. UU. multirregional); Authentication en EE. UU.; confirmar proyecto desplegado y otros servicios por separado. |

### Datos que debe confirmar el proveedor antes de generar versión PUBLICABLE

No registrar un DNI personal, contraseña, número de tarjeta ni claves de Firebase en documentos. RUC y datos comerciales podrán figurar en términos públicos según corresponda.

1. **Identidad fiscal/contratante:** persona natural con negocio o empresa; nombre/razón social; RUC; domicilio legal o fiscal que deba publicarse; representante si corresponde. Confirmar actividad y emisión de comprobantes propios por la suscripción.
2. **Contactos:** correo soporte, correo privacidad/ARCO, correo reclamos (puede coincidir), horario y canal usado para notificaciones. Confirmar URL del Libro de Reclamaciones *real y funcional* o necesidad de implementarlo antes de vender.
3. **Planes y promesas comerciales:** precio(s) en S/; impuestos incluidos o adicionales; límite por sede/usuario; prueba gratis sí/no; periodicidad, forma de pago, renovación automática o manual, cancelación, reembolsos y plazos reales de soporte. No inventar SLA ni garantía 24/7.
4. **Cobro y comprobante del SaaS:** quién cobra, Yape/transferencia/gateway; si la suscripción se activa manualmente; boleta/factura de SUNAT propia; comprobación de pagos y atención de errores de cobro.
5. **Baja, exportación y conservación:** qué ocurre con los datos cuando vence la licencia; funciones efectivamente disponibles de exportación y restauración; si hay plan operativo de retención/eliminación y cuánto dura; confirmar que el respaldo actual incluya o excluya imágenes P18.
6. **Datos personales:** qué campos se registran de propietarios/cajeros/clientes finales; fotos con personas o menores; si hay marketing por WhatsApp/correo, analytics o soporte que abra datos de clientes; tratamientos de alta sensibilidad que deban evitarse.
7. **Alcance comercial y legal:** ¿solo Perú? ¿exclusivamente pastelerías? ¿sede legal para conflictos empresariales? ¿contratos suscritos por dueño con facultades? ¿habrá clientes en otros países?
8. **Condiciones de servicios externos:** confirmar proyecto Firestore producción en `nam5`, Google Auth, origen de QR, correos y dominios externos, y si se utilizan terceros adicionales para hosting, analítica o soporte.

### Diseño final requerido: exactamente DOS ventanas legales, sin nuevo sitio Firebase

- **Ventana A — Términos y Condiciones**: documento contractual completo y versión pública, incluyendo el anexo de tratamiento de datos y las condiciones comerciales reales. Casilla afirmativa no premarcada para su aceptación. Propietario: declarará legitimación para representar al negocio. Cajero: aceptación de reglas de uso de su rol sin fingir que puede vincular comercialmente a su empleador.
- **Ventana B — Política de Privacidad**: texto íntegro independiente, accesible con o sin sesión, lectura y derechos ARCO; no imponer consentimiento general para tratamientos necesarios cuando la ley permite base distinta. Consentimientos opcionales (marketing) separados solo si realmente se implementan. La política no sustituye las obligaciones técnicas de protección de datos.
- Implementación responsive en modales/páginas del **mismo Hosting actual** `migapos-peru`, sin dominio ni sitio nuevo, con links públicos a los textos oficiales versionados. El texto vigente y su checksum deben coincidir con la evidencia grabada.
- Versiones de trabajo: **Términos 2.0** y **Privacidad 1.0**. No habilitarlas en producción hasta completar datos y aprobación legal; mostrar 1.1 hasta autorización explícita. Nunca rellenar información contractual con valores simulados.
- La ficha de aceptación antigua de Firestore contiene `hasAcceptedTerms`, `termsAcceptedAt` y `termsVersion`. El valor booleano solo no basta para demostrar aceptación 2.0. Crear evidencia nueva atribuible a UID/tenant/doc/version/hash/tiempo de servidor y proteger historial con Rules o indicar limitación si se reutiliza el perfil. Toda regla nueva necesita pruebas de emulador y publicación supervisada separada, nunca hacer el bypass de Hosting para alterar reglas silenciosamente.

### Verificaciones de salida

- No texto `[PENDIENTE]` visible a clientes en modalidad `published`; no acceso previo a aceptación contractual de nueva versión cuando corresponda; no checkbox de marketing preseleccionado; términos y privacidad disponibles antes del inicio de sesión.
- QA propietario y cajero, perfiles v1.1 y nuevos, cambio de versión y dos documentos, reingreso tras aceptar, error/reintento de Firestore, sin red, enlaces a Libro reales, viewport 320–430 px, teclado, accesibilidad y regresiones de caja/contratos/P18/P19.
- QA P20-PRIV-TICKET: confirmar que el nombre y la etiqueta del cajero no figuran en ningún ticket POS público, impreso, guardado como HTML ni reimpreso, incluidos tickets anteriores que aún conservan `cashierName` internamente; el historial/auditoría y los totales siguen correctos.
- No ofrecer exportación ni borrado de fotos no existente, restauraciones inexistentes, SLA o indemnización ilimitada de cualquier causa.
- Documento `docs/RESULTADOS-P20-LEGAL.md` separa GO técnico de GO jurídico/comercial; cerrar solo tras evidencia del propietario + revisión de abogado peruano.

### Fuentes verificadas (organismos y textos oficiales)

- Código Civil art. 1328: https://www.sat.gob.pe/TransparenciaV3/Portals/0/Docs/NormasOtrasEntidades/DECRETO_LEGISLATIVO_295_v5.pdf
- Ley 29571: https://busquedas.elperuano.pe/dispositivo/NL/538113-1
- D.S. 016-2024-JUS: https://busquedas.elperuano.pe/dispositivo/SE/2349653-1
- Ley 32495: https://busquedas.elperuano.pe/dispositivo/NL/2457203-1
- D. Leg. 1729: https://busquedas.elperuano.pe/dispositivo/NL/2486266-3
- Libro/15 días Indecopi: https://consumidor.gob.pe/libro-de-reclamaciones/
- Inscripción ANPD: https://www.gob.pe/institucion/anpd/pages/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales
- Derechos ARCO: https://www.gob.pe/9269-iniciar-procedimiento-para-el-ejercicio-de-derechos-de-acceso-rectificacion-cancelacion-y-oposicion
- Firebase regiones: https://firebase.google.com/docs/firestore/locations
- Firebase procesamiento: https://firebase.google.com/support/privacy/
- Software D. Leg. 822: https://www.gob.pe/institucion/pcm/normas-legales/1670023-822
