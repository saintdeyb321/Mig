# Prompt Codex — P20: dos ventanas legales para salida comercial MigaPOS (actualizado 14/11/2026)

Eres arquitecto senior React/Firebase Spark y especialista en trazabilidad técnica de aceptación de contratos. No eres abogado; no inventes una base legal ni sustituyas su aprobación profesional.

**Repositorio local:** `C:\Proyectos\MigaPOS`. Trabaja en la rama que tenga el propietario sin cambiarla. **Base auditada:** `f7db1c393cd46926d560fc7aa51137e3c0638880`; comprueba el estado de Git, ya que pueden existir commits posteriores. Lee *completos* y contrasta los cuatro archivos de `docs/`:

1. `MIGAPOS-P20-AUDITORIA-Y-PLAN-LEGAL.md` (incluye ficha de datos del proveedor y normas verificadas).
2. `MIGAPOS-TERMINOS-v2-BORRADOR.md` (veinte secciones, contrato SaaS y anexo de tratamiento de datos en el mismo documento).
3. `MIGAPOS-PRIVACIDAD-v1-BORRADOR.md` (tratamiento responsable/encargado y titulares).
4. `MIGAPOS-P20-PROMPT-CODEX-LEGAL.md` (este prompt).

## Condición inicial innegociable

**No actives documentos con placeholders.** El usuario completará datos de identidad fiscal, soporte, privacidad, reclamos, comercialización, retención y terceros antes de aceptar la salida a producción. Si persisten placeholders, implementar como *draft* no publicado y dejar el feature flag/version anterior activa. Nunca incorporar texto 'borrador' como texto contractual presentado a clientes por error.

## Objetivo: exactamente dos ventanas, no otro Hosting

- **Ventana 1: Términos y Condiciones**: diseño Nebula, contenido integral 2.0 separado del JSX, resumen orientador pero texto completo accesible, scroll interno, áreas seguras, accesibilidad 320px/200% zoom, controles de aceptación visibles, vínculo a texto versionado. Incluir dentro de estos Términos las condiciones comerciales y anexo DPA/encargo de datos; sin tercer modal legal.
- **Ventana 2: Política de Privacidad**: diseño Nebula consistente, texto completo 1.0 independiente, lectura y navegación sin forzar consentimiento genérico. Debe ser consultable antes del login y después. No forzar consentimiento opcional de marketing si no se utiliza; si existe, requerir autorización autónoma y revocable.
- **Sin nuevo Firebase Hosting site ni dominio**: usar rutas o assets estáticos públicos de `migapos-peru` y enlaces navegables desde acceso, pie y producto; no exponer datos por Rules públicas.

## Requisito añadido P20-PRIV-TICKET — Ticket POS sin nombre de cajero

- **Solicitud expresa:** en los tickets de ventas rápidas POS que se entregan a consumidores, **NO mostrar el nombre ni los apellidos del cajero, ni la fila/etiqueta `CAJERO:`**. Esto aplica a impresión, vista de impresión y reimpresión de tickets históricos, aunque `cashierName` exista en los datos de la venta. Es minimización de datos personales; no afirmes que su presencia anterior equivalía automáticamente a infracción legal.
- **Punto exacto auditado en `f7db1c3`:** `frontend/src/utils/receiptTemplate.js` línea 110 interpola `saleData.cashierName` en el HTML con `CAJERO:`. `frontend/src/features/sales/hooks/usePOS.js` línea 193 incorpora el campo al objeto de venta. **Elimina únicamente la interpolación pública en el generador de tickets**; no borres el campo de ventas ni migres Firestore/IndexedDB.
- Conserva `userId` / identificadores de responsable, `cashierName` cuando ya forme parte del registro interno, auditoría de caja y trazabilidad de cobros/ventas/anulaciones. No ocultes el responsable de vistas administrativas autorizadas; no alteres identidad, autorización, inventario, movimientos ni transacciones.
- Conserva los otros campos impresos (empresa, RUC, sucursal, dirección/teléfono, referencia, fecha y hora, productos, totales, pagos, vuelto, anulación, advertencias offline) y las protecciones anti-XSS. No modifiques plantillas de contratos ni el régimen de comprobantes SUNAT.
- **Actualizar pruebas**: `tests/ui-security.test.mjs` ahora **exige** que se imprima `CAJERO:` en su test de escape HTML (líneas 53–59). Cambiar esa expectativa por pruebas de ausencia de etiqueta/nombre, incluso si el dato histórico existe, sin retirar la cobertura de inyección HTML en el resto del ticket. Comprobar el flujo de `generateReceiptHTML` y reimpresiones, conservar casos con/ sin `cashierName`, ejecutar regresión anti-XSS y POS.
- Esta modificación de **presentación externa únicamente** está permitida dentro del alcance P20 y no requiere cambios de Rules, migraciones ni nuevos consentimientos. Entregar resultado y pruebas específicas en `docs/RESULTADOS-P20-LEGAL.md`.

