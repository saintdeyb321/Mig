import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';
import { createReportBackfill } from '../src/reports/backfill.js';

const { values } = parseArgs({ options: {
  project: { type: 'string' }, business: { type: 'string' }, month: { type: 'string' }, year: { type: 'string' },
  documents: { type: 'string' }, writes: { type: 'string' }, limit: { type: 'string', default: '100' },
  apply: { type: 'boolean', default: false }, 'authorize-project': { type: 'string' },
} });
const { project, business, month, year, apply } = values;
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!project || !business || Boolean(month) === Boolean(year)) throw new Error('Indica proyecto, negocio y un mes o año.');
if (host ? project !== 'demo-migapos' || host !== '127.0.0.1:8080' : values['authorize-project'] !== project) {
  throw new Error('Usa el emulador demo-migapos o una autorización explícita del proyecto con credenciales administrativas externas.');
}
initializeApp({ projectId: project, ...(host ? {} : { credential: applicationDefault() }) });
const job = createReportBackfill(getFirestore());
const result = year ? (apply ? await job.publishYearProducts({ businessId: business, year })
  : { dryRun: true, year, writes: 0 }) : await job.resume({ businessId: business, periodKey: month, maxDocuments: Number(values.documents) },
  { dryRun: !apply, maxWrites: Number(values.writes), limit: Number(values.limit), manual: true });
console.log(JSON.stringify(result));
