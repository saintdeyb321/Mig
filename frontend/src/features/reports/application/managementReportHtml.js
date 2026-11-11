import { escapeHtml as text } from '../../../shared/security/html.js';
import { reportDay, reportTime, visibleDay } from '../domain/reportPeriod.js';
import { CHANNEL_BREAKDOWN_ROWS } from '../domain/reportTotals.js';

const money = value => `S/ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = date => `${visibleDay(reportDay(date))} ${reportTime(date)}`;
const cell = (value, className) => `<td${className ? ` class="${className}"` : ''}>${text(value)}</td>`;
const table = (headers, rows) => `<div class="table-wrap"><table><thead><tr>${headers.map(heading =>
  `<th scope="col">${text(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.join('')}</tr>`).join('')}</tbody></table></div>`;

export function cashReviewPresentation(events) {
  const incidents = [];
  for (const event of events) {
    if (!['expiry', 'closing'].includes(event.kind)) continue;
    const declared = event.kind === 'closing' && Number.isFinite(event.counted);
    const difference = declared && !event.estimated && Number.isFinite(event.difference) ? event.difference : null;
    let title, explanation, severity = 'warning';
    if (event.kind === 'expiry') {
      title = 'Turno vencido sin arqueo';
      explanation = 'Revisa el turno anterior y sus comprobantes.';
    } else if (event.estimated) {
      title = 'Cierre pendiente de conciliación';
      explanation = 'La referencia de caja es provisional. Coteja el cierre con los comprobantes.';
    } else if (difference === null) {
      title = 'Cierre sin diferencia calculable';
      explanation = 'Revisa los importes pendientes del cierre.';
    } else if (difference !== 0) {
      severity = difference < 0 ? 'danger' : 'warning';
      title = difference < 0 ? 'Faltante registrado' : 'Sobrante registrado';
      explanation = 'Coteja la diferencia registrada con el conteo y los comprobantes.';
    } else continue;
    incidents.push({ title, explanation, severity, branch: event.branch, occurredAt: event.date,
      responsible: event.cashier, recordedBy: event.actor !== event.cashier ? event.actor : null,
      moneyLabel: declared ? 'Efectivo declarado' : 'Efectivo contado', moneyValueText: declared ? money(event.counted) : 'No declarado', difference });
  }
  incidents.sort((a, b) => b.occurredAt - a.occurredAt);
  return { totalCount: incidents.length, visible: incidents.slice(0, 6) };
}

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
  const cashReview = cashReviewPresentation(cashEvents);
  const financial = summary.posTicketCount || summary.contractPaymentCount || summary.voidedTicketCount || summary.refundCount;
  const hasActivity = financial || view.orderCount || cashEvents.length;
  const channelRows = [{ name: 'Efectivo', value: cash.net }, { name: 'Yape / Plin', value: digital.net }];
  const cards = [
    ['Cobros registrados', money(collections)], ['Ajustes contables', money(summary.refunds)],
    ['Total neto registrado', money(summary.netRevenue)], ['Tickets de venta válidos', summary.posTicketCount],
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
    .subtitle{margin:4px 0}.meta,.muted{font-size:9pt;color:#52485e}
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
    .warning{border-color:#905a23;background:#fff5e3}
    .cash-review h2{color:#412767}.cash-review-intro{break-after:avoid}
    .cash-review-mark{display:inline-grid;place-items:center;width:1.2em;height:1.2em;margin-right:.45em;border-radius:4px;background:#fff1da;color:#75471a;font-size:.9em}
    .review-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);gap:2px 9px;margin-top:4px;padding:4px 7px;border:1px solid #e9ded1;border-left:3px solid #9a6125;border-radius:4px;background:#fffaf3;font-size:8.5pt;line-height:1.23;break-inside:avoid}
    .review-row.danger{border-left-color:#973b43}.review-row h3{margin:0;color:#43265d;font-size:9.5pt}
    .review-amounts{margin:0;text-align:right;font-variant-numeric:tabular-nums}.review-amounts dt,.review-amounts dd{display:inline;margin:0}
    .review-amounts dd{font-weight:700}.review-action{grid-column:1/-1;color:#514451}
    @media screen and (max-width:520px){body{padding:9px} .cards{grid-template-columns:repeat(2,minmax(0,1fr))}.card strong{font-size:13pt}.bar-row{grid-template-columns:1fr 1fr}.track{order:3;grid-column:1/-1;margin-bottom:3px}.review-row{grid-template-columns:1fr}.review-amounts{text-align:left}}
    @media print{body{padding:0;background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      .masthead{padding-block:6px}.section{margin-top:8px;orphans:2;widows:2}.card,.pill{padding-block:5px}
      .chart{padding-block:4px;margin-block:4px 5px}th,td{padding-block:3px}.review-row{padding-block:2px;margin-top:3px}
      .table-wrap{overflow:visible}h2{break-after:avoid}.next-page{break-before:page}}
  </style></head><body><main>
    <header class="masthead"><p class="eyebrow">MigaPOS · Reporte gerencial</p><h1>Informe del negocio</h1>
      <p class="subtitle"><strong>${text(business)}</strong> · ${text(branch)}</p>
      <p>${text(visibleDay(period.start))} al ${text(visibleDay(period.end))} · America/Lima <span class="meta">· Movimientos contables del período</span></p>
      <p class="meta">Datos consultados ${text(dateTime(fetchedAt))} · Generado ${text(dateTime(generatedAt))} · ${text(operator)}</p>
    </header>
    ${warning ? `<p class="notice warning">${text(warning)}</p>` : ''}
    ${financial ? `<section class="section"><h2>Panorama financiero</h2>
      <div class="cards">${cards.map(([label, value], i) => `<div class="card ${i === 2 ? 'net' : ''}">${text(label)}<strong>${text(value)}</strong></div>`).join('')}</div>
      <p class="muted">Neto de ventas en mostrador ${text(money(summary.posRevenue))} · Neto de pagos de pedidos ${text(money(summary.contractRevenue))}
        · ${summary.voidedTicketCount} tickets anulados · ${summary.contractPaymentCount} pagos de pedidos</p>
    </section>
    <section class="section"><h2>Neto por canal</h2>${signedBars(channelRows)}
      ${table(['Movimiento', 'Efectivo', 'Yape / Plin'], CHANNEL_BREAKDOWN_ROWS.map(({ key, label }) =>
        [cell(label), cell(money(cash[key]), 'num'), cell(money(digital[key]), 'num')]))}
      ${channelRows.some(row => row.value < 0) ? '<p class="muted">El neto negativo incluye ajustes cuyos cobros pueden pertenecer a otro período.</p>' : ''}
    </section>` : `<div class="notice"><strong>${hasActivity ? 'Sin cobros ni ajustes contables en el período' : 'No se registraron movimientos confirmados en este período'}</strong>
      <p>Total neto registrado ${text(money(summary.netRevenue))}</p></div>`}
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
    ${cashReview.visible.length ? `<section class="section cash-review" aria-labelledby="cash-review-title">
      <div class="cash-review-intro"><h2 id="cash-review-title"><span class="cash-review-mark" aria-hidden="true">!</span>Cajas que requieren revisión</h2>
      <p class="muted">Incidencias de turnos de caja. Compara el efectivo declarado con tus comprobantes.</p></div>
      ${cashReview.visible.map(row => `<article class="review-row ${row.severity}"><div><h3>${text(row.title)}</h3>
        <p>${text(row.branch)} · ${text(dateTime(row.occurredAt))} · Responsable: ${text(row.responsible)}${row.recordedBy ? ` · Registró: ${text(row.recordedBy)}` : ''}</p></div>
        <dl class="review-amounts"><div><dt>${text(row.moneyLabel)}</dt> <dd>${text(row.moneyValueText)}</dd></div>
        ${row.difference === null ? '' : `<div><dt>Diferencia registrada</dt> <dd>${text(money(row.difference))}</dd></div>`}</dl>
        <p class="review-action">${text(row.explanation)}</p></article>`).join('')}
      ${cashReview.totalCount > cashReview.visible.length ? `<p class="muted">Se muestran las 6 incidencias más recientes de ${cashReview.totalCount} detectadas en el período.</p>` : ''}
    </section>` : ''}
    ${summary.refundCount ? '<p class="muted section">Los ajustes contables no acreditan una devolución de dinero.</p>' : ''}
  </main></body></html>`;
}
