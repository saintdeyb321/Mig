const formatDate = value => {
  if (value?.$type === 'timestamp') value = value.seconds * 1000 + value.nanoseconds / 1e6;
  else if (value?.$type === 'date') value = value.iso;
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
};

const tables = {
  tenants: ['Negocio', ['Nombre', 'Estado'], row => [row.businessName, row.status]],
  licenses: ['Licencia', ['Negocio', 'Estado', 'Vence (Lima)', 'Máx. activas', 'Máx. registradas', 'Activas inventariadas', 'Registradas inventariadas'],
    row => [row.businessName, row.status, formatDate(row.expiry), row.maxActiveBranches, row.maxRegisteredBranches,
      row.branchQuotaVersion === 1 && Array.isArray(row.activeBranchIds) ? row.activeBranchIds.length : '',
      row.registeredBranchQuotaVersion === 1 && Array.isArray(row.registeredBranchIds) ? row.registeredBranchIds.length : '']],
  branches: ['Sedes', ['Nombre', 'Estado', 'Dirección', 'Teléfono'], row => [row.name, row.status, row.address, row.phone]],
  categories: ['Categorías', ['Nombre', 'Estado'], row => [row.name, row.status]],
  products: ['Productos', ['Nombre', 'Categoría', 'Estado', 'Precio (S/)'], row => [row.name, row.category, row.status, typeof row.price === 'number' ? row.price : '']],
  users: ['Perfiles', ['Nombres', 'Apellidos', 'Correo', 'Rol', 'Estado', 'Sede'], person],
  invites: ['Invitaciones', ['Nombres', 'Apellidos', 'Correo', 'Rol', 'Estado', 'Sede'], person],
};
function person(row, branches) {
  return [row.firstName, row.lastName, row.email, row.role, row.status,
    row.branchId === 'global' ? 'Todas las sedes' : row.branchId ? branches.get(row.branchId) ?? 'Sede no disponible en la captura' : ''];
}
const labels = { complete: 'Leída', limited: 'Parcial · límite', incomplete: 'Parcial · interrumpida', inaccessible: 'Inaccesible', 'not-read': 'Sin leer' };
const cell = value => typeof value === 'string' || Number.isFinite(value) ? value : '';

export function buildBusinessSummaryWorkbook(XLSX, { businessName, capturedAt, sections, warnings }) {
  const workbook = XLSX.utils.book_new();
  const branches = new Map(sections.find(section => section.name === 'branches')?.records.map(row => [row.id, row.name]));
  const outcome = sections.every(section => section.status === 'complete') ? 'Secciones solicitadas leídas' : 'EXPORTACIÓN PARCIAL';
  const metadata = [['Negocio', businessName], ['Captura (UTC)', capturedAt], ['Alcance', 'Resumen empresarial · sin movimientos financieros']];
  const append = (name, context, headers, records) => {
    const sheet = XLSX.utils.aoa_to_sheet([...context, [], headers, ...records].map(row => row.map(cell)));
    const headerRow = context.length + 1;
    const range = { s: { r: headerRow, c: 0 }, e: { r: headerRow + records.length, c: headers.length - 1 } };
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    sheet['!cols'] = headers.map((heading, column) => ({
      wch: Math.min(58, Math.max(16, heading.length + 3, ...records.map(row => String(row[column] ?? '').length + 2), column === 1 ? 36 : 0)),
    }));
    for (let column = 0; column < headers.length; column++) {
      sheet[XLSX.utils.encode_cell({ r: headerRow, c: column })].s = { fill: { patternType: 'solid', fgColor: { rgb: '352064' } }, font: { bold: true, color: { rgb: 'FFFFFF' } } };
    }
    if (name === 'Productos') for (let index = 0; index < records.length; index++) {
      const price = sheet[XLSX.utils.encode_cell({ r: headerRow + index + 1, c: headers.indexOf('Precio (S/)') })];
      if (price?.t === 'n') price.z = '"S/ "0.00';
    }
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  append('Alcance', [...metadata, ['Estado', outcome], ...warnings.map(warning => ['Nota', warning])],
    ['Sección', 'Documentos', 'Estado', 'Observación'], sections.map(section => [tables[section.name][0], section.records.length, labels[section.status], section.warning]));
  for (const section of sections) {
    const [name, headers, record] = tables[section.name];
    append(name, [...metadata, ['Estado', labels[section.status]], ...(section.warning ? [['Nota', section.warning]] : [])],
      headers, section.records.map(row => record(row, branches)));
  }
  return workbook;
}
