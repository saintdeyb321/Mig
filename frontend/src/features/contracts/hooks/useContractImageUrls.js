import { useEffect, useMemo, useState } from 'react';
import { resolveContractImageUrls } from '../infrastructure/contractImages.js';

const EMPTY_IMAGES = [];

export function useContractImageUrls(images = EMPTY_IMAGES, { preserveSlots = false, scope } = {}) {
  const scopeKey = JSON.stringify(scope ?? {});
  const media = useMemo(() => ({ scope: JSON.parse(scopeKey), blobs: new Map() }), [scopeKey]);
  const key = JSON.stringify(images);
  const [result, setResult] = useState({ key: null, urls: [], loading: false, error: null });
  useEffect(() => {
    const controller = new AbortController();
    let release = () => {};
    resolveContractImageUrls(JSON.parse(key), {
      preserveSlots, scope: media.scope, signal: controller.signal, verifiedBlobs: media.blobs,
    }).then(resolved => {
      if (controller.signal.aborted) { resolved.release(); return; }
      release = resolved.release;
      setResult({ key, scopeKey, urls: resolved.urls, loading: false,
        error: resolved.warnings.length ? new Error(resolved.warnings.join(' ')) : null });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key, scopeKey, urls: [], loading: false, error });
    });
    return () => { controller.abort(); release(); };
  }, [key, scopeKey, preserveSlots, media]);
  return result.key === key && result.scopeKey === scopeKey ? result : { urls: [], loading: images.length > 0, error: null };
}
