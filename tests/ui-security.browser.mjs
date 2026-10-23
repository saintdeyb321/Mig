import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import XLSX from 'xlsx-js-style';
import { createPrintJob } from '../frontend/src/shared/printing/printDocument.js';
import { usePrintJobs } from '../frontend/src/shared/printing/usePrintJobs.js';
import { usingImageSources } from '../frontend/src/features/contracts/application/imageSources.js';
import { safeImageUrl } from '../frontend/src/shared/security/html.js';
import { generateReceiptHTML } from '../frontend/src/utils/receiptTemplate.js';
import { generateContractReceiptHTML } from '../frontend/src/utils/contractReceiptTemplate.js';
import { generateContractProductionHTML, generateContractTextOnlyHTML } from '../frontend/src/utils/contractProductionTemplate.js';

const checks = [];
const check = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const rejection = async (promise, pattern) => {
  try { await promise; throw new Error('Expected rejection'); } catch (error) { assert(pattern.test(error.message + error.name), error.stack); }
};
const observePrint = (inspect, { root = document.body, native = true, fail = false } = {}) => {
  const observer = new MutationObserver(records => {
    for (const frame of records.flatMap(record => [...record.addedNodes]).filter(node => node.tagName === 'IFRAME')) {
      frame.addEventListener('load', () => {
        const original = frame.contentWindow.print.bind(frame.contentWindow);
        frame.contentWindow.print = () => {
          inspect(frame);
          if (fail) throw new Error('Printer fixture failed');
          if (native) original();
        };
      }, { once: true, capture: true });
    }
  });
  observer.observe(root, { childList: true });
  return () => observer.disconnect();
};
const externalImage = 'https://firebasestorage.googleapis.com/v0/b/demo-migapos.appspot.com/o/contracts%2Ffixture.png?alt=media&token=fixture';
const attack = '<img src=x onerror="parent.__xss=1"><script>parent.__xss=1</script>" &';

