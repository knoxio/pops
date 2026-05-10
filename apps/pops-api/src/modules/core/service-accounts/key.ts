/**
 * Service-account API key generation, parsing, hashing and verification.
 *
 * Wire format: `pops_sa_<prefix>.<secret>`
 *   - `pops_sa_` is a literal marker so leaked keys are easy to detect by
 *     pattern (similar to GitHub's `ghp_` / `ghs_` convention).
 *   - `<prefix>` is 8 url-safe base64 characters (~48 bits of entropy)
 *     used as a fast O(1) DB lookup. Stored in the clear.
 *   - `<secret>` is 32 url-safe base64 characters (~192 bits of entropy)
 *     hashed with scrypt before storage.
 *
 * Why scrypt: it ships with Node, no native deps to compile in CI / Alpine
 * containers, and is good enough for a key with 192 bits of entropy where
 * brute-force is not the threat model.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEY_MARKER = 'pops_sa_';
const PREFIX_BYTES = 6; // 8 base64 chars after url-safe encode without padding
const SECRET_BYTES = 24; // 32 base64 chars after url-safe encode without padding
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const HASH_FORMAT_VERSION = 'scrypt';

function urlSafeBase64(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export interface IssuedKey {
  /** The full plaintext key. Show to operator once, never persist. */
  plaintext: string;
  /** The 8-char prefix to store in the DB for fast lookup. */
  prefix: string;
  /** scrypt-encoded hash of the secret half, ready to persist. */
  hash: string;
}

/** Generate a fresh API key plus its persistable prefix and hash. */
export async function generateApiKey(): Promise<IssuedKey> {
  const prefix = urlSafeBase64(randomBytes(PREFIX_BYTES)).slice(0, 8);
  const secret = urlSafeBase64(randomBytes(SECRET_BYTES)).slice(0, 32);
  const plaintext = `${KEY_MARKER}${prefix}.${secret}`;
  const hash = await hashSecret(secret);
  return { plaintext, prefix, hash };
}

/**
 * Parse a presented header value into its prefix + secret components.
 * Returns null if the input is malformed (caller should reject with 401).
 */
export function parseApiKey(header: string): { prefix: string; secret: string } | null {
  if (!header.startsWith(KEY_MARKER)) return null;
  const body = header.slice(KEY_MARKER.length);
  const dot = body.indexOf('.');
  if (dot !== 8) return null; // prefix must be exactly 8 chars
  const prefix = body.slice(0, 8);
  const secret = body.slice(9);
  if (secret.length === 0) return null;
  return { prefix, secret };
}

async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(secret, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${HASH_FORMAT_VERSION}$${urlSafeBase64(salt)}$${urlSafeBase64(derived)}`;
}

/**
 * Constant-time verify a presented secret against a stored hash. Returns
 * false on any malformed input (never throws on bad data).
 */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [version, saltB64, hashB64] = stored.split('$');
  if (version !== HASH_FORMAT_VERSION || !saltB64 || !hashB64) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
    expected = Buffer.from(hashB64.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;
  const derived = (await scryptAsync(secret, salt, SCRYPT_KEYLEN)) as Buffer;
  return timingSafeEqual(derived, expected);
}
