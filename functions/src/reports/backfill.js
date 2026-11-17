import { hash } from './contributions.js';
import { createConsolidation } from './consolidation.js';
import { createProjectionStore } from './projectionStore.js';
import { collections, failReport, keyOf, monthInLima, validMonth, validScopePart } from './summaryModel.js';

export function createReportBackfill(database, options = {}) {
  const projection = createProjectionStore(database, options), reports = createConsolidation(database, options);
  const clock = options.clock ?? Date.now;
  async function resume(input, { dryRun = true, limit = 100, maxWrites, manual = true } = {}) {
    const { businessId, periodKey, maxDocuments } = input;
    if (!validScopePart(businessId) || !validMonth(periodKey) || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw failReport('report-budget', 'Límite de lote inválido.');
    }
    const evidence = await reports.readEvidence(input);
    const candidates = evidence.candidates.map(row => ({ ...row, key: keyOf(row.source, row.id) })).sort((a, b) => a.key < b.key ? -1 : 1);
    if (dryRun) return { dryRun: true, records: candidates.length, budget: evidence.budget, writes: 0 };
    if (!Number.isSafeInteger(maxWrites) || maxWrites < 402 || maxWrites > 200000) {
      throw failReport('report-budget', 'El backfill requiere presupuesto de escrituras.');
    }
    if (evidence.blocked) throw failReport('report-evidence', 'La cuarentena del negocio requiere revisión autorizada.');
    const ref = database.collection(collections.state).doc(keyOf('backfill', businessId, periodKey));
    const inventory = hash(candidates.map(row => row.key));
    const token = hash([businessId, periodKey, inventory, clock(), Math.random()]);
    const checkpoint = await database.runTransaction(async tx => {
      const prior = (await tx.get(ref)).data();
      if (prior?.leaseUntil > clock()) throw failReport('report-checkpoint-race', 'Otro proceso tiene el checkpoint.');
      const cursor = prior?.inventory === inventory ? prior.cursor : null;
      tx.set(ref, { kind: 'backfill', businessId, periodKey, inventory, cursor, token, leaseUntil: clock() + 180000, budget: maxDocuments });
      return cursor;
    });
    let writes = 1, cursor = checkpoint;
    const save = async extra => {
      await database.runTransaction(async tx => {
        const prior = (await tx.get(ref)).data();
        if (prior?.token !== token) throw failReport('report-checkpoint-race', 'El permiso de ejecución cambió.');
        tx.update(ref, { cursor, ...extra });
      });
      writes++;
    };
    try {
      const left = candidates.filter(row => checkpoint === null || row.key > checkpoint);
      let completed = 0;
      for (const record of left.slice(0, limit)) {
        // A month-scoped contract can have one cohort and at most one contribution per branch/day/ledger component.
        // Reserve a conservative transaction upper bound before starting the source.
        if (writes + 400 + 1 > maxWrites) break;
        const result = await projection.sync(record.source, record.id, { businessId, month: periodKey, observedAt: evidence.through });
        writes += result.writes;
        cursor = record.key;
        completed++;
      }
      if (completed < left.length) {
        await save({ leaseUntil: 0 });
        return { status: 'paused', processed: completed, writes, budget: evidence.budget };
      }
      let publication;
      if (writes + 400 + 1 <= maxWrites) publication = await reports.consolidate(input, { manual });
      if (publication) writes += publication.writes;
      cursor = publication ? null : cursor;
      await save({ leaseUntil: 0, publishedRevision: publication?.revision ?? null });
      return { status: publication ? 'verified' : 'paused', writes, processed: completed, budget: evidence.budget,
        publicationBudget: publication?.budget };
    } catch (error) {
      // The completed prefix is safe to retry. Drift without a source inventory change restarts that prefix as well.
      if (error.code === 'report-checkpoint-drift') cursor = null;
      await save({ leaseUntil: 0 });
      throw error;
    }
  }

  async function sweep({ maxDocuments, limit = 5 } = {}) {
    const now = clock();
    const queue = await database.collection(collections.state).where('kind', '==', 'month')
      .where('mode', '==', 'automatic')
      .where('nextCheckAt', '<=', now).orderBy('nextCheckAt').limit(limit).get();
    const outcome = [];
    for (const doc of queue.docs) {
      const { businessId, periodKey } = doc.data();
      const input = { businessId, periodKey, maxDocuments };
      try {
        let result;
        try { result = await reports.consolidate(input); }
        catch (error) {
          if (error.code !== 'report-checkpoint-drift') throw error;
          result = await resume(input, { dryRun: false, maxWrites: 6000, limit: 80, manual: false });
        }
        if (result.status === 'verified') {
          try { await reports.publishYearProducts({ businessId, year: periodKey.slice(0, 4), asOf: now }); }
          catch (error) { if (error.code !== 'report-summary-pending') throw error; }
        }
        outcome.push(result.status);
      } catch (error) { outcome.push(error.code ?? 'report-evidence'); }
    }
    return outcome;
  }
  return { resume, sweep, publishYearProducts: reports.publishYearProducts,
    publishCurrentYear: businessId => reports.publishYearProducts({ businessId, year: monthInLima(clock()).slice(0, 4) }) };
}
