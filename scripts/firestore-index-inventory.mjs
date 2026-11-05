import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createRequire } from 'node:module';
import { firestoreQueryCatalog as catalog, queryIndexFields, reviewedSDKQueryCounts, dynamicQueryReviews } from '../frontend/src/core/firebase/queryCatalog.js';

// Offline only: imports a parser and reviewed source metadata, never Firebase/CLI/Auth.
const require = createRequire(import.meta.url);
const { parse } = require('../frontend/node_modules/espree/dist/espree.cjs');
const root = resolve('.'), sourceRoot = resolve('frontend/src');
const guidePath = 'docs/INDICES-FIRESTORE-MIGAPOS.md';
const configuration = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
const files = [];
function scan(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) {
  const path = resolve(directory, entry.name);
  if (entry.isDirectory()) scan(path); else if (/\.[jm]sx?$/.test(path)) files.push(path);
} }
scan(sourceRoot);
function* nodes(node) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') yield node;
  for (const value of Object.values(node)) if (Array.isArray(value)) { for (const child of value) if (child?.type) yield* nodes(child); }
  else if (value?.type) yield* nodes(value);
}
const name = callee => callee?.type === 'Identifier' ? callee.name : callee?.type === 'MemberExpression' && ['sdk', 'lite', 'firestoreSDK', 'firestore'].includes(callee.object?.name) ? callee.property?.name : null;
const code = new Map(), asts = new Map();
for (const path of files) { const text = readFileSync(path, 'utf8'); code.set(path, text); asts.set(path, parse(text, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true, range: true })); }
const dependencies = (path, input) => {
  if (typeof input !== 'string' || !input.startsWith('.')) return null;
  const base = resolve(dirname(path), input);
  return [base, base + '.js', base + '.jsx', resolve(base, 'index.js'), resolve(base, 'index.jsx')].find(candidate => asts.has(candidate));
};
const reached = new Set();
function visit(path) {
  if (!path || reached.has(path)) return; reached.add(path);
  for (const node of nodes(asts.get(path))) {
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) visit(dependencies(path, node.source?.value));
    if (node.type === 'ImportExpression') visit(dependencies(path, node.source?.value));
  }
}
visit(resolve('frontend/src/main.jsx'));
const calls = [], discrepancies = [];
let groups = 0;
for (const [path, ast] of asts) {
  const text = code.get(path), file = relative(root, path).replaceAll('\\', '/');
  if (!/from\s+['"]firebase\/firestore(?:\/lite)?['"]/.test(text)) continue;
  const sdkQueries = [...nodes(ast)].filter(node => node.type === 'CallExpression' && name(node.callee) === 'query');
  if (sdkQueries.length && reviewedSDKQueryCounts[file] !== sdkQueries.length) discrepancies.push(`${file}: ${sdkQueries.length} queries SDK; catálogo revisado ${reviewedSDKQueryCounts[file] ?? 'ausente'}.`);
  const reviewedFields = new Set(catalog.filter(record => record.file === file).flatMap(record => [...record.filters, ...record.order].map(([field]) => field)));
  for (const node of nodes(ast)) if (node.type === 'CallExpression') {
    const method = name(node.callee);
    if (method === 'collectionGroup') groups++;
    if (['where', 'orderBy'].includes(method) && typeof node.arguments[0]?.value === 'string' && !reviewedFields.has(node.arguments[0].value)) discrepancies.push(`${file}:${node.loc.start.line}: campo literal sin catalogar ${node.arguments[0].value}.`);
  }
  for (const node of sdkQueries) {
    const dynamic = [...nodes(node)].some(child => child.type === 'SpreadElement' || child.type === 'CallExpression'
      && ['where', 'orderBy', 'collection'].includes(name(child.callee)) && (name(child.callee) === 'collection' ? child.arguments[1]?.type !== 'Literal' : child.arguments[0]?.type !== 'Literal' && name(child.arguments[0]?.callee) !== 'documentId'));
    if (dynamic && !dynamicQueryReviews[file]) discrepancies.push(`${file}:${node.loc.start.line}: forma dinámica sin revisión declarada.`);
    calls.push({ file, line: node.loc.start.line, reached: reached.has(path), dynamic, text: text.slice(node.range[0], node.range[1]).replace(/\s+/g, ' ') });
  }
}
for (const [file, count] of Object.entries(reviewedSDKQueryCounts)) if (calls.filter(call => call.file === file).length !== count
  && !discrepancies.some(problem => problem.startsWith(file + ':'))) discrepancies.push(`${file}: cantidad de builders revisados desactualizada.`);
if (groups) discrepancies.push('collectionGroup detectado: revisar y catalogar explícitamente sus ámbitos antes de declarar cobertura.');
function normalize(index) {
  const fields = index.fields.map(field => ({ ...field }));
  if (!fields.some(field => field.fieldPath === '__name__')) fields.push({ fieldPath: '__name__', order: fields.findLast(field => field.order)?.order ?? 'ASCENDING' });
  return { collectionGroup: index.collectionGroup, queryScope: index.queryScope, fields,
    ...Object.fromEntries(Object.entries(index).filter(([key]) => !['collectionGroup', 'queryScope', 'fields', 'name', 'state'].includes(key))) };
}
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const key = index => JSON.stringify(canonical(normalize(index)));
const indexes = configuration.indexes.map((value, index) => ({ ...normalize(value), id: `I${String(index + 1).padStart(2, '0')}` }));
const keys = new Set();
for (const index of configuration.indexes) { if (keys.has(key(index))) discrepancies.push(`Índice equivalente duplicado: ${key(index)}`); keys.add(key(index)); }
const matches = record => {
  const fields = queryIndexFields(record);
  const ordered = new Set((record.order.length ? record.order : record.filters.filter(([, op]) => !['==', 'in'].includes(op)).map(([field]) => [field])).map(([field]) => field));
  const equality = new Set(record.filters.filter(([field, op]) => ['==', 'in'].includes(op) && field !== '__name__' && !ordered.has(field)).map(([field]) => field));
  return indexes.filter(index => index.collectionGroup === record.collection && index.queryScope === record.scope && index.fields.length === fields.length
    && index.fields.slice(0, equality.size).every(field => equality.has(field.fieldPath) && field.order === 'ASCENDING')
    && fields.slice(equality.size).every(([field, order], position) => index.fields[equality.size + position]?.fieldPath === field && index.fields[equality.size + position]?.order === order));
};
const required = catalog.filter(record => record.kind === 'composite' && reached.has(resolve(record.file)));
for (const record of required) if (!matches(record).length) discrepancies.push(`Falta compuesto local justificado: ${record.id}: ${JSON.stringify(queryIndexFields(record))}`);
const escape = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const fieldsText = fields => fields.map(field => '`' + (Array.isArray(field) ? `${field[0]} ${field[1] === 'DESCENDING' ? 'DESC' : 'ASC'}` : `${field.fieldPath} ${field.order === 'DESCENDING' ? 'DESC' : field.order ? 'ASC' : field.arrayConfig}`) + '`').join(' → ');
const origin = record => { const text = code.get(resolve(record.file)); const line = text?.slice(0, text.indexOf(record.anchor)).split('\n').length ?? 1; return `[${record.id}](../${record.file}#L${line})`; };
let body = `# Índices Firestore de MigaPOS\n\nInventario local reproducible, sin red, cuentas, consultas ni lecturas Spark. Proyecto **migapos**, base **(default)**. No publica, crea ni elimina índices.\n\n`;
body += `Analizados ${calls.length} builders SDK en ${new Set(calls.map(call => call.file)).size} archivos; ${groups} collectionGroup. Configuración local: **${indexes.length} compuestos** (${indexes.filter(index => catalog.some(record => record.kind === 'composite' && reached.has(resolve(record.file)) && matches(record).some(match => match.id === index.id))).length} necesarios para las formas actuales catalogadas), ${configuration.fieldOverrides?.length ?? 0} fieldOverrides conservados. Acceso por ID (perfil, invitación, licencia, tenant, locks, receipts) usa índices documentales automáticos. IndexedDB no se cuenta como Firestore.\n\n`;
body += `**Remoto: no comprobado.** El propietario informó un índice de notificaciones; no se consultó Firebase ni se comprueba que ese índice coincida en todos los campos/órdenes. Definido en Git no significa Habilitado. Los emuladores no demuestran disponibilidad de índices remotos.\n\n`;
body += `## Creación manual posterior\n\n1. Abrir Firebase Console con la cuenta del propietario, elegir **migapos → Firestore Database → (default) → Índices**. Revisar primero el conjunto activo y sus exenciones de campos simples.\n2. Consultar la fila por módulo/ID. Para un compuesto necesario ausente, usar **Añadir índice** con la colección, ámbito y campos ASC/DESC exactos de la tabla Ixx. Los campos de igualdad pueden estar permutados en un índice compatible ya existente; no crear duplicados a ciegas.\n3. \`__name__\` es el orden documental implícito: coincide con la última dirección de ordenación salvo que la tabla indique otra dirección. No agregar otro campo artificial ni cambiar el ámbito.\n4. Esperar a que Console indique **Habilitado** y reintentar únicamente el flujo afectado. Si el SDK entrega un enlace real, la app puede mostrarlo; esta guía no fabrica URLs create_composite.\n5. Registrar manualmente Pendiente / En creación / Habilitado y fecha de comprobación al final de la guía. Conservar índices históricos mientras se revisan clientes desplegados. No desplegar este archivo completo ni aceptar eliminaciones automáticas de índices activos.\n\n`;
body += `## Consultas por prioridad: acceso, operación, reportes y administración\n\nLas consultas con un solo campo utilizan su índice simple (incluye __name__). Varias igualdades simples pueden combinar índices; un compuesto local para ellas no se declara obligatorio. Exenciones simples remotas requieren revisión manual. El filtro role != superadmin se retiró de Personal: businessId == basta con las Rules existentes; la exclusión visual de plataforma continúa.\n\n| Prioridad | Módulo / consulta | Colección | Ámbito | Filtros | Campos / orden | Estado local | Estado remoto | Creación manual |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
for (const record of [...catalog].sort((a, b) => a.priority - b.priority || Number(!a.id.startsWith('personnel')) - Number(!b.id.startsWith('personnel')) || a.id.localeCompare(b.id))) {
  const local = matches(record).map(index => index.id).join(', ');
  const necessary = record.kind === 'composite';
  const actual = reached.has(resolve(record.file));
  body += `| P${record.priority} | ${escape(record.module)} · ${origin(record)} | ${record.collection} | ${record.scope} | ${escape(record.filters.map(([field, op]) => field + ' ' + op).join('; ') || 'Sin filtros')} | ${fieldsText(queryIndexFields(record))} | ${necessary ? local ? 'Compuesto ' + local + (actual ? '; necesario' : '; histórico/no alcanzable') : 'FALTA LOCAL' : local ? 'Compuesto opcional ' + local : 'Automáticos; sin compuesto nuevo'} | No comprobado | ${necessary && actual ? 'Si falta: definición Ixx y pasos 1–5' : 'Revisar exenciones; no crear compuesto por defecto'} |\n`;
}
body += `\n## Compuestos del archivo local, ordenados por uso actual\n\nLos campos se muestran en el orden real de firestore.indexes.json. "Necesario" se limita a patrones examinados alcanzables desde main.jsx; una referencia exportada no demuestra ejecución. Las igualdades sin orden adicional se clasifican por separado.\n\n| ID / prioridad | Módulo / consulta origen | Colección | Ámbito | Campos en orden | Estado local / uso | Estado remoto | Creación manual |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
const uses = index => catalog.filter(record => matches(record).some(match => match.id === index.id));
const priority = index => Math.min(9, ...uses(index).filter(record => reached.has(resolve(record.file))).map(record => record.priority));
for (const index of [...indexes].sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id))) {
  const linked = uses(index).filter(record => reached.has(resolve(record.file)));
  const needed = linked.some(record => record.kind === 'composite');
  const state = needed ? 'Definido; necesario para patrón actual' : linked.length ? 'Definido; opcional para igualdades' : 'Definido; histórico/sin uso actual confirmado';
  body += `| ${index.id} / ${priority(index) === 9 ? 'Legado' : 'P' + priority(index)} | ${linked.length ? linked.map(origin).join(', ') : uses(index).map(origin).join(', ') || 'Sin builder Spark coincidente'} | ${index.collectionGroup} | ${index.queryScope} | ${fieldsText(index.fields)} | ${state} | No comprobado | ${needed ? 'Si falta: pasos 1–5' : 'No crear ni borrar sin revisión de clientes activos'} |\n`;
}
body += `\n## Builders con partes dinámicas / revisión explícita\n\nEl parser identifica llamadas SDK, literales, spreads y campos/colecciones calculados; **no ejecuta ni resuelve semánticamente todos los builders**. El catálogo enumera manualmente las variantes revisadas. Cambios de número de queries, campos literales sin catalogar o dinámicas sin revisión hacen fallar --check. Valores y cursores se omiten para no registrar datos de negocio.\n\n| Origen | Alcance | Forma | Revisión necesaria / límites conocidos |\n| --- | --- | --- | --- |\n`;
for (const call of calls) body += `| [${call.file}:${call.line}](../${call.file}#L${call.line}) | ${call.reached ? 'Alcanzable Spark' : 'Sin alcance actual confirmado'} | ${call.dynamic ? 'Dinámica: NO resuelta automáticamente' : 'Campos literales'} | ${escape(call.dynamic ? dynamicQueryReviews[call.file] || 'SIN REVISAR' : 'Inspeccionada junto al catálogo')} |\n`;
body += `\nLimitaciones: las rutas de inventario/limpieza son una whitelist de documentos concretos; no se usa collectionGroup ni se inventa cobertura de subcolecciones desconocidas. Los históricos Timestamp/ISO cambian valores, no campos de índice. getContractAuditDocuments combina businessId con lotes documentId in de 10 (índice simple businessId con nombre documental). Los limit y cursores no agregan campos por sí mismos. Un failed-precondition sin evidencia de índice no se reclasifica automáticamente como falta de índice.\n\n`;
body += `## Resultado local\n\n${discrepancies.length ? discrepancies.map(problem => '- REVISAR: ' + problem).join('\n') : 'Sin compuestos faltantes para las formas actuales catalogadas. Se conservan las 44 definiciones y fieldOverrides; no se añaden ni eliminan índices sin justificación. Esto no confirma los índices de producción.'}\n\n`;
body += `Regenerar: npm run indexes:inventory. Comprobar sin escribir: npm run indexes:check. Ambos funcionan sin conexión y no importan Firebase.\n\nComparación opcional con un export local aportado por el propietario: node scripts/firestore-index-inventory.mjs --check --remote .release/indexes-publicados.json. La comparación conserva colección/ámbito/orden de campos/arrayConfig/opciones y fieldOverrides; el origen, frescura y estado Habilitado del archivo aportado no se verifican automáticamente. Codex no ejecuta firestore:indexes contra el proyecto real.\n\nFuentes primarias: [tipos y combinación de índices](https://firebase.google.com/docs/firestore/query-data/index-overview), [creación manual](https://firebase.google.com/docs/firestore/query-data/indexing), [formato de definición](https://firebase.google.com/docs/reference/firestore/indexes).\n\n`;
const marker = '<!-- seguimiento manual: conservar al regenerar -->';
const existing = existsSync(guidePath) ? readFileSync(guidePath, 'utf8').replaceAll('\r\n', '\n') : '';
const manual = existing.includes(marker) ? existing.slice(existing.indexOf(marker)) : `${marker}\n## Seguimiento del propietario\n\nAnotar ID Ixx, estado Pendiente/En creación/Habilitado, fecha y evidencia en Console. No hay estados remotos comprobados en esta entrega.\n`;
const output = body + manual;
const check = process.argv.includes('--check');
if (!check) writeFileSync(guidePath, output);
else if (existing !== output) discrepancies.push('La guía no coincide con el catálogo/configuración; ejecutar npm run indexes:inventory y revisar el diff.');
const remoteIndex = process.argv.indexOf('--remote');
if (remoteIndex >= 0) {
  const remote = JSON.parse(readFileSync(process.argv[remoteIndex + 1], 'utf8').replace(/^\uFEFF/, ''));
  const remoteKeys = new Set(remote.indexes.map(key)), localKeys = new Set(configuration.indexes.map(key));
  console.log(JSON.stringify({ evidence: 'archivo local aportado, procedencia/estado remoto no verificados', localOnly: configuration.indexes.filter(index => !remoteKeys.has(key(index))), remoteOnly: remote.indexes.filter(index => !localKeys.has(key(index))), fieldOverridesEqual: JSON.stringify(canonical(configuration.fieldOverrides ?? [])) === JSON.stringify(canonical(remote.fieldOverrides ?? [])) }));
}
console.log(JSON.stringify({ sdkBuilders: calls.length, sourceFiles: new Set(calls.map(call => call.file)).size, collectionGroupCalls: groups,
  localIndexes: indexes.length, requiredCurrentIndexes: indexes.filter(index => uses(index).some(record => record.kind === 'composite' && reached.has(resolve(record.file)))).length,
  findings: discrepancies, remote: 'not-checked', networkRequests: 0 }));
if (discrepancies.length) process.exitCode = 1;
