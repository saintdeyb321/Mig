import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBrowserFixture } from './helpers/browserHarness.mjs';

it('opens the real SuperAdmin shell without tenant subscriptions, backend calls or IndexedDB loss', { timeout: 90000 }, async () => {
  const module = path => fileURLToPath(new URL(`../frontend/src/${path}`, import.meta.url)).replaceAll('\\', '/');
  const forbidden = `globalThis.__sparkForbidden.push('subscription'); throw new Error('Unexpected business subscription');`;
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
    [module('features/licenses/infrastructure/licenseRepository.js')]: `export function subscribeLicense() {${forbidden}}`,
    [module('features/licenses/infrastructure/administrationRepository.js')]: `export async function adminCall() {${forbidden}} export async function administrationPage() {${forbidden}}`,
    [module('utils/offlineRetry.js')]: `export async function retryOfflineSales() {${forbidden}}`,
  };
  const result = await runBrowserFixture({ htmlFile: new URL('./spark-startup.browser.html', import.meta.url), route: '/spark-startup-test', moduleMocks,
    // Fail before any external endpoint is contacted. Only these forbidden services are intercepted.
    setupPage: page => page.send('Fetch.enable', { patterns: ['*cloudfunctions.net*', '*firebasestorage.googleapis.com*', '*storage.googleapis.com*'].map(urlPattern => ({ urlPattern, requestStage: 'Request' })) }),
  });
  assert.equal(result.checks.length, 8);
  console.log(`Spark startup: ${result.checks.length} isolated browser checks passed; no real login or Firebase connection.`);
});