## Archivos y flujos a auditar

`frontend/src/components/TermsModal.jsx`, `frontend/src/config/brand.js`, `frontend/src/App.jsx`, `frontend/src/features/users/hooks/useAcceptTerms.js`, `frontend/src/features/users/infrastructure/userRepository.js`, `firestore.rules`, `useAuthManager.js`, Onboarding e invitaciones, pruebas de aceptación y acceso, UX compartida. Detectar todo código que confíe en `hasAcceptedTerms` sin comparar la versión vigente.

## Contratación y roles

- Contratación del SaaS ligada al dueño/representante del negocio: solo éste declara contar con facultad de contratar y acepta las condiciones económicas; no atribuir esa facultad a cajeros por su check.
- Cada usuario autorizado acepta reglas de uso para su rol. La privacidad es un aviso informativo; cada tratamiento que exija consentimiento voluntario debe tener su propio check separado, no premarcado.
- Versionar de forma trazable **T&C 2.0** y **Privacidad 1.0**; conservar el historial 1.1 y evitar que un booleano viejo equivalga automáticamente a aceptación de la versión nueva.
- Guardar evidencia adecuada a Spark con UID real, `businessId`, rol, versión, hash SHA-256 del documento exacto, fecha del servidor y versión del aviso de privacidad mostrado. Preferir registro append-only con Rules de create sin update/delete, validación de identidad/versiones y pruebas; no suponer que una escritura cliente equivale a prueba inviolable. Evitar IP, fingerprint y datos no necesarios. No atribuir al click certificado criptográfico de firma digital.
- Ante nuevo T&C, reaceptación afirmativa cuando proceda; si falta red/confirmación del servidor no declarar que fue aceptado. Preservar historial y explicar estado accesible, sin dejar usuarios bloqueados por error silencioso.

## Exactitud legal y funcional

- Implementar las **dos políticas redactadas** tras validación de datos del proveedor: Ley 29733, DS 016-2024-JUS, Ley 29571 y Ley 32495, DL 1729, Código Civil 1328, DL 822. Nunca prometer inmunidad, exención universal por Firebase, eliminación de datos a los 60 días, reembolso inexistente, SLA 24/7 ni renuncia a derechos de consumidores.
- Reflejar el P08 real: sin internet se crean borradores sin cobro confirmado, no se asume sincronización automática. Avisar sobre persistencia local, estado de recibos y límites de exportación de fotografías P18; no cambiar la lógica financiera.
- Contrastar con la realidad técnica `Firestore nam5`, Firebase Auth, cookies/analítica, protección contra incidentes, datos que son responsabilidad de cada pastelería, acceso de soporte, retención efectiva. Mantener `[COMPLETAR]` únicamente en archivos de trabajo, **no** en UI de producción.
- Canal de derechos ARCO y Libro de Reclamaciones deben ser reales. Si el Libro resulta obligatorio para la operación comercial, no dar GO legal sin que esté accesible y funcional. No simular enlaces. Registrar el estado en informe.
- No confundir un ticket de caja con comprobante SUNAT. MigaPOS no verifica automáticamente transferencias de Yape/Plin.

## Rules y despliegue

Si agregas nuevos documentos de evidencia en Firestore, escribe Rules precisas y pruebas positivas/negativas en `demo-migapos`, evitando lectura/escritura entre tenants. Si se modifican Rules, explicar con exactitud el paso manual previo de publicar esas reglas antes del nuevo Hosting y la compatibilidad con perfiles antiguos; no publicarlas tú. Si la evidencia puede reforzarse sin Rules adicionales, explica límites reales, sin inventar inmutabilidad.

No cambiar lógica financiera ni persistencia de cobros, ventas, caja, licencias, contratos, inventario, P18, P19 o precios para acomodar un borrador legal. La única excepción deliberada en las ventas es la **presentación pública del ticket POS** indicada en P20-PRIV-TICKET. Evitar dependencias nuevas si no son necesarias. Mantener la estética Nebula, accesibilidad y una sola experiencia de dos ventanas.

**Pruebas:** incluir cobertura P20-PRIV-TICKET contra divulgación de `cashierName` en recibos POS y reimpresiones; lint, build/PWA, `npm run audit:security`, `npm run check:release`, pruebas de usuarios y Rules, inicio propietario/cajero, v1.1 vs 2.0, aceptación y retorno, borrado histórico impedido, error de red, accesibilidad y mobile 320/390px, smoke del login público, regresiones relevantes P08/P18/P19. No modificar el pipeline para hacerlo verde mediante omisión de pruebas.

**Entrega** `docs/RESULTADOS-P20-LEGAL.md`: rutas, campos pendientes, matriz de pruebas, riesgos jurídicos, estado DRAFT/GO técnico/NO-GO jurídico y guía de activación manual. NO commit, NO push, NO merge, NO deploy, NO Firebase de producción.
