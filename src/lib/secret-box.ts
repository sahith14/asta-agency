/**
 * AgencyOS — secret box for OAuth token storage (Task 2-b).
 *
 * AES-256-GCM encryption for Gmail OAuth tokens at rest. Ciphertext format:
 *   v1:<iv b64>:<tag b64>:<data b64>
 *
 * Key derivation (HKDF-SHA-256, 32 bytes):
 * - Preferred: AGENCYOS_TOKEN_SECRET env var (operator-controlled key).
 * - Fallback: an app-generated random 32-byte secret persisted once in the
 *   Setting table under "oauth_secret_v1". Documented trade-off: the key is
 *   encrypted at rest only insofar as the app-held DB is protected; using the
 *   env var is strictly better and is recommended in production.
 *
 * Secrets are NEVER logged and NEVER returned through any API response.
 */
import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const SETTING_KEY = "oauth_secret_v1";
/** Static, non-secret context strings; key material entropy comes from the IKM. */
const HKDF_SALT = Buffer.from("agencyos:oauth-token-encryption:v1", "utf8");
const HKDF_INFO = Buffer.from("aes-256-gcm:token-encryption:v1", "utf8");

const globalForSecretBox = globalThis as unknown as {
  __agencyosSecretKey?: Promise<Buffer>;
};

function deriveKey(ikm: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, HKDF_SALT, HKDF_INFO, 32));
}

async function loadOrCreateKey(): Promise<Buffer> {
  const envSecret = process.env.AGENCYOS_TOKEN_SECRET?.trim();
  if (envSecret) {
    return deriveKey(Buffer.from(envSecret, "utf8"));
  }

  const stored = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  if (stored?.value) {
    return deriveKey(Buffer.from(stored.value, "base64"));
  }

  // First use: generate once and persist. A concurrent creation (two cold
  // requests racing) hits the primary-key constraint — re-read in that case.
  const raw = randomBytes(32);
  try {
    await db.setting.create({ data: { key: SETTING_KEY, value: raw.toString("base64") } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      const winner = await db.setting.findUnique({ where: { key: SETTING_KEY } });
      if (winner?.value) return deriveKey(Buffer.from(winner.value, "base64"));
    }
    throw err;
  }
  return deriveKey(raw);
}

/** Returns the HKDF-derived encryption key, cached for the process lifetime. */
function getKey(): Promise<Buffer> {
  if (!globalForSecretBox.__agencyosSecretKey) {
    globalForSecretBox.__agencyosSecretKey = loadOrCreateKey().catch((err) => {
      // Do not cache failures — a transient DB hiccup must not poison the cache.
      globalForSecretBox.__agencyosSecretKey = undefined;
      throw err;
    });
  }
  return globalForSecretBox.__agencyosSecretKey;
}

/** Encrypts a plaintext secret into the "v1:iv:tag:data" envelope. */
export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

/** Decrypts a "v1:iv:tag:data" envelope; throws when the tag or key mismatches. */
export async function decryptSecret(cipherText: string): Promise<string> {
  const parts = cipherText.split(":");
  if (parts.length !== 4 || parts[0] !== "v1" || !parts[1] || !parts[2] || !parts[3]) {
    throw new Error("Unrecognised cipher envelope.");
  }
  const key = await getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]);
  return plain.toString("utf8");
}
