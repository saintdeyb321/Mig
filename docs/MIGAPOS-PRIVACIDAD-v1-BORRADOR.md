# MigaPOS — Política de Privacidad (BORRADOR PARA REVISIÓN LEGAL)

**Versión propuesta:** 1.0  
**Fecha de actualización de la investigación:** 14 de noviembre de 2026  
**Estado:** NO PUBLICAR hasta completar el inventario real de datos y los campos de identificación.

> Responsable de datos de cuenta, soporte y contratación: **[RAZÓN SOCIAL/NOMBRE, RUC Y DOMICILIO]**. Contacto para derechos del titular: **[CORREO DE PRIVACIDAD/ARCO]**. Banco(s) de datos propios: **[INVENTARIO E INSCRIPCIÓN ANPD, SI CORRESPONDE]**. En datos de clientela/trabajadores registrados por cada pastelería, determinar y documentar las funciones de responsable del negocio y encargado de tratamiento del SaaS según el flujo real.

## 1. Qué datos se tratan

Según la funcionalidad utilizada: identificadores de usuario y cuenta Google, correo y nombre, pertenencia a un negocio, roles y sucursales, información de soporte y contratación, eventos técnicos mínimos de seguridad, registros operativos de clientes de las pastelerías (nombre, teléfono, pedidos, imágenes aportadas, pagos declarados y demás campos efectivamente habilitados), así como datos locales cifrados o temporales asociados a las funciones offline.

**Completar a partir de un inventario técnico**: categorías exactas, origen, quién puede verlas, si se usan estadísticas, diagnósticos, cookies/localStorage, SDKs externos, dónde se alojan, si hay datos sensibles y si los datos de QR contienen información personal. No afirmar que no existe tratamiento o seguimiento sin verificarlo.

## 2. Finalidades y bases legales

Usar la información para autenticar, administrar la suscripción, habilitar funciones del negocio, brindar soporte autorizado, proteger la seguridad, prevenir abuso y cumplir obligaciones legales. Para finalidades no necesarias para prestar el servicio, incluida publicidad directa, se requerirá la base legal correspondiente y, cuando proceda, consentimiento **separado, libre, previo e informado**, no una casilla obligatoria dentro de los términos.

## 3. Roles en el tratamiento

Para datos del personal de MigaPOS, contactos comerciales y soporte, el Proveedor podrá actuar como responsable. Para registros de compradores, empleados y fotografías incorporados por una pastelería en su operación, esta generalmente determina las finalidades y el Proveedor puede actuar como encargado, sujeto a instrucciones y acuerdos adecuados. Estos roles deben confirmarse por conjunto de datos: no se resuelven declarando que «todos los datos son propiedad del usuario».

## 4. Proveedores, nube y transferencias internacionales

MigaPOS utiliza servicios tecnológicos externos, incluidos los que se comprueben en el inventario real (p. ej., Google/Firebase). La información puede procesarse por proveedores o subencargados y en ubicaciones que deben identificarse y verificarse en el despliegue efectivo. Según `firebase.json` del repositorio auditado, la base Firestore `(default)` está configurada para `nam5`, región multirregional de **Estados Unidos**, mientras Firebase Authentication trata información en centros de datos de **Estados Unidos**, conforme a la documentación oficial de Google. Las demás ubicaciones de procesamiento y proveedores deben verificarse por servicio; no se debe afirmar que todos los datos permanecen en Perú o que el conjunto completo de servicios está limitado a `nam5`.

Antes del lanzamiento, confirmar el despliegue real en Firebase Console, la ubicación y proveedores, y describir las categorías de datos, destinatarios, fines, transferencias internacionales, medidas y comunicaciones/inscripciones que correspondan ante la ANPD. Informar claramente de transferencias internacionales, destinos, finalidades, garantías y obligaciones de comunicación o registro conforme al marco peruano, cuando correspondan. No inventar país de residencia de datos ni afirmar residencia exclusiva en Perú sin evidencia.

## 5. Accesos y medidas de seguridad

Se aplicarán medidas técnicas y organizativas proporcionales, como autenticación, control de roles, segregación entre negocios, protección de comunicaciones y controles sobre datos locales, conforme a las funciones efectivamente implementadas. Ningún sistema es inmune a incidentes. La existencia de terceros no elimina los deberes de seguridad propios del Proveedor y de cada responsable.

## 6. Retención, exportación y eliminación

Los datos se conservarán solo durante el tiempo necesario para las finalidades y obligaciones legales aplicables. **Definir e implementar antes de publicar:** plazos por categoría, causal, bloqueo, eliminación, restauración, copias y exportaciones; tratamiento de imágenes del contrato y registros offline; efectos de baja de suscripción. No se presume borrado automático a los 60 días ni conservación ilimitada.

## 7. Derechos del titular

