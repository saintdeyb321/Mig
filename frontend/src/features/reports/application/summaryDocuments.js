import { get, financial, integer } from '../../../../../functions/src/reports/summaryModel.js';
import { createOverviewSheet, createSheet, excelDay } from '../../../utils/excelHelpers.js';
import { escapeHtml as escape } from '../../../shared/security/html.js';
import { reportTime, visibleDay } from '../domain/reportPeriod.js';
import { branchReportName, reportLabel } from './reportNames.js';

const sol = value => value / 100;
const fmt = value => typeof value === 'number' ? new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value) : value;
const cashFormat = value => 'S/ ' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = value => typeof value === 'number' ? cashFormat(value) : value;
const evidence = 'Los reembolsos contables requieren comprobación del desembolso.';
const column = (format = '', tone = 'info', width = 17) => ({ format, tone, width });

function financialRow(values) {
  const face = financial(values);
  return { 'Mostrador (S/)': sol(face.pos), 'Pedidos (S/)': sol(face.orders), 'Efectivo (S/)': sol(face.cash.net),
    'Yape/Plin (S/)': sol(face.digital.net), 'Neto (S/)': sol(face.net), Tickets: get(values, 'tickets'),
    'Tickets anulados': get(values, 'voids'), 'Pedidos anulados': get(values, 'cancelled') };
}
function cashRow(values) {
  const v = key => get(values, key);
  const verify = key => v('unverified') && !v('verifiedClosings') ? 'Sin verificar' : sol(v(key));
  return { Aperturas: v('openings'), Cierres: v('closings'), Cuadradas: v('balanced'), 'Con sobrante': v('extra'), 'Con faltante': v('short'),
    'Vencidas sin conteo': v('expired'), 'Por revisar': v('review'), 'Sobrante confirmado (S/)': verify('confirmedExtra'),
    'Faltante confirmado (S/)': verify('confirmedShort'), 'Cierres sin verificación': v('unverified') };
}
function ordersRow(values) {
  const v = key => get(values, key);
  const amount = kind => sol(integer(v(kind + 'Cash') + v(kind + 'Digital')));
  const cash = sol(integer(v('advanceCash') + v('paymentCash') + v('refundCash')));
  const digital = sol(integer(v('advanceDigital') + v('paymentDigital') + v('refundDigital')));
  return { Adelantos: v('advances'), 'Adelantos (S/)': amount('advance'), Abonos: v('payments'), 'Abonos (S/)': amount('payment'),
    'Reembolsos contables': v('refunds'), 'Reembolsos contables (S/)': amount('refund'), 'Neto pedidos (S/)': sol(financial(values).orders),
    'Efectivo (S/)': cash, 'Yape/Plin (S/)': digital, 'Pedidos anulados': v('cancelled'), Creados: v('created'),
    Entregados: v('delivered'), Pendientes: v('pending'), 'Con saldo': v('debt') };
}
const schema = (fields, tones = {}) => Object.fromEntries(fields.map(name => [name,
  name === 'Sucursal' || name === 'Producto' ? column('', 'info', 26)
    : name === 'Fecha' ? column('date', 'info', 16)
    : name === 'Mes' ? column('', 'info', 14)
    : column(name.endsWith('(S/)') ? 'money' : 'count', tones[name] ?? 'ivory')]));
const displayDate = date => date.length === 7 ? date : visibleDay(date);
const cutoff = view => {
  const day = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'short' }).format(view.calculatedThrough);
  return day + ' · ' + reportTime(view.calculatedThrough);
};

