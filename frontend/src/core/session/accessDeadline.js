// Limit a verification without trying to cancel an SDK request already sent.
export function withAccessDeadline(work, timeoutMs = 10000) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error('La verificación de acceso no respondió a tiempo.'), { code: 'deadline-exceeded' }));
    }, timeoutMs);
  });
  return Promise.race([deadline, Promise.resolve().then(() => work(controller.signal))]).finally(() => clearTimeout(timer));
}
