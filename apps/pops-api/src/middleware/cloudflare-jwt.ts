/**
 * Cloudflare Access JWT validation middleware
 * Validates Cf-Access-Jwt-Assertion header and extracts user email
 */

import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";

/**
 * Cloudflare Access JWT payload structure
 */
export interface CloudflareJWTPayload extends JwtPayload {
  email: string;
  aud: string[];
  iss: string;
}

/**
 * Cache for Cloudflare public keys (15 min TTL)
 */
interface KeyCache {
  keys: Record<string, string>;
  expiresAt: number;
}

let keyCache: KeyCache | null = null;

/**
 * Fetch Cloudflare Access public keys
 * Keys are cached for 15 minutes to avoid excessive requests
 */
async function getCloudflarePublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();

  if (keyCache && keyCache.expiresAt > now) {
    return keyCache.keys;
  }

  const teamName = process.env["CLOUDFLARE_ACCESS_TEAM_NAME"];
  if (!teamName) {
    throw new Error("CLOUDFLARE_ACCESS_TEAM_NAME not configured");
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
    expiresAt: now + 15 * 60 * 1000, // 15 minutes
  };

  return keys;
}

/**
 * Verify Cloudflare Access JWT token
 * @param token - JWT token from Cf-Access-Jwt-Assertion header
 * @returns Decoded JWT payload with user email
 * @throws Error if token is invalid or verification fails
 */
export async function verifyCloudflareJWT(token: string): Promise<CloudflareJWTPayload> {
  // Decode header to get kid (key ID)
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new Error("Invalid JWT: Unable to decode header");
  }

  const kid = decoded.header.kid;
  if (!kid) {
    throw new Error("Invalid JWT: Missing kid in header");
  }

  // Fetch public keys
  const publicKeys = await getCloudflarePublicKeys();
  const publicKey = publicKeys[kid];

  if (!publicKey) {
    throw new Error(`Invalid JWT: Public key not found for kid ${kid}`);
  }

  // Verify token signature
  const payload = jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
  }) as CloudflareJWTPayload;

  // Validate audience (application AUD)
  const expectedAud = process.env["CLOUDFLARE_ACCESS_AUD"];
  if (expectedAud && !payload.aud.includes(expectedAud)) {
    throw new Error("Invalid JWT: Audience mismatch");
  }

  // Validate email exists
  if (!payload.email) {
    throw new Error("Invalid JWT: Missing email claim");
  }

  return payload;
}
