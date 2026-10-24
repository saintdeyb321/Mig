// src/modules/Reports.jsx
import React, { useMemo, memo } from 'react';
import { readDiagnostics } from '../core/firebase/readDiagnostics.js';
import { useSessionResources } from '../core/session/sessionResourceHooks.js';
import { useReports } from '../features/reports/hooks/useReports';

const TIME_FILTERS = {
  hoy: 'Hoy',
  semana: 'Esta Semana',
  mes: 'Este Mes',
  todo: 'Este Año'
};

const MEDALS_CONFIG = [
  { medalClass: 'medal-gold', icon: '🥇', barClass: 'bar-gold' },
  { medalClass: 'medal-silver', icon: '🥈', barClass: 'bar-silver' },
  { medalClass: 'medal-bronze', icon: '🥉', barClass: 'bar-bronze' }
];

const formatMoney = (amount = 0) =>
  Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const formatChartMoney = (amount = 0) =>
  Math.round(Number(amount)).toLocaleString('en-US');

const MetricCard = memo(({ title, value, subtext, emoji, borderColor, bgColor, valueColor }) => (
  <div className={`metric-card ${borderColor}`}>
    <div className={`metric-icon-box ${bgColor}`}>
      <span className="metric-emoji">{emoji}</span>
    </div>
    <div className="metric-info">
      <h4 className="metric-label">{title}</h4>
      <p className={`metric-value ${valueColor || ''}`}>{value}</p>
      {subtext && <span className="metric-subtext">{subtext}</span>}
    </div>
  </div>
));

const ChartColumn = memo(({ ventas, date, maxChartValue }) => {
  const numVentas = Number(ventas) || 0;
  const heightPercentage = Math.max((Math.abs(numVentas) / maxChartValue) * 100, 2);
  const isZero = numVentas === 0;

  return (
    <div className="chart-col">
      <span className={`chart-label-y ${isZero ? 'zero-value' : ''}`}>
        <span className="money-symbol">S/ </span>
        <span className="money-amount">{formatChartMoney(numVentas)}</span>
      </span>
      <div className="chart-bar-bg">
        <div className="chart-bar-fill fade-in" style={{ height: `${heightPercentage}%`, ...(numVentas < 0 ? { background: 'var(--danger, #dc2626)' } : {}) }} />
      </div>
      <span className="chart-label-x">{date}</span>
    </div>
  );
});

const TopProductItem = memo(({ name, qty, index, isLast, maxProductQty }) => {
  const medal = index < 3
      ? MEDALS_CONFIG[index]
      : { medalClass: 'medal-default', icon: `${index + 1}`, barClass: 'bar-default' };

  const numQty = Number(qty) || 0;
  const percentage = maxProductQty > 0 ? Math.round((numQty / maxProductQty) * 100) : 0;

  return (
    <div className={`fade-in top-product-item ${isLast ? 'last-item' : ''}`}>
      <div className="top-product-header">
        <div className="top-product-name-col">
          <div className={`medal-badge ${medal.medalClass}`}>{medal.icon}</div>
          <span className="top-product-name">{name}</span>
        </div>
        <div className="top-product-qty">{numQty.toLocaleString('en-US')} u.</div>
      </div>
      <div className="progress-bg">
        <div className={`progress-fill ${medal.barClass}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
});

export default function Reports({ user }) {
  const {
    summary, contractCounts,
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
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        <p className="loader-text">Generando Reportes...</p>
      </div>
    );
  }

  if (error) return <div className="card" role="alert">No se puede mostrar un reporte completo: {error} <button onClick={refreshReport}>Reintentar</button></div>;
  return (
    <div className="fade-in max-container padding-bottom-lg">
      <p role="status">Movimientos confirmados; excluye pendientes locales. Lecturas paginadas: máximo 10000 movimientos y 500 contratos por negocio para compatibilidad histórica. Los cierres operativos conservan conciliación pendiente.</p>

      <p role="status">Lectura del reporte: {updatedAt ? new Date(updatedAt).toLocaleString('es-PE') : 'pendiente'}. Es un informe histórico, no un saldo en tiempo real. <button onClick={refreshReport}>Actualizar período</button></p>
      {import.meta.env.DEV && <details><summary>Lecturas observadas en esta ejecución</summary><pre>{JSON.stringify({ queries: readDiagnostics(), navigation: resources.diagnostics() }, null, 2)}</pre><p>Documentos recibidos, no lecturas facturadas: no incluye accesos internos de Rules ni entradas de índices. Navegar dentro de dos minutos reutiliza listeners visitados; cerrar sesión los detiene.</p></details>}
      <p>Pedidos creados en el período: {contractCounts.pending} pendientes · {contractCounts.delivered} entregados · {contractCounts.cancelled} cancelados · {contractCounts.withDebt} con saldo.</p>
      <header className="module-header">
        <h2 className="module-title">
          <span className="module-title-icon">📊</span>
          <span className="module-title-text">Dashboard Gerencial</span>
        </h2>
        <div className="time-filter-group">
          {Object.entries(TIME_FILTERS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTimeFilter(key)}
              className={`filter-btn ${timeFilter === key ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="metrics-grid">
        <MetricCard
          title="Ingresos Netos"
          value={`S/ ${formatMoney(total)}`}
          subtext={`POS: S/ ${formatMoney(summary.posRevenue)} · Pedidos: S/ ${formatMoney(summary.contractRevenue)}`}
          emoji="💰"
          borderColor="border-primary"
          bgColor="bg-primary-light"
        />

        <MetricCard
          title="Tickets POS"
          value={totalSales.toLocaleString('en-US')}
          subtext={`Promedio POS: S/ ${formatMoney(summary.posAverageTicket)} · Anulados: ${summary.voidedTicketCount} · Pagos pedidos: ${summary.contractPaymentCount}`}
          emoji="🧾"
          borderColor="border-dark"
          bgColor="bg-gray"
        />

        {/* 🚀 Ahora estos reflejan el Efectivo y Yape de la Sede Seleccionada (o el Global) */}
        <MetricCard
          title="Ingresos en Efectivo"
          value={`S/ ${formatMoney(cash)}`}
          emoji="💵"
          borderColor="border-success"
          bgColor="bg-success-light"
          valueColor="text-success"
        />

        <MetricCard
          title="Vía Yape / Plin"
          value={`S/ ${formatMoney(yape)}`}
          emoji="📲"
          borderColor="border-purple"
          bgColor="bg-purple-light"
          valueColor="text-purple"
        />
      </div>

      <div className="dashboard-split">
        <div className="card split-card">
          <div className="split-card-header">
            <h3 className="split-card-title">📈 Evolución de Ventas</h3>
          </div>
          <div className={`chart-container ${chartData.length > 10 ? 'chart-dense' : ''}`}>
            {chartData.length === 0 ? (
              <div className="empty-chart">No hay datos suficientes para graficar.</div>
            ) : (
              chartData.map((data, i) => (
                <ChartColumn key={i} ventas={data?.ventas} date={data?.date} maxChartValue={maxChartValue} />
              ))
            )}
          </div>
        </div>

        <div className="card split-card">
          <div className="split-card-header">
            <h3 className="split-card-title">🏆 Top 5 Productos</h3>
          </div>
          {topProducts.length === 0 ? (
            <div className="empty-top-products">
              <span className="empty-icon-lg">🛒</span>
              No hay datos en este periodo.
            </div>
          ) : (
            <div className="top-products-list">
              {topProducts.map((p, index) => (
                <TopProductItem key={p.name} name={p?.name} qty={p?.qty} index={index} isLast={index === topProducts.length - 1} maxProductQty={maxProductQty} />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
