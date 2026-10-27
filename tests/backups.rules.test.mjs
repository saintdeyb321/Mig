import assert from 'node:assert/strict';
import { before, after, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import * as lite from 'firebase/firestore/lite';
import { getApp } from 'firebase/app';
import { createBackupRepository } from '../frontend/src/features/backups/infrastructure/backupRepository.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos');
assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
sdk.setLogLevel('silent');
let env;
const read = uid => {
  const context = env.authenticatedContext(uid).firestore();
  const database = lite.getFirestore(getApp(context.app.name));
  lite.connectFirestoreEmulator(database,'127.0.0.1',8080,{mockUserToken:{sub:uid,user_id:uid}});
  return createBackupRepository(database, {sdk:{...lite,getDocsFromServer:lite.getDocs,getDocFromServer:lite.getDoc},currentUser:()=>({uid})});
};
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
      'payments/payment':{businessId:'tenant-a',amount:10},'platform_jobs/job-a':{businessId:'tenant-a'},'platform_jobs/job-a/scopes/child':{path:'contracts/contract/unknown'},'platform_jobs/job-b':{businessId:'tenant-b'},'platform_jobs/job-b/scopes/foreign':{path:'foreign'},'cash_sessions/cash':{businessId:'tenant-a',status:'closed',reconciliationPending:true}};
    for (const name of ['pos_sale_groups','pos_voids','pos_void_groups']) {
      rows[`${name}/local-proof`] = {businessId:'tenant-a',branchId:'branch',saleId:'sale'};
      rows[`${name}/foreign-proof`] = {businessId:'tenant-b',branchId:'other',saleId:'foreign'};
    }
    for (let index=0;index<205;index++) rows[`products/p-${String(index).padStart(3,'0')}`] = {businessId:'tenant-a',name:'Producto',price:1};
    for (const [path,value] of Object.entries(rows)) batch.set(sdk.doc(db,path),value);
    await batch.commit();
  });
});
after(async () => env?.cleanup());
it('pages past 200 documents using the main Rules and excludes secrets and foreign tenants', async () => {
  const progress = [], exported = await read('admin')({businessId:'tenant-a',actorId:'admin',maxRecords:500,onProgress:p=>progress.push(p)});
  const products = exported.sections.find(s=>s.name==='products');
  assert.equal(products.records.length,205,products.warning); assert.equal(products.status,'complete');
  assert.ok(progress.filter(p=>p.collection==='products').length>=2);
  assert.doesNotMatch(JSON.stringify(exported),/never-export|"Foreign"/);
  for (const name of ['sales','contracts','payments','cash_sessions']) assert.equal(exported.sections.find(s=>s.name===name).records.length,1,name);
  for (const name of ['pos_sale_groups','pos_voids','pos_void_groups']) {
    const section = exported.sections.find(s=>s.name===name); assert.equal(section.records.length,1,name);
    assert.equal(section.status,'complete'); assert.equal(section.records[0].businessId,'tenant-a');
  }
  assert.equal(exported.sections.find(s=>s.name==='cash_sessions').records[0].reconciliationPending,true);
});
it('caps documents and grants SuperAdmin only temporary scoped reads; revokes at the end', async () => {
  const capped = await read('admin')({businessId:'tenant-a',actorId:'admin',maxRecords:100});
  assert.equal(capped.sections.reduce((sum,s)=>sum+s.records.length,0),100); assert.ok(capped.sections.some(s=>s.status==='not-read'));
  const admin = await read('admin')({businessId:'tenant-a',actorId:'admin',maxRecords:500});
  assert.equal(admin.sections.find(s=>s.name==='products').records.length,205);
  assert.equal(admin.sections.find(s=>s.name==='contracts').records.length,1);
  assert.equal(admin.sections.find(s=>s.name==='platform_job_children').records.length,1);
  assert.equal(admin.sections.find(s=>s.name==='unverified_subcollections').status,'not-read');
  assert.equal(admin.accessControlWrites,2);
  assert.equal((await sdk.getDocFromServer(sdk.doc(env.authenticatedContext('admin').firestore(),'platform_data_access/admin'))).exists(),false);
  assert.equal(admin.sections.find(s=>s.name==='sales').records.length,1);
  assert.match(admin.warnings.join(),/permiso temporal/);
  await assertFails(sdk.getDocFromServer(sdk.doc(env.authenticatedContext('admin').firestore(),'products/p-000')));
});
it('rejects cashiers and another owner before reading business data, while direct cross-tenant reads remain denied', async () => {
  for (const uid of ['owner','cashier','foreign']) await assert.rejects(read(uid)({businessId:'tenant-a',actorId:uid,maxRecords:100}),/Solo SuperAdmin/);
  await assertFails(sdk.getDocFromServer(sdk.doc(env.authenticatedContext('foreign').firestore(),'products/p-000')));
});

it('Rules protect scopes from owners, cross-tenant reads, expired grants and all administrative business writes', async () => {
  const admin = env.authenticatedContext('admin').firestore(), owner = env.authenticatedContext('owner').firestore();
  const grant = { actorId:'admin',businessId:'tenant-a',purpose:'export',accessId:'scoped-test-operation',createdAt:sdk.serverTimestamp() };
  await assertFails(sdk.setDoc(sdk.doc(owner,'platform_data_access/owner'),{...grant,actorId:'owner'}));
  await sdk.setDoc(sdk.doc(admin,'platform_data_access/admin'),grant);
  await sdk.getDocFromServer(sdk.doc(admin,'products/p-000'));
  assert.equal((await sdk.getDocsFromServer(sdk.query(sdk.collection(admin,'products'),sdk.where('businessId','==','tenant-a'),sdk.orderBy(sdk.documentId()),sdk.limit(200)))).size,200);
  await assertFails(sdk.getDocsFromServer(sdk.collection(admin,'products')));
  await assertFails(sdk.getDocFromServer(sdk.doc(admin,'products/foreign')));
  await assertFails(sdk.getDocFromServer(sdk.doc(admin,'platform_jobs/job-b/scopes/foreign')));
  await assertFails(sdk.updateDoc(sdk.doc(admin,'products/p-000'),{price:0}));
  await assertFails(sdk.deleteDoc(sdk.doc(admin,'sales/sale')));
  await assertFails(sdk.deleteDoc(sdk.doc(admin,'customers/customer')));
  await assertFails(sdk.setDoc(sdk.doc(admin,'platform_data_access/admin'),{...grant,createdAt:sdk.Timestamp.fromMillis(Date.now()-11*60000)}));
  await env.withSecurityRulesDisabled(context => sdk.setDoc(sdk.doc(context.firestore(),'platform_data_access/admin'),{...grant,createdAt:sdk.Timestamp.fromMillis(Date.now()-11*60000)}));
  await assertFails(sdk.getDocFromServer(sdk.doc(admin,'products/p-000')));
  await sdk.deleteDoc(sdk.doc(admin,'platform_data_access/admin'));
  // Normal operational reads remain intact; Rules cannot infer intent to export identical readable data.
  await sdk.getDocFromServer(sdk.doc(owner,'products/p-000'));
});