export function buildSummaryWorkbook(XLSX, view, { period, business, branchesMap = {}, now = new Date() }) {
  if (!view.verified || !Array.isArray(view.products)) throw new Error('Resumen sin cobertura completa de productos.');
  const workbook = XLSX.utils.book_new(), annual = period.filter === 'todo';
  workbook.Props = { Title: 'Informe gerencial de ventas', Subject: period.start + ' – ' + period.end, CreatedDate: now };
  const overview = financialRow(view.values), finance = financial(view.values);
  const blocks = [
    { label: 'RESUMEN DEL NEGOCIO', tone: 'header', bold: true },
    { label: 'Negocio', value: business, tone: 'info' },
    { label: 'Fuente resumida verificada', value: view.mode === 'manual' ? 'Publicación administrativa' : 'Consolidación de servidor', tone: 'info' },
    { label: 'Actualizado hasta (Lima)', value: cutoff(view), tone: 'info' },
    { label: 'Estado del período', value: view.closed ? 'Cerrado' : 'En curso', tone: 'warning' },
    { label: 'INGRESO NETO REGISTRADO', value: overview['Neto (S/)'], format: 'money', tone: 'success', bold: true },
    ...[['VENTAS DE MOSTRADOR', overview['Mostrador (S/)'], 'cash'], ['PAGOS DE PEDIDOS', overview['Pedidos (S/)'], 'product'],
      ['Efectivo', overview['Efectivo (S/)'], 'cash'], ['Yape / Plin', overview['Yape/Plin (S/)'], 'digital'],
      ['Anulaciones de mostrador', sol(finance.cash.posCompensations + finance.digital.posCompensations), 'danger'],
      ['Reembolsos de pedidos', sol(finance.cash.contractRefunds + finance.digital.contractRefunds), 'warning']]
      .map(([label, value, tone]) => ({ label, value, tone, format: 'money' })),
    ...[['TICKETS COMPLETADOS', overview.Tickets], ['TICKETS ANULADOS', overview['Tickets anulados']], ['PEDIDOS ANULADOS', overview['Pedidos anulados']]]
      .map(([label, value]) => ({ label, value, tone: /ANULADOS/.test(label) && value ? 'danger' : 'ivory', format: 'count' })),
    { label: evidence, tone: 'warning', note: true, height: 24 },
  ];
  XLSX.utils.book_append_sheet(workbook, createOverviewSheet(XLSX, blocks), 'Resumen_Financiero');
  const append = (name, rows, headers, tones, footer = []) =>
    XLSX.utils.book_append_sheet(workbook, createSheet(XLSX, rows, schema(headers, tones), { filter: !rows.some(row => row._kind), footer }), name);
  const branchName = id => branchReportName(branchesMap, id), dates = annual ? 'Mes' : 'Fecha';
  const dateValue = date => annual ? date : excelDay(date);
  if (view.branchIds.length > 1) {
    append('Comparativa_Sedes', view.branches.map(row => ({ Sucursal: branchName(row.key), ...financialRow(row.values) })),
      ['Sucursal', ...Object.keys(overview)], { 'Neto (S/)': 'success' },
      [{ Sucursal: 'TOTAL NEGOCIO', ...overview, _kind: 'business-total' }]);
  }
  append(annual ? 'Evolucion_Mensual' : 'Evolucion_Diaria',
    view.evolution.map(row => ({ [dates]: dateValue(row.key), ...financialRow(row.values) })), [dates, ...Object.keys(overview)],
    { 'Neto (S/)': 'success' }, [{ ...overview, _kind: 'business-total' }]);
  const grouped = project => view.groups.flatMap((row, i, all) => [
    ...(i && row.branchId !== all[i - 1].branchId ? [{ _kind: 'group-spacer' }] : []),
    { Sucursal: branchName(row.branchId), [dates]: dateValue(row.date), ...project(row.values) },
  ]);
  for (const [name, project, tones] of [
    ['Resumen_Cajas', cashRow, { 'Con sobrante': 'warning', 'Con faltante': 'danger', 'Vencidas sin conteo': 'warning', 'Por revisar': 'warning' }],
    ['Resumen_Pedidos', ordersRow, { 'Reembolsos contables (S/)': 'danger', 'Pedidos anulados': 'danger', 'Neto pedidos (S/)': 'product' }],
  ]) {
    const sum = project(view.values);
    append(name, grouped(project), ['Sucursal', dates, ...Object.keys(sum)], tones, [{ Sucursal: 'TOTAL NEGOCIO', ...sum, _kind: 'business-total' }]);
  }
  if (view.products.length) {
    const byId = new Map();
    for (const product of view.products) {
      const current = byId.get(product.id);
      byId.set(product.id, current ? { ...current, qty: integer(current.qty + product.qty), cents: integer(current.cents + product.cents),
        name: current.first < product.first ? current.name : product.name, first: current.first < product.first ? current.first : product.first } : product);
    }
    const rank = (a, b) => b.qty - a.qty || b.cents - a.cents || a.name.localeCompare(b.name, 'es');
    const line = product => ({ Producto: reportLabel(product.name, 'Producto sin nombre', product.id), 'Cantidad vendida': product.qty, 'Ventas (S/)': sol(product.cents) });
    append('Productos_Global', [...byId.values()].sort(rank).map(line), ['Producto', 'Cantidad vendida', 'Ventas (S/)'], { 'Ventas (S/)': 'product' });
    append('Productos_Sedes', [...view.products].sort((a, b) => a.branchId.localeCompare(b.branchId) || rank(a, b))
      .flatMap((product, i, all) => [
        ...(i && all[i - 1].branchId !== product.branchId ? [{ _kind: 'group-spacer' }] : []),
        { Sucursal: branchName(product.branchId), ...line(product) },
      ]), ['Sucursal', 'Producto', 'Cantidad vendida', 'Ventas (S/)'], { 'Ventas (S/)': 'product' });
  }
  return workbook;
}

