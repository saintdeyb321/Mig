import { httpsCallable } from 'firebase/functions';
import { Timestamp } from 'firebase/firestore';
import { functions } from '../../../core/firebase/client';

export const adminCall = (name, data) => httpsCallable(functions, name)(data).then(result => result.data);
export const administrationPage = async data => {
  const page = await adminCall('getTenantAdministration', data);
  return { ...page, rows: page.rows.map(row => ({ ...row, expiry: row.expiry ? Timestamp.fromDate(new Date(row.expiry)) : null })) };
};
