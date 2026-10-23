const env = import.meta.env ?? {};
export function configuredHttpsUrl(value) {
  if (typeof value !== 'string' || !value || /[\s\p{Cc}]/u.test(value)) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export const brand = Object.freeze({
  name: 'MigaPOS', symbol: '🥧', themeColor: '#341b3a', termsVersion: '1.1',
  logo: '/img/Logo_MP.png', icon192: '/img/Logo_192.png', icon512: '/img/Logo_512.png',
  supportUrl: configuredHttpsUrl(env.VITE_SUPPORT_URL), billingUrl: configuredHttpsUrl(env.VITE_BILLING_URL),
});
