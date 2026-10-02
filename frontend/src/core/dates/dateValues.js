export function toDateSafe(value) {
  if (value === null || value === undefined || value === '') return null;
  try {
    if (!(value instanceof Date) && typeof value.toDate !== 'function'
      && !['string', 'number'].includes(typeof value)) return null;
    const date = typeof value.toDate === 'function'
      ? value.toDate()
      : value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

export function toMillisSafe(value) {
  return toDateSafe(value)?.getTime() ?? 0;
}
