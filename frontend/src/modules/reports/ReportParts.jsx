import { memo } from 'react';
import { CheckCircle2, ClipboardList, Clock3, WalletCards, XCircle } from 'lucide-react';
import { Card, cn } from '../../shared/ui';
import { CHANNEL_BREAKDOWN_ROWS, CHANNEL_EVIDENCE_NOTE, CHANNEL_NEGATIVE_NOTE, REPORT_CHANNELS } from '../../features/reports/domain/reportTotals.js';

const metricTones = {
  stellar: 'border-t-stellar to-stellar-soft/75 hover:border-x-stellar/35 hover:border-b-stellar/35',
  neutral: 'border-t-ink to-subtle hover:border-x-control/40 hover:border-b-control/40',
  success: 'border-t-success to-success-soft/75 hover:border-x-success/35 hover:border-b-success/35',
  accent: 'border-t-accent to-accent-soft/75 hover:border-x-accent/35 hover:border-b-accent/35',
};
const orderIndicators = [
  { key: 'pending', label: 'Pendientes', icon: Clock3, badge: 'bg-warning-soft text-warning', bar: 'bg-warning' },
  { key: 'delivered', label: 'Entregados', icon: CheckCircle2, badge: 'bg-success-soft text-success', bar: 'bg-success' },
  { key: 'cancelled', label: 'Cancelados', icon: XCircle, badge: 'bg-danger-soft text-danger', bar: 'bg-danger' },
  { key: 'withDebt', label: 'Con saldo', icon: WalletCards, badge: 'bg-stellar-soft text-stellar', bar: 'bg-stellar' },
];
const panelFeedback = 'motion-safe:transition-[border-color,box-shadow] motion-safe:duration-150 hover:shadow-md focus-within:shadow-md';
const rankStyles = [
  { badge: 'bg-stellar-soft text-stellar', bar: 'bg-stellar' },
  { badge: 'bg-accent-soft text-accent', bar: 'bg-accent' },
  { badge: 'bg-primary-soft text-primary', bar: 'bg-primary' },
  { badge: 'bg-subtle text-brand-deep', bar: 'bg-nebula' },
  { badge: 'bg-subtle text-muted', bar: 'bg-control' },
];
const formatChartMoney = (amount = 0) => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ReportPanel({ title, headingId, icon: Icon, children }) {
  return <Card aria-labelledby={headingId} className={cn('overflow-hidden p-0 hover:border-stellar/35 focus-within:border-stellar/45 sm:p-0', panelFeedback)}>
    <div className="flex items-center gap-2 bg-linear-to-r from-stellar to-stellar/90 px-4 py-3 text-white">
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <h2 id={headingId} className="font-bold">{title}</h2>
    </div>
    {children}
  </Card>;
}

