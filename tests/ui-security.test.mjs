import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, extname } from 'node:path';
import { escapeHtml, escapeAttribute, multilineHtml, safeImageUrl } from '../frontend/src/shared/security/html.js';
import { brand, configuredHttpsUrl } from '../frontend/src/config/brand.js';
import { isWithinShift, limaTime, watchShift } from '../frontend/src/core/auth/shiftAccess.js';
import { generateReceiptHTML } from '../frontend/src/utils/receiptTemplate.js';
import { generateContractReceiptHTML } from '../frontend/src/utils/contractReceiptTemplate.js';
import { generateContractProductionHTML, generateContractTextOnlyHTML } from '../frontend/src/utils/contractProductionTemplate.js';
import { resolveImageSources, usingImageSources } from '../frontend/src/features/contracts/application/imageSources.js';
import { hostingHeaders, environmentFor } from '../frontend/src/config/environments.js';

const attack = '<img src=x onerror="parent.__xss=1"><script>parent.__xss=1</script>\' &';
const settings = { companyData: { razonSocial: attack, ruc: attack, direccion: attack, telefono: attack } };
const branches = [{ id: 'b', name: attack, address: attack, phone: attack }];
const sale = { localId: attack, date: '2026-10-23', total: 10, payment: attack, cashierName: attack, voidReason: attack,
  items: [{ name: attack, qty: 1, price: 10 }] };
const contract = { contractId: attack, clientName: attack, clientPhone: attack, deliveryType: 'domicilio', deliveryAddress: attack,
  createdAt: '2026-10-23', deliveryDate: '2026-10-24', details: `Primera\r\n${attack}\nÚltima`, voidReason: attack, voidedByName: attack,
  total: 10, balance: 5, payments: [{ date: '2026-10-23', method: attack, label: attack, amount: 5 }] };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6F8kAAAAASUVORK5CYII=';
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('Printable tenant data', () => {
  it('escapes HTML text, attributes and CRLF without losing literal content', () => {
    assert.equal(escapeHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeAttribute('"\n\x00'), '&quot;&#10;&#0;');
    assert.equal(multilineHtml('A\r\n<b>B</b>\rC\nD'), 'A<br>&lt;b&gt;B&lt;/b&gt;<br>C<br>D');
  });
  it('escapes every POS field including historical payment, cashier and void reason', () => {
    const html = generateReceiptHTML(sale, settings, branches[0]);
    assert.ok(html.includes(escapeHtml(attack)));
    assert.ok(html.includes('Sucursal: ' + escapeHtml(attack)));
    assert.ok(html.includes('CAJERO:</span> ' + escapeHtml(attack)));
    assert.ok(html.includes('ANULACIÓN:</span> ' + escapeHtml(attack)));
    assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('&amp;lt;'));
  });
  for (const template of [generateContractReceiptHTML, generateContractProductionHTML, generateContractTextOnlyHTML]) {
    it(`${template.name} escapes clients, delivery, details, voids and historical labels`, () => {
      const html = template(contract, settings, branches);
      assert.ok(html.includes(escapeHtml(attack)));
      assert.ok(html.includes('Primera<br>' + escapeHtml(attack) + '<br>Última'));
      assert.ok(html.includes('ANULACIÓN:'));
      assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
      assert.ok(!html.includes('&amp;lt;'));
      const pickup = template({ ...contract, deliveryType: 'b' }, {}, branches);
      assert.ok(pickup.includes('RECOJO EN: ' + escapeHtml(attack)));
      assert.ok(!pickup.includes('&amp;lt;'));
    });
    it(`${template.name} uses the current tenant and generic fallback without tenant leakage`, () => {
      for (const name of ['Tenant A & hijos', 'Tenant B']) {
        const html = template({ ...contract, referenceImages: [png] }, { companyData: { razonSocial: name } });
        assert.ok(html.includes(escapeHtml(name)));
        assert.ok(!html.includes(name === 'Tenant B' ? 'Tenant A' : 'Tenant B'));
      }
      assert.ok(template(contract, {}).includes('Mi Negocio'));
    });
  }
  it('uses branch address/phone and falls back to tenant contact only when absent', () => {
    const companyData = { razonSocial: 'Tenant', direccion: 'Dirección general', telefono: 'Teléfono tenant' };
    const branch = { id: 'b', name: 'Sede & norte', address: 'Dirección sede', phone: 'Teléfono sede' };
    for (const html of [generateReceiptHTML(sale, { companyData }, branch), generateContractReceiptHTML({ ...contract, deliveryType: 'b' }, { companyData }, [branch])]) {
      assert.ok(html.includes('Sede &amp; norte')); assert.ok(html.includes('Dirección sede')); assert.ok(html.includes('Teléfono sede'));
      assert.ok(!html.includes('Dirección general')); assert.ok(!html.includes('Teléfono tenant'));
    }
    assert.ok(generateReceiptHTML(sale, { companyData }).includes('Dirección general'));
  });
});

