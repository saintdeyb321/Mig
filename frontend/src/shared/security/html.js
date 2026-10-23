export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
export const escapeAttribute = value => escapeHtml(value).replace(/\p{Cc}/gu, character => `&#${character.charCodeAt(0)};`);
export const multilineHtml = value => escapeHtml(value).replace(/\r\n?|\n/g, '<br>');

export function safeImageUrl(value, { origin = globalThis.location?.origin } = {}) {
  if (typeof value !== 'string' || /[\s\p{Cc}<>"']/u.test(value)) return '';
  if (value.startsWith('blob:')) {
    const match = /^blob:(https?:\/\/[^/?#]+|null)\/[a-f0-9-]{36}$/i.exec(value);
    return match && (!origin || match[1] === origin) ? value : '';
  }
  const data = /^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/]+={0,2})$/i.exec(value);
  if (data) {
    const [, type, payload] = data;
    if (payload.length > 7 * 1024 * 1024 || payload.length % 4 !== 0) return '';
    try {
      const bytes = atob(payload.slice(0, Math.min(32, payload.length)));
      const valid = type.toLowerCase() === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n')
        : type.toLowerCase() === 'jpeg' ? bytes.startsWith('\xff\xd8\xff')
        : type.toLowerCase() === 'gif' ? /^GIF8[79]a/.test(bytes)
        : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
      return valid ? value : '';
    } catch { return ''; }
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) return '';
    if (url.hostname === 'firebasestorage.googleapis.com' && /^\/v0\/b\/[^/]+\/o\/.+/.test(url.pathname)) return url.href;
    if (url.hostname === 'storage.googleapis.com' && /^\/[^/]+\/.+/.test(url.pathname)) return url.href;
  } catch { /* Invalid or unapproved schemes are never interpolated into attributes. */ }
  return '';
}
