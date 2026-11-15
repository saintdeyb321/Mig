import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { legalArchives, legalPublication, legacyTerms } from '../src/features/legal/publication.js';

const unresolved = /\[[^\]\r\n]+\]|\b(?:BORRADOR PARA REVISIÓN|NO PUBLICAR|NO ACTIVAR)\b|^\s*(?:#+\s*)?(?:Estado:\s*)?BORRADOR\b/imu;
const https = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
};

export function validateLegalPublication(directory, rules, publication = legalPublication) {
  const { state, terms, privacy, provider } = publication;
  if (state === 'approved') {
    assert.ok(terms?.path === `/legal/terminos-${terms?.version}.txt`
      && privacy?.path === `/legal/privacidad-${privacy?.version}.txt`, 'La activación requiere Términos y Privacidad aprobados.');
    if (terms.version === legacyTerms.version) {
      assert.deepEqual(terms, legacyTerms, 'Los Términos 1.1 deben coincidir con el archivo 1.1 verificado.');
      assert.equal(privacy.version, '1.0', 'La publicación inicial vincula Términos 1.1 y Privacidad 1.0.');
    }
    assert.ok(provider && ['name', 'ruc', 'address', 'supportEmail', 'privacyEmail'].every(key => provider[key]?.trim() && !unresolved.test(provider[key])),
      'Completa la ficha del proveedor y los canales de soporte y privacidad.');
    assert.match(provider.ruc, /^\d{11}$/);
    for (const email of [provider.supportEmail, provider.privacyEmail]) assert.match(email, /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i);
    assert.ok(typeof provider.complaintsRequired === 'boolean'
      && (provider.complaintsUrl ? https(provider.complaintsUrl) : !provider.complaintsRequired),
    'Confirma si corresponde el Libro de Reclamaciones y configura su URL HTTPS cuando aplique.');
  } else {
    assert.deepEqual(publication, { state: 'legacy', terms: legacyTerms, privacy: null, provider: null });
  }

  const documents = [...legalArchives.filter(document => document.path !== terms.path), terms, privacy].filter(Boolean);
  const filenames = new Set();
  for (const document of documents) {
    assert.match(document.version, /^\d+\.\d+$/);
    assert.match(document.path, /^\/legal\/(terminos|privacidad)-\d+\.\d+\.txt$/);
    assert.ok(document.path.endsWith(`-${document.version}.txt`) && document.dateLabel?.trim() && !unresolved.test(document.dateLabel));
    const filename = document.path.slice('/legal/'.length);
    assert.ok(!filenames.has(filename), `Archivo legal duplicado: ${filename}`);
    filenames.add(filename);
    const bytes = readFileSync(join(directory, filename));
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.ok(content.trim() && !unresolved.test(content), `Texto pendiente de aprobación: ${filename}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), document.sha256, `Hash legal incorrecto: ${filename}`);
  }
  assert.deepEqual(readdirSync(directory).sort(), [...filenames].sort(), 'Hay archivos legales sin registrar.');
  const rulePublication = rules.match(/function legalPublication\(\) \{[\s\S]+?return \{([^}]+)\}/)?.[1];
  assert.ok(rulePublication, 'No se encontraron las versiones legales en Rules.');
  const pins = JSON.parse('{' + rulePublication.replaceAll("'", '"') + '}');
  assert.deepEqual(pins, { termsVersion: terms.version, termsSha256: terms.sha256,
    privacyVersion: privacy?.version ?? null, privacySha256: privacy?.sha256 ?? null }, 'El build y Rules deben fijar los mismos documentos.');
}
