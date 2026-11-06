import FirestoreQueryError from '../components/FirestoreQueryError';
import { Banknote, ChartNoAxesCombined, ReceiptText, Smartphone, Trophy, WalletCards } from 'lucide-react';
import { ChannelBreakdown, MetricCard, ChartColumn, OrderStatusChart, ReportPanel, TopProductItem } from './reports/ReportParts.jsx';
import { LoadingState, Button, PageHeader, HelpDisclosure } from '../shared/ui';
import { useMemo } from 'react';
import { useReports } from '../features/reports/hooks/useReports';

const TIME_FILTERS = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  todo: 'Este año'
};
const formatMoney = (amount = 0) => Number(amount).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
export default function Reports({
  user
}) {
  const {
    summary,
    contractCounts,
    topProducts,
    chartData,
    isLoading, isRefreshing, hasData,
    error,
    timeFilter,
    setTimeFilter,
    refreshReport,
    maxProductQty, updatedAt
  } = useReports(user);


  const total = summary.netRevenue;
  const cash = summary.cashRevenue;
  const yape = summary.digitalRevenue;
  const totalSales = summary.posTicketCount;
  const maxChartValue = useMemo(() => {
    if (!Array.isArray(chartData) || chartData.length === 0) return 1;
    return Math.max(1, ...chartData.map(d => Math.abs(Number(d?.ventas) || 0)));
  }, [chartData]);
  if (isLoading) {
    return <LoadingState variant="module">Generando reportes…</LoadingState>;
  }
  if (error && !hasData) return <FirestoreQueryError error={error} area="reports" user={user} onRetry={refreshReport} />;
  return <div className="workspace-page max-w-7xl gap-3 animate-enter motion-reduce:animate-none">
    <PageHeader title="Dashboard gerencial" icon={ChartNoAxesCombined} className="border-t-stellar/70 p-3 sm:p-3" actions={
      <div className="segmented-control grid w-full grid-cols-2 sm:flex sm:w-auto" role="group" aria-label="Período del reporte">
        {Object.entries(TIME_FILTERS).map(([key, label]) => <Button key={key} type="button" size="sm"
          onClick={() => setTimeFilter(key)} aria-pressed={timeFilter === key} variant={timeFilter === key ? 'primary' : 'ghost'}>
          {label}
        </Button>)}
      </div>
    } />

    {error && <FirestoreQueryError error={error} area="reports" user={user} onRetry={refreshReport} />}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <p>Informe histórico · no es saldo de caja.</p>
      <p role="status">{isRefreshing ? 'Actualizando el período… Los resultados anteriores siguen visibles.'
        : updatedAt ? `Actualizado ${new Date(updatedAt).toLocaleString('es-PE')}` : 'Lectura pendiente.'}</p>
    </div>

    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="Ingresos netos" value={`S/ ${formatMoney(total)}`} subtext={`POS: S/ ${formatMoney(summary.posRevenue)} · Pedidos: S/ ${formatMoney(summary.contractRevenue)}`} icon={WalletCards} tone="stellar" bgColor="bg-stellar-soft" valueColor="text-stellar" />
      <MetricCard title="Tickets POS" value={totalSales.toLocaleString('en-US')} subtext={`Promedio POS: S/ ${formatMoney(summary.posAverageTicket)} · Anulados: ${summary.voidedTicketCount} · Pagos pedidos: ${summary.contractPaymentCount}`} icon={ReceiptText} bgColor="bg-subtle" />
      <MetricCard title="Neto contable en efectivo" value={`S/ ${formatMoney(cash)}`} subtext="Según movimientos del período." icon={Banknote} tone="success" bgColor="bg-success-soft" valueColor="text-success" />
      <MetricCard title="Neto contable Yape / Plin" value={`S/ ${formatMoney(yape)}`} subtext="Según movimientos del período." icon={Smartphone} tone="accent" bgColor="bg-accent-soft" valueColor="text-accent" />
    </div>

    <ChannelBreakdown channels={summary.channels} formatMoney={formatMoney} />
    <OrderStatusChart counts={contractCounts} />

    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <ReportPanel title="Evolución de ventas" icon={ChartNoAxesCombined}>
        <div role="region" aria-label="Gráfico de ventas" tabIndex={chartData.length ? 0 : undefined}
          className="flex h-64 min-w-0 items-end gap-3 overflow-x-auto overscroll-x-contain p-4 focus-visible:outline-offset-[-3px]">
          {chartData.length === 0 ? <p className="m-auto text-center text-sm text-muted">No hay datos suficientes para graficar.</p>
            : chartData.map((data, i) => <ChartColumn key={i} ventas={data?.ventas} date={data?.date} maxChartValue={maxChartValue} />)}
        </div>
      </ReportPanel>
      <ReportPanel title="Top 5 productos" icon={Trophy}>
        {topProducts.length === 0 ? <p className="p-4 text-sm text-muted">No hay datos en este período.</p>
          : <div className="px-4">
            {topProducts.map((p, index) => <TopProductItem key={p.name} name={p?.name} qty={p?.qty} index={index} maxProductQty={maxProductQty} />)}
          </div>}
      </ReportPanel>
    </div>

    <HelpDisclosure title="Alcance de este informe">
      <p>Incluye movimientos contables confirmados y excluye pendientes locales. Las compensaciones POS se descuentan una vez por el método original. No certifican saldo físico, desembolsos ni devoluciones digitales. Los cierres operativos conservan conciliación pendiente.</p>
      <p>La lectura se limita a 10 000 movimientos y 500 contratos por negocio.</p>
    </HelpDisclosure>
  </div>;
}
