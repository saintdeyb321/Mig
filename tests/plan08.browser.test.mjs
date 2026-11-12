import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

const path = name => fileURLToPath(new URL('../frontend/src/' + name, import.meta.url)).replaceAll('\\', '/');
const client = path('core/firebase/client.js');
const transactions = path('features/sales/infrastructure/saleTransactions.js');
const historyMocks = {
  [client]: 'export const auth = {get currentUser(){return window.__p08Actor;}}; export const db = {};',
  [path('features/sales/infrastructure/salesRepository.js')]: `export function subscribeRecentSales(business,branch,next){
    const model=window.__p08History;const publish=(rows,meta)=>next(rows.filter(row=>row.businessId===business&&(branch==='global'||row.branchId===branch)),meta);
    model.emitSales=publish;publish(model.remote,{fromCache:false});return()=>{};}`,
  [path('features/sales/infrastructure/pendingSalesCache.js')]: `export function subscribePendingSales(user,branch,next){next(window.__p08History.local.filter(row=>row.userId===user.uid&&row.businessId===user.businessId&&(branch==='global'||row.branchId===branch)));return()=>{};}`,
  [path('features/sales/infrastructure/posVoidQueryRepository.js')]: `export const voidCashPayments=()=>[];export function createPosVoidReader(){return{subscribeIds(business,branch,ids,next){
    const model=window.__p08History;const publish=(rows,meta)=>next(rows.filter(row=>row.businessId===business&&ids.includes(row.saleId)&&(branch==='global'||row.branchId===branch)),meta);
    model.emitVoids=publish;publish(model.receipts,{fromCache:false});return()=>{};}};}`,
  [transactions]: `export async function voidSaleTransaction(command){const model=window.__p08History;model.writes++;model.command=command;
    model.attempts=[{saleId:command.id,reason:command.voidReason,userId:command.identity.uid,branchId:command.identity.branchId,businessId:command.identity.businessId,localState:'pending'}];model.emitAttempts?.(model.attempts);
    return new Promise((resolve,reject)=>{model.resolve=resolve;model.reject=reject;});}
    export function subscribeVoidAttempts(identity,next){const model=window.__p08History;model.emitAttempts=next;next(model.attempts.filter(row=>row.userId===identity.uid&&row.businessId===identity.businessId));return()=>{};}
    export const verifyPendingSaleTransaction=async()=>{};
    export const voidRecovery={async verify(){const model=window.__p08History;model.verifications++;model.receipts=[...model.receipts,model.verifyReceipt];model.emitVoids(model.receipts,{fromCache:false});return model.verifyReceipt;}};
    export const reviewDraftSaleTransaction=async()=>{throw Error('Not part of this modal race');};export const confirmDraftSaleTransaction=async()=>{throw Error('No draft writes in this test');};`,
};

it('P08 history closes from server receipts, ignores late failures and cache, preserves review, and prevents duplicate void submits', { timeout: 90000 }, async () => {
  const result = await runBrowserFixture({ htmlFile: new URL('./plan08-history.browser.html', import.meta.url), route: '/plan08-history', moduleMocks: historyMocks,
    setupPage: page => page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] }),
  });
  assert.equal(result.financialOperations, 2); assert.equal(result.readOnlyVerifications, 1); assert.equal(result.checks.length, 11);
});

it('P08 Chromium preserves durable draft ciphertext, coordinates last-unit races, requires explicit review and keeps cash provisional', { timeout: 90000 }, async () => {
  const result = await runBrowserFixture({ htmlFile: new URL('./plan08-pos.browser.html', import.meta.url), route: '/plan08-pos', moduleMocks: {
    [client]: 'export const auth={get currentUser(){return window.__p08Actor;}};export const db={};',
    [transactions]: `export const saveSaleTransaction=(...args)=>window.__p08Transactions.save(...args);
      export const saveSaleDraftTransaction=(...args)=>window.__p08Transactions.draft(...args);
      export const subscribeSaleAcknowledgement=(...args)=>window.__p08Transactions.subscribe(...args);
      export const reviewDraftSaleTransaction=(...args)=>window.__p08Transactions.review(...args);
      export const confirmDraftSaleTransaction=(...args)=>window.__p08Transactions.confirm(...args);
      export const verifyPendingSaleTransaction=(...args)=>window.__p08Transactions.verify(...args);`,
  }, setupPage: page => page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*', requestStage: 'Request' }] }) });
  assert.equal(result.remoteWrites, 2); assert.equal(result.warningsDuringProcessing, 0); assert.equal(result.checks.length, 19);
});
