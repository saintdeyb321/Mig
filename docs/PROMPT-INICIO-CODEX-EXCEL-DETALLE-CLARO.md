# MENSAJE DE INICIO PARA CODEX — EXCEL DETALLE CLARO

Trabaja **solo en** `C:\Proyectos\MigaPOS`. Ya dejé seleccionada manualmente la rama `fix/migapos-production-readiness`; tú no uses Git/GitHub ni cambies de rama. La rama `marketing/video-promo-migapos` y la carpeta `marketing/` son intocables.

Lee íntegramente:
- `docs/PLAN-EXCEL-DETALLE-CLARO-MIGAPOS.md`
- `docs/PROMPT-CODEX-EXCEL-DETALLE-CLARO.md`

Implementa la corrección enfocada: el detalle por sede no debe repetir sucursal ni `(Lima)`; pagos de pedidos no son productos vendidos, ni deben llevar cantidad o precio unitario ficticios; tickets multítem aportan el total financiero una sola vez. Audita la redundancia en las demás hojas sin deshacer las comparativas útiles, mantén cálculos y caché sin lecturas Firestore nuevas, usa estilos/formatos por nombres de columnas y verifica reimportando el Excel.

Caso de aceptación: 3 tickets POS (S/20 + S/37.30 + S/6) y 2 pagos de pedido (S/20 + S/80) producen **S/163.30** de cobros registrados y ninguna doble contabilización; preservar todos los demás escenarios financieros de regresión.

Actualiza el inventario Markdown estricto por rutas exactas —incluidas las dos rutas legítimas del commit de video ya existentes— sin tocar marketing. Ejecuta pruebas locales, lint y build, y documenta en `docs/RESULTADOS-EXCEL-DETALLE-CLARO.md` resultados y cualquier bloqueo.

**Prohibido**: todos los comandos y conectores Git/GitHub, deployments, instalaciones, Firebase real, cambios a caja/ventas/anulaciones/persistencia/Rules/índices, o debilitar controles.

Al terminar, entrégame archivos modificados y el informe. **Yo realizaré el commit, push y auditoría de GitHub.**
