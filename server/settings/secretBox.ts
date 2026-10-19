import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getDbPath } from '../db/open.ts'

/**
 * At-rest encryption for locally persisted secrets (e.g. the KIE API key).
 *
 * Threat model: a local-first desktop app. This protects the SQLite DB from
 * casual inspection, backups, and accidental sharing of `studio.db` — the key
 * lives in a separate 0600 file next to the DB, so the DB alone reveals
 * nothing. It is not a defense against an attacker with full filesystem read.
 */

const ENC_PREFIX = 'enc:v1:'
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

let cachedKey: Buffer | null = null

/** Path of the local master-key file (sibling of the SQLite DB). */
function keyFilePath(): string {
  return resolve(dirname(getDbPath()), 'studio-secret.key')
}

/**
 * Resolve the 32-byte master key. Priority: `STUDIO_SECRET_KEY` (base64) env
 * override → local key file (created on first use with 0600 permissions).
 */
function getMasterKey(): Buffer {
  const fromEnv = process.env.STUDIO_SECRET_KEY?.trim()
  if (fromEnv) {
    const key = Buffer.from(fromEnv, 'base64')
    if (key.length !== KEY_BYTES) {
      throw new Error('STUDIO_SECRET_KEY must decode to 32 bytes (base64)')
    }
    return key
  }

  if (cachedKey) return cachedKey

  const path = keyFilePath()
  if (existsSync(path)) {
    const key = Buffer.from(readFileSync(path, 'utf8').trim(), 'base64')
    if (key.length !== KEY_BYTES) {
      throw new Error('Local secret key file is corrupt (expected 32 bytes)')
    }
    cachedKey = key
    return key
  }

  const key = randomBytes(KEY_BYTES)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, key.toString('base64'), { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(path, 0o600)
  } catch {
    // Best effort: some filesystems (e.g. Windows) ignore POSIX modes.
  }
  cachedKey = key
  return key
}

/** Whether a stored value is in the encrypted envelope format. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX)
}

/** Encrypt a plaintext secret into the `enc:v1:` envelope. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', getMasterKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

/**
 * Decrypt a stored value. Legacy plaintext (no `enc:v1:` prefix) is returned
 * as-is for backward compatibility. Throws when an encrypted payload cannot be
 * authenticated (wrong key or tampering).
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored
  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64')
  const iv = raw.subarray(0, IV_BYTES)
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', getMasterKey(), iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8')
}
