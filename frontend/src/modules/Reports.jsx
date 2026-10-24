import FirestoreQueryError from '../components/FirestoreQueryError';
import { ChartNoAxesCombined } from 'lucide-react';
import { MetricCard, ChartColumn, TopProductItem } from "./reports/ReportParts.jsx";
import { LoadingState, Button, PageHeader, Card, cn, HelpDisclosure } from "../shared/ui";
// src/modules/Reports.jsx
import { useMemo } from 'react';
import { readDiagnostics } from '../core/firebase/readDiagnostics.js';
import { useSessionResources } from '../core/session/sessionResourceHooks.js';
import { useReports } from '../features/reports/hooks/useReports';
const TIME_FILTERS = {
  hoy: 'Hoy',
  semana: 'Esta Semana',
  mes: 'Este Mes',
  todo: 'Este Año'
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
    isLoading,
    error,
    timeFilter,
    setTimeFilter,
    refreshReport,
    maxProductQty, updatedAt
  } = useReports(user);

  const resources = useSessionResources();
  // 🚀 LIMPIO: Nos quedamos solo con las métricas estandarizadas
  const total = summary.netRevenue;
  const cash = summary.cashRevenue;
  const yape = summary.digitalRevenue;
  const totalSales = summary.posTicketCount;
  const maxChartValue = useMemo(() => {
    if (!Array.isArray(chartData) || chartData.length === 0) return 1;
    return Math.max(1, ...chartData.map(d => Math.abs(Number(d?.ventas) || 0)));
  }, [chartData]);
  if (isLoading) {
    return <LoadingState>Generando Reportes...</LoadingState>;
  }
  if (error) return <FirestoreQueryError error={error} area="reports" user={user} onRetry={refreshReport} />;
  return <div className="animate-enter motion-reduce:animate-none mx-auto w-full min-w-0 max-w-7xl space-y-5 pb-6">


      <PageHeader title="Dashboard gerencial" icon={ChartNoAxesCombined} eyebrow="Resumen del negocio" description="Consulta los movimientos confirmados del período." actions={<><div className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1">
          {Object.entries(TIME_FILTERS).map(([key, label]) => <Button key={key} onClick={() => setTimeFilter(key)} className={cn(`text-xs sm:text-sm ${timeFilter === key ? "bg-primary-soft text-primary" : ''} `)} type="button" variant="secondary">
              {label}
            </Button>)}
        </div></>} />

      <p role="status" className="text-sm text-muted">Lectura del reporte: {updatedAt ? new Date(updatedAt).toLocaleString('es-PE') : 'pendiente'}. Informe histórico, no saldo en tiempo real. <Button onClick={refreshReport} variant="secondary">Actualizar período</Button></p>
      {import.meta.env.DEV && <details><summary>Lecturas observadas</summary><pre className="overflow-auto text-xs">{JSON.stringify({ queries: readDiagnostics(), navigation: resources.diagnostics() }, null, 2)}</pre><p>Documentos recibidos, no facturación; no incluye accesos internos de Rules ni índices.</p></details>}
      <p>Pedidos creados en el período: {contractCounts.pending} pendientes · {contractCounts.delivered} entregados · {contractCounts.cancelled} cancelados · {contractCounts.withDebt} con saldo.</p>

      <HelpDisclosure title="Alcance de este informe">Movimientos confirmados; excluye pendientes locales. Lectura limitada a 10000 movimientos y 500 contratos por negocio. Los cierres operativos conservan conciliación pendiente.</HelpDisclosure>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Ingresos Netos" value={`S/ ${formatMoney(total)}`} subtext={`POS: S/ ${formatMoney(summary.posRevenue)} · Pedidos: S/ ${formatMoney(summary.contractRevenue)}`} emoji="💰" borderColor="border-primary" bgColor="bg-primary-soft" />

        <MetricCard title="Tickets POS" value={totalSales.toLocaleString('en-US')} subtext={`Promedio POS: S/ ${formatMoney(summary.posAverageTicket)} · Anulados: ${summary.voidedTicketCount} · Pagos pedidos: ${summary.contractPaymentCount}`} emoji="🧾" borderColor="border-t-4 border-t-ink" bgColor="bg-subtle" />

        {/* 🚀 Ahora estos reflejan el Efectivo y Yape de la Sede Seleccionada (o el Global) */}
        <MetricCard title="Ingresos en Efectivo" value={`S/ ${formatMoney(cash)}`} emoji="💵" borderColor="border-success" bgColor="bg-success-soft" valueColor="text-success" />

        <MetricCard title="Vía Yape / Plin" value={`S/ ${formatMoney(yape)}`} emoji="📲" borderColor="border-t-4 border-t-accent" bgColor="bg-accent-soft" valueColor="text-accent" />
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden p-0 sm:p-0" as="div">
          <div className="border-b border-primary/10 bg-primary-soft/50 p-4">
            <h3 className="text-base font-semibold">📈 Evolución de Ventas</h3>
          </div>
          <div className={cn(`flex h-80 min-w-0 items-end gap-4 overflow-x-auto overscroll-x-contain p-5 pt-10 ${chartData.length > 10 ? "gap-3" : ''} `)}>
            {chartData.length === 0 ? <div className="m-auto text-center text-sm text-muted">No hay datos suficientes para graficar.</div> : chartData.map((data, i) => <ChartColumn key={i} ventas={data?.ventas} date={data?.date} maxChartValue={maxChartValue} />)}
          </div>
        </Card>

        <Card className="min-w-0 overflow-hidden p-0 sm:p-0" as="div">
          <div className="border-b border-primary/10 bg-primary-soft/50 p-4">
            <h3 className="text-base font-semibold">🏆 Top 5 Productos</h3>
          </div>
          {topProducts.length === 0 ? <div className="grid min-h-48 place-content-center gap-3 p-5 text-center text-sm text-muted">
              <span className="text-4xl text-muted">🛒</span>
              No hay datos en este periodo.
            </div> : <div className="px-4">
              {topProducts.map((p, index) => <TopProductItem key={p.name} name={p?.name} qty={p?.qty} index={index} isLast={index === topProducts.length - 1} maxProductQty={maxProductQty} />)}
            </div>}
        </Card>
      </div>

    </div>;
}
