# P20 · Documentos legales y privacidad del ticket POS

Fecha de revisión local: 14 de noviembre de 2026. Base inspeccionada: `f7db1c393cd46926d560fc7aa51137e3c0638880`.

## Estado de publicación

**DRAFT · NO-GO jurídico/comercial.** Términos 1.1 (abril de 2026) sigue vigente. La ventana de privacidad informa que la versión 1.0 está pendiente. Términos 2.0, su anexo de encargo y Política de Privacidad 1.0 permanecen en `docs/`, fuera del bundle, del precaché y del directorio publicado por Hosting.

| Ruta en el Hosting existente | Estado |
| --- | --- |
| `/legal/terminos` | Ventana Nebula con el texto íntegro de la versión vigente y descarga de su archivo versionado. |
| `/legal/privacidad` | Ventana de consulta pública con el estado de la política. Al aprobarse, mostrará el texto íntegro, descarga y contacto ARCO. |
| `/legal/terminos-1.1.txt` | Archivo de la versión vigente, verificado por SHA-256. |

Ambas rutas funcionan antes de iniciar sesión. El acceso autenticado se ofrece en la navegación de escritorio y en «Más» en móvil. La aprobación contractual usa una casilla inicialmente vacía. La interfaz distingue las reglas de uso del cajero de la declaración del representante. La consulta de privacidad carece de casilla. Las rutas públicas cargan los documentos sin iniciar Firebase Auth ni consultas Firestore.

El POS omite la fila pública del cajero en la plantilla común a la impresión y reimpresión, incluso con tickets previos, borradores o pendientes. Los registros internos conservan el responsable. Se conservan los datos operativos del ticket, los avisos financieros, el escape HTML y las plantillas de pedidos.

## Aceptación y controles

- Con 1.1 vigente se admite el registro histórico de aceptación con versión 1.1 o sin campo de versión. Las nuevas escrituras de 1.1 requieren fecha del servidor y quedan protegidas contra sobreescritura. Un número de versión distinto requiere resolver la aceptación vigente. El archivo 1.1 conserva el texto contractual del modal anterior. Su hash documenta los bytes archivados en P20, ya que los registros previos carecían de un hash asociado al clic.
- Una activación aprobada requiere evidencia nueva para dueño y cajero. La transacción escribe el registro en `users/{uid}/legal_acceptances/{id}` y un indicador de versión y ámbito en el perfil en forma atómica. Conserva los campos históricos de 1.1. La marca de tiempo y los metadatos del aviso de privacidad quedan en la evidencia protegida, junto con UID, negocio, rol y los hashes de ambos documentos. La aceptación prescinde de IP, huella digital y datos de dispositivo.
- Rules valida identidad, tenant activo, rol, par de versiones, hashes, fecha, identificador y escritura conjunta. Se permite lectura individual propia dentro del negocio actual. El listado, borrado y modificación desde clientes están denegados, incluido SuperAdmin. Una misma aceptación concurrente se resuelve a través de la transacción del perfil. La administración de infraestructura conserva sus capacidades de acceso y debe fijar su política probatoria y de conservación.
- La suscripción de perfil existente determina cuándo se habilita el espacio de trabajo. Las ventanas prescinden de listeners adicionales. En una aceptación nueva se lee el perfil dentro de la transacción. Una aceptación en curso o sin confirmación de servidor no habilita el acceso.
- El clic autenticado produce evidencia técnica. La aplicación no emite una firma digital certificada ni acredita por sí sola poderes de representación. La autorización de transacciones Firestore conserva el protocolo financiero existente.

## Pendientes del proveedor

1. Confirmar identidad fiscal, RUC, domicilio, representación, contacto de soporte, procedimiento ARCO, canal de reclamos y Libro de Reclamaciones cuando corresponda. Verificar que cada canal atienda solicitudes de forma efectiva.
2. Cerrar los planes, precios, IGV, facturación del SaaS, forma de cobro, renovaciones, cancelación, reembolsos y soporte. Documentar facultades del titular del negocio.
3. Inventariar los datos por finalidad y responsable, titulares, fotos, acceso de soporte, regiones reales y transferencias internacionales. La configuración local de Firestore indica `nam5`. Firebase Analytics es opcional y su presencia efectiva depende de la configuración de producción. Verificar el estado de analítica y las obligaciones correspondientes antes de hacer promesas sobre rastreo.
4. Definir retención, recuperación, exportación y borrado por categoría, incluidos evidencias legales, IndexedDB y fotos P18. Verificar inscripción de bancos de datos, proveedores, incidentes y obligaciones de encargo. Obtener revisión de abogado peruano sobre textos y anexo.
5. Completar pruebas con datos aprobados, aceptar UX en dispositivos físicos y verificar la CI del cambio que se publicará. Los fixtures de aprobación de este plan usan datos sintéticos únicamente en el emulador.

## Activación manual tras aprobación

