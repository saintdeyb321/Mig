export const mergePayments = (ledger, legacy) => [...new Map([...legacy, ...ledger].map(payment => [payment.id, payment])).values()];

export async function compatiblePayments(input, readLedger, readLegacy) {
  const fallback = [];
  let cursor = null;
  do {
    const page = await readLegacy({ ...input, cursor });
    if (page.manualReview) throw new Error('Hay pagos históricos pendientes de revisión administrativa; revisa la migración antes de cerrar caja o emitir el reporte.');
    fallback.push(...page.payments); cursor = page.nextCursor;
  } while (cursor);
  // A batch can commit between these reads. Deduplicate movement IDs, never whole contracts.
  return mergePayments(await readLedger(), fallback);
}
