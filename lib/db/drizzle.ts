import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import dotenv from 'dotenv'

dotenv.config()

let url = process.env.POSTGRES_URL || process.env.DATABASE_URL
if (!url) {
  throw new Error('POSTGRES_URL or DATABASE_URL environment variable is not set')
}
// Normalize common scheme variant
if (url?.startsWith('postgresql://')) url = url.replace('postgresql://', 'postgres://')
const isSupabase = /(\.|\/)supabase\.(co|com)/.test(url || '')
const isSupabasePooler = /pooler\.supabase\.(co|com)|(:)6543\//.test(url || '')

// Options tuned for Supabase pooler compatibility in serverless environments
const clientOptions: Parameters<typeof postgres>[1] = {
  ssl: isSupabase ? 'require' : undefined,
  // Supabase transaction pooler (pgbouncer) does not support prepared statements
  // Disable when connecting to any supabase pooler host or port 6543
  prepare: isSupabasePooler ? false : undefined,
  // Keep connection usage minimal in serverless environments
  max: isSupabase ? 1 : undefined,
}

declare global {
  // eslint-disable-next-line no-var
  var __db_client__: ReturnType<typeof postgres> | undefined
}

export const client =
  process.env.NODE_ENV === 'production'
    ? postgres(url!, clientOptions)
    : (global.__db_client__ ??= postgres(url!, clientOptions))

export const db = drizzle(client, { schema })
