import assert from 'node:assert/strict';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-migapos', 'Spark checks require the local demo-migapos project.');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'A local Firestore Emulator is mandatory.');
assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS, 'Service accounts must not be used by Spark tests.');
console.log('Spark emulator isolation verified: demo-migapos, 127.0.0.1:8080, no service account.');
