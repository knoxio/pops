/**
 * Cloudflare Access JWT validation.
 *
 * Mirrors `apps/pops-api/src/middleware/cloudflare-jwt.ts` (and the
 * local copies in `apps/pops-core-api/src/middleware/cloudflare-jwt.ts`
 * + `apps/pops-inventory-api/src/middleware/cloudflare-jwt.ts`) because
 * finance-api stands alone in the dependency graph — see the standalone
 * comment on `finance-sqlite-path.ts`. A future refactor can lift this
 * into a shared `@pops/auth` package; for now duplication is the right
 * call to keep the writer-move PR additive and easy to revert.
 */
import jwt from 'jsonwebtoken';

import type { JwtPayload } from 'jsonwebtoken';

export interface CloudflareJWTPayload extends JwtPayload {
  email: string;
  aud: string[];
  iss: string;
}

interface KeyCache {
  keys: Record<string, string>;
  expiresAt: number;
}

let keyCache: KeyCache | null = null;

async function getCloudflarePublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (keyCache && keyCache.expiresAt > now) {
    return keyCache.keys;
  }

  const teamName = process.env['CLOUDFLARE_ACCESS_TEAM_NAME'];
  if (!teamName) {
    throw new Error('CLOUDFLARE_ACCESS_TEAM_NAME not configured');
  }

  const certsUrl = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`;
  const response = await fetch(certsUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Cloudflare certs: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    public_certs: Array<{ kid: string; cert: string }>;
  };

  const keys: Record<string, string> = {};
  for (const cert of data.public_certs) {
    keys[cert.kid] = cert.cert;
  }

  keyCache = {
    keys,
    expiresAt: now + 15 * 60 * 1000,
  };
  return keys;
}

export async function verifyCloudflareJWT(token: string): Promise<CloudflareJWTPayload> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Invalid JWT: Unable to decode header');
  }
  const kid = decoded.header.kid;
  if (!kid) {
    throw new Error('Invalid JWT: Missing kid in header');
  }
  const publicKeys = await getCloudflarePublicKeys();
  const publicKey = publicKeys[kid];
  if (!publicKey) {
    throw new Error(`Invalid JWT: Public key not found for kid ${kid}`);
  }

  const payload = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
  }) as CloudflareJWTPayload;

  const expectedAud = process.env['CLOUDFLARE_ACCESS_AUD'];
  if (expectedAud && !payload.aud.includes(expectedAud)) {
    throw new Error('Invalid JWT: Audience mismatch');
  }
  if (!payload.email) {
    throw new Error('Invalid JWT: Missing email claim');
  }
  return payload;
}
