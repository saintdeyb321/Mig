import { memo } from 'react';
import { Card, cn } from '../../shared/ui';
const MEDALS_CONFIG = [{
  medalClass: "bg-warning-soft text-warning",
  icon: '🥇',
  barClass: "bg-primary"
}, {
  medalClass: "bg-subtle text-muted",
  icon: '🥈',
  barClass: "bg-accent"
}, {
  medalClass: "bg-accent-soft text-accent",
  icon: '🥉',
  barClass: "bg-primary/70"
}];
const formatChartMoney = (amount = 0) => Math.round(Number(amount)).toLocaleString('en-US');
export const MetricCard = memo(({
  title,
  value,
  subtext,
  emoji,
  borderColor,
  bgColor,
  valueColor
}) => <Card className={cn(`flex min-w-0 items-start gap-3 ${borderColor} `)} as="div">
    <div className={cn(`flex size-10 shrink-0 items-center justify-center rounded-xl ${bgColor} `)}>
      <span className="text-xl">{emoji}</span>
    </div>
    <div className="grid min-w-0 flex-1 gap-1.5">
      <h4 className="text-xs font-medium text-muted">{title}</h4>
      <p className={cn(`break-words text-xl font-bold tracking-tight ${valueColor || ''} `)}>{value}</p>
      {subtext && <span className="text-xs leading-relaxed text-muted">{subtext}</span>}
    </div>
  </Card>);
export const ChartColumn = memo(({
  ventas,
  date,
  maxChartValue
}) => {
  const numVentas = Number(ventas) || 0;
  const heightPercentage = Math.max(Math.abs(numVentas) / maxChartValue * 100, 2);
  const isZero = numVentas === 0;
  return <div className="flex h-full w-12 shrink-0 flex-col items-center justify-end gap-2">
      <span className={cn(`rounded-md bg-success-soft px-1.5 py-1 text-xs font-semibold text-success ${isZero ? "bg-subtle text-muted" : ''} `)}>
        <span>S/ </span>
        <span>{formatChartMoney(numVentas)}</span>
      </span>

      <div className="flex w-full flex-1 items-end overflow-hidden rounded-t-lg bg-subtle">
        <div className={cn(numVentas < 0 ? 'w-full rounded-t-lg bg-danger' : 'w-full rounded-t-lg bg-gradient-to-t from-primary to-accent')} style={{
        height: `${heightPercentage}%`
      }} />
      </div>
      <span className="w-full border-t border-line pt-2 text-center text-xs text-muted">{date}</span>
    </div>;
});
export const TopProductItem = memo(({
  name,
  qty,
  index,
  isLast,
  maxProductQty
}) => {
  const medal = index < 3 ? MEDALS_CONFIG[index] : {
    medalClass: "bg-primary-soft text-primary",
    icon: `${index + 1}`,
    barClass: "bg-primary/50"
  };
  const numQty = Number(qty) || 0;
  const percentage = maxProductQty > 0 ? Math.round(numQty / maxProductQty * 100) : 0;
  return <div className={cn(`animate-enter motion-reduce:animate-none grid gap-3 border-b border-line py-4 last:border-0 ${isLast ? "border-0" : ''} `)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn(`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${medal.medalClass} `)}>{medal.icon}</div>
          <span className="break-words text-sm font-medium">{name}</span>
        </div>
        <div className="shrink-0 rounded-full bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">{numQty.toLocaleString('en-US')} u.</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-subtle"><div className={cn(`h-full rounded-full  ${medal.barClass} `)} style={{
        width: `${percentage}%`
      }} /></div>
    </div>;
});
