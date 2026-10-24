const references = { branchId: 'branches', sessionId: 'cash_sessions', userId: 'users', createdBy: 'users', contractId: 'contracts', saleId: 'sales' };
export function inventorySections(sections, businessId) {
  return sections.map(section => ({ ...section, records: section.records.map(record => {
    if (record.businessId != null && record.businessId !== businessId) throw new Error('Inventario fuera del negocio seleccionado.');
    const found = new Set();
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (value.$type === 'reference') found.add(value.path);
      for (const [key, child] of Object.entries(value)) {
        if (references[key] && typeof child === 'string' && child && child !== 'global' && !child.includes('/')) found.add(`${references[key]}/${child}`);
        if (key === 'items' && Array.isArray(child)) child.forEach(item => { if (typeof item.id === 'string' && !item.id.includes('/')) found.add(`products/${item.id}`); });
        if (key === 'referenceImages' && Array.isArray(child)) child.forEach(image => found.add(`device-or-legacy-image:${typeof image === 'string' ? image : image.storagePath ?? image.reference ?? 'unresolved'}`));
        visit(child);
      }
    };
    visit(record);
    if (record.sourceId && ['contract', 'sale'].includes(record.sourceType)) found.add(`${record.sourceType === 'sale' ? 'sales' : 'contracts'}/${record.sourceId}`);
    return { path: record.$path, businessId, references: [...found].sort(),
      referenceAuthority: 'unverified-targets-never-followed-or-deleted',
      ...(section.name === 'platform_jobs' ? { knownSubcollections: ['scopes', 'asset_sources'].map(name => `${record.$path}/${name}`) } : {}) };
  }) }));
}
