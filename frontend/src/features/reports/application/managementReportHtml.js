import { escapeHtml as text } from '../../../shared/security/html.js';
import { reportDay, reportTime, visibleDay } from '../domain/reportPeriod.js';
import { amount, CHANNEL_BREAKDOWN_ROWS, CHANNEL_EVIDENCE_NOTE, CHANNEL_NEGATIVE_NOTE } from '../domain/reportTotals.js';

const money = value => `S/ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = date => `${visibleDay(reportDay(date))} ${reportTime(date)}`;
const cell = (value, className) => `<td${className ? ` class="${className}"` : ''}>${text(value)}</td>`;
const table = (headers, rows, empty) => rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map(heading =>
  `<th scope="col">${text(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.join('')}</tr>`).join('')}</tbody></table></div>`
  : `<p class="muted">${text(empty)}</p>`;
const note = (total, shown) => total > shown ? `<p class="muted">Se muestran ${shown} de ${total}. Consulta el detalle en Excel.</p>` : '';

export function managementReportHtml(view, { period, business, branch, operator, branchesMap, generatedAt }) {
  const { summary, contractCounts, topProducts, branches, cashEvents, warning } = view;
  const { cash, digital } = summary.channels;
  const displayedBranches = branches.slice(0, 6);
  const alerts = cashEvents.filter(event => event.kind === 'expiry' || event.kind === 'closing'
    && (event.estimated || event.difference !== 0));
  const displayedAlerts = alerts.slice(-6).reverse();
  const payments = CHANNEL_BREAKDOWN_ROWS.map(({ key, label }) => [
    cell(label), cell(money(cash[key]), 'num'), cell(money(digital[key]), 'num'),
  ]);
  const cards = [
    ['Neto contable', money(summary.netRevenue)],
    ['Cobros registrados', money(amount(cash.collections + digital.collections))],
    ['Contramovimientos contables', money(summary.refunds)],
    ['Neto POS', money(summary.posRevenue)],
    ['Neto pedidos', money(summary.contractRevenue)],
    ['Tickets POS registrados', summary.posTicketCount],
  ];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Informe gerencial · MigaPOS</title>
    <style>
      @page{size:A4;margin:12mm}
      *{box-sizing:border-box}
      body{margin:0 auto;max-width:900px;padding:18px;color:#241d36;background:#fffefa;font:14px/1.4 system-ui,sans-serif;overflow-wrap:anywhere}
      header{border-top:5px solid #55428b;padding:12px 0;border-bottom:1px solid #c8c0d5}
      h1,h2,p{margin:0 0 7px} h1{font-size:29px;line-height:1.15} h2{font-size:17px;color:#39296b}
      .brand{color:#584190;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
      .muted,footer{color:#5a5265;font-size:12px}
      section{margin-top:14px}
      .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .card{border:1px solid #c4b9d9;background:#f7f4fc;border-radius:6px;padding:8px;break-inside:avoid}
      .card:first-child{border-color:#6b9d8b;background:#eff8f3}.card strong{display:block;font-size:18px;font-variant-numeric:tabular-nums}
      .callout{padding:8px 10px;border-left:3px solid #584190;background:#f7f4fc;margin-top:8px;break-inside:avoid}
      .warning{border-color:#936016;background:#fff7e6}
      .table-wrap{overflow-x:auto}
      table{width:100%;border-collapse:collapse} thead{display:table-header-group}
      th,td{padding:5px 6px;border-bottom:1px solid #ccc3d8;text-align:left}
      th{background:#f1edf8} tr{break-inside:avoid} .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
      .bounded{max-width:36mm;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      footer{margin-top:12px;padding-top:6px;border-top:1px solid #c8c0d5}
      @media screen and (max-width:460px){body{padding:10px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.card strong{font-size:15px}.table-wrap{margin-bottom:5px}}
      @media print{body{padding:0;background:#fff;font-size:11px}h1{font-size:24px}h2{font-size:15px}.table-wrap{overflow:visible}section{margin-top:10px}.operations{break-before:page}p,h2{orphans:2;widows:2}h2{break-after:avoid}th,td{padding:4px 5px}.bounded{max-width:36mm}}
    </style></head><body><main>
    <header><p class="brand">MigaPOS · Gestión del negocio</p><h1>Informe gerencial</h1>
      <p><strong>${text(business)}</strong> · ${text(branch)}</p>
      <p>${text(visibleDay(period.start))} al ${text(visibleDay(period.end))} · America/Lima</p>
      <p class="muted">Generado ${text(dateTime(generatedAt))} · ${text(operator)}</p>
    </header>
    <section><h2>Panorama financiero</h2><div class="cards">${cards.map(([label, value]) =>
      `<div class="card">${text(label)}<strong>${text(value)}</strong></div>`).join('')}</div>
      <p class="callout">El neto contable no representa dinero disponible ni beneficio neto.</p>
      ${warning ? `<p class="callout warning">${text(warning)}</p>` : '<p class="muted">Alcance: movimientos confirmados del período; conciliación física de caja fuera del informe.</p>'}
    </section>
    <section><h2>Cobros y compensaciones por canal</h2>${table(['Movimiento', 'Efectivo', 'Yape / Plin'], payments)}
      <p class="muted">${text(CHANNEL_NEGATIVE_NOTE)}</p><p class="muted">${text(CHANNEL_EVIDENCE_NOTE)}</p>
    </section>
    <section><h2>Pedidos y tickets</h2><p>Pedidos creados: ${view.orders.length} · Pendientes: ${contractCounts.pending} · Entregados: ${contractCounts.delivered} · Cancelados: ${contractCounts.cancelled} · Con saldo: ${contractCounts.withDebt}</p>
      <p>Pagos de pedidos registrados: ${summary.contractPaymentCount} · Tickets POS anulados: ${summary.voidedTicketCount}</p>
    </section>
    <footer>MigaPOS · Panorama financiero · Lima</footer>
    <div class="operations">
    <section><p class="brand">Operación y revisión</p><h2>Comparativa de sucursales</h2>${table(['Sucursal', 'Neto', 'Efectivo', 'Yape / Plin', 'Anulados', 'Pagos pedidos'],
      displayedBranches.map(row => [cell(branchesMap[row.branchId] ?? row.branchId, 'bounded'), cell(money(row.netRevenue), 'num'),
        cell(money(row.cashRevenue), 'num'), cell(money(row.digitalRevenue), 'num'), cell(row.voidedTicketCount, 'num'), cell(row.contractPaymentCount, 'num')]), 'Sin movimientos financieros en el período.')}
      ${note(branches.length, displayedBranches.length)}
    </section>
    <section><h2>Productos más vendidos</h2>${table(['Producto', 'Unidades netas', 'Importe neto'],
      topProducts.map(row => [cell(row.name, 'bounded'), cell(row.qty, 'num'), cell(money(row.revenue), 'num')]), 'Sin productos con unidades netas positivas.')}
      <p class="muted">Las unidades e importes netos incluyen las compensaciones del período.</p>
    </section>
    <section><h2>Cajas que requieren revisión</h2>${table(['Movimiento (Lima)', 'Sede', 'Responsable', 'Contado', 'Estado'],
      displayedAlerts.map(row => [cell(dateTime(row.date), 'num'), cell(branchesMap[row.branchId] ?? row.branchId, 'bounded'), cell(row.cashier, 'bounded'),
        cell(row.counted === null ? 'No declarado' : money(row.counted), 'num'), cell(row.state)]), 'Sin movimientos de caja pendientes de revisión dentro del período.')}
      ${note(alerts.length, displayedAlerts.length)}
      ${summary.refundCount ? '<p class="muted">Verifica el medio de devolución si hubo desembolsos vinculados a los contramovimientos.</p>' : ''}
      <p class="muted">El vencimiento sin arqueo conserva el fondo original. No hay diferencia calculable si falta dinero contado.</p>
    </section><footer>MigaPOS · Resumen de operación · Consulta el detalle en Excel.</footer>
    </div></main></body></html>`;
}
