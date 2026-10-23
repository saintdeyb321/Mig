import { Timestamp } from 'firebase/firestore';
import { callBackend } from '../../../core/firebase/callable.js';

export const adminCall = (name, data) => callBackend(name, data);
export const administrationPage = async data => {
  const page = await adminCall('getTenantAdministration', data);
  return { ...page, rows: page.rows.map(row => ({ ...row, expiry: row.expiry ? Timestamp.fromDate(new Date(row.expiry)) : null })) };
};
