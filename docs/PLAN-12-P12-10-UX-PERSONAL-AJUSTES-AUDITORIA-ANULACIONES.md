# PLAN P12-10 — UX de Personal/Ajustes + Auditoría de anulaciones, reportes e integridad

## 1. Contexto

Después de mejorar POS, Historial, Contratos y Reportes, todavía quedan dos frentes importantes:

1. **Refinamiento UX / visual** en:
   - módulo **Personal**,
   - módulo **Configuración global / Ajustes**,
   - e **iconografía general de navegación**.

2. **Auditoría técnica y diagnóstico** del flujo de:
   - apertura/cierre de caja,
   - anulaciones,
   - impacto de anulaciones en reportes,
   - consistencia entre métodos de pago (**efectivo, yape/plin, mixto**) y métricas financieras.

El objetivo es que esta iteración avance en dos planos al mismo tiempo:
- **sí implementar mejoras visuales** en los módulos pendientes,
- **pero no tocar todavía la lógica financiera crítica**, sino auditarla, diagnosticarla y proponer soluciones seguras antes de decidir el cambio funcional final.

---

## 2. Problemas detectados

### 2.1 UX de Personal
Estado actual:
- El módulo ya es usable, pero todavía se siente visualmente plano.
- Falta aplicar el refinamiento que sí ya existe en módulos mejorados.
- Las tarjetas de empleados, el bloque de búsqueda y los filtros pueden ganar más jerarquía visual.
- Los badges de rol (dueño, cajero, etc.) pueden volverse más expresivos.

Resultado esperado:
- Superficies suaves y bien separadas.
- Bloques con mejor aire, ritmo y color.
- Tarjetas de empleado con más estructura visual.
- CTA “Nuevo empleado” más integrado al lenguaje del sistema.

### 2.2 UX de Configuración global / Ajustes
Estado actual:
- El módulo tiene estructura, pero aún puede sentirse uniforme y algo seco.
- Las secciones (Sucursales, datos de boletas/facturas, disponibilidad, etc.) todavía pueden enriquecerse visualmente.
- Hace falta separar mejor las capas de información mediante color suave y superficies diferenciadas.

Resultado esperado:
- Tarjetas/secciones con fondos pastel sutiles, bordes suaves y mejor segmentación.
- Mejor lectura de submódulos internos.
- Sucursales y tarjetas de configuración con mayor claridad y atractivo visual.

### 2.3 Iconografía del nav y módulos
Estado actual:
- Hay margen para mejorar la calidad visual de varios íconos.
- Algunos íconos se sienten funcionales, pero no tan “bonitos” ni dinámicos como el resto del rediseño.

Resultado esperado:
- Revisar la iconografía del nav y de encabezados de módulos.
- Escoger o reutilizar íconos más consistentes, modernos y visualmente agradables.
- Mantener coherencia semántica y no romper accesibilidad.

### 2.4 Anulaciones y reportes — señal de inconsistencia
Se observó un caso real:
- al anular una operación, el reporte puede dejar **Yape / Plin en negativo**.

Esto abre dudas importantes:
- ¿cómo impacta una anulación sobre caja física?
- ¿cómo impacta una anulación sobre ingresos netos?
- ¿cómo impacta en cada método de pago?
- ¿cómo debe representarse contablemente una devolución/anulación digital?
- ¿qué pasa si la caja estaba abierta y se anula una venta Yape?
- ¿el sistema está mezclando movimiento contable con dinero físico?

Resultado esperado:
- realizar una auditoría técnica y un diagnóstico serio,
- identificar el flujo actual exacto,
- documentar riesgos,
- y proponer varias soluciones posibles con ventajas/desventajas.

---

## 3. Objetivo general de la iteración

### 3.1 Objetivo UX
Implementar mejoras visuales reales en:
- **Personal**,
- **Configuración global / Ajustes**,
- **iconografía general del nav y encabezados**.

