import { createContext, useContext } from 'react';
export const AssistedAccessContext = createContext(false);
export const useAssistedAccess = () => useContext(AssistedAccessContext);
