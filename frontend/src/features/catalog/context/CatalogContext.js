import { createContext, useContext } from 'react';

export const CatalogContext = createContext(null);
export const useCatalogData = () => useContext(CatalogContext);
