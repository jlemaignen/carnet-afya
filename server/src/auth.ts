import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// Mots de passe : argon2id (paramètres recommandés OWASP : 19 Mio, 2 passes, 1 fil).
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 12;

/** Mot de passe provisoire donné par un administrateur : 16 caractères tirés au hasard, à changer à la première connexion. */
export function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

// Vérifié quand le compte n'existe pas, pour que la réponse prenne le même temps.
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(passwordHash: string | undefined, password: string): Promise<boolean> {
  if (!passwordHash) {
    dummyHash ??= hashPassword('compte-inexistant-pour-egaliser-le-temps');
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Cookie de session : "<userId>.<émis à (ms)>.<hmac>". Le compte est relu en base à chaque
// requête : désactivation ou changement de mot de passe coupent les sessions ouvertes.
export function signSession(userId: number, issuedAtMs: number, secret: string): string {
  const payload = `${userId}.${issuedAtMs}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

export function verifySession(
  value: string | undefined,
  secret: string,
  maxAgeSeconds: number,
  nowMs: number = Date.now(),
): { userId: number; issuedAt: number } | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [userIdStr, issuedAtStr, mac] = parts;
  const expected = createHmac('sha256', secret).update(`${userIdStr}.${issuedAtStr}`).digest('base64url');
  if (!safeEqual(mac, expected)) return null;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt) || nowMs - issuedAt > maxAgeSeconds * 1000 || issuedAt > nowMs + 60_000) return null;
  const userId = Number(userIdStr);
  return Number.isInteger(userId) && userId > 0 ? { userId, issuedAt } : null;
}

/**
 * Verrou par compte : après 8 échecs en 15 minutes, le compte refuse toute tentative pendant
 * 15 minutes (en plus de la limite par IP). En mémoire : un redémarrage le remet à zéro.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max = 8, windowMs = 15 * 60_000) {
    this.max = max;
    this.windowMs = windowMs;
  }

  private recent(key: string, now: number): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  isLocked(username: string, now = Date.now()): boolean {
    return this.recent(username.toLowerCase(), now).length >= this.max;
  }

  fail(username: string, now = Date.now()): void {
    const key = username.toLowerCase();
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(username: string): void {
    this.failures.delete(username.toLowerCase());
  }
}

// ── Second facteur facultatif : application d'authentification (TOTP, RFC 6238) ──

export const MAX_CODE_ATTEMPTS = 5;
const TOTP_PERIOD_S = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_S);
}

export function totpAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * Accepte le code de la période en cours, de la précédente ou de la suivante (horloges décalées).
 * Renvoie la période reconnue, ou null. Une période déjà utilisée (<= lastStep) est refusée :
 * un code intercepté ne peut pas resservir.
 */
export function verifyTotp(secret: Buffer, code: string, lastStep: number, nowMs: number = Date.now()): number | null {
  const now = totpStep(nowMs);
  let found: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    if (safeEqual(totpAt(secret, step), code) && step > lastStep) found = step;
  }
  return found;
}

export function totpUri(secret: Buffer, email: string): string {
  const issuer = 'CCAG Carnet AFYA';
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${base32(secret)}&issuer=${encodeURIComponent(issuer)}`;
}

// Le secret TOTP est chiffré en base (AES-256-GCM, clé dérivée de SESSION_SECRET) : une copie du
// fichier SQLite seule ne permet pas de fabriquer des codes.
function totpKey(sessionSecret: string): Buffer {
  return createHmac('sha256', sessionSecret).update('totp-secret-encryption').digest();
}

export function sealSecret(secret: Buffer, sessionSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', totpKey(sessionSecret), iv);
  const data = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

export function openSecret(sealed: string | null, sessionSecret: string): Buffer | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', totpKey(sessionSecret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  } catch {
    return null;
  }
}

/** Jeton du lien « Mot de passe oublié » : 256 bits ; seule son empreinte SHA-256 est gardée en base. */
export function newResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newChallengeId(): string {
  return randomBytes(24).toString('base64url');
}

/** Cookie d'attente entre le mot de passe et le code : "<défi>.<hmac>". */
export function signChallenge(challengeId: string, secret: string): string {
  return `${challengeId}.${createHmac('sha256', secret).update(`challenge.${challengeId}`).digest('base64url')}`;
}

export function verifyChallenge(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const i = value.lastIndexOf('.');
  if (i <= 0) return null;
  const id = value.slice(0, i);
  return safeEqual(value, signChallenge(id, secret)) ? id : null;
}
