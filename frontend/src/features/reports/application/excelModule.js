let pending;
let failedUrl;
let retry = 0;

function excelAssetFrom(error) {
  const address = error?.message?.match(/https?:\/\/[^\s"'<>]+/)?.[0];
  if (!address) return null;
  try {
    const url = new URL(address);
    const expected = import.meta.env.DEV
      ? /^\/node_modules\/\.vite(?:-[\w-]+)?\/deps\/xlsx-js-style\.js$/
      : /^\/assets\/xlsx(?:\.min)?-[\w-]+\.js$/;
    return url.origin === location.origin && !url.username && !url.password && expected.test(url.pathname) ? url : null;
  } catch { return null; }
}

const hasWriter = api => typeof api?.write === 'function' && typeof api.utils?.book_new === 'function' && typeof api.utils?.json_to_sheet === 'function';

async function importExcel() {
  try {
    let loaded;
    if (failedUrl) {
      const url = new URL(failedUrl);
      // A failed import is remembered per module URL. The fragment gives it a fresh
      // identity without changing the HTTP/Workbox cache key of the production chunk.
      url.hash = 'excel-retry-' + ++retry;
      if (import.meta.env.DEV) url.searchParams.delete('v');
      loaded = await import(/* @vite-ignore */ url.href);
    } else {
      loaded = await import('xlsx-js-style');
    }
    // Rollup's transformed import unwraps a CommonJS namespace. A direct retry
    // sees that namespace under the chunk's generated export name.
    const excel = [loaded, ...Object.values(loaded)].find(hasWriter);
    if (!excel) {
      throw new Error('El módulo Excel no expone la API de escritura esperada.');
    }
    return excel;
  } catch (error) {
    failedUrl = excelAssetFrom(error) ?? failedUrl;
    pending = undefined;
    throw error;
  }
}

export function loadExcelModule() {
  return pending ??= importExcel();
}
