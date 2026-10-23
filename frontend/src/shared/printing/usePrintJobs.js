import { useCallback, useEffect, useRef } from 'react';
import { createPrintJob } from './printDocument';

export function usePrintJobs() {
  const jobs = useRef(new Set());
  useEffect(() => {
    const active = jobs.current;
    return () => { for (const job of active) job.close(); active.clear(); };
  }, []);
  return useCallback(async (prepare, options) => {
    const job = createPrintJob(options);
    jobs.current.add(job);
    try { await prepare(job); } finally { job.close(); jobs.current.delete(job); }
  }, []);
}
