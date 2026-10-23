import { safeImageUrl } from '../security/html.js';
import { reportDiagnostic } from '../../core/errors/diagnostics.js';

const printPolicy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src blob: data: https://firebasestorage.googleapis.com https://storage.googleapis.com; base-uri 'none'; form-action 'none'";

function printableDocument(html, document) {
  const parsed = new document.defaultView.DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script,iframe,object,embed,link,base,form,svg,math,meta[http-equiv]').forEach(node => node.remove());
  for (const node of parsed.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || ['srcdoc', 'href', 'action', 'formaction'].includes(attribute.name)) node.removeAttribute(attribute.name);
      if (attribute.name === 'src') {
        const source = node.tagName === 'IMG' ? safeImageUrl(attribute.value) : '';
        if (source) node.setAttribute('src', source); else node.removeAttribute('src');
      }
    }
  }
  const policy = parsed.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy'; policy.content = printPolicy;
  parsed.head.prepend(policy);
  return '<!doctype html>' + parsed.documentElement.outerHTML;
}

export function createPrintJob({ popup = false, compact = false, host = window, imageTimeout = 10000, finishTimeout = 60000 } = {}) {
  const target = popup ? host.open('', '', compact ? 'width=350,height=600' : 'width=800,height=900') : host;
  if (!target) throw new Error('Permite las ventanas emergentes.');
  if (popup) target.opener = null;
  const controller = new AbortController();
  let frame, printed = false;
  const closed = () => controller.signal.aborted || (popup && target.closed);
  const close = () => {
    controller.abort(); clearInterval(watchClosed);
    frame?.remove();
    if (popup && !target.closed) target.close();
  };
  const watchClosed = popup ? setInterval(() => { if (target.closed) close(); }, 250) : undefined;
  function waitFor(register, timeout, message) {
    return new Promise((resolve, reject) => {
      if (closed()) { reject(new DOMException('Impresión cancelada.', 'AbortError')); return; }
      let dispose = () => {};
      const finish = error => {
        clearTimeout(timer); controller.signal.removeEventListener('abort', abort); dispose();
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(new DOMException('Impresión cancelada.', 'AbortError'));
      const timer = setTimeout(() => finish(message ? new Error(message) : undefined), timeout);
      controller.signal.addEventListener('abort', abort, { once: true });
      dispose = register(finish);
    });
  }
  return { close, async print(html) {
    try {
      if (closed()) throw new DOMException('Impresión cancelada.', 'AbortError');
      if (printed) throw new Error('La impresión ya fue preparada.');
      printed = true;
      frame = target.document.createElement('iframe');
      frame.title = 'Comprobante';
      // Printing needs modals and same-origin DOM access; executable scripts stay disabled.
      frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
      frame.style.cssText = popup ? 'width:100%;height:100vh;border:0' : 'position:fixed;left:-10000px;width:320px;height:600px;border:0';
      const loaded = waitFor(finish => {
        const onLoad = () => finish();
        frame.addEventListener('load', onLoad, { once: true });
        return () => frame.removeEventListener('load', onLoad);
      }, imageTimeout, 'No se pudo cargar el comprobante.');
      frame.srcdoc = printableDocument(html, host.document);
      target.document.body.appendChild(frame);
      await loaded;
      await Promise.all([...frame.contentDocument.images].map(async image => {
        if (image.complete) {
          if (image.naturalWidth) return undefined;
          throw new Error('No se pudo cargar una imagen del comprobante.');
        }
        return waitFor(finish => {
          const onLoad = () => finish(), onError = () => finish(new Error('No se pudo cargar una imagen del comprobante.'));
          image.addEventListener('load', onLoad, { once: true }); image.addEventListener('error', onError, { once: true });
          return () => { image.removeEventListener('load', onLoad); image.removeEventListener('error', onError); };
        }, imageTimeout, 'La imagen del comprobante no terminó de cargar.');
      }));
      if (closed()) throw new DOMException('Impresión cancelada.', 'AbortError');
      const finished = waitFor(finish => {
        const afterPrint = () => finish();
        frame.contentWindow.addEventListener('afterprint', afterPrint, { once: true });
        return () => frame?.contentWindow?.removeEventListener('afterprint', afterPrint);
      }, finishTimeout);
      frame.contentWindow.focus();
      try { frame.contentWindow.print(); } catch (error) { close(); await finished.catch(() => {}); throw error; }
      await finished;
    } catch (error) {
      if (error.name !== 'AbortError') reportDiagnostic('print', error);
      throw error;
    } finally { close(); }
  } };
}
