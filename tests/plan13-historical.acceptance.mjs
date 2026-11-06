import assert from 'node:assert/strict';
import { it } from 'node:test';
import { reportPeriod } from '../frontend/src/features/reports/domain/reportPeriod.js';
import { pairedTicket, reportPeriodHarness, saleDay, spanningPeriod, voidDay } from './helpers/plan13PeriodHarness.mjs';

it('P13-04 A2/A10 acceptance: historical days must add to the union with bounded readers', async () => {
  const { sale, receipt } = pairedTicket({ legacy: true });
  const h = reportPeriodHarness({ sales: [sale], voids: [receipt] });
  const totals = [];
  for (const period of [reportPeriod('hoy', saleDay), reportPeriod('hoy', voidDay), spanningPeriod()]) {
    const view = h.open(period);
    try {
      await view.dashboard.ready;
      const { summary, products } = view.state.model;
      const excel = await view.excel();
      assert.equal(excel.summary['💰 GRAN TOTAL INGRESOS NETOS'], summary.netRevenue);
      assert.equal(excel.summary['Tickets POS Anulados'], summary.voidedTicketCount);
      assert.deepEqual(excel.model.products, products);
      totals.push([summary.netRevenue, summary.digitalRevenue, summary.voidedTicketCount,
        products.reduce((qty, row) => qty + row.qty, 0), products.reduce((amount, row) => amount + row.revenue, 0)]);
    } finally { view.close(); }
  }
  assert.deepEqual(totals, [[30, 30, 0, 1, 30], [-30, -30, 1, -1, -30], [0, 0, 1, 0, 0]],
    'Historical acceptance requires evidence for the original period before publishing definitive totals');
});
