import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

function normalizeUrl(u?: string | null) {
  let url = u || ''
  if (url.startsWith('postgresql://')) url = url.replace('postgresql://', 'postgres://')
  return url
}

async function main() {
  // Prefer explicit migration URL, then non-pooling (5432), else runtime URL
  const chosen =
    process.env.DRIZZLE_URL
      ? { key: 'DRIZZLE_URL', value: process.env.DRIZZLE_URL }
      : process.env.POSTGRES_URL_NON_POOLING
      ? { key: 'POSTGRES_URL_NON_POOLING', value: process.env.POSTGRES_URL_NON_POOLING }
      : process.env.POSTGRES_URL
      ? { key: 'POSTGRES_URL', value: process.env.POSTGRES_URL }
      : process.env.DATABASE_URL
      ? { key: 'DATABASE_URL', value: process.env.DATABASE_URL }
      : undefined

  const url = normalizeUrl(chosen?.value)
  if (!url) throw new Error('Missing DB URL: set POSTGRES_URL or DRIZZLE_URL')

  const isSupabase = /(\.|\/)supabase\.(co|com)/.test(url)
  const isPooler = /pooler\.supabase\.(co|com)|(:)6543\//.test(url)

  try {
    const u = new URL(url)
    const host = u.hostname
    const port = u.port || (isPooler ? '6543' : '5432')
    console.log(
      `Running migrations via ${chosen?.key} -> ${host}:${port} (pooler=${isPooler ? 'yes' : 'no'})`
    )
  } catch {}

  const client = postgres(url, {
    ssl: isSupabase ? 'require' : undefined,
    // Important: PgBouncer transaction pooler does not support prepared statements
    prepare: isPooler ? false : undefined,
    max: 1,
  })

  try {
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: 'lib/db/migrations' })
    console.log('Migrations applied successfully.')
  } finally {
    await client.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
