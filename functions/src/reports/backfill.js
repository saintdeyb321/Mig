import { hash } from './contributions.js';
import { createConsolidation } from './consolidation.js';
import { checkBackfillLease, createProjectionStore } from './projectionStore.js';
import { collections, failReport, integrityDay, keyOf, monthInLima, validMonth, validScopePart } from './summaryModel.js';

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
    const ref = database.collection(collections.state).doc(keyOf('backfill', businessId, periodKey));
    const inventory = hash(candidates.map(row => row.key));
    const token = hash([businessId, periodKey, inventory, clock(), Math.random()]);
    const lease = { ref, token };
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
        await checkBackfillLease(tx, lease, clock);
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
        const result = await projection.sync(record.source, record.id, { businessId, month: periodKey, observedAt: evidence.through, lease });
        writes += result.writes;
        cursor = record.key;
        completed++;
      }
      if (completed < left.length) {
        await save({ leaseUntil: 0 });
        return { status: 'paused', processed: completed, writes, budget: evidence.budget };
      }
      let publication;
      if (writes + 400 + 1 <= maxWrites) publication = await reports.consolidate(input, { manual, lease });
      if (publication) writes += publication.writes;
      cursor = publication ? null : cursor;
      await save({ leaseUntil: 0, publishedRevision: publication?.revision ?? null });
      return { status: publication ? 'verified' : 'paused', writes, processed: completed, budget: evidence.budget,
        publicationBudget: publication?.budget };
    } catch (error) {
      // The completed prefix is safe to retry. Drift without a source inventory change restarts that prefix as well.
      if (error.code === 'report-backfill-lease') throw error;
      if (error.code === 'report-checkpoint-drift') cursor = null;
      await save({ leaseUntil: 0 });
      throw error;
    }
  }

  async function claimAudit(ref, businessId, metrics) {
    const state = database.collection(collections.state);
    const quota = state.doc(keyOf('integrity', businessId));
    const hold = state.doc(keyOf('hold', businessId));
    const claim = await database.runTransaction(async tx => {
      metrics.claimAttempts++;
      metrics.checkpointPointReads += 3;
      const [current, gate, quarantine] = await tx.getAll(ref, quota, hold);
      const now = clock(), checkpoint = current.data();
      if (checkpoint?.mode !== 'automatic' || checkpoint.nextCheckAt > now) return { status: 'skipped', writes: 0 };
      const nextAuditAt = gate.data()?.nextAuditAt ?? 0;
      if (quarantine.exists || nextAuditAt > now) {
        tx.update(ref, { nextCheckAt: quarantine.exists ? now + integrityDay : nextAuditAt });
        return { status: quarantine.exists ? 'held' : 'deferred', writes: 1 };
      }
      // A tenant-wide reservation survives retries or a crash after an attempted scan.
      tx.set(quota, { kind: 'integrity', businessId, nextAuditAt: now + integrityDay });
      return { status: 'claimed', writes: 1 };
    });
    metrics.checkpointWrites += claim.writes;
    return claim.status;
  }

  async function sweep({ maxDocuments, limit = 5 } = {}) {
    if (!Number.isSafeInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 40000
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 5) throw failReport('report-budget', 'Presupuesto de verificación inválido.');
    const now = clock();
    const queue = await database.collection(collections.state).where('kind', '==', 'month')
      .where('mode', '==', 'automatic')
      .where('nextCheckAt', '<=', now).orderBy('nextCheckAt').limit(limit).get();
    const outcome = [], metrics = { queueQueries: 1, checkpointsReturned: queue.size, checkpointPointReads: 0,
      claimAttempts: 0, checkpointWrites: 0, audits: 0, auditBudgets: [], publicationWrites: 0, publicationAttempts: 0,
      repairWrites: 0, repairPointReads: 0, repairAttempts: 0, annual: { pointReads: 0, checkpoints: 0 } };
    for (const doc of queue.docs) {
      const { businessId, periodKey } = doc.data();
      const input = { businessId, periodKey, maxDocuments };
      try {
        const claim = await claimAudit(doc.ref, businessId, metrics);
        if (claim !== 'claimed') { outcome.push(claim); continue; }
        metrics.audits++;
        const result = await reports.consolidate(input, { repair: true });
        metrics.auditBudgets.push(result.budget);
        metrics.checkpointPointReads += result.checkpoint.pointReads;
        metrics.publicationWrites += result.writes;
        metrics.publicationAttempts += result.checkpoint.attempts;
        if (result.status === 'incomplete') {
          // Repair only differing sources from this audit, within 14 transactions of at most 400 writes each.
          // A later exhaustive pass must prove the result again before any publication.
          for (const record of result.repairs.slice(0, 14)) {
            const repaired = await projection.sync(record.source, record.id, { businessId, month: periodKey, observedAt: result.through });
            metrics.repairWrites += repaired.writes;
            metrics.repairPointReads += repaired.pointReads;
            metrics.repairAttempts += repaired.attempts;
          }
        }
        if (result.status === 'verified' && result.writes) {
          try { metrics.publicationWrites += (await reports.publishYearProducts({ businessId, year: periodKey.slice(0, 4), asOf: now }, metrics.annual)).writes; }
          catch (error) { if (error.code !== 'report-summary-pending') throw error; }
        }
        outcome.push(result.status);
      } catch (error) { outcome.push(error.code ?? 'report-evidence'); }
    }
    return { outcome, metrics };
  }
  return { resume, sweep, publishYearProducts: reports.publishYearProducts,
    publishCurrentYear: businessId => reports.publishYearProducts({ businessId, year: monthInLima(clock()).slice(0, 4) }) };
}