export function ChannelBreakdown({ channels, formatMoney }) {
  const entries = Object.entries(REPORT_CHANNELS);
  return <ReportPanel title="Desglose contable por canal" headingId="report-channels-heading" icon={WalletCards}>
    <div className="space-y-3 p-3 sm:p-4">
      <table className="w-full table-fixed text-xs sm:text-sm">
        <caption className="sr-only">Cobros, contramovimientos y neto contable del período</caption>
        <thead className="border-b border-line text-muted">
          <tr>
            <th scope="col" className="w-[44%] py-2 pr-2 text-left font-semibold">Concepto</th>
            {entries.map(([key, label]) => <th key={key} scope="col" className="px-1 py-2 text-right font-semibold sm:px-2">{label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {CHANNEL_BREAKDOWN_ROWS.map(({ key, label }) => <tr key={key} className={key === 'net' ? 'bg-stellar-soft text-ink' : undefined}>
            <th scope="row" className={cn('py-2.5 pr-2 text-left', key === 'net' ? 'pl-1 font-extrabold sm:pl-2' : 'font-medium')}>{label}</th>
            {entries.map(([channel]) => {
              const value = channels[channel][key];
              return <td key={channel} className={cn('px-1 py-2.5 text-right tabular-nums wrap-anywhere sm:px-2', key === 'net' && 'font-extrabold', value < 0 && 'text-danger')}>S/ {formatMoney(value)}</td>;
            })}
          </tr>)}
        </tbody>
      </table>
      <div className="space-y-1 text-xs leading-relaxed text-muted">
        <p>El neto suma los cobros y los contramovimientos con su signo, por fecha de registro.</p>
        <p>{CHANNEL_NEGATIVE_NOTE}</p>
        <p>{CHANNEL_EVIDENCE_NOTE}</p>
      </div>
    </div>
  </ReportPanel>;
}

export function OrderStatusChart({ counts }) {
  const scale = Math.max(1, ...orderIndicators.map(({ key }) => counts[key]));
  return <ReportPanel title="Pedidos" headingId="report-orders-heading" icon={ClipboardList}>
    <div className="space-y-3 p-3 sm:p-4">
      <p className="text-xs text-muted">Estado actual de los pedidos creados en el período.</p>
      <dl className="divide-y divide-line rounded-xl border border-line bg-subtle/40 px-3 sm:px-4">
        {orderIndicators.map(({ key, label, icon: Icon, badge, bar }) => <div key={key} className="grid min-w-0 grid-cols-[minmax(0,42%)_minmax(0,1fr)] items-center gap-2 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
          <dt className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', badge)}><Icon aria-hidden="true" className="size-4" /></span>
            <span className="wrap-anywhere">{label}</span>
          </dt>
          <dd className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span aria-hidden="true" className={cn('h-2.5 min-w-0 flex-1 overflow-hidden rounded-full', badge)}>
              <span className={cn('block h-full rounded-full', bar)} style={{ width: `${counts[key] / scale * 100}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right text-lg leading-tight font-extrabold tabular-nums">{counts[key]}</span>
          </dd>
        </div>)}
      </dl>
      <p className="text-xs text-muted">«Con saldo» puede incluir pedidos pendientes o entregados.</p>
    </div>
  </ReportPanel>;
}

export const MetricCard = memo(({
  title,
  value,
  subtext,
  icon: Icon,
  tone = 'neutral',
  bgColor,
  valueColor = 'text-ink'
}) => <Card className={cn('grid content-start gap-2 border-t-4 bg-linear-to-br from-panel via-panel p-3 sm:p-4', panelFeedback, metricTones[tone])} as="div">
  <div className="flex items-center gap-2">
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl shadow-xs', bgColor, valueColor)}>
      <Icon aria-hidden="true" className="size-4" />
    </span>
    <h2 className="text-sm font-semibold leading-snug text-muted">{title}</h2>
  </div>
  <p className={cn('text-2xl font-extrabold tracking-tight tabular-nums', valueColor)}>{value}</p>
  {subtext && <p className="text-xs leading-relaxed text-muted">{subtext}</p>}
</Card>);
export const ChartColumn = memo(({
  ventas,
  date,
  maxChartValue
}) => {
  const numVentas = Number(ventas) || 0;
  const heightPercentage = Math.max(Math.abs(numVentas) / maxChartValue * 100, 2);
  const isZero = numVentas === 0;
  return <div className="flex h-full w-16 shrink-0 flex-col items-center justify-end gap-2">
      <span className={cn('max-w-full rounded-md px-1.5 py-1 text-center text-xs font-semibold tabular-nums wrap-anywhere', isZero ? 'text-muted' : numVentas < 0 ? 'bg-danger-soft text-danger' : 'bg-stellar-soft text-stellar')}>
        <span>S/ </span>
        <span>{formatChartMoney(numVentas)}</span>
      </span>

      <div className="flex w-full flex-1 items-end overflow-hidden rounded-t-lg bg-stellar-soft/45" aria-hidden="true">
        {!isZero && <div className={cn('w-full rounded-t-lg', numVentas < 0 ? 'bg-danger' : 'bg-stellar')} style={{
        height: `${heightPercentage}%`
      }} />}
      </div>
      <span className="w-full border-t border-line pt-2 text-center text-xs text-muted">{date}</span>
    </div>;
});
export const TopProductItem = memo(({
  name,
  qty,
  index,
  maxProductQty
}) => {
  const rank = rankStyles[index] ?? rankStyles[4];
  const numQty = Number(qty) || 0;
  const percentage = maxProductQty > 0 ? Math.round(numQty / maxProductQty * 100) : 0;
  return <div className="grid gap-1.5 border-b border-line py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums', rank.badge)}>{index + 1}</span>
          <span className="min-w-0 text-sm font-medium wrap-anywhere">{name}</span>
        </div>
        <span className="shrink-0 text-xs font-semibold text-ink tabular-nums">{numQty.toLocaleString('en-US')} u.</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true"><div className={cn('h-full rounded-full', rank.bar)} style={{
        width: `${percentage}%`
      }} /></div>
    </div>;
});
