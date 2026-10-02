import { SaleError } from './domain/saleModel.js';

export const OFFLINE_WINDOW_MS = 18 * 60 * 60 * 1000;
export function milliseconds(value) {
  const result = new Date(value?.toDate ? value.toDate() : value).getTime();
  if (value == null || !Number.isFinite(result)) throw new SaleError('invalid-session', 'Fecha de caja inválida.');
  return result;
}

export function validateSaleSession(session, sale, actor, now) {
  if (!session || session.businessId !== actor.businessId || session.userId !== actor.uid || session.branchId !== sale.branchId) {
    throw new SaleError('invalid-session', 'Caja de otro usuario, negocio o sede.');
  }
  const created = milliseconds(sale.createdAt);
  const queued = milliseconds(sale.queuedAt);
  if (created > queued || queued > now + 60000 || created > now + 60000) {
    throw new SaleError('invalid-session', 'Fecha de venta fuera de la ventana válida.');
  }
  if (session.status === 'open') {
    const start = milliseconds(session.financialWindow?.openedAt ?? session.openedAt);
    if (created < start) throw new SaleError('invalid-session', 'Venta anterior a la apertura de caja.');
    if (sale.origin === 'offline' && session.financialWindow?.expiresAt
      && created > milliseconds(session.financialWindow.expiresAt)) {
      throw new SaleError('invalid-session', 'Autorización offline de caja expirada.');
    }
    return;
  }
  if (sale.origin !== 'offline' || !['closed', 'closed_with_discrepancy'].includes(session.status)) {
    throw new SaleError('closed-session', 'La caja está cerrada para nuevas ventas online.');
  }
  // Legacy client-authored windows cannot authorize new late financial writes.
  const window = session.financialWindow;
  if (!window?.openedAt || !window.closedAt || !window.expiresAt) {
    throw new SaleError('unverified-session', 'La caja antigua no tiene una ventana offline verificada.');
  }
  const end = Math.min(milliseconds(window.closedAt), milliseconds(window.expiresAt));
  if (created < milliseconds(window.openedAt) || created > end || queued > end) {
    throw new SaleError('invalid-session', 'Venta offline fuera del período autorizado de caja.');
  }
}
