import 'dotenv/config'
import type { Config } from 'drizzle-kit'

// Prefer an explicit migration URL if provided, else fall back.
// This lets you use Supabase pooler for runtime but direct 5432 for migrations.
// DRIZZLE_URL > POSTGRES_URL_NON_POOLING > POSTGRES_URL > DATABASE_URL
let url =
  process.env.DRIZZLE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  ''
if (url.startsWith('postgresql://')) url = url.replace('postgresql://', 'postgres://')
// Ensure SSL for Supabase in CLI (drizzle-kit) by appending sslmode=require
if (/(\.|\/)supabase\.(co|com)/.test(url)) {
  if (url.includes('?')) {
    if (!/([?&])sslmode=/.test(url)) url += '&sslmode=require'
  } else {
    url += '?sslmode=require'
  }
}

const isSupabase = /(\.|\/)supabase\.(co|com)/.test(url)

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url,
    ssl: isSupabase ? 'require' : undefined,
  },
} satisfies Config