1. Congelar los textos finales en UTF-8 con LF, con encabezados de sección `##` y bloques separados por una línea vacía. Agregar `frontend/public/legal/terminos-2.0.txt` y `frontend/public/legal/privacidad-1.0.txt`. Conservar el archivo 1.1 y la copia exacta de cada versión posterior.
2. Calcular SHA-256 sobre los bytes que se servirán. En `frontend/src/features/legal/publication.js`, establecer `state: 'approved'`, las dos entradas con `path`, `version`, `sha256` y `dateLabel`, y la ficha `provider` con `name`, `ruc`, `address`, `supportEmail`, `privacyEmail`, `complaintsRequired` y `complaintsUrl` cuando aplique. Archivar versiones previas mediante `legalArchives`. Cambiar también los cuatro valores de `legalPublication()` en `firestore.rules`. El build rechaza discrepancias, archivos no registrados y marcadores pendientes.
3. Validar en emulador con los textos definitivos, incluyendo reaceptación de perfiles 1.1, cajero nuevo, cuenta suspendida y reintentos. Actualizar las expectativas de las pruebas que hoy verifican el estado de publicación 1.1, preservando las pruebas negativas y el historial 1.1. Conservar el inventario de archivos y hashes junto al artefacto aprobado de CI.
4. Guardar una copia verificada de las Rules publicadas antes de sustituirlas. En la ventana de publicación autorizada, publicar manualmente las Rules coordinadas en Firestore `(default)` de `migapos`, luego Hosting `migapos-peru` del mismo código. Las Rules deben reconocer las nuevas evidencias antes de exponer los formularios que las escriben. Revisar el desfase posible de clientes con una PWA antigua. Verificar rutas, descargas, canales y reaceptación al terminar. Mantener las evidencias y los textos archivados ante una reversión.

Referencias para la revisión de los procedimientos de privacidad y reclamos. [D. S. 016-2024-JUS](https://busquedas.elperuano.pe/dispositivo/SE/2349653-1), [ANPD y derechos ARCO](https://www.gob.pe/9269-iniciar-procedimiento-para-el-ejercicio-de-derechos-de-acceso-rectificacion-cancelacion-y-oposicion), [Indecopi y Libro de Reclamaciones](https://consumidor.gob.pe/libro-de-reclamaciones/).

## Archivos

- Publicación: `.gitattributes`, `frontend/public/legal/terminos-1.1.txt`, `frontend/src/features/legal/{publication.js,LegalDocuments.jsx}`, `frontend/config/validateLegalPublication.js`, `frontend/vite.config.js`, `scripts/check-build.mjs`.
- Acceso y UX: `frontend/src/{App.jsx,main.jsx,BottomNav.jsx,index.css}`, `components/TermsModal.jsx`, `modules/Auth.jsx`, `layouts/AppLayout.jsx`, `config/brand.js`, `hooks/useAuthManager.js`, `core/session/{accessState,operationAccess}.js`.
- Evidencia: `frontend/src/features/legal/acceptanceRepository.js`, `features/users/{hooks/useAcceptTerms.js,infrastructure/userRepository.js}` y `firestore.rules`.
- Tickets: `frontend/src/utils/receiptTemplate.js`.
- Pruebas y CI: `tests/{p20-legal.browser.html,p20-legal.browser.test.mjs,spark.rules.test.mjs,ui-security.test.mjs,ui-security.browser.test.mjs,ui-security.browser.mjs}` y `.github/workflows/verify.yml`. Las rutas abreviadas de frontend son relativas a `frontend/src/`.

## Validación local

| Estado | Comprobación | Resultado |
| --- | --- | --- |
| PASS | `npm run test:spark:rules` en `demo-migapos` | 84/84. Incluye el modo heredado, el modo futuro simulado, perfiles dueño/cajero, intentos falsificados, rechazo de escritura independiente, concurrencia, integridad e inmutabilidad del historial. |
| PASS | `npm run test:spark` | 85/85. Incluye arranque SuperAdmin, recuperación de sesión, clientes Spark y respaldos en navegador aislado. |
| PASS | Regresiones Node | 93/93 en las suites de seguridad UI, sesión, Spark, P07, P08 y P09. El validador prueba hashes, archivos sin registrar, placeholders y desajustes entre Rules y build. |
| PASS | Chromium P20 | 3/3. Login con enlaces, rutas directas desde el build, escritura simulada con reintento, bloqueo offline, documento alterado, 320/390 px y texto al 200 %. Impresión y reimpresión POS con CSP y 18 comprobaciones de seguridad. |
| PASS | Regresiones Chromium | P08, IndexedDB, P18, P19, P09, P10-06 y P14-RC. El escenario Windows de SuperAdmin se repitió con éxito tras ajustar la navegación para conservar su ámbito de plataforma. |
| PASS | Lint, build/PWA, `check:release` y `git diff --check` | Build demo con 46 archivos locales de precaché (2,94 MiB). El único documento en el directorio legal de salida es Términos 1.1. |
| PASS | `npm run audit:security` | Cero avisos en la raíz. Avisos de severidad baja en frontend y Functions históricas. |
| BLOCKED | Publicación definitiva y UX en dispositivos físicos | Pendientes CI Ubuntu, datos y canales aprobados, revisión jurídica y aceptación en dispositivos del propietario. No se ejecutó ningún despliegue. |

**GO técnico local para revisión.** Validación final sin fallos locales. Los escenarios de prueba del modo futuro son sintéticos. La aprobación, los canales reales, el entorno publicado y la aceptación jurídica quedan pendientes.
