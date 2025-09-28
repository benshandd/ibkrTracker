import 'server-only'
import crypto from 'crypto'

function getKey(): Buffer {
  const b64 = process.env.ENCRYPTION_KEY
  if (!b64) throw new Error('ENCRYPTION_KEY is not set')
  let key: Buffer
  try {
    key = Buffer.from(b64, 'base64')
  } catch (e) {
    throw new Error('ENCRYPTION_KEY must be base64-encoded 32 bytes')
  }
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes')
  return key
}

export function encrypt(plain: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decrypt(payload: string): string {
  const key = getKey()
  const raw = Buffer.from(payload, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const data = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return dec.toString('utf8')
}