export function managementSummaryReportHtml(view, { period, business, branchesMap = {} }) {
  if (!view.verified) throw new Error('Resumen sin cobertura.');
  const title = period.filter === 'todo' ? 'Informe anual' : 'Informe mensual';
  const overview = financialRow(view.values);
  const channels = financial(view.values);
  const table = (keys, rows) => '<div class="table"><table><thead><tr>' + keys.map(key => '<th scope="col">' + escape(key) + '</th>').join('')
    + '</tr></thead><tbody>' + rows.map(row => '<tr>' + keys.map(key => '<td>' + escape(key.endsWith('(S/)') ? signed(row[key]) : fmt(row[key])) + '</td>').join('') + '</tr>').join('')
    + '</tbody></table></div>';
  const branches = view.branches.length ? view.branches.map(({ key, values }) => ({ name: branchReportName(branchesMap, key), values }))
    : [{ name: 'Total del negocio', values: view.values }];
  const operational = (project, keys) => table(['Sucursal', ...keys], branches.map(branch => ({ Sucursal: branch.name, ...project(branch.values) })));
  const maximum = Math.max(1, ...view.evolution.map(row => Math.abs(financial(row.values).net)));
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{color:#30243f;background:#fffefa;margin:0;font:12px system-ui,sans-serif}
  main{max-width:920px;margin:auto;padding:16px}h1,h2{color:#442067}h1{font-size:24px;margin:0}h2{font-size:15px}p{margin:6px 0}
  section{margin:14px 0}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px;text-align:left;border-bottom:1px solid #dbd0e5}
  th{background:#eee6f9}thead{display:table-header-group}tr{break-inside:avoid}.table{overflow-x:auto}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px}
  .card{padding:8px;border-radius:7px;background:#e6f6eb}.card strong{display:block;font-size:16px}.bar{display:grid;grid-template-columns:90px 1fr auto;gap:8px;align-items:center}
  .bar i{display:block;background:#6150b3;height:6px;border-radius:4px}.bar[data-negative="true"] i{background:#9f2741}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.table{overflow:visible}main{padding:0}h2{break-after:avoid}
  th,td{font-size:11px;padding:4px}td{overflow-wrap:anywhere}}</style>
  <main><h1>${title}</h1><p>${escape(business)} · ${visibleDay(period.start)} – ${visibleDay(period.end)}</p>
  <p>Fuente resumida verificada${view.mode === 'manual' ? ' · Publicación administrativa' : ''} · Actualizado hasta ${cutoff(view)} (Lima)</p>
  <p>${view.closed ? 'Período cerrado' : 'Período en curso'}</p>
  <section class="cards">${Object.entries(overview).map(([label, value]) => `<div class="card">${label}<strong>${label.endsWith('(S/)') ? cashFormat(value) : value}</strong></div>`).join('')}</section>
  <section><h2>Ajustes por canal</h2>${table(['Movimiento', 'Efectivo (S/)', 'Yape/Plin (S/)'],
    [['Cobros registrados', 'collections'], ['Anulaciones de mostrador', 'posCompensations'], ['Reembolsos contables', 'contractRefunds']]
      .map(([label, key]) => ({ Movimiento: label, 'Efectivo (S/)': sol(channels.cash[key]), 'Yape/Plin (S/)': sol(channels.digital[key]) })))}</section>
  ${!view.rows.length ? '<p>No hubo operaciones en el período verificado.</p>' : ''}
  <section><h2>Evolución del neto</h2>${view.evolution.map(row => {
    const value = financial(row.values).net;
    return `<div class="bar" data-negative="${value < 0}"><span>${displayDate(row.key)}</span><i style="width:${Math.abs(value) / maximum * 100}%"></i><strong>${cashFormat(sol(value))}</strong></div>`;
  }).join('')}</section>
  ${branches.length > 1 ? '<section><h2>Sucursales</h2>' + operational(financialRow, Object.keys(overview)) + '</section>' : ''}
  ${view.topProducts.length ? '<section><h2>Productos destacados</h2>' + table(['Producto', 'Unidades', 'Ventas (S/)'], view.topProducts.map(row =>
    ({ Producto: reportLabel(row.name, 'Producto sin nombre'), Unidades: row.qty, 'Ventas (S/)': sol(row.cents) }))) + '</section>' : ''}
  <section><h2>Cajas — resumen</h2>${operational(cashRow, ['Aperturas', 'Cierres', 'Cuadradas', 'Con sobrante', 'Con faltante',
    'Vencidas sin conteo', 'Por revisar', 'Cierres sin verificación'])}
  ${operational(cashRow, ['Sobrante confirmado (S/)', 'Faltante confirmado (S/)'])}</section>
  <section><h2>Pedidos — resumen</h2>${operational(ordersRow, ['Creados', 'Entregados', 'Pendientes', 'Pedidos anulados', 'Adelantos', 'Abonos',
    'Reembolsos contables', 'Neto pedidos (S/)'])}
  ${operational(ordersRow, ['Adelantos (S/)', 'Abonos (S/)', 'Reembolsos contables (S/)', 'Efectivo (S/)', 'Yape/Plin (S/)'])}<p>${evidence}</p></section>
  </main></html>`;
}