try {
  const blob = await (await fetch('/img/Logo_192.png')).blob();
  const dataImage = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
  const temporary = URL.createObjectURL(blob);
  check(safeImageUrl(temporary) === temporary && safeImageUrl(dataImage) === dataImage, 'Browser Blob and validated legacy data images accepted');
  let beforePrint = 0, inspections = 0;
  const stop = observePrint(frame => {
    const doc = frame.contentDocument;
    inspections++;
    assert(!doc.querySelector('script,[onerror],[onclick],iframe,object,svg'), 'Executable content survived');
    assert(!frame.sandbox.contains('allow-scripts') && frame.sandbox.contains('allow-modals'), 'Unsafe sandbox');
    assert([...doc.images].every(image => image.complete && image.naturalWidth > 0), 'Print started before images loaded');
    assert(doc.body.textContent.includes(attack), 'Escaped tenant text was lost or double-escaped');
    assert(getComputedStyle(doc.body).fontFamily.includes('Helvetica') || getComputedStyle(doc.body).fontFamily.includes('Segoe'), 'Ticket styles blocked');
    frame.contentWindow.addEventListener('beforeprint', () => beforePrint++);
  });
  const company = { companyData: { razonSocial: attack, direccion: attack, telefono: attack } };
  const sale = { localId: 'test', cashierName: attack, total: 10, payment: attack, items: [{ name: attack, price: 10, qty: 1 }] };
  await createPrintJob({ finishTimeout: 300 }).print(generateReceiptHTML(sale, company));
  check(inspections === 1 && beforePrint > 0, 'Native POS print works with sandbox and CSP');
  check(!document.querySelector('iframe'), 'POS frame removed after printing');
  const contract = { contractId: 'fixture', clientName: attack, clientPhone: attack, details: `Primera\n${attack}\nÚltima`, deliveryType: 'domicilio', deliveryAddress: attack,
    referenceImage: temporary, referenceImages: [temporary, dataImage, externalImage], total: 10, balance: 5, payments: [{ method: attack, label: attack, amount: 5 }] };
  for (const template of [generateContractReceiptHTML, generateContractProductionHTML, generateContractTextOnlyHTML]) {
    await createPrintJob({ finishTimeout: 300 }).print(template(contract, company));
  }
  stop(); URL.revokeObjectURL(temporary);
  check(inspections === 4 && !window.__xss && !document.querySelector('iframe'), 'All contract templates preserve text and image loading without script execution');

  let defenceChecked = false;
  const stopDefence = observePrint(frame => {
    defenceChecked = !frame.contentDocument.querySelector('script,[onerror],[onclick],a[href],meta[http-equiv="refresh"]');
  });
  await createPrintJob({ finishTimeout: 300 }).print(`<html><head><meta http-equiv="refresh" content="0;url=javascript:alert(1)"></head><body onclick="parent.__xss=1"><script>parent.__xss=1</script><a href="javascript:alert(1)">text</a></body></html>`);
  stopDefence();
  check(defenceChecked && !window.__xss, 'Print container also removes scripts, events and navigation attributes');

  let opened;
  const popupHost = { document, open: (...args) => { opened = window.open(...args); return opened; } };
  const popup = createPrintJob({ popup: true, host: popupHost, finishTimeout: 300 });
  let popupPrinted = false;
  const stopPopup = observePrint(frame => { popupPrinted = frame.contentDocument.body.textContent.includes('Popup fixture'); }, { root: opened.document.body });
  await popup.print('<html><body>Popup fixture</body></html>'); stopPopup();
  check(popupPrinted && opened.closed, 'Contract popup prints and closes without opener access');
  await rejection(Promise.resolve().then(() => createPrintJob({ popup: true, host: { open: () => null } })), /emergentes/);
  check(!document.querySelector('iframe'), 'Blocked popup does not leak frames or resources');

  let revoked = [];
  const imageOptions = { load: async () => blob, revokeUrl: url => { revoked.push(url); URL.revokeObjectURL(url); } };
  await rejection(usingImageSources([{ storagePath: 'contracts/fixture/a.jpg' }], async urls => {
    await new Promise((resolve, reject) => {
      const image = new Image(); image.onload = resolve; image.onerror = () => reject(new Error('Blob revoked before use')); image.src = urls[0];
    });
    throw new Error('Template preparation failed');
  }, imageOptions), /preparation failed/);
  check(revoked.length === 1, 'Storage Blob revoked on template preparation failure');
  await rejection(usingImageSources([{ storagePath: 'contracts/fixture/a.jpg' }, 'javascript:alert(1)'], () => {}, imageOptions), /permitida/);
  check(revoked.length === 2, 'Partial image resolution failure releases every created Blob');

  let observedError = false;
  const stopError = observePrint(() => { observedError = true; }, { fail: true });
  await rejection(createPrintJob({ finishTimeout: 300 }).print('<body>Print failure</body>'), /Printer fixture failed/); stopError();
  check(observedError && !document.querySelector('iframe'), 'Print exception closes the frame and pending listeners');
  const deadUrl = URL.createObjectURL(blob); URL.revokeObjectURL(deadUrl);
  await rejection(createPrintJob({ imageTimeout: 1000 }).print(`<body><img src="${deadUrl}"></body>`), /cargar|carg/);
  check(!document.querySelector('iframe'), 'Image load failure closes the print container');
  await rejection(createPrintJob({ imageTimeout: 200 }).print('<body><img src="https://storage.googleapis.com/demo-migapos/slow.png"></body>'), /cargar|carg/);
  check(!document.querySelector('iframe'), 'Image load deadline closes a stalled print job');

  let rendered, rejected;
  const ready = new Promise(resolve => { rendered = resolve; });
  const done = new Promise(resolve => { rejected = resolve; });
  const stopPending = observePrint(() => rendered(), { native: false });
  function PendingPrint() {
    const runPrint = usePrintJobs();
    useEffect(() => {
      void runPrint(job => usingImageSources([{ storagePath: 'contracts/fixture/unmount.jpg' }],
        urls => job.print(`<body>Pending print<img src="${urls[0]}"></body>`), imageOptions)).catch(error => rejected(error));
    }, [runPrint]);
    return null;
  }
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); root.render(React.createElement(PendingPrint));
  await ready; root.unmount();
  const cancelled = await done; stopPending(); container.remove();
  check(cancelled.name === 'AbortError' && revoked.length === 3 && !document.querySelector('iframe'), 'Unmount aborts the active React print job, removes its frame and revokes its Blob');

  let latePopup;
  const lateJob = createPrintJob({ popup: true, host: { document, open: (...args) => (latePopup = window.open(...args)) } });
  latePopup.close(); await pause(300);
  await rejection(usingImageSources([{ storagePath: 'contracts/fixture/late.jpg' }],
    urls => lateJob.print(`<body><img src="${urls[0]}"></body>`), imageOptions), /AbortError/);
  check(latePopup.closed && revoked.length === 4, 'Closing a popup cancels late asynchronous print preparation and revokes its Blob');

  const allowed = ['https://identitytoolkit.googleapis.com/fixture', 'https://securetoken.googleapis.com/fixture', 'https://firestore.googleapis.com/fixture', 'https://firebasestorage.googleapis.com/fixture', 'https://us-central1-migapos.cloudfunctions.net/fixture'];
  await Promise.all(allowed.map(url => fetch(url).then(response => assert(response.ok, 'CSP blocked ' + url))));
  const script = document.createElement('script'); script.src = 'https://apis.google.com/js/api.js';
  await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
  const authFrame = document.createElement('iframe'); authFrame.src = 'https://migapos.firebaseapp.com/__/auth/iframe';
  await new Promise(resolve => { authFrame.onload = resolve; document.body.appendChild(authFrame); }); authFrame.remove();
  check(window.__authScriptLoaded === true, 'CSP admits mocked Firebase APIs and Google Auth script/helper iframe');
  const inline = document.createElement('script'); inline.textContent = 'window.__inlineScriptExecuted=true'; document.head.appendChild(inline);
  let blocked = false; try { await fetch('https://untrusted.invalid/fixture'); } catch { blocked = true; }
  check(!window.__inlineScriptExecuted && blocked, 'CSP rejects inline scripts and unapproved network origins');

  const registration = await navigator.serviceWorker.register('/__ui-sw.js', { scope: '/__ui-fixture/' });
  await new Promise(resolve => {
    const worker = registration.installing || registration.waiting || registration.active;
    if (worker.state === 'activated') resolve(); else worker.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(); });
  });
  assert(await registration.unregister(), 'SW cleanup failed');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Producto: 'Fixture', Total: 10 }]), 'Fixture');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  assert(new Uint8Array(bytes)[0] === 0x50, 'Workbook generation failed under CSP');
  const download = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a'); anchor.download = 'fixture.xlsx'; anchor.href = download; anchor.click(); URL.revokeObjectURL(download);
  check(!document.querySelector('iframe'), 'CSP permits a same-origin service worker and Blob spreadsheet download');
  await fetch('/__phase4-report', { method: 'POST', body: JSON.stringify({ ok: true, checks }) });
} catch (error) {
  await fetch('/__phase4-report', { method: 'POST', body: JSON.stringify({ ok: false, checks, error: `${checks.length} checks: ${error.stack || error}` }) });
}