describe('Image and configured link allowlists', () => {
  it('blocks javascript, SVG, arbitrary schemes, credentials, ports and attribute injection', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'data:image/svg+xml;base64,PHN2Zz4=', 'file:///x', '//evil.test/x', 'http://firebasestorage.googleapis.com/v0/b/a/o/a', 'https://evil.test/a.png', 'https://storage.googleapis.com:444/b/a', 'https://user:pw@storage.googleapis.com/b/a', png + '" onerror="x', 'data:image/png;base64,PHNjcmlwdD4=', 'data:image/jpeg;base64,iVBORw0KGgo=']) assert.equal(safeImageUrl(url), '', url);
  });
  it('keeps Firebase Storage/GCS URLs and escapes token parameters as attributes', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/tenant.appspot.com/o/contracts%2Fa.jpg?alt=media&token=legacy';
    assert.equal(safeImageUrl(url), url);
    assert.equal(safeImageUrl('https://storage.googleapis.com/bucket/contracts/a.jpg'), 'https://storage.googleapis.com/bucket/contracts/a.jpg');
    const html = generateContractReceiptHTML({ ...contract, referenceImage: url }, {});
    assert.ok(html.includes('alt=media&amp;token=legacy'));
    assert.ok(!generateContractProductionHTML({ ...contract, referenceImages: ['javascript:alert(1)'] }, {}).includes('<img'));
  });
  it('accepts validated legacy raster data and current-origin temporary blobs', () => {
    assert.equal(safeImageUrl(png), png);
    const blob = 'blob:https://app.test/a1b2c3d4-1234-1234-abcd-123456789abc';
    assert.equal(safeImageUrl(blob, { origin: 'https://app.test' }), blob);
    assert.equal(safeImageUrl(blob, { origin: 'https://other.test' }), '');
    assert.equal(safeImageUrl('blob:javascript:alert(1)'), '');
    assert.ok(generateContractProductionHTML({ ...contract, referenceImages: [png] }, {}).includes(png));
  });
  it('shows only explicitly configured HTTPS support and billing links', () => {
    assert.equal(brand.name, 'MigaPOS'); assert.equal(brand.termsVersion, '1.1');
    assert.equal(configuredHttpsUrl('https://support.example/path'), 'https://support.example/path');
    for (const value of ['', 'javascript:alert(1)', 'http://example.com', 'https://u:p@example.com', 'https://example.com/\n']) assert.equal(configuredHttpsUrl(value), null);
  });
});

describe('Temporary image ownership', () => {
  it('selects Storage thumbnails and releases owned URLs exactly once, retaining legacy URLs', async () => {
    const loaded = [], revoked = [];
    const result = await resolveImageSources([{ storagePath: 'contracts/a.jpg', thumbnailPath: 'contracts/thumbs/a.jpg' }, png], {
      thumbnails: true, load: async path => { loaded.push(path); return new Blob(['fixture']); },
      createUrl: () => 'blob:owned', revokeUrl: url => revoked.push(url),
    });
    assert.deepEqual(loaded, ['contracts/thumbs/a.jpg']); assert.deepEqual(result.urls, ['blob:owned', png]);
    assert.deepEqual(revoked, []); result.release(); result.release(); assert.deepEqual(revoked, ['blob:owned']);
  });
  it('retains images through the awaited print callback, including failure, and then releases them', async () => {
    for (const fail of [false, true]) {
      const revoked = [];
      const operation = usingImageSources([{ storagePath: 'contracts/a.jpg' }], async urls => {
        await Promise.resolve(); assert.equal(urls[0], 'blob:owned'); assert.deepEqual(revoked, []);
        if (fail) throw new Error('Print failure');
        return 'printed';
      }, { load: async () => new Blob(['fixture']), createUrl: () => 'blob:owned', revokeUrl: url => revoked.push(url) });
      if (fail) await assert.rejects(operation, /Print failure/); else assert.equal(await operation, 'printed');
      assert.deepEqual(revoked, ['blob:owned']);
    }
  });
  it('waits for late image results and revokes them when any parallel load fails', async () => {
    let releaseLate; const late = new Promise(resolve => { releaseLate = resolve; });
    const revoked = [];
    const operation = resolveImageSources([{ storagePath: 'contracts/late.jpg' }, { storagePath: 'contracts/fail.jpg' }], {
      load: async path => { if (path.includes('fail')) throw new Error('Download failed'); return late; },
      createUrl: () => 'blob:late', revokeUrl: url => revoked.push(url),
    });
    const rejected = assert.rejects(operation, /Download failed/);
    releaseLate(new Blob(['fixture'])); await rejected; assert.deepEqual(revoked, ['blob:late']);
  });
});

