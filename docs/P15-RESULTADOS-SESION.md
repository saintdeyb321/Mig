# MigaPOS · P15 · Recuperación segura de sesión

## Reproducción y causa

La pantalla «Configuración no encontrada» proviene de la confirmación de dos documentos ausentes en `licenseAccess`. Un perfil ausente, una sesión anónima, una lectura de caché y un error de permisos tienen recorridos distintos.

El ensayo `.release/qa-p15/baseline.log` ejecutó el flujo anterior en Chromium con Auth y Firestore simulados. Partió de un dueño con permiso de escritura, reprodujo dos respuestas vacías de los listeners con metadatos de servidor y mantuvo disponibles respuestas positivas en la lectura directa. Al pulsar «Volver a comprobar acceso», la app siguió bloqueada. El registro mostró un listener de perfil, dos pares sucesivos de listeners de negocio/licencia y cero lecturas explícitas. El reintento recreaba los mismos listeners con el perfil anterior. Sigue pendiente identificar qué desencadenó las respuestas vacías en la sesión del propietario.

## Corrección

El reintento manual retira el permiso local de escritura, renueva las credenciales de la sesión actual una sola vez y vuelve a leer su perfil desde el servidor. Solo si la cuenta, el rol, el negocio y la sede asignada siguen correspondiendo al mismo contexto inicia el par de lecturas directas de `licenses/{businessId}` y `tenants/{businessId}`. Se aplica el resultado en conjunto y se ignoran respuestas de generaciones anteriores. Después de un resultado activo se restablecen los listeners de negocio y licencia. Una denegación o ausencia real queda visible y permite otra comprobación explícita. Se conserva la compatibilidad de un negocio histórico con licencia válida y ausencia de documento de negocio confirmada por el servidor. [Lecturas de Firestore desde el servidor](https://firebase.google.com/docs/reference/js/firestore) · [Credenciales de usuario Firebase](https://firebase.google.com/docs/reference/js/auth.user)

Volver a la pestaña con evidencia de al menos 30 minutos o con una lectura recuperable puede iniciar un paquete. Un corte durante la comprobación invalida ese intento. Al volver la conexión, la comprobación pendiente se ejecuta una vez cuando termine el intento anterior y se cumpla la pausa de 30 segundos entre paquetes automáticos. Los eventos simultáneos se agrupan y solo el botón fuerza la renovación del token. El arranque con listeners sanos no añade lecturas directas. El paquete inicia como máximo una lectura de perfil y dos de configuración, además de las suscripciones que se restablecen tras confirmar acceso. Los plazos son de 10 segundos para perfil y 20 segundos para el paquete. Las solicitudes que el SDK ya haya enviado pueden terminar, sin publicar resultados del intento vencido o cancelado.

Los metadatos de caché o escrituras pendientes no habilitan operaciones. Se retira la licencia local cuando se pierde la evidencia de perfil y se comprueba su vencimiento también al intentar escribir. Se conservan los estados separados para credenciales, conexión, permiso, licencia ausente, suspensión y vencimiento. El monitor del turno de cajeros conserva su propio cierre de sesión. Los diagnósticos locales acotan el entorno, etapa, código y metadatos booleanos. No incluyen UID, correo, negocio completo, tokens, documentos ni importes.

## Evidencia local

| Control | Resultado |
| --- | --- |
| Chromium antes de la corrección | **FAIL reproducido**. El reintento dejó el mensaje de ausencia con cero lecturas explícitas. |
| Matriz Chromium P15 | **PASS 1/1**. Inactividad simulada de cuatro horas, F5 con reintento, reconexión y corte durante lectura, credencial vencida, denegación, ausencia, licencia suspendida o vencida, caché, escrituras pendientes, cambio de sede/cuenta/negocio y aislamiento entre pestañas. Borrador IndexedDB íntegro. Registro en `.release/qa-p15/recovery-final.log`. |
| Regresiones Node y Spark | **PASS 45/45** en sesión y seguridad UI, incluidas las comprobaciones del fin de turno. **PASS 81/81** en `npm run test:spark`, que incluye la matriz P15. La primera corrida detectó que la fixture de SuperAdmin carecía de los métodos nuevos. Se añadieron espías que fallan si ese contexto intenta una lectura de negocio. Registros en `.release/qa-p15/node.log` y `.release/qa-p15/spark-final.log`. |
| Lint, build/PWA | **PASS**. Build con configuración sintética de `demo-migapos`, salida aislada y precaché verificada de 2,89 MiB. Vite avisó de chunks mayores de 500 kB. Registros en `.release/qa-p15/lint-final.log` y `.release/qa-p15/build-final.log`. |
| `npm run test:spark:rules` | **BLOCKED**. El JAR local de Firestore estaba disponible, pero no se encontró Java en Windows ni en WSL Ubuntu. La suite de Rules no se ejecutó. |
| Sesión del propietario y CI del futuro SHA | **MANUAL / pendiente**. Verificar inactividad real, F5, reconexión, cambio de cuenta y cierre de turno antes de autorizar una publicación. |

Código principal en `useAuthManager.js`, `profileSession.js`, `useLicenseAccess.js`, `accessState.js`, `operationAccess.js`, `accessDeadline.js` y `licenseRepository.js`. `App.jsx` y `LicenseGuard.jsx` conectan la comprobación de perfil con el guard de negocio. `RestrictedAccess.jsx` distingue el error de credenciales y `diagnostics.js` registra metadatos acotados. Las regresiones están en `tests/session-recovery.test.mjs`, `tests/p15-session.browser.test.mjs` y sus fixtures. La prueba de arranque de SuperAdmin conserva su prohibición de lecturas de negocio. La regresión Chromium se incluyó en `test:spark` y `tests/ui-security.test.mjs` conserva el inventario Markdown por rutas exactas.

Se preservaron los borradores y el almacenamiento local. La prueba usa un borrador sintético de IndexedDB en un perfil temporal. Los cambios quedaron en local y el piloto sigue sujeto a la validación del propietario y a Rules.