### 3.2 Objetivo de auditoría
Investigar y documentar el comportamiento actual de:
- anulaciones,
- caja,
- métodos de pago,
- reportes,
- ingresos netos,
- y saldo por canal.

El resultado no es “cambiar todo de una vez”, sino producir un **diagnóstico confiable** con propuestas claras para tomar la mejor decisión después.

---

## 4. Alcance de trabajo

## A. Implementación UX (sí se ejecuta)

### 4.1 Módulo Personal
Mejorar:
- cabecera del módulo,
- bloque de búsqueda / filtros,
- tarjetas de empleado,
- badges de rol,
- CTA primario y secundarios,
- consistencia de espaciados y superficies.

Lineamientos:
- Aplicar el mismo lenguaje visual refinado del resto del sistema.
- Usar fondos suaves, separación por superficies, paneles internos sutiles y mejor jerarquía.
- Hacer que el dueño o cajero identifiquen rápido nombre, rol, sede, turno y acciones.

### 4.2 Módulo Configuración global / Ajustes
Mejorar:
- hero/header del módulo,
- tarjetas de secciones,
- panel de sucursales,
- panel de datos fiscales / boletas y facturas,
- secciones desplegables,
- CTA de edición/nueva sede,
- separación visual entre avisos, filtros y listas.

Lineamientos:
- Evitar exceso de blanco plano.
- Dar color suave a secciones: por ejemplo lila, azul claro, verde menta, crema tenue según contexto.
- Mantener alta legibilidad y una sensación premium/operativa.

### 4.3 Iconos
Revisar:
- íconos del nav,
- íconos de encabezado de módulos,
- íconos de secciones internas si amerita.

Lineamientos:
- Hacerlos más agradables y consistentes.
- No romper accesibilidad ni semántica.
- Preferir una familia coherente y ya existente en el proyecto si es posible.

---

## B. Auditoría técnica (sí se investiga, no se cambia la lógica todavía)

### 4.4 Auditoría de anulaciones y caja
Codex debe investigar y documentar:

1. **Qué ocurre hoy cuando se anula una venta en efectivo**
   - qué registros se tocan,
   - cómo impacta en caja,
   - cómo impacta en reportes,
   - si se descuenta o compensa adecuadamente.

2. **Qué ocurre hoy cuando se anula una venta Yape/Plin**
   - cómo se modela esa reversión,
   - si el negativo en reportes es esperado o un síntoma de mala modelación,
   - si se está registrando como contramovimiento contable,
   - si la caja física se mantiene separada del canal digital.

3. **Qué ocurre hoy cuando el pago fue mixto**
   - cómo se reparten compensaciones,
   - cómo se reflejan en reportes,
   - si existe riesgo de doble compensación o incoherencia.

4. **Relación con apertura/cierre de caja**
   - si las anulaciones afectan el arqueo esperado,
   - si deben afectar solo efectivo,
   - si yape/plin debe impactar neto digital pero no efectivo físico,
   - si los reportes actuales mezclan conceptos.

5. **Integridad y seguridad**
   - riesgo de datos negativos inesperados,
   - riesgo de doble anulación,
   - riesgo de inconsistencia entre historial, notificaciones, reportes y caja,
   - posibles huecos de integridad o resguardo.

### 4.5 Documento de auditoría obligatorio
Codex debe crear un documento nuevo, por ejemplo:
- `docs/AUDITORIA-ANULACIONES-CAJA-REPORTES.md`

Ese documento debe incluir:
1. mapa del flujo actual,
2. módulos/archivos implicados,
3. comportamiento actual por método de pago,
4. diagnóstico del caso Yape negativo,
5. riesgos detectados,
6. al menos **3 opciones de solución**,
7. recomendación principal razonada,
8. impacto esperado de cada opción.

### 4.6 Opciones de solución que deben analizarse
Codex debe analizar, como mínimo, estas posibilidades:

#### Opción A — Mantener negativos como contramovimiento contable explícito
- útil si se quiere ver devoluciones como resta real del canal.
- requiere comunicarlo muy bien en reportes.
- puede confundir si el usuario espera “ingreso del día” y no “neto contable”.

#### Opción B — Separar “ventas” de “anulaciones/devoluciones”
- mostrar ingresos positivos por canal,
- mostrar devoluciones por canal aparte,
- calcular un neto final derivado,
- normalmente es más claro para dueños.

#### Opción C — Separar “caja física” vs “canal digital / compensación”
- efectivo afecta caja física,
- yape/plin afecta canal digital,
- mixto reparte en ambos,
- reportes muestran ambos planos sin mezclarlos.

#### Opción D — Capa de ledger/movimientos tipados
- registrar explícitamente tipos de movimiento: venta, anulación, compensación, devolución, ajuste.
- solución más robusta, pero potencialmente más compleja.

Codex puede agregar otras opciones si son mejores.

---

## 5. Restricciones obligatorias

1. **No usar comandos Git/GitHub.**
   - Prohibido `git`, `gh`, API/conectores GitHub, push, commit, branch, diff, etc.

2. **No ejecutar pruebas ni procesos pesados en esta iteración.**
   - No lint.
   - No build.
   - No tests Node/Chromium/Spark.
   - No deploy.

3. **No cambiar todavía la lógica financiera de anulaciones/reportes.**
   - La parte crítica de dominio debe auditarse y documentarse.
   - Solo se permite inspección del código y documentación del diagnóstico.
   - No tocar Firestore, reglas, persistencia o cálculos financieros finales en esta iteración.

4. **Sí se puede mejorar la UX / UI** de Personal, Ajustes e iconografía.

5. **No instalar dependencias nuevas** salvo que el proyecto ya tenga lo necesario.

---

## 6. Fases P12-10

### P12-10-A — Mejorar UX de Personal
- Aplicar superficies suaves, jerarquía, badges y tarjetas mejor estructuradas.

### P12-10-B — Mejorar UX de Configuración global / Ajustes
- Refinar secciones internas y tarjetas de sucursales/configuración.

### P12-10-C — Mejorar iconografía general
- Revisar nav y encabezados de módulos.

### P12-10-D — Auditar flujo de anulaciones y caja
- Inspección técnica del dominio actual.

### P12-10-E — Diagnosticar reportes y caso Yape negativo
- Explicar la causa o posibles causas con evidencia de código.

### P12-10-F — Elaborar documento de soluciones recomendadas
- Dejar opciones claras para decisión posterior.

---

## 7. Criterios de aceptación

### UX
Se considerará bien implementado si:
- **Personal** luce más refinado y consistente con el resto del rediseño.
- **Configuración global / Ajustes** se ve más rica visualmente y menos plana.
- Los íconos del nav y módulos se ven mejor y más coherentes.

### Auditoría
Se considerará correcta si:
- existe un documento técnico claro,
- explica el flujo actual de anulaciones,
- analiza efectivo, yape/plin y mixto por separado,
- aborda el caso del Yape negativo,
- propone soluciones concretas,
- y deja una recomendación razonada.

### Restricciones
Además, debe cumplirse que:
- no se usó Git/GitHub,
- no se ejecutaron pruebas ni despliegues,
- y no se cambió la lógica financiera crítica todavía.

---

## 8. Entrega esperada de Codex

Al finalizar, Codex debe responder con:
1. archivos modificados para UX,
2. archivo(s) creados para auditoría,
3. resumen de mejoras en Personal,
4. resumen de mejoras en Ajustes,
5. resumen de mejoras de iconos,
6. hallazgo principal del flujo de anulaciones/reportes,
7. resumen de opciones de solución propuestas,
8. confirmación explícita de que **no ejecutó Git/GitHub, pruebas ni despliegues**,
9. confirmación explícita de que **no modificó la lógica financiera crítica**, solo la auditó.
