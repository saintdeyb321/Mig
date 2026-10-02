import { createContext, useContext } from 'react';

export const TenantContext = createContext(null);
export const useTenantData = () => useContext(TenantContext);
