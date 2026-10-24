import assert from 'node:assert/strict';
import { before, after, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { createBackupRepository } from '../frontend/src/features/backups/infrastructure/backupRepository.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos');
assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
sdk.setLogLevel('silent');
let env;
const read = uid => createBackupRepository(env.authenticatedContext(uid).firestore(), {sdk, currentUser:()=>({uid})});
before(async () => {
  env = await initializeTestEnvironment({projectId:'demo-migapos',firestore:{host:'127.0.0.1',port:8080,rules:readFileSync('firestore.rules','utf8')}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = sdk.writeBatch(db);
    const rows = {'users/owner':{businessId:'tenant-a',role:'dueño',status:'activo'}, 'users/foreign':{businessId:'tenant-b',role:'dueño',status:'activo'},
      'users/cashier':{businessId:'tenant-a',role:'cajero',status:'activo'},'users/admin':{businessId:'platform-admin',role:'superadmin',status:'activo'},
      'tenants/tenant-a':{businessId:'tenant-a',status:'active'},'licenses/tenant-a':{businessId:'tenant-a',status:'activa',expiry:sdk.Timestamp.fromMillis(Date.now()+86400000)},
      'settings/tenant-a':{businessId:'tenant-a',companyData:{razonSocial:'Fixture',password:'never-export'},apiKey:'never-export'},
      'products/foreign':{businessId:'tenant-b',name:'Foreign'},'customers/customer':{businessId:'tenant-a',name:'Fixture'},
      'sales/sale':{businessId:'tenant-a',total:10,confirmedAt:sdk.Timestamp.now()},'contracts/contract':{businessId:'tenant-a',total:10},
      'payments/payment':{businessId:'tenant-a',amount:10},'cash_sessions/cash':{businessId:'tenant-a',status:'closed',reconciliationPending:true}};
    for (let index=0;index<205;index++) rows[`products/p-${String(index).padStart(3,'0')}`] = {businessId:'tenant-a',name:'Producto',price:1};
    for (const [path,value] of Object.entries(rows)) batch.set(sdk.doc(db,path),value);
    await batch.commit();
  });
});
after(async () => env?.cleanup());
it('pages past 200 documents using the main Rules and excludes secrets and foreign tenants', async () => {
  const progress = [], exported = await read('owner')({businessId:'tenant-a',actorId:'owner',maxRecords:500,onProgress:p=>progress.push(p)});
  const products = exported.sections.find(s=>s.name==='products');
  assert.equal(products.records.length,205); assert.equal(products.status,'complete');
  assert.ok(progress.filter(p=>p.collection==='products').length>=2);
  assert.doesNotMatch(JSON.stringify(exported),/never-export|"Foreign"/);
  for (const name of ['sales','contracts','payments','cash_sessions']) assert.equal(exported.sections.find(s=>s.name===name).records.length,1,name);
  assert.equal(exported.sections.find(s=>s.name==='cash_sessions').records[0].reconciliationPending,true);
});
it('caps total documents and reports omitted collections; never expands SuperAdmin operational permissions', async () => {
  const capped = await read('owner')({businessId:'tenant-a',actorId:'owner',maxRecords:100});
  assert.equal(capped.sections.reduce((sum,s)=>sum+s.records.length,0),100); assert.ok(capped.sections.some(s=>s.status==='not-read'));
  const admin = await read('admin')({businessId:'tenant-a',actorId:'admin',maxRecords:500});
  assert.equal(admin.sections.find(s=>s.name==='products').status,'inaccessible');
  assert.equal(admin.sections.find(s=>s.name==='contracts').status,'inaccessible');
  assert.equal(admin.sections.find(s=>s.name==='sales').records.length,1);
  assert.match(admin.warnings.join(),/no hereda permisos operativos/);
  await assertFails(sdk.getDocFromServer(sdk.doc(env.authenticatedContext('admin').firestore(),'products/p-000')));
});
it('rejects cashiers and another owner before reading business data, while direct cross-tenant reads remain denied', async () => {
  for (const uid of ['cashier','foreign']) await assert.rejects(read(uid)({businessId:'tenant-a',actorId:uid,maxRecords:100}),/Solo el dueño/);
  await assertFails(sdk.getDocFromServer(sdk.doc(env.authenticatedContext('foreign').firestore(),'products/p-000')));
});
