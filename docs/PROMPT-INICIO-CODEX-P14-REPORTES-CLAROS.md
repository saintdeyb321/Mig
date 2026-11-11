# INICIO — MIGAPOS P14-RC+ · INFORMES CLAROS Y FONDO CREMA GLOBAL

Trabaja exclusivamente en `C:\Proyectos\MigaPOS`, sobre el árbol local que el propietario ha seleccionado para publicar en la rama `marketing/video-promo-migapos`.

**La rama contiene trabajo promocional inconcluso. IGNÓRALO POR COMPLETO.** No abras, audites ni edites rutas `marketing/**`, `.agents/**`, videos, audios, assets o documentación del video. No ejecutes absolutamente ningún comando Git/GitHub ni conector/API relacionado; el propietario selecciona la rama y publica después.

Lee los archivos:

- `docs/PLAN-P14-REPORTES-CLAROS-AVISOS-CAJA.md`
- `docs/PROMPT-CODEX-P14-REPORTES-CLAROS.md`

Implementa los dos objetivos descritos en el plan actualizado:

**A. Reportes:** mejora semántica y visual de Reportes/PDF/Excel, sin modificar resultados financieros.

**B. Apariencia global heredada:** ajusta la paleta compartida para que **todos los módulos** tengan un fondo marfil/crema cálido, luminoso, elegante, como masa de pan o vainilla tenue; tarjetas claras con pequeños contrastes pastel; sidebar violeta profundo **vivo** y acorde al logo. No usar gris plano, azul opaco generalizado ni degradados llamativos. La referencia visual está en la captura compartida por el propietario. Implementar con tokens existentes, **preferentemente solo `frontend/src/shared/styles/theme.css` y `frontend/src/index.css`**, con `AppLayout.jsx`/`BottomNav.jsx` exclusivamente si resultan necesarios para pintar el shell. No modificar componentes funcionales de todos los módulos. Las «alertas operativas» actuales son incidencias de sesiones de caja, **no notificaciones**; conviértelas en «Cajas que requieren revisión» con explicación, datos monetarios correctamente etiquetados y máximo seis últimas visibles **sin consultas adicionales**.

Renombra los encabezados ambiguos del Excel por sede para que quede claro que «Ingreso» es **«Total neto registrado (S/)»**, «Efectivo/Yape» son netos contables y «Ingreso POS/Pedidos» son componentes del mismo total. Mantén los números intactos y alinea las etiquetas equivalentes de las hojas globales.

Asegura los ejemplos: **S/6 = S/5.50 + S/0.50** y **S/222 = S/17 + S/205 = S/100 + S/122**. Reimporta el XLSX, valida PDF A4 con 0/1/6/>6 avisos y demuestra cero lecturas SDK nuevas. También revisa la paleta heredada visualmente en Dashboard, POS, Historial, Contratos, Caja, Personal, Ajustes, Reportes, Productos y Categorías; móvil y escritorio; legibilidad WCAG AA, foco y estados. **No romper el carrito anclado del POS: Cobrar y total visibles incluso a 1280×560**. La impresión A4 debe permanecer mayoritariamente blanca. Ejecuta pruebas locales, lint y build sin instalar dependencias.

Crea `docs/RESULTADOS-P14-REPORTES-CLAROS.md` con una sección de **paleta cálida global**, lista de tokens y cambios CSS, capturas/mediciones y riesgos UX. Si ese nuevo Markdown activa el inventario estricto, añade solo su ruta a la lista permitida de `tests/ui-security.test.mjs`, sin desactivar la prueba.

Prohibido modificar dominio financiero, Firestore, Rules, caja, ventas, contratos, autenticación, persistencia, marketing, video o desplegar. Permitidos **solo** los archivos de reportes/tests originalmente listados y los estilos compartidos explícitamente autorizados en la sección 5 del plan. Entrega el listado de archivos modificados y resultados PASS/FAIL/BLOCKED. **El propietario realizará commit/push por su cuenta.**

Comienza ahora.
