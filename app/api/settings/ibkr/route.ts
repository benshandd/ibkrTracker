import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/db/queries'
import { db } from '@/lib/db/drizzle'
import { users } from '@/lib/db/schema'
import { encrypt } from '@/lib/auth/crypto'
import { eq } from 'drizzle-orm'

const Body = z.object({
  flexToken: z.string().min(8),
  queryId: z.string().min(1),
  baseCcy: z.string().min(3).max(8).optional(),
})

export async function POST(req: NextRequest) {
  const me = await getUser()
  if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const json = await req.json().catch(() => null)
  const parsed = Body.safeParse(json)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body', details: parsed.error.format() }, { status: 400 })
  }
  const { flexToken, queryId, baseCcy } = parsed.data

  try {
    const encToken = encrypt(flexToken)
    const encQuery = encrypt(queryId)
    await db
      .update(users)
      .set({
        ibkrFlexTokenEnc: encToken,
        ibkrQueryIdEnc: encQuery,
        baseCcy: baseCcy ? baseCcy.toUpperCase() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, me.id))
    return Response.json({ ok: true })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed to save settings' }, { status: 500 })
  }
}

