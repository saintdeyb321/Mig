import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

it('opens the real SuperAdmin shell without tenant subscriptions, backend calls or IndexedDB loss', { timeout: 90000 }, async () => {
  const module = path => fileURLToPath(new URL(`../frontend/src/${path}`, import.meta.url)).replaceAll('\\', '/');
  const forbidden = `globalThis.__sparkForbidden.push('subscription'); throw new Error('Unexpected business subscription');`;
  const forbiddenRead = `globalThis.__sparkForbidden.push('read'); throw new Error('Unexpected business read');`;
  const moduleMocks = {
    [module('core/firebase/client.js')]: 'export const auth = {currentUser: null}; export const db = {};',
    [module('hooks/useAuthManager.js')]: `import {useState} from 'react'; export function useAuthManager() {
      const [user, setUser] = useState(null); globalThis.__setSparkUser = setUser;
      return {user, authLoading:false, handleLogout:() => setUser(null)};
    }`,
    [module('hooks/useMaintenance.js')]: 'export const useMaintenance = () => ({isMaintenance:false});',
    [module('components/ReloadPrompt.jsx')]: 'export default function ReloadPrompt() {return null;}',
    [module('features/branches/infrastructure/branchRepository.js')]: `export function subscribeBranches() {${forbidden}}`,
    [module('features/settings/infrastructure/settingsRepository.js')]: `export function subscribeSettings() {${forbidden}}`,
    [module('features/catalog/infrastructure/catalogRepository.js')]: `export function subscribeProducts() {${forbidden}} export function subscribeCategories() {${forbidden}}`,
    [module('features/notifications/infrastructure/notificationRepository.js')]: `export function subscribeUnreadNotifications() {${forbidden}} export function markNotificationRead() {${forbidden}} export function markAllNotificationsRead() {${forbidden}}`,
    [module('features/licenses/infrastructure/licenseRepository.js')]: `
      export function subscribeLicense() {${forbidden}}
      export function subscribeTenant() {${forbidden}}
      export function getLicenseFromServer() {${forbiddenRead}}
      export function getTenantFromServer() {${forbiddenRead}}`,
    [module('features/licenses/infrastructure/administrationRepository.js')]: `
      const expiryMs = Date.now() + 86400000;
      const expiry = {toDate:() => new Date(expiryMs), toMillis:() => expiryMs};
      const rows = [{id:'fixture-tenant', businessName:'Negocio existente', status:'activa', tenantStatus:'active', expiry}];
      export async function administrationPage() {globalThis.__sparkPageCalls++; return {rows:[...rows], cursor:null};}
      export async function administrationLicense({businessId}) {
        globalThis.__sparkLicenseReads = (globalThis.__sparkLicenseReads ?? 0) + 1;
        return {...rows.find(row=>row.id===businessId)};
      }
      export async function administrationContact() {
        globalThis.__sparkContactReads = (globalThis.__sparkContactReads ?? 0) + 1;
        return {ownerFirstName:'Titular',ownerEmail:'contacto@example.test'};
      }
      export async function adminCall(name, data) {
        if (!['createTenant','extendTenantLicense','setTenantLicenseStatus'].includes(name)) {${forbidden}}
        globalThis.__sparkAdminCalls.push({name, data});
        if(name === 'createTenant') rows.push({id:data.operationId, businessName:data.businessName, ownerEmail:data.ownerEmail, tenantStatus:'active', status:'activa', expiry});
        if(name === 'extendTenantLicense' && !globalThis.__sparkRenewFailed) {
          await new Promise(resolve => { globalThis.__sparkResolveRenew = resolve; });
          globalThis.__sparkRenewFailed = true;
          throw Object.assign(new Error('Respuesta interrumpida en la simulación'), {code:'unavailable'});
        }
        return {businessId:data.operationId};
      }`,
    [module('utils/offlineRetry.js')]: `export async function retryOfflineSales() {${forbidden}}`,
  };
  const result = await runBrowserFixture({ htmlFile: new URL('./spark-startup.browser.html', import.meta.url), route: '/spark-startup-test', moduleMocks,
    // Fail before any external endpoint is contacted. Only these forbidden services are intercepted.
    setupPage: page => page.send('Fetch.enable', { patterns: ['*cloudfunctions.net*', '*firebasestorage.googleapis.com*', '*storage.googleapis.com*'].map(urlPattern => ({ urlPattern, requestStage: 'Request' })) }),
  });
  assert.equal(result.checks.length, 17);
  console.log(`Spark startup: ${result.checks.length} isolated browser checks passed; no real login or Firebase connection.`);
});
