# MIGAPOS · PLAN P12-07
## Corrección de apertura de caja y jerarquía visual operativa

**Fecha:** 2026-11-05  
**Estado:** Para ejecutar localmente en Codex; NO aprobado visualmente ni certificado funcionalmente.  
**Rama:** El propietario trabaja en `main`. Codex no debe ejecutar ningún comando Git/GitHub ni consultar ramas.  
**Alcance:** POS/carrito, apertura y cierre de caja, tarjetas de Historial, Notificaciones y formulario de Contratos.  
**Fuera de alcance:** Reescrituras, operaciones financieras, cálculos, Firestore, Rules, índices, Firebase, autenticación, permisos, sincronización, Excel, reportes y otros módulos.

> **Fuente de verdad para el cambio:** el árbol LOCAL de MigaPOS. Se revisó la versión pública de `main`, pero el propietario tiene correcciones P12 recientes que podrían no estar publicadas allí. Verificar archivos locales antes de editar. **No sobrescribir mejoras ya existentes** ni realizar refactors por suposiciones.

## 0. Problema y principios

El diseño actual mezcla superficies blancas visualmente idénticas. El propietario necesita segmentación intuitiva del contenido: fondo luminoso, jerarquía de información, estados diferenciados y menos sobrecarga. En el POS se reportó además un **bug reproducido por el usuario**: tras confirmar apertura de caja, el modal sigue visible.

**Heurísticas a aplicar:** visibilidad del estado, coincidencia con el lenguaje del cajero, consistencia, prevención de errores, reconocimiento antes que memorización, control del usuario, densidad adecuada y divulgación progresiva. La skill UI/UX Pro Max **ya instalada** es una referencia opcional; la especificación siguiente y las capturas del propietario prevalecen. No descargar skills ni frameworks.

### Paleta semántica: usar tokens y niveles claros

| Uso | Superficie propuesta | Texto/acento propuesto | Regla |
|---|---|---|---|
| Lienzo general | `#FAF9F6` o crema casi blanco equivalente | tinta `#24213D` | No gris plomo; contraste suficiente |
| Panel principal | `#FFFFFF` / `#FFFDFC` | índigo oscuro | Mantener limpieza y lectura |
| Efectivo / pago verde | `#E7F8EF` | verde `#167454` | Selector, monto y detalles |
| Yape / Plin | `#F0E8FF` | violeta `#6B3BD1` | Selector, monto y detalles |
| Pago mixto | `#EAF1FF` | azul `#315ECE` | Selector, monto y detalles |
| Apertura/caja normal | `#E7F8EF` o azul claro según sección | verde/azul | No usar rojo en acciones exitosas |
| Diferencia faltante | `#FFF1DE` | ámbar `#A96512` | Etiqueta explícita «Faltante» |
| Sobrante no conciliado | `#FFF0F2` | rojo `#B93649` | Señal de revisión, no pérdida demostrada |
| Ticket anulado | `#FFF0F2` | rojo `#B93649` | Prioridad visual / no permite anular de nuevo |
| Resultado por revisar | `#FFF5E4` | ámbar | No declarar faltante definitivo |
| Separadores y bordes | `#DFDDEC` | — | Bordes suaves, visibles |
| Identidad | morado oscuro + índigo nebular | blanco | Sidebar, acentos; evitar saturar superficies |

Los HEX son referencias, no obligan a duplicar constantes. Evolucionar **tokens semánticos existentes** en `frontend/src/shared/styles/theme.css` y clases reutilizables, con CSS local limitado cuando corresponda. Evitar degradados intensos en cada tarjeta; no usar color como única señal de estado. Mantener estados `:focus-visible`, `disabled`, hover, motion-reduce y contraste WCAG AA cuando sea posible.

## 1. P12-07-A — Bug apertura de caja (bloqueante funcional)

### Archivos de investigación

- `frontend/src/modules/POS.jsx`
- `frontend/src/modules/CashRegisterModals.jsx`
- `frontend/src/features/cash-register/hooks/useCashRegister.js` **solo lectura salvo corrección mínima y probada imprescindible**
- `frontend/src/modules/contracts/ContractManager.jsx` (también abre caja)
- `frontend/src/shared/ui/Dialog.jsx` (solo lectura salvo defecto genérico demostrado)

### Pista técnica encontrada en versión pública

