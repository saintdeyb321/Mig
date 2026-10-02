// Convertir string a ArrayBuffer
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// UID binds the local ciphertext to an account; it is not a server-side secret.
async function getKey(uid) {
  if (typeof uid !== 'string' || !uid) throw new Error('UID requerido para cifrar o descifrar.');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(uid.padEnd(32, '0')), // Aseguramos longitud mínima
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('miga-pos-salt-v2'), // Salt fijo pero conocido (puede ser público)
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encripta un texto usando el UID del usuario como clave.
 * @param {string} text - Texto a encriptar.
 * @param {string} uid - UID del usuario (debe ser único por sesión).
 * @returns {Promise<string>} - Base64 del IV + datos cifrados.
 */
export async function encrypt(text, uid) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits para AES-GCM
  const key = await getKey(uid);
  const encoded = encoder.encode(text);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  // Combinar IV y ciphertext en un solo Uint8Array
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  // Convertir a Base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Desencripta un texto previamente encriptado con encrypt.
 * @param {string} base64 - Base64 del IV + datos cifrados.
 * @param {string} uid - UID del usuario (debe ser el mismo que se usó para encriptar).
 * @returns {Promise<string>} - Texto original.
 */
export async function decrypt(base64, uid) {
  const combined = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const key = await getKey(uid);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return decoder.decode(decrypted);
}
