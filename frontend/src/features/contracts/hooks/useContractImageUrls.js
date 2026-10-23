import { useEffect, useState } from 'react';
import { resolveContractImageUrls } from '../infrastructure/contractImages';
import { reportDiagnostic } from '../../../core/errors/diagnostics.js';

const EMPTY_IMAGES = [];

export function useContractImageUrls(images = EMPTY_IMAGES) {
  const key = JSON.stringify(images);
  const [result, setResult] = useState({ key: null, urls: [], loading: false, error: null });
  useEffect(() => {
    let disposed = false;
    let release = () => {};
    resolveContractImageUrls(JSON.parse(key)).then(resolved => {
      if (disposed) { resolved.release(); return; }
      release = resolved.release;
      setResult({ key, urls: resolved.urls, loading: false, error: resolved.warnings?.length ? new Error(resolved.warnings.join(' ')) : null });
    }).catch(error => {
      reportDiagnostic('storage', error);
      if (!disposed) setResult({ key, urls: [], loading: false, error });
    });
    return () => { disposed = true; release(); };
  }, [key]);
  return result.key === key ? result : { urls: [], loading: images.length > 0, error: null };
}
