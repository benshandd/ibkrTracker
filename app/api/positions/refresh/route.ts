import { NextRequest } from 'next/server'
import { getUser } from '@/lib/db/queries'
import { refreshOpenPositions } from '@/lib/portfolio/cache'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  const me = await getUser()
  if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    // fire and respond
    refreshOpenPositions(me.id).catch(() => {})
    return Response.json({ queued: true }, { status: 202 })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed to refresh' }, { status: 500 })
  }
}

