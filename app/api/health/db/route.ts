import { db } from '@/lib/db/drizzle'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  const started = Date.now()
  try {
    const res = await db.execute(sql`select 1 as ok`)
    const elapsed = Date.now() - started
    return Response.json({ ok: true, elapsed_ms: elapsed, result: res })
  } catch (err: any) {
    const elapsed = Date.now() - started
    return Response.json(
      {
        ok: false,
        elapsed_ms: elapsed,
        error: err?.message || String(err),
      },
      { status: 500 }
    )
  }
}

