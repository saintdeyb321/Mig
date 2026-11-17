import { useEffect, useRef, useState } from 'react';
import { useTenantData } from '../../features/branches/context/TenantContext';
import { readAuditPage } from '../../features/reports/infrastructure/reportAuditRepository.js';
import { loadExcelModule } from '../../features/reports/application/excelModule.js';
import { writeSalesWorkbook } from '../../features/reports/application/salesWorkbook.js';
import { reportDay } from '../../features/reports/domain/reportPeriod.js';
import { createSheet, excelDay } from '../../utils/excelHelpers.js';
import { Alert, Button, Input, Select } from '../../shared/ui';

const PAGE_CAP = 4;
const money = value => Number.isFinite(value) ? 'S/ ' + value.toFixed(2) : 'Sin declarar';

export default function ReportAudits({ user }) {
  const { activeBranchId, businessBranches, identityKey } = useTenantData();
  const [open, setOpen] = useState(false), [area, setArea] = useState('cash'), [branch, setBranch] = useState('');
  const [from, setFrom] = useState(() => reportDay(new Date())), [to, setTo] = useState(() => reportDay(new Date()));
  const [filter, setFilter] = useState('incidents'), [lookup, setLookup] = useState('');
  const [state, setState] = useState(null), busy = useRef(null);
  const owner = user?.role === 'dueño', branchId = owner ? (branch || activeBranchId || 'global') : user?.branchId;
  const key = JSON.stringify([identityKey, branchId, open, area, from, to, filter, lookup]);
  useEffect(() => () => { busy.current?.abort(); busy.current = null; }, [key]);
  if (!user?.businessId || !['dueño', 'cajero'].includes(user.role) || !branchId) return null;
  const current = state?.key === key ? state : null;
  const scope = { uid: user.uid, businessId: user.businessId, branchId, area, from, to, filter, lookup: lookup.trim() };
  const siteName = id => businessBranches?.find(item => item.id === id)?.name ?? 'Sucursal';
  const load = async (cursor, exportPages = false) => {
    if (busy.current) return;
    if (exportPages && !window.confirm('Se consultarán como máximo 4 páginas (hasta 200 documentos). Si hay más datos, se exportarán solo esas páginas. ¿Continuar?')) return;
    const controller = new AbortController();
    busy.current = controller;
    setState({ key, loading: true });
    try {
      let page = await readAuditPage({ ...scope, cursor, signal: controller.signal });
      if (exportPages) {
        const rows = [...page.rows];
        for (let i = 1; i < PAGE_CAP && page.next; i++) {
          page = await readAuditPage({ ...scope, cursor: page.next, signal: controller.signal });
          rows.push(...page.rows);
        }
        const XLSX = await loadExcelModule();
        controller.signal.throwIfAborted();
        const book = XLSX.utils.book_new();
        const cols = { Sucursal: { width: 24 }, Fecha: { width: 14, format: 'date' }, Hora: { width: 11 }, Estado: { width: 28 },
          ...(area === 'cash' ? Object.fromEntries(['Fondo inicial', 'Efectivo esperado', 'Efectivo contado', 'Diferencia']
            .map(label => [label + ' (S/)', { width: 22, format: 'money' }]))
            : { 'Importe (S/)': { width: 17, format: 'money' }, Método: { width: 15 } }), Evidencia: { width: 27 } };
        const data = rows.map(row => ({ Sucursal: siteName(row.branchId), Fecha: excelDay(row.date), Hora: row.time,
          Estado: row.type, ...(area === 'cash' ? { 'Fondo inicial (S/)': row.opening ?? 'Sin registrar',
            'Efectivo esperado (S/)': row.expected ?? 'Sin referencia', 'Efectivo contado (S/)': row.amount ?? 'Sin declarar',
            'Diferencia (S/)': row.difference ?? 'Sin calcular' } : { 'Importe (S/)': row.amount ?? 'Sin declarar', Método: row.payment ?? '' }),
          Evidencia: row.estimated ? 'Por verificar' : row.reference ?? '' }));
        if (page.next) data.push({ Estado: 'Exportación parcial', Evidencia: 'Hay páginas adicionales' });
        XLSX.utils.book_append_sheet(book, createSheet(XLSX, data, cols), 'Auditoría');
        const url = URL.createObjectURL(new Blob([writeSalesWorkbook(XLSX, book)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        try {
          const link = document.createElement('a'); link.href = url;
          link.download = 'Auditoria_' + area + (page.next ? '_parcial' : '') + '.xlsx';
          link.click();
        } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
        setState({ key, message: page.next ? 'Se exportaron hasta 4 páginas. Quedan resultados adicionales.' : 'Auditoría exportada.' });
      } else if (!controller.signal.aborted) setState({ key, rows: page.rows, next: page.next });
    } catch (error) {
      if (!controller.signal.aborted) setState({ key, error: error.message });
    } finally { if (busy.current === controller) busy.current = null; }
  };
  return <section className="min-w-0 rounded-card border border-line bg-panel p-3" aria-label="Auditorías">
    <Button type="button" variant="secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>Auditorías</Button>
    {open && <div className="mt-3 space-y-3">
      <form className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3" onSubmit={event => { event.preventDefault(); void load(); }}>
        <label className="text-sm">Auditoría<Select value={area} onChange={event => { setArea(event.target.value); setFilter(event.target.value === 'cash' ? 'incidents' : 'all'); }}>
          <option value="cash">Caja</option><option value="orders">Pedidos</option>
        </Select></label>
        {owner && <label className="text-sm">Sucursal<Select value={branchId} onChange={event => setBranch(event.target.value)}>
          <option value="global">Todas las sucursales</option>{businessBranches?.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
        </Select></label>}
        <label className="text-sm">Desde<Input type="date" required value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label className="text-sm">Hasta<Input type="date" required value={to} onChange={event => setTo(event.target.value)} /></label>
        <label className="text-sm">Tipo<Select disabled={Boolean(lookup.trim())} value={filter} onChange={event => setFilter(event.target.value)}>{(area === 'cash'
          ? [['incidents', 'Solo incidentes'], ['all', 'Aperturas'], ['closing', 'Cierres'], ['expired', 'Vencimientos']]
          : [['all', 'Todos'], ['advance', 'Adelantos'], ['payment', 'Abonos'], ['refund', 'Reembolsos contables']])
          .map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
        <label className="text-sm">ID del {area === 'cash' ? 'turno' : 'pedido'}<Input value={lookup} maxLength={160} onChange={event => setLookup(event.target.value)} /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-full">
          <Button type="submit" loading={current?.loading}>Consultar</Button>
          <Button type="button" variant="secondary" disabled={current?.loading} onClick={() => load(undefined, true)}>Exportar hasta 4 páginas</Button>
        </div>
      </form>
      {area === 'orders' && <p className="text-xs text-muted">Movimientos del libro de pedidos. Los pagos embebidos se consultan en la ficha del pedido.</p>}
      {current?.error && <Alert title="No se pudo consultar la auditoría" variant="warning">{current.error}</Alert>}
      {current?.message && <p role="status">{current.message}</p>}
      {current?.rows?.length === 0 && <p role="status" className="text-sm text-muted">Esta página no contiene resultados para el filtro.</p>}
      {!!current?.rows?.length && <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Movimientos de la auditoría">
        <table className="w-full text-left text-sm"><thead><tr>{['Sucursal', 'Fecha', 'Estado', ...(area === 'cash'
          ? ['Fondo inicial', 'Esperado', 'Contado', 'Diferencia', 'Evidencia'] : ['Importe', 'Referencia'])]
          .map(label => <th scope="col" key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{current.rows.map(row => <tr key={row.id + ':' + row.when} className="border-t border-line">
          <td className="p-2">{siteName(row.branchId)}</td><td className="p-2">{row.date} · {row.time}</td>
          <td className="p-2">{row.type}</td>
          {area === 'cash' && <><td className="p-2 tabular-nums">{money(row.opening)}</td><td className="p-2 tabular-nums">{money(row.expected)}</td></>}
          <td className="p-2 tabular-nums">{money(row.amount)}</td>
          {area === 'cash' && <td className="p-2 tabular-nums">{money(row.difference)}</td>}
          <td className="p-2">{row.estimated ? 'Por verificar' : row.reference || row.payment || ''}</td></tr>)}</tbody></table>
      </div>}
      {current?.next && <Button type="button" variant="secondary" onClick={() => load(current.next)}>Siguiente página</Button>}
    </div>}
  </section>;
}
