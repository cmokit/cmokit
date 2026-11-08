// Credentials are sealed with AES-GCM under a key that is a secret of the deployment, and opened only
// to call their vendor (ADR-0030). Web Crypto alone, so it runs the same in a Worker and in Node.

export interface Vault {
  seal(plain: string): Promise<string>;
  open(sealed: string): Promise<string>;
}

/** A vault under a 256-bit key, given as base64. */
export function aesGcmVault(base64Key: string): Vault {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('The credential key must be 32 bytes, as base64');
  const key = crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    async seal(plain) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key, new TextEncoder().encode(plain)));
      return base64(new Uint8Array([...iv, ...sealed]));
    },
    async open(text) {
      const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await key, bytes.slice(12));
      return new TextDecoder().decode(plain);
    },
  };
}

function base64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

/** A SHA-256 hash as hex, for one-time link tokens, which are kept only hashed. */
export async function hash(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random token of 32 url-safe characters. */
export function randomToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => alphabet[b % 64]).join('');
}
