export const UNKNOWN_EMPLOYEE = 'Empleado no identificado';
const technical = /^(?:[\w-]{20,}|[^\s]+@[^\s]+)$/u;

export function reportLabel(value, fallback, ...ids) {
  const label = typeof value === 'string' ? value.trim() : '';
  return label && !technical.test(label) && !ids.includes(label) ? label : fallback;
}

export const branchReportName = (branches, id) => reportLabel(branches[id], 'Sucursal sin nombre', id);
export const employeeReportName = (people, id, ...recorded) => {
  for (const name of [...recorded, people?.get(id)]) {
    const visible = reportLabel(name, '', id);
    if (visible) return visible;
  }
  return UNKNOWN_EMPLOYEE;
};
export const profileReportName = profile => [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.displayName;
export const orderReportNumber = (order, payment) => {
  const ids = [order?.id, payment?.sourceId, payment?.id];
  return reportLabel(order?.contractNumber, '', ...ids)
    || reportLabel(payment?.contractNumber, '', ...ids)
    || (/^(?:PED|COM)-[A-Z0-9-]+$/i.test(order?.contractId ?? '') ? reportLabel(order.contractId, '', ...ids) : '')
    || 'Sin número comercial';
};

export function reportNote(value, ...ids) {
  let note = typeof value === 'string' ? value : '';
  for (const id of new Set(ids)) if (typeof id === 'string' && id.length >= 8) note = note.replaceAll(id, '[referencia interna]');
  return note.replace(/\b(?:UID|ID)\s*:\s*[\w-]{8,}/giu, '[referencia interna]');
}