Los titulares de datos pueden ejercer los derechos reconocidos por la Ley 29733 y normas aplicables, incluyendo acceso, rectificación, cancelación y oposición, mediante **[CANAL DERECHO TITULAR]**. Identificar el responsable competente para cada solicitud (MigaPOS o negocio contratante) y facilitar su atención según corresponda. El titular puede acudir a la Autoridad Nacional de Protección de Datos Personales cuando proceda. Conforme a la orientación publicada por la ANPD, el plazo general de atención es de **20 días hábiles para acceso** y **10 días hábiles para rectificación, cancelación u oposición**, sujeto a precisiones, supuestos y reglas de cómputo aplicables. La solicitud se atenderá por el responsable competente, previa verificación proporcional de identidad, sin obligar al titular a contactar exclusivamente a MigaPOS por datos cuyo responsable sea la pastelería. Las quejas ante la ANPD permanecen disponibles cuando corresponda.

## 8. Incidentes de seguridad

El Proveedor documentará y gestionará incidentes de datos personales y comunicará sin demora a los responsables del tratamiento cuando actúe como encargado. Los responsables efectuarán las notificaciones a la Autoridad y/o titulares en los supuestos y plazos previstos por la normativa, incluyendo **48 horas cuando correspondan los requisitos del artículo 34 del Reglamento 016-2024-JUS**. No afirmar que toda indisponibilidad de Firebase equivale a una filtración de datos.

## 9. Menores, imágenes y uso de datos de clientes

El Cliente debe evitar recabar datos innecesarios, especialmente información sensible y de menores, y obtener las autorizaciones legales correspondientes para fotos identificables. Los datos operativos de las pastelerías no serán usados por MigaPOS para anuncios, comercialización de bases de datos o entrenamiento externo salvo base legal específica, finalidad transparente y autorización cuando corresponda.

## 10. Información a titulares, finalidad y consentimiento no condicionado

La política se publicará antes de recopilar datos de la cuenta y explicará qué datos son indispensables, cuáles opcionales, los destinatarios, el período de conservación, los derechos y las consecuencias de no proporcionar datos necesarios. **Leer la política no equivale por sí solo a consentir cualquier tratamiento.** Los tratamientos necesarios para ejecutar una relación contractual se basarán en las excepciones legales que procedan; marketing, perfilado no necesario o fines autónomos exigirán base adecuada y consentimiento separado cuando sea obligatorio, sin casilla premarcada ni perjuicio por negarse.

Las personas cuyos datos son ingresados por una pastelería deben recibir la información exigible por ese negocio. MigaPOS facilitará la atención de solicitudes relacionadas con los datos a los que tenga acceso en su calidad de encargado según instrucciones lícitas y obligaciones propias.

## 11. Información del navegador, seguridad y marketing

La aplicación puede guardar datos de sesión y de funcionamiento en almacenamiento local/IndexedDB y emplear recursos de autenticación de Google. **[INVENTARIAR Y VERIFICAR]** cookies, SDK de analítica, logs de errores y herramientas de telemetría realmente activadas en producción antes de afirmar qué información se recoge. No se publicará una promesa de ausencia de cookies o seguimiento que no haya sido contrastada. La configuración de publicidad o prospección no está incluida automáticamente en el servicio.

## 12. Versiones y comunicación

Esta política estará disponible de forma accesible antes de que una persona entregue información. Los cambios materiales se informarán de modo comprensible y se solicitará consentimiento cuando la ley lo requiera. Mantener versiones archivadas y fecha de vigencia verificable.

---

**Estado de implementación:** este texto requiere un inventario técnico, registro de bancos de datos personales cuando corresponda, evaluación de flujos transfronterizos, acuerdo con proveedores y política de incidentes. También se debe comprobar el plazo de conservación real por categoría, las imágenes de contratos, los datos exclusivamente locales y las exportaciones. La publicación de la política por sí sola no satisface estas obligaciones.

**Fuentes oficiales**: Reglamento D.S. 016-2024-JUS (https://busquedas.elperuano.pe/dispositivo/SE/2349653-1); ANPD (https://www.gob.pe/institucion/anpd/campa%C3%B1as/128319-nuevo-reglamento-de-proteccion-de-datos-personales); derechos ARCO (https://www.gob.pe/9269-iniciar-procedimiento-para-el-ejercicio-de-derechos-de-acceso-rectificacion-cancelacion-y-oposicion); registro de bancos (https://www.gob.pe/institucion/anpd/pages/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales); Firebase privacidad (https://firebase.google.com/support/privacy/); regiones Firestore (https://firebase.google.com/docs/firestore/locations). **No sustituye el asesoramiento jurídico**. Fuentes de partida: Ley 29733; DS 016-2024-JUS; ANPD (gob.pe).