`CashRegisterModals.handleOpen` ya hace `if (success) setShowOpenModal(false)`. `openRegister` actualiza la sesión y responde `true` tras confirmar la operación. En `POS.jsx` el componente tiene una key derivada de `${modalScope}:${currentSession?.id ?? 'closed'}`; esa identidad cambia cuando se abre la caja. **Hipótesis a verificar:** un remontaje mientras sigue pendiente el callback provoca persistencia visual o carrera entre estado de sesión y estado de diálogo. No afirmar que sea la causa sin reproducir.

### Corrección obligatoria

1. Rastrear secuencia real: clic, `busy`, `openRegister()`, resultado, actualización de `currentSession`, cambio de `key`, `showOpenModal` y montaje/desmontaje de `Dialog`.
2. La ventana **solo** se cierra tras éxito/confirmación verificable de caja; nunca ocultarla por un clic ni antes de que la operación se confirme. Una respuesta incierta mantiene la posibilidad de consulta/verificación, **sin emitir otra apertura por accidente**.
3. Considerar estabilizar la identidad del modal por negocio/sucursal y controlar expresamente su visibilidad ante `currentSession` confirmada, evitando duplicaciones y actualizaciones obsoletas al cambiar de sede o usuario.
4. Si apertura falla, conservar monto introducido, mostrar error y permitir reintentar de forma segura. Si cambia sesión/sucursal, impedir que callbacks atrasados cierren una ventana de otro contexto.
5. Verificar también el flujo de apertura desde Contratos, sin duplicar lógica.
6. No tocar el contrato transaccional, IDs de idempotencia, validaciones, Rules ni lectura/escritura de Firestore. Si no se puede solucionar sin tocar dominio/infrastructura financiera, **detener esa corrección concreta y documentar el bloqueo**, dejando el resto UX implementado.

### Aceptación manual (propietario)

- Abrir caja desde POS: después de confirmarse desaparece el modal, la cabecera dice caja abierta, el botón de cobro corresponde al estado real y no se dispara segunda apertura.
- Abrir desde Contratos produce el mismo resultado.
- Error de red o error de permisos: modal y monto siguen disponibles; no se indica éxito falso.
- Doble clic/Enter repetido: una sola operación.
- Cambiar de sede/usuario durante una respuesta retrasada no deja un modal de otra sesión abierto.
- Cerrar y volver a abrir solo mediante operación auténtica; no forzar cierre de turno por UI.

## 2. P12-07-B — Carrito POS y métodos de pago

### Archivos

`frontend/src/modules/pos/PaymentParts.jsx`, `frontend/src/modules/pos/TicketParts.jsx`, `frontend/src/modules/POS.jsx`, estilos POS locales y tokens.

### Diseño

- Tres opciones equivalentes, del mismo alto/ancho, legibles: **Efectivo verde**, **Yape/Plin violeta**, **Mixto azul**.
- Estado seleccionado con fondo claro semántico + borde acentuado + texto/icono fuerte; no relleno oscuro pesado. `aria-pressed` se mantiene y el seleccionado debe identificarse sin depender solo del color.
- Hover y focus accesibles; inactivos claramente deshabilitados, no confundibles con «no seleccionado».
- Conservar el total y la acción Cobrar fijos/accesibles. No estrechar la región de productos para agregar decoración.
- No modificar métodos soportados ni cambiar validación de efectivo/mixto, cálculos de vuelto, cobros o QR.

## 3. P12-07-C — Tarjetas de Historial: jerarquía real

### Archivos

`frontend/src/modules/sales-history/SaleHistoryCard.jsx`, `frontend/src/modules/SalesHistory.jsx` y estilos scoped.

### Estructura obligatoria por tarjeta

