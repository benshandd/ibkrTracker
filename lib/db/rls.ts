import 'dotenv/config'
import postgres from 'postgres'

// Enable RLS on all app tables and add permissive, idempotent policies for local/dev.
// This keeps RLS on while avoiding accidental breakage during local development.

const TABLES = [
  // Core auth/teams
  'users',
  'teams',
  'team_members',
  'activity_logs',
  'invitations',
  // Portfolio domain
  'symbols',
  'price_cache',
  'trades',
  'positions',
  'sync_runs',
  'open_positions',
  'cash_balances',
]

function normalizeUrl(u?: string | null) {
  let url = u || ''
  if (url.startsWith('postgresql://')) url = url.replace('postgresql://', 'postgres://')
  return url
}

async function main() {
  const rawUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (!rawUrl) throw new Error('POSTGRES_URL or DATABASE_URL is required')
  const url = normalizeUrl(rawUrl)

  const isSupabase = /(\.|\/)supabase\.(co|com)/.test(url)
  const isSupabasePooler = /pooler\.supabase\.(co|com)|(:)6543\//.test(url)
  const sql = postgres(url, {
    ssl: isSupabase ? 'require' : undefined,
    prepare: isSupabasePooler ? false : undefined,
    max: isSupabase ? 1 : undefined,
  })

  try {
    // Enable RLS and attach permissive policies (idempotent) for each table
    for (const table of TABLES) {
      // Enable RLS (safe if already enabled)
      await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`).catch(() => {})

      // Add a permissive policy for dev if it doesn't exist.
      // Use DO block to ignore duplicate_object when policy already exists.
      await sql.unsafe(
        `DO $$
        BEGIN
          BEGIN
            CREATE POLICY rls_all_${table} ON ${table}
            FOR ALL
            USING (true)
            WITH CHECK (true);
          EXCEPTION WHEN duplicate_object THEN
            NULL;
          END;
        END
        $$;`
      )
    }

    // Optional: ensure RLS is forced (applies to owner too). Commented out by default for dev.
    // for (const table of TABLES) {
    //   await sql.unsafe(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`).catch(() => {})
    // }

    console.log('RLS enabled with permissive policies on tables:', TABLES.join(', '))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('RLS configuration failed:', err)
  process.exit(1)
})
