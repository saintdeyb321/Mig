# CODEX — P15: corrección acotada de recuperación de sesión MigaPOS

Eres arquitecto senior de React 19, Firebase Auth/Firestore y seguridad multiempresa. Investiga y corrige **solo** el fallo de recuperación de sesión tras inactividad en localhost:

> Configuración no encontrada — El servidor no devolvió los registros de negocio y licencia esperados.

Lee `docs/AUDITORIA-P15-SESION-RECUPERACION.md` y luego inspecciona el código local real (el código local puede ser posterior al GitHub publicado).

## Proceso

1. Traza `useAuthManager` → `createProfileSession` → `LicenseGuard` → `useLicenseAccess` → `licenseAccess` → `subscribeTenant/subscribeLicense` → `RestrictedAccess`, además de `useShiftMonitor`, caché IndexedDB y PWA si suponen impacto probado.
2. Reproduce la transición tras inactividad, background/visibility, F5, `online`, refresh de credenciales, cambio de cuenta y metadatos `fromCache`/servidor; distingue los estados `tenant-missing-confirmed`, `permission-denied`, `network-error`, `offline-unverified`.
3. Instrumenta códigos y presencia documental sin exponer secretos, UID, correo, `businessId` íntegro ni documentos. Examina cuál es la causa verificable. **No inventes que faltan documentos** ni la atribuyas a tokens/caché sin pruebas.
4. Implementa el cambio mínimo: reintento explícito efectivo, reconexión y refresh de credenciales acotados si corresponde; descarta respuestas atrasadas de otra identidad; ningún acceso financiero hasta confirmación de servidor. Usa la misma infraestructura existente; evita nuevas dependencias.
5. Añade regresiones para la matriz de auditoría y conteo de lecturas. Un verdadero documento ausente o una licencia suspendida debe continuar bloqueando.
6. Ejecuta Node/Chromium, lint, build/PWA y las suites locales pertinentes; Rules en emulador solo si Java ya está disponible. Registra PASS/FAIL/BLOCKED de verdad.
7. Crea `docs/P15-RESULTADOS-SESION.md` con causa demostrada, archivos y pruebas, situación de pendientes, y confirma que no se han borrado datos locales.

## Límites absolutos

- NO comandos `git`, `gh` ni APIs/conectores GitHub, siquiera de lectura.
- NO deploy, NO cambios en producción, NO instalaciones, NO borrado de IndexedDB/Service Worker/caché, NO creación automática de `tenants`, `licenses`, usuarios o perfiles.
- NO cambios en caja, ventas, anulaciones, métodos de pago, Firestore Rules, índices, reportes financieros, backups ni persistencia.
- NO conceder acceso por información no confirmada del servidor ni reducir las pruebas de seguridad.
- Si necesitas cambiar Firestore Rules o el dominio de autenticación, documenta el motivo y para: no lo implementes a ciegas.

Comienza ahora con diagnóstico y corrección mínima, luego pruebas. **No declares producción autorizada hasta ver CI del nuevo SHA y el procedimiento de release seguro.**