1. **Cabecera compacta:** fecha/hora, nombre legible de sede y estado del ticket (registrada/anulada/pendiente). Evitar UUID, tickets completos, UID, cifras repetidas y explicaciones técnicas.
2. **Cuerpo:** lista de productos con cantidad, descripción y subtotal alineados; hasta tres productos visibles; expandir más sin romper otras tarjetas.
3. **Bloque financiero INFERIOR, antes del pie:** panel con borde y fondo suave del método de pago. En efectivo: etiqueta «Efectivo» + **S/ total** + recibido/vuelto solo cuando exista y aporte valor. Digital: «Yape / Plin» + total. Mixto: total visible y dos mini-paneles **Efectivo S/** (verde) y **Yape/Plin S/** (violeta), dentro de un conjunto azul. Mantener datos exactos, sin recalcular valores diferentes.
4. **Pie uniforme:** nombre visible del cajero/responsable y botón discreto «Anular ticket» cuando esté autorizado. Alinear pies cuando las tarjetas ocupen la misma fila sin introducir zonas vacías enormes.
5. **Anuladas:** borde/estado rojo + distintivo «ANULADA» (diagonal si cabe y no tapa texto); motivo abreviado y revelable; no presentarlo como ingreso efectivo ni mostrar anulación repetida.
6. **Estados especiales:** borrador, resultado incierto, intento rechazado y anulación pendiente conservan sus advertencias/acciones y no se confunden con ventas confirmadas.

No eliminar datos del registro ni las verificaciones: **solo ocultar IDs técnicos de la vista principal**. Se pueden consultar en detalle técnico bajo una divulgación apropiada (evitar expandir tres tarjetas al cargar). Nunca usar nombres de campos Firestore como texto de cajero.

### Densidad y simetría

- Tarjetas casi blancas sobre lienzo crema. Colores financieros presentes en bloques bajos, no amontonados en el encabezado.
- Grid adaptable 1/2/3 columnas. Importe visible en zona financiera sin obligar a abrir detalles. Cabeceras y pies alineados, sin alturas fijas que recorten contenido.
- Descripciones largas se truncan visualmente con acción accesible «Ver motivo»; no ocultar información relevante para auditoría.

## 4. P12-07-D — Notificaciones con semántica financiera

### Archivo base

`frontend/src/components/NotificationBell.jsx` y estilos locales/tokens; consultar esquemas de `notification.metadata` **sin alterar** generador, listeners ni repositorios.

### Clasificación segura

Preferir tipo/autoridad/metadata estructurada. **No clasificar por `message.includes()` o colores aleatorios**. Si el payload no permite inferencia confiable, usar estado neutro/informativo, no inventar un descuadre.

- **Anulación confirmada:** borde superior/lateral rojo, icono de anulación y monto con énfasis, motivo breve y acceso al detalle completo; mantener advertencia de entrega física no verificada.
- **Cierre con sobrante:** superficie rojo suave, título «Sobrante por revisar» si el registro lo acredita, no afirmar ganancia/pérdida definitiva.
- **Cierre con faltante:** superficie ámbar suave, título «Faltante por revisar» si procede.
- **Cierre provisional / incierto:** ámbar y «Cuadre por revisar», no usar cifras como diferencia definitiva.
- **Cierre cuadrado:** verde claro y «Sin diferencia registrada», respetando límites de conciliación.
- **Otros avisos:** azul/lavanda neutro si no se puede determinar clase.

Composición: barra/título + monto/estado, sede y responsable, texto breve; detalle técnico colapsado solo si hace falta para soporte. Mantener fecha, acción Marcar como leída, botones accesibles y todas las advertencias financieras obligatorias; no mostrar IDs completos en la tarjeta principal.

## 5. P12-07-E — Cuadre/cierre de caja segmentado

### Archivo

`frontend/src/modules/CashRegisterModals.jsx`, especialmente `CashCountSummary`. Evitar modificar `calculateCashTotals`, `sparkCashClosingRepository`, `cashRegisterRepository` y validaciones.

- **Sección de comparación:** «Referencia calculada / Dinero esperado» con panel azul/lavanda suave y «Dinero contado» con fondo crema distinto; importes con pesos consistentes y moneda peruana.
- **Sección de resultado:** verde si coincide y es verificable; ámbar si faltante o provisional; rojo suave si sobrante sujeto a revisión, según convención solicitada; texto siempre explícito («Faltan», «Sobran», «Por revisar»).
- **Detalle expandible:** «Ver detalle del cuadre», con categorías agrupadas: fondo inicial; cobros por medio; anulaciones/compensaciones; referencia; aclaraciones. No mezclar números de naturaleza distinta en una sola lista plana.
- **Observaciones:** bloque aparte, un poco de amarillo/crema, visible cuando corresponde; no esconder campo requerido ni cambiar su condición de obligatoriedad.
- **Footer:** «Volver a contar» y «Cerrar turno» a igual altura; compacto y fijo, pero el contenido debe poder scrollear sin quedar tapado.
- Conserva el carácter provisional de las anulaciones/no devolución certificada; no clasificar gastos no registrados como salidas reales. No alterar cálculos, tolerancias o cierre real.

## 6. P12-07-F — Contratos: secciones intuitivas y botones equilibrados

### Archivos

`frontend/src/modules/contracts/components/ContractFormModal.jsx`, `ContractFinanceFields.jsx`, `frontend/src/shared/ui/SectionCard.jsx` (solo ampliación compatible) y estilos scoped.

| Sección | Tratamiento visual |
|---|---|
| 1. Datos del cliente | Lavanda muy clara, número/icono violeta |
| 2. Logística de entrega | Azul pálido, fecha/dirección con jerarquía |
| 3. Detalles y fotos | Blanco cálido y acento índigo, fotos separadas |
| 4. Finanzas y cobro | Verde menta suave, monto total muy visible |
| Saldo pendiente | Ámbar o rojo suave según necesidad de atención (sin modificar regla de negocio) |

- Secciones claramente diferenciadas por **cabecera/borde/superficie**, sin colorear masivamente inputs ni producir carnaval cromático.
- En Finanzas: campos de costo, total, cuota y método organizados con jerarquía; **no mover montos entre campos ni alterar fórmulas**.
- Footer fijo, con botones **centrados como grupo**, alturas equivalentes y anchuras proporcionadas. En móvil ocupan el ancho útil de forma ordenada; en escritorio no quedan pegados a un extremo sin balance visual.
- Un solo scroll para el cuerpo del formulario, footer visible y teclado/foco sin recortes; no crear scroll dentro de cada sección.
- Mantener `busy`, `isProcessing`, required, file uploads, guardas de edición/pagos y bloqueo de cierre mientras se guarda. No añadir nuevas dependencias.

## 7. Guardrails absolutos

- **NO Git ni GitHub**: tampoco `git status`, `git diff`, `gh`, API, conectores, cambios de rama o publicación. El propietario hará todo GitHub manualmente.
- **NO ejecutar** tests, lint, build, Chromium, Firebase emulators, deploy ni comandos de release; es la preferencia explícita para esta fase. El propietario probará después. No afirmar PASS sin ejecución.
- Sin descargar plugins, skills, librerías, frameworks ni imágenes.
- No cambiar Firestore, Rules, índices, sesión, token, caché, permisos, dominios financieros, algoritmos de cobro, anulaciones o contratos.
- Se permite la **corrección mínima de estado/presentación del bug del modal de apertura**. Si exige tocar dominio/infrastructure financiera, informar sin modificarla.
- No eliminar campos almacenados, avisos legales, restricciones de caja ni identificadores usados para comprobación/idempotencia.
- No introducir listeners, cálculos financieros alternativos, consultas o renderizados innecesarios.
- Trabajar sobre la **versión local** real y reutilizar los componentes de React/Tailwind existentes. Evitar editar `shared/ui/Dialog` global salvo causa probada y sin regresiones.

## 8. Entrega y aceptación

### Entrega de Codex (sin ejecutar pruebas)

- Archivos concretos tocados y 1 frase por cambio.
- Causa diagnosticada del modal y reparación aplicada (o bloqueo si requiere dominio financiero).
- Lista breve de escenarios manuales aún no validados.
- Declaración explícita de que no ejecutó Git/GitHub, pruebas, builds ni deploy.

### Checklist del propietario

- [ ] Caja abre y modal desaparece **solo cuando está confirmada**; botón/estado actualizado; sin doble registro.
- [ ] Error/timeout/reintento y cambio de sucursal funcionan sin falsos éxitos.
- [ ] POS con 0, 1, 5 y 8 productos conserva total y Cobrar visibles, inputs no recortados.
- [ ] Botones de pago: verde, morado y azul, adecuados tanto seleccionados como deshabilitados.
- [ ] Historial: efectivo/Yape/mixto con totales abajo y encabezado despejado; cajero y acciones alineados.
- [ ] Historial: anuladas/pendientes/borradores sin confusión financiera.
- [ ] Notificaciones: anulación, cuadre faltante, sobrante, conciliado e incierto con colores y mensajes correctos.
- [ ] Modal cierre: detalles, observaciones y botones no se tapan en pantallas pequeñas.
- [ ] Contrato: cuatro secciones distintas y footer centrado, teclado móvil y foto de referencia correctos.
- [ ] Sin scroll horizontal involuntario a 360, 390, 768, 1024 y escritorio.
- [ ] Contraste, foco, accesibilidad básica y ausencia de nuevas consultas de Firebase.

**Criterio de éxito:** más legible y cómodo, **ninguna garantía financiera debilitada**. Visualmente atractivo no sustituye aceptación funcional y pruebas futuras antes de comercializar.
