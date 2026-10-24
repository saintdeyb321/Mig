import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { makeBackup, encodeBackup, verifyBackupFile, sanitizeBackup, canonicalJSON, sha256 } from '../frontend/src/features/backups/domain/backupFile.js';
import { releaseConfig, assertSparkConfig, assertReleaseGuard, assertPolicyRollback, assertIndexReview, publishedRulesRecord, releasePlan, sourceFileHash } from '../scripts/release.mjs';
import { environmentFor } from '../frontend/src/config/environments.js';
import { createBackupRepository } from '../frontend/src/features/backups/infrastructure/backupRepository.js';
import { firebaseErrorMessage } from '../frontend/src/core/errors/firebaseErrors.js';

const sample = () => makeBackup({ businessId: 'tenant-a', actorId: 'owner', startedAt: '2026-10-23T12:00:00Z',
  sections: [{ name: 'sales', records: [{ id: 'sale-1', total: 10 }], status: 'complete' }, { name: 'products', records: [], status: 'inaccessible', warning: 'permission-denied' }] });
it('roundtrips the manifest and rejects tampering, missing collections and another tenant without writes', async () => {
  const backup = await sample(), text = await encodeBackup(backup);
  const result = await verifyBackupFile(text, '', 'tenant-a');
  assert.equal(result.writes, 0); assert.equal(result.records, 1); assert.equal(result.manifest.partial, true);
  assert.match(result.manifest.warnings.join(), /no es una copia integral/);
  await assert.rejects(verifyBackupFile(text, '', 'tenant-b'), /otro negocio/);
  backup.sections[0].records[0].total = 200;
  await assert.rejects(verifyBackupFile(JSON.stringify(backup)), /Checksum global/);
  const { integrity, ...payload } = backup;
  backup.integrity = await sha256(canonicalJSON(payload));
  await assert.rejects(verifyBackupFile(JSON.stringify(backup)), /Integridad de colección/);
  assert.ok(integrity);
});
it('encrypts with a fresh salt/IV and authenticates passphrase and ciphertext; never stores the passphrase', async () => {
  const backup = await sample(), passphrase = 'local-test-password-only';
  const first = await encodeBackup(backup, passphrase), second = await encodeBackup(backup, passphrase);
  assert.notEqual(first, second); assert.ok(!first.includes(passphrase) && !first.includes('sale-1'));
  assert.equal((await verifyBackupFile(first, passphrase)).writes, 0);
  await assert.rejects(verifyBackupFile(first, 'incorrect'), /Contraseña incorrecta/);
  const changed = JSON.parse(first); changed.ciphertext = 'A' + changed.ciphertext.slice(1);
  // Alter a byte even if the original happened to begin with A.
  changed.ciphertext = (JSON.parse(first).ciphertext[0] === 'A' ? 'B' : 'A') + changed.ciphertext.slice(1);
  await assert.rejects(verifyBackupFile(JSON.stringify(changed), passphrase), /alterado/);
  await assert.rejects(encodeBackup(backup, 'short'), /12 a 1024/);
});
it('rejects a partial export labelled complete even when its global checksum was recomputed', async () => {
  const backup = await sample(); backup.manifest.partial = false;
  const {integrity, ...payload} = backup;
  backup.integrity = await sha256(canonicalJSON(payload));
  await assert.rejects(verifyBackupFile(JSON.stringify(backup)), /debe indicarse como parcial/);
  await assert.rejects(verifyBackupFile('null'), /Manifiesto/);
  assert.ok(integrity);
});
it('preserves an accessible first page and labels it incomplete when a later page fails', async () => {
  let pages = 0;
  const sdk = {doc:(_db,name,id)=>({name,id}),getDocFromServer:async ref=>ref.name==='users'?{data:()=>({role:'superadmin',businessId:'platform-admin'})}:{exists:()=>false},
    collection:(_db,name)=>({name}),query:ref=>ref,where:()=>({}),orderBy:()=>({}),documentId:()=>({}),startAfter:()=>({}),limit:()=>({}),
    getDocsFromServer:async ref=>{
      if(ref.name!=='products') return {size:0,docs:[]};
      if(pages++) throw Object.assign(Error('connection-lost'),{code:'unavailable'});
      const docs=Array.from({length:200},(_,i)=>({id:String(i),data:()=>({businessId:'tenant-a',name:'Product'})}));
      return {size:docs.length,docs};
    }};
  const read=createBackupRepository({}, {sdk,currentUser:()=>({uid:'owner'}),withAccess:async(_scope,work)=>work()});
  const exported=await read({businessId:'tenant-a',actorId:'owner',maxRecords:500});
  const products=exported.sections.find(section=>section.name==='products');
  assert.equal(products.records.length,200);assert.equal(products.status,'incomplete');
  const backup=await makeBackup({...exported,businessId:'tenant-a',actorId:'owner',startedAt:new Date().toISOString()});
  assert.equal((await verifyBackupFile(await encodeBackup(backup))).manifest.partial,true);
});
it('redacts nested credentials, arbitrary auth tokens, JWT and private keys but preserves financial identifiers', () => {
  const redactions = [], row = sanitizeBackup({ idempotencyKey: 'sale-key', requestHash: 'hash', nested: { authToken: 'private', api_key: 'private', password: 'private', cryptoKey: 'private', credentials: {} }, jwt: 'eyJabc.def.ghi', pem: '-----BEGIN PRIVATE KEY-----\nvalue', total: 12 }, redactions);
  assert.deepEqual(row.nested, {}); assert.equal(row.total, 12); assert.equal(row.idempotencyKey, 'sale-key');
  assert.ok(redactions.length >= 7); assert.doesNotMatch(JSON.stringify(row), /PRIVATE KEY|private|eyJabc/);
});
it('generates production-only Spark resources and refuses additional resources, endpoints and altered guards', () => {
  const base = JSON.parse(readFileSync('firebase.json', 'utf8')), profile = environmentFor('production'), config = releaseConfig(base, profile);
  assert.equal(base.functions, undefined); assert.equal(base.storage, undefined);
  assert.equal(base.emulators.functions, undefined); assert.equal(base.emulators.storage, undefined);
  assert.doesNotThrow(() => assertSparkConfig(config, profile)); assert.equal(config.emulators, undefined);
  for (const mutate of [c => c.functions = {}, c => c.hosting.site = 'other-site', c => c.firestore.database = 'other',
    c => c.hosting.rewrites = [{source:'**', function:'legacy'}], c => c.hosting.predeploy = [], c => c.hosting.headers[0].headers[0].value += ' http://localhost:8080']) {
    const altered = structuredClone(config); mutate(altered); assert.throws(() => assertSparkConfig(altered, profile));
  }
  const plan = releasePlan(profile, 'a'.repeat(40));
  assert.equal(plan.length, 4); assert.ok(plan.every(line => line.includes('--project migapos')));
  assert.match(plan[1], /--only "firestore:rules,firestore:indexes"/); assert.match(plan[2], /--only hosting /);
  const fixture = { profile, project:'migapos', acknowledgement:'migapos/migapos-peru', commit:'sha', fingerprint:'source', configHash:'config', publicEnvHash:'env', artifactHash:'dist',
    receipt:{environment:'production', projectId:'migapos', site:'migapos-peru', commit:'sha', fingerprint:'source', configHash:'config', publicEnvHash:'env', artifactHash:'dist'},
    ci:{commit:'sha', fingerprint:'source', result:'passed', run:'https://github.com/saintdeyb321/Mig/actions/runs/123'} };
  assert.doesNotThrow(() => assertReleaseGuard(fixture));
  for (const change of [{acknowledgement:''}, {project:'other'}, {artifactHash:'changed'}, {fingerprint:'dirty'}, {ci:null}, {profile:environmentFor('emulator')}]) assert.throws(() => assertReleaseGuard({...fixture,...change}));
  const rollback = {profile, config:{firestore:{database:'(default)',rules:'.release/policy/migapos/previous/firestore.rules',predeploy:['node scripts/release.mjs guard-rollback --env production --config firebase.production.rollback.generated.json']}},
    policy:{source:'firebase-console-manual',publicationVerified:'manual',rules:'.release/published-policy/migapos/previous/firestore.rules',policyHash:'verified-hash'},receipt:{policyHash:'verified-hash'},acknowledgement:'migapos/(default)/verified-hash'};
  rollback.config.firestore.rules=rollback.policy.rules;
  assert.doesNotThrow(()=>assertPolicyRollback(rollback));
  for (const mutate of [r=>r.policy.source='repository-build',r=>r.policy.publicationVerified=false,r=>r.acknowledgement='',r=>r.config.firestore.indexes='firestore.indexes.json',r=>r.config.hosting={},r=>r.config.firestore.rules='firestore.rules',r=>r.config.firestore.predeploy=[]]) {
    const altered=structuredClone(rollback);mutate(altered);assert.throws(()=>assertPolicyRollback(altered));
  }
  const refused = spawnSync(process.execPath, ['scripts/release.mjs', 'guard', '--env', 'production'], {env:{...process.env, GOOGLE_APPLICATION_CREDENTIALS:'never-open.json'}, encoding:'utf8', windowsHide:true});
  assert.notEqual(refused.status, 0); assert.match(refused.stderr, /no admite cuentas de servicio/);
});
it('records only operator-declared published Rules and requires exact active-index review before release', () => {
  const rules=Buffer.from("rules_version = '2'; service cloud.firestore { match /databases/{db}/documents { match /{all=**} { allow read, write: if false; } } }");
  const record=publishedRulesRecord(rules,{version:'synthetic-test-only',reviewer:'test-fixture',confirmation:'migapos/(default)'});
  assert.equal(record.source,'firebase-console-manual');assert.equal(record.publicationVerified,'manual');
  assert.equal(record.projectId,'migapos');assert.equal(record.database,'(default)');assert.equal(record.rulesHash.length,64);
  assert.throws(()=>publishedRulesRecord(rules,{version:'git-sha',reviewer:'',confirmation:'migapos/(default)'}));
  assert.throws(()=>publishedRulesRecord(rules,{version:'fixture',reviewer:'fixture',confirmation:'other/(default)'}));
  const profile=environmentFor('production');
  assert.doesNotThrow(()=>assertIndexReview(profile,'index-hash','migapos/(default)/index-hash'));
  for(const ack of ['', 'migapos/(default)/old-hash','other/(default)/index-hash']) assert.throws(()=>assertIndexReview(profile,'index-hash',ack));
});
it('matches CI source receipts across Windows/Linux line endings while retaining binary changes', () => {
  assert.equal(sourceFileHash(Buffer.from('á\r\ncode\r\n')),sourceFileHash(Buffer.from('á\ncode\n')));
  assert.notEqual(sourceFileHash(Buffer.from([0,13,10])),sourceFileHash(Buffer.from([0,10])));
  assert.notEqual(sourceFileHash(Buffer.from('code')),sourceFileHash(Buffer.from('changed')));
});
it('covers notification and confirmed sale/contract range indexes without widening Rules', () => {
  const indexes = JSON.parse(readFileSync('firestore.indexes.json','utf8')).indexes;
  const has = (collection, fields) => indexes.some(index => index.collectionGroup === collection && fields.every(([name, order]) => index.fields.some(field => field.fieldPath === name && field.order === order)));
  assert.ok(has('notifications', [['businessId','ASCENDING'],['userId','ASCENDING'],['readAt','ASCENDING'],['createdAt','DESCENDING']]));
  for (const collection of ['sales', 'contracts']) assert.ok(has(collection, [['businessId','ASCENDING'],[collection === 'sales' ? 'confirmedAt' : 'createdAt','ASCENDING']]));
  assert.match(firebaseErrorMessage({code:'failed-precondition',message:'index-link'}), /index-link/);
  assert.match(firebaseErrorMessage({code:'permission-denied'}), /Rules publicadas/);
});
it('stops reads after byte quota exhaustion and aborts instead of exporting a foreign record or stale identity', async () => {
  let calls = 0, uid = 'owner', oversized = true;
  const sdk = {doc:(_db,name,id) => ({name,id}), getDocFromServer: async ref => {
    calls++; return ref.name === 'users' ? {data:() => ({role:'superadmin',businessId:'platform-admin'})} : {id:ref.id, exists:() => true, data:() => ({businessId:'tenant-a', big:oversized ? 'x'.repeat(17*1024*1024) : ''})};
  }, collection:()=>({}), query:()=>({}), where:()=>({}), orderBy:()=>({}), documentId:()=>({}), startAfter:()=>({}), limit:()=>({}),
  getDocsFromServer: async () => {calls++; return {size:1, docs:[{id:'foreign',data:()=>({businessId:'tenant-b'})}]};}};
  const read = createBackupRepository({}, {sdk,currentUser:()=>({uid}),withAccess:async(_scope,work)=>work()});
  const result = await read({businessId:'tenant-a',actorId:'owner',maxRecords:100});
  assert.equal(calls,2); assert.equal(result.sections[0].status,'limited'); assert.equal(result.sections[1].status,'not-read');
  oversized = false; calls = 0;
  await assert.rejects(read({businessId:'tenant-a',actorId:'owner',maxRecords:100}), /fuera del negocio/);
  uid = 'another'; calls = 0;
  await assert.rejects(read({businessId:'tenant-a',actorId:'owner'}), /identidad/); assert.equal(calls,0);
});

it('inventories known routes and references without treating reference targets as owned or complete', async () => {
  const { inventorySections } = await import('../frontend/src/features/backups/domain/tenantInventory.js');
  const sections = inventorySections([{ name:'sales', status:'complete', records:[{ $path:'sales/a',businessId:'tenant-a',userId:'cashier',branchId:'branch',items:[{id:'product'}],extra:{$type:'reference',path:'customers/unknown-owner'} }] },
    {name:'unverified_subcollections',records:[],status:'not-read'}], 'tenant-a');
  assert.deepEqual(sections[0].records[0].references, ['branches/branch','customers/unknown-owner','products/product','users/cashier']);
  assert.equal(sections[0].records[0].referenceAuthority,'unverified-targets-never-followed-or-deleted');
  const backup = await makeBackup({businessId:'tenant-a',actorId:'admin',startedAt:new Date().toISOString(),sections,purpose:'inventory'});
  const verified = await verifyBackupFile(await encodeBackup(backup));
  assert.equal(verified.manifest.partial,true); assert.equal(verified.manifest.purpose,'inventory');
  assert.throws(()=>inventorySections([{name:'sales',records:[{businessId:'foreign'}]}],'tenant-a'),/fuera del negocio/);
});
