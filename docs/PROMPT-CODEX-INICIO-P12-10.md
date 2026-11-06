# MIGAPOS — PROMPT DE INICIO P12-10

Actúa como arquitecto frontend senior especializado en React 19, Tailwind CSS 4, UX operativa para software POS y análisis técnico de flujos financieros.

Vamos a ejecutar la iteración **P12-10 — UX de Personal/Ajustes + Auditoría de anulaciones, reportes e integridad**.

Lee y aplica íntegramente:
- `docs/PLAN-12-P12-10-UX-PERSONAL-AJUSTES-AUDITORIA-ANULACIONES.md`
- este archivo `docs/PROMPT-CODEX-INICIO-P12-10.md`

## Objetivo
Tienes dos misiones en paralelo:

### Misión A — Sí implementar mejoras UX
Mejorar visualmente:
- módulo **Personal**,
- módulo **Configuración global / Ajustes**,
- iconos del nav y encabezados.

### Misión B — Auditar, no modificar todavía la lógica crítica
Investigar y documentar el flujo de:
- anulaciones,
- caja,
- reportes,
- impacto por método de pago,
- y el caso observado donde **Yape / Plin aparece negativo**.

No debes corregir todavía la lógica financiera final. Primero debemos auditar y decidir con evidencia.

---

## Tarea 1 — Mejorar UX del módulo Personal
Debes refinar el módulo Personal para que visualmente esté al nivel de los módulos ya mejorados.

Mejora:
- cabecera,
- tarjeta hero,
- búsqueda y filtros,
- tarjetas/listado de empleados,
- badges de rol,
- paneles internos,
- CTA “Nuevo empleado”,
- acciones como editar / deshabilitar.

Requisitos:
- usar superficies suaves,
- aplicar mejor jerarquía,
- separar visualmente bloques,
- evitar blanco plano excesivo,
- mantener legibilidad excelente.

---

## Tarea 2 — Mejorar UX del módulo Configuración global / Ajustes
Debes refinar visualmente:
- cabecera del módulo,
- secciones internas,
- tarjetas de sucursales,
- datos de boletas y facturas,
- bloques desplegables,
- avisos, filtros y CTAs.

Requisitos:
- utilizar fondos pastel suaves / difuminados sutiles para separar secciones,
- mejorar la percepción de capas de información,
- mantener consistencia con Galaxy Nebula,
- hacer que el módulo se vea más profesional y menos seco.

---

## Tarea 3 — Mejorar iconos del nav y de módulos
Debes revisar la iconografía general y mejorarla donde haga falta.

Incluye:
- íconos del nav lateral,
- íconos de hero/header de módulos,
- íconos de secciones internas importantes si amerita.

Requisitos:
- más bonitos,
- más consistentes,
- más agradables visualmente,
- sin perder semántica ni accesibilidad.

---

## Tarea 4 — Auditar flujo de anulaciones
Sin cambiar la lógica financiera crítica, investiga el flujo actual de anulaciones.

Debes identificar:
- archivos y funciones implicadas,
- qué pasa al anular una venta en efectivo,
- qué pasa al anular una venta Yape/Plin,
- qué pasa al anular una venta mixta,
- relación con apertura/cierre de caja,
- relación con reportes e ingresos netos.

---

## Tarea 5 — Diagnosticar el caso Yape / Plin negativo en reportes
Debes investigar por qué puede aparecer un valor negativo en el reporte de Yape / Plin.

Quiero que determines:
- si es comportamiento esperado por la modelación actual,
- si es una señal de mala separación entre devolución contable y caja física,
- si es un bug,
- o si es una decisión contable mal comunicada en la UI/reportes.

Debes dejarlo documentado con lenguaje claro y técnico.

---

## Tarea 6 — Crear documento de auditoría y opciones de solución
Debes crear un documento nuevo, por ejemplo:
- `docs/AUDITORIA-ANULACIONES-CAJA-REPORTES.md`

Debe incluir como mínimo:
1. resumen ejecutivo,
2. mapa del flujo actual,
3. componentes/archivos implicados,
4. análisis por método de pago:
   - efectivo,
   - yape/plin,
   - mixto,
5. impacto en caja física,
6. impacto en reportes,
7. riesgos de integridad,
8. diagnóstico del caso Yape negativo,
9. opciones de solución,
10. recomendación principal.

Analiza al menos estas opciones:
- **Opción A:** mantener negativos como contramovimiento contable.
- **Opción B:** separar ventas positivas y anulaciones/devoluciones por canal.
- **Opción C:** separar caja física vs canal digital / compensación.
- **Opción D:** modelar un ledger de movimientos tipados.

Puedes añadir otras si descubres una mejor.

---

## Restricciones absolutas
1. **No usar comandos Git/GitHub bajo ninguna circunstancia.**
   - Prohibido `git`, `gh`, APIs de GitHub, conectores, push, pull, status, diff, commit, branch, etc.

2. **No ejecutar pruebas ni verificaciones pesadas.**
   - No lint.
   - No build.
   - No tests.
   - No Chromium.
   - No Spark.
   - No deploy.

3. **No modificar todavía la lógica financiera crítica.**
   - No tocar el dominio final de anulaciones, caja, reportes, persistencia o Firestore.
   - Solo auditar, documentar y proponer soluciones.

4. **Sí puedes modificar UI/UX** de:
   - Personal,
   - Ajustes,
   - iconografía.

5. **No instalar dependencias nuevas.**
   - Usa la arquitectura ya disponible.

---

## Entrega final esperada
Cuando termines, responde únicamente con:

1. lista breve de archivos modificados para UX,
2. archivo(s) creados para auditoría,
3. resumen de mejoras en Personal,
4. resumen de mejoras en Configuración global / Ajustes,
5. resumen de mejoras en iconografía,
6. hallazgo principal sobre anulaciones y reportes,
7. resumen de las opciones de solución propuestas,
8. confirmación explícita de que **no ejecutaste Git/GitHub, pruebas ni despliegues**,
9. confirmación explícita de que **no modificaste la lógica financiera crítica**, solo la auditaste.

No declares el sistema listo para producción.

Comienza ahora con la implementación completa de **P12-10**.