describe('Shared UI shift rules (Lima, not server authorization)', () => {
  const cashier = (shiftStart, shiftEnd) => ({ role: 'cajero', shiftStart, shiftEnd });
  it('includes the start and excludes the end of 08:00–17:00', () => {
    const user = cashier('08:00', '17:00');
    for (const [time, expected] of [['07:59', false], ['08:00', true], ['12:00', true], ['16:59', true], ['17:00', false], ['23:59', false]]) assert.equal(isWithinShift(user, time), expected, time);
  });
  it('handles 22:00–06:00, midnight and the following day', () => {
    const user = cashier('22:00', '06:00');
    for (const [time, expected] of [['21:59', false], ['22:00', true], ['23:59', true], ['00:00', true], ['05:59', true], ['06:00', false], ['12:00', false]]) assert.equal(isWithinShift(user, time), expected, time);
    assert.equal(limaTime(new Date('2026-10-24T05:00:00Z')), '00:00');
    assert.ok(isWithinShift(user, new Date('2026-10-24T05:00:00Z')));
    assert.ok(!isWithinShift(user, new Date('2026-10-24T11:00:00Z')));
  });
  it('preserves absent/full-day shifts, exempts owners/admins and rejects invalid roles/times', () => {
    assert.ok(isWithinShift(cashier(null, null), '12:00'));
    assert.ok(isWithinShift(cashier('08:00', null), '12:00'));
    assert.ok(isWithinShift(cashier('08:00', '08:00'), '00:00'));
    for (const role of ['dueño', 'superadmin']) assert.ok(isWithinShift({ role, shiftStart: 'bad', shiftEnd: 'bad' }));
    for (const user of [null, {}, { role: 'unknown' }, cashier('25:00', '06:00')]) assert.equal(isWithinShift(user, '12:00'), false);
  });
  it('runs one periodic check, expires once and suppresses stale callbacks after cleanup', () => {
    let callback, stopped = 0, expired = 0, time = '23:59', intervals = 0;
    const options = { now: () => time, every: check => { intervals++; callback = check; return 42; }, cancel: id => { assert.equal(id, 42); stopped++; } };
    const stop = watchShift(cashier('22:00', '06:00'), () => expired++, options);
    time = '06:00'; callback(); callback(); assert.equal(expired, 1); assert.equal(intervals, 1);
    stop(); callback(); assert.equal(expired, 1); assert.equal(stopped, 1);
    time = '23:00'; const stopEarly = watchShift(cashier('22:00', '06:00'), () => expired++, options);
    stopEarly(); time = '07:00'; callback(); assert.equal(expired, 1);
    watchShift({ role: 'dueño' }, () => expired++, options)(); assert.equal(intervals, 2);
  });
  it('auth and the single monitor consume the same pure rule and cancel delayed logout', () => {
    const auth = source('frontend/src/hooks/useAuthManager.js'), monitor = source('frontend/src/hooks/useShiftMonitor.js');
    assert.ok(auth.includes('isWithinShift(userData)')); assert.ok(!auth.includes('setInterval'));
    assert.ok(monitor.includes('watchShift(')); assert.ok(monitor.includes('clearTimeout(logoutTimer)'));
    assert.ok(monitor.includes('auth.currentUser?.uid === uid'));
  });
});

describe('Hosting policy and conservative cleanup', () => {
  it('permits exact Firebase/Auth/PWA sources without broad wildcards or eval', () => {
    const headers = Object.fromEntries(hostingHeaders(environmentFor('production')).map(({ key, value }) => [key, value]));
    const csp = headers['Content-Security-Policy'];
    assert.ok(!csp.includes('*')); assert.ok(!csp.includes('unsafe-eval'));
    assert.ok(csp.includes("script-src 'self' https://apis.google.com"));
    assert.ok(!csp.match(/script-src[^;]*unsafe-inline/));
    for (const value of ["worker-src 'self'", "manifest-src 'self'", 'https://migapos.firebaseapp.com', 'https://us-central1-migapos.cloudfunctions.net', 'https://firebasestorage.googleapis.com', 'blob:', 'data:']) assert.ok(csp.includes(value), value);
    assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.ok(source('frontend/vite.config.js').includes('inline styles for React/toasts'));
  });
  it('has no broken local imports, legacy adapters or hardcoded business branding', () => {
    const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)]);
    for (const file of walk('frontend/src').filter(file => ['.js', '.jsx'].includes(extname(file)))) {
      const text = readFileSync(file, 'utf8');
      assert.ok(!/k.?prichitos|angie|975\s*108\s*337|Deyvid Pariona/i.test(text), file);
      for (const match of text.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)) {
        const path = resolve(dirname(file), match[2].split('?')[0]);
        assert.ok(['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'].some(suffix => existsSync(path + suffix)), `${file}: ${match[2]}`);
      }
    }
    for (const path of ['frontend/src/firebase.js', 'frontend/src/utils/adminExcelStyles.js', 'frontend/src/utils/backupAdmin/adminDataProcessor.js', 'backend/src/index.js', 'shared/README.md']) assert.ok(!existsSync(path), path);
    const markdown = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(existsSync);
    assert.ok(markdown.includes('docs/MASTER-PLAN.md'));
    assert.ok(markdown.every(path => ['docs/MASTER-PLAN.md', 'docs/PLAN-REFAC-SPARK-MIGAPOS.md'].includes(path)));
  });
});
