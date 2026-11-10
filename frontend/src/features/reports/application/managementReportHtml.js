import { escapeHtml as text } from '../../../shared/security/html.js';
import { reportDay, reportTime, visibleDay } from '../domain/reportPeriod.js';
import { CHANNEL_BREAKDOWN_ROWS } from '../domain/reportTotals.js';

const money = value => `S/ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = date => `${visibleDay(reportDay(date))} ${reportTime(date)}`;
const cell = (value, className) => `<td${className ? ` class="${className}"` : ''}>${text(value)}</td>`;
const table = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map(heading =>
  `<th scope="col">${text(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.join('')}</tr>`).join('')}</tbody></table></div>`;

function signedBars(rows) {
  const max = Math.max(1, ...rows.map(row => Math.abs(row.value)));
  return `<div class="chart">${rows.map(({ name, value }) => {
    const width = Math.abs(value) * 50 / max;
    const left = value < 0 ? 50 - width : 50;
    return `<div class="bar-row"><span>${text(name)}</span>
      <div class="track" aria-hidden="true"><span class="bar ${value < 0 ? 'negative' : ''}" style="left:${left}%;width:${width}%"></span></div>
      <strong class="num">${text(money(value))}</strong></div>`;
  }).join('')}</div>`;
}

export function managementReportHtml(view, { period, business, branch, operator, generatedAt, fetchedAt = generatedAt }) {
  const { summary, collections, contractCounts, topProducts, comparisons, cashEvents, warning } = view;
  const { cash, digital } = summary.channels;
  const sites = comparisons.slice(0, 6);
  const alerts = cashEvents.filter(event => event.kind === 'expiry' || event.kind === 'closing'
    && (event.estimated || event.difference !== 0));
  const shownAlerts = alerts.slice(-6).reverse();
  const financial = summary.posTicketCount || summary.contractPaymentCount || summary.voidedTicketCount || summary.refundCount;
  const hasActivity = financial || view.orderCount || cashEvents.length;
  const channelRows = [{ name: 'Efectivo', value: cash.net }, { name: 'Yape / Plin', value: digital.net }];
  const cards = [
    ['Cobros registrados', money(collections)], ['Ajustes contables', money(summary.refunds)],
    ['Neto contable', money(summary.netRevenue)], ['Tickets POS', summary.posTicketCount],
  ];
  const counts = [['Pendientes', contractCounts.pending], ['Entregados', contractCounts.delivered],
    ['Cancelados', contractCounts.cancelled], ['Con saldo', contractCounts.withDebt]];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1"><title>Informe del negocio · MigaPOS</title>
  <style>
    @page{size:A4 portrait;margin:10mm 12mm}
    *{box-sizing:border-box} body{max-width:920px;margin:0 auto;padding:18px;color:#271d3d;background:#fffdfa;font:10.5pt/1.34 system-ui,Arial,sans-serif;overflow-wrap:anywhere}
    h1,h2,p{margin:0} h1{font-size:23pt;line-height:1.12;letter-spacing:-.035em} h2{font-size:13pt;line-height:1.2;margin-bottom:6px}
    .masthead{border-top:5px solid #52368a;border-bottom:1px solid #cec2df;padding:9px 0 10px;break-inside:avoid}
    .eyebrow{font-size:9pt;letter-spacing:.16em;text-transform:uppercase;color:#543c89;font-weight:800;margin-bottom:3px}
    .subtitle{margin:4px 0}.meta,.muted,footer{font-size:9pt;color:#52485e}
    .section{margin-top:13px} .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
    .card,.pill{border:1px solid #c7bdd6;background:#f6f2fc;border-radius:6px;padding:7px 8px;break-inside:avoid}
    .card.net{background:#ecf7f0;border-color:#7fa994;border-left:4px solid #1b684c}
    .card strong{display:block;font-size:15pt;margin-top:2px;line-height:1.16}
    .pill strong{display:block;font-size:12pt}.pill{font-size:9pt}
    .chart{padding:6px 9px;border:1px solid #d3c9df;border-radius:5px;margin:5px 0 7px;break-inside:avoid}
    .bar-row{display:grid;grid-template-columns:minmax(6rem,1fr) 2fr minmax(6rem,1fr);align-items:center;gap:6px;min-height:20px;font-size:9pt}
    .track{position:relative;height:12px;background:#f1edf6;border:1px solid #ddd4e6;border-radius:3px}
    .track:after{content:'';position:absolute;left:50%;top:-1px;bottom:-1px;border-left:1px solid #493c5c}
    .bar{position:absolute;top:1px;bottom:1px;background:#6c50ab;border:1px solid #432a7a;border-radius:2px}
    .bar.negative{background:repeating-linear-gradient(135deg,#9a412b 0 2px,#f2dcd5 2px 4px);border-color:#793820}
    .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .table-wrap{overflow-x:auto} table{width:100%;border-collapse:collapse;font-size:9.5pt}
    thead{display:table-header-group} th,td{text-align:left;padding:4px 5px;border-bottom:1px solid #d6ccdf}
    th{background:#f2edf8} tr{break-inside:avoid}.bounded{max-width:52mm}
    .notice{padding:8px 10px;border-left:3px solid #6b4ba2;background:#f6f2fc;margin-top:8px;break-inside:avoid}
    .warning{border-color:#905a23;background:#fff5e3} .alert-row{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:5px 0;border-bottom:1px solid #ded5e7;font-size:9pt;break-inside:avoid}
    .alert-row span:last-child{text-align:right} footer{border-top:1px solid #cec2df;margin-top:12px;padding-top:6px;break-inside:avoid}
    @media screen and (max-width:520px){body{padding:9px} .cards{grid-template-columns:repeat(2,minmax(0,1fr))}.card strong{font-size:13pt}.bar-row{grid-template-columns:1fr 1fr}.track{order:3;grid-column:1/-1;margin-bottom:3px}}
    @media print{body{padding:0;background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      .table-wrap{overflow:visible}h2{break-after:avoid}.next-page{break-before:page}.section{orphans:2;widows:2}}
  </style></head><body><main>
    <header class="masthead"><p class="eyebrow">MigaPOS · Reporte gerencial</p><h1>Informe del negocio</h1>
      <p class="subtitle"><strong>${text(business)}</strong> · ${text(branch)}</p>
      <p>${text(visibleDay(period.start))} al ${text(visibleDay(period.end))} · America/Lima</p>
      <p class="meta">Datos consultados ${text(dateTime(fetchedAt))} · Generado ${text(dateTime(generatedAt))} · ${text(operator)}</p>
    </header>
    ${warning ? `<p class="notice warning">${text(warning)}</p>` : ''}
    ${financial ? `<section class="section"><h2>Panorama financiero</h2>
      <div class="cards">${cards.map(([label, value], i) => `<div class="card ${i === 2 ? 'net' : ''}">${text(label)}<strong>${text(value)}</strong></div>`).join('')}</div>
      <p class="muted">Neto POS ${text(money(summary.posRevenue))} · Neto pedidos ${text(money(summary.contractRevenue))}
        · ${summary.voidedTicketCount} tickets anulados · ${summary.contractPaymentCount} pagos de pedidos</p>
    </section>
    <section class="section"><h2>Neto por canal</h2>${signedBars(channelRows)}
      ${table(['Movimiento', 'Efectivo', 'Yape / Plin'], CHANNEL_BREAKDOWN_ROWS.map(({ key, label }) =>
        [cell(label), cell(money(cash[key]), 'num'), cell(money(digital[key]), 'num')]))}
      ${channelRows.some(row => row.value < 0) ? '<p class="muted">El neto negativo incluye ajustes cuyos cobros pueden pertenecer a otro período.</p>' : ''}
    </section>` : `<div class="notice"><strong>${hasActivity ? 'Sin cobros ni ajustes contables en el período' : 'No se registraron movimientos confirmados en este período'}</strong>
      <p>Neto contable ${text(money(summary.netRevenue))}</p></div>`}
    ${financial && sites.length ? `<section class="section"><h2>${sites.length > 1 ? 'Comparativa de sucursales' : 'Desempeño de la sede'}</h2>
      ${sites.length > 1 ? signedBars(sites.map(site => ({ name: site.name, value: site.net }))) : ''}
      ${table(['Sucursal', 'Neto POS', 'Neto pedidos', 'Neto total'], sites.map(site =>
        [cell(site.name, 'bounded'), cell(money(site.pos), 'num'), cell(money(site.orders), 'num'), cell(money(site.net), 'num')]))}
      ${comparisons.length > sites.length ? `<p class="muted">Se muestran ${sites.length} de ${comparisons.length} sucursales. Consulta el detalle en Excel.</p>`
    : sites.length > 1 ? '<p class="muted">La suma de sedes corresponde al total del negocio en este informe.</p>' : ''}
    </section>` : ''}
    ${topProducts.length ? `<section class="section ${sites.length >= 5 ? 'next-page' : ''}">
      ${sites.length >= 5 ? '<p class="eyebrow">MigaPOS · Informe del negocio · Continuación</p>' : ''}
      <h2>Productos destacados</h2>
      ${table(['Producto', 'Unidades netas', 'Importe neto'], topProducts.map(row =>
        [cell(row.name, 'bounded'), cell(row.qty, 'num'), cell(money(row.revenue), 'num')]))}</section>` : ''}
    ${view.orderCount ? `<section class="section"><h2>Pedidos del período</h2><div class="cards">${counts.map(([label, value]) =>
      `<div class="pill">${text(label)}<strong>${value}</strong></div>`).join('')}</div></section>` : ''}
    ${shownAlerts.length || summary.refundCount ? `<section class="section"><h2>Alertas operativas</h2>
      ${shownAlerts.map(row => `<div class="alert-row"><span><strong>${text(row.state)}</strong> · ${text(row.branch)}<br>
        ${text(row.actor)} · ${text(dateTime(row.date))} (Lima)</span>
        <span>${text(row.counted === null ? 'Contado no declarado' : `Contado ${money(row.counted)}`)}</span></div>`).join('')}
      ${alerts.length > shownAlerts.length ? '<p class="muted">Se muestran las seis alertas más recientes del período.</p>' : ''}
      ${summary.refundCount ? '<p class="muted">Los ajustes contables no acreditan una devolución de dinero.</p>' : ''}
    </section>` : ''}
    <footer>MigaPOS · El neto contable no equivale a ganancia ni a dinero disponible.</footer>
  </main></body></html>`;
}
