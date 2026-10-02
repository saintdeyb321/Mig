// src/modules/Reports.jsx
import React, { useMemo, memo } from 'react';
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
  const heightPercentage = Math.max((numVentas / maxChartValue) * 100, 2);
  const isZero = numVentas === 0;

  return (
    <div className="chart-col">
      <span className={`chart-label-y ${isZero ? 'zero-value' : ''}`}>
        <span className="money-symbol">S/ </span>
        <span className="money-amount">{formatChartMoney(numVentas)}</span>
      </span>
      <div className="chart-bar-bg">
        <div className="chart-bar-fill fade-in" style={{ height: `${heightPercentage}%` }} />
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
    summary,
    topProducts,
    chartData,
    isLoading,
    timeFilter,
    setTimeFilter,
    maxProductQty
  } = useReports(user);

  // 🚀 LIMPIO: Nos quedamos solo con las métricas estandarizadas
  const total = summary?.total || 0;
  const cash = summary?.cash || 0;
  const yape = summary?.yape || 0;
  const totalSales = summary?.totalSales || 0;

  const maxChartValue = useMemo(() => {
    if (!Array.isArray(chartData) || chartData.length === 0) return 1;
    return Math.max(...chartData.map(d => Number(d?.ventas) || 0));
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="module-loader fade-in">
        <div className="spinner"></div>
        <p className="loader-text">Generando Reportes...</p>
      </div>
    );
  }

  return (
    <div className="fade-in max-container padding-bottom-lg">

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
          title="Ingresos Brutos"
          value={`S/ ${formatMoney(total)}`}
          emoji="💰"
          borderColor="border-primary"
          bgColor="bg-primary-light"
        />

        <MetricCard
          title="Tickets Generados"
          value={totalSales.toLocaleString('en-US')}
          subtext={totalSales > 0 ? `Promedio: S/ ${formatMoney(total / totalSales)} por venta` : null}
          emoji="🧾"
          borderColor="border-dark"
          bgColor="bg-gray"
        />

        {/* 🚀 Ahora estos reflejan el Efectivo y Yape de la Sede Seleccionada (o el Global) */}
        <MetricCard
          title="En Caja (Efectivo)"
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
