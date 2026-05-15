// AES-256-GCM encryption for Dialpad OAuth tokens at rest in
// tenant_integrations.{access,refresh}_token_encrypted (text columns
// holding base64-encoded nonce||ciphertext||authTag).
//
// Key: TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes). Rotating it
// invalidates all stored tokens — users would have to reconnect.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LEN = 12; // GCM standard
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) {
    cachedKey = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');
    if (cachedKey.length !== 32) {
      throw new Error(
        `TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${cachedKey.length}). It must be 64 hex chars.`,
      );
    }
  }
  return cachedKey;
}

/** Encrypts plaintext → base64(nonce || ciphertext || authTag). */
export function encryptToken(plaintext: string): string {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGORITHM, key(), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, authTag]).toString('base64');
}

/** Decrypts base64(nonce || ciphertext || authTag) → plaintext. */
export function decryptToken(b64: string): string {
  const combined = Buffer.from(b64, 'base64');
  if (combined.length <= NONCE_LEN + TAG_LEN) {
    throw new Error('decryptToken: ciphertext too short for nonce + authTag');
  }
  const nonce = combined.subarray(0, NONCE_LEN);
  const authTag = combined.subarray(combined.length - TAG_LEN);
  const ciphertext = combined.subarray(NONCE_LEN, combined.length - TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key(), nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
