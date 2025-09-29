import 'server-only'

import { db } from '@/lib/db/drizzle'
import { users, openPositions, cashBalances } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { decrypt } from '@/lib/auth/crypto'
import { getFlexStatementXML } from '@/lib/portfolio/flex'
import { parseFlexXML } from '@/lib/portfolio/xml'

const refreshing = new Set<number>()

function nowUtc(): Date {
  return new Date()
}

function ttlMinutes(): number {
  const n = Number(process.env.SNAPSHOT_TTL_MIN || '15')
  return Number.isFinite(n) && n > 0 ? n : 15
}

export async function getOpenPositionsCached(userId: number): Promise<{
  baseCcy: string
  lastUpdated: string | null
  stale: boolean
  rows: (typeof openPositions.$inferSelect)[]
  cash: (typeof cashBalances.$inferSelect)[]
}> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  const baseCcy = (user?.baseCcy || 'USD').toUpperCase()

  const rows = await db
    .select()
    .from(openPositions)
    .where(eq(openPositions.userId, userId))
    .orderBy(desc(openPositions.updatedAt))

  let cash: (typeof cashBalances.$inferSelect)[] = []
  try {
    cash = await db
      .select()
      .from(cashBalances)
      .where(eq(cashBalances.userId, userId))
      .orderBy(desc(cashBalances.updatedAt))
  } catch (_) {
    // If table is missing (e.g., migrations not yet applied), continue with empty cash set
    cash = []
  }
  

  const lastRows = rows.length ? rows[0].updatedAt : null
  const lastCash = cash.length ? cash[0].updatedAt : null
  const last = lastRows && lastCash ? (lastRows > lastCash ? lastRows : lastCash) : (lastRows || lastCash)
  const lastUpdated = last ? last.toISOString() : null
  const stale = (() => {
    if (!last) return true
    const ageMs = nowUtc().getTime() - last.getTime()
    return ageMs > ttlMinutes() * 60 * 1000
  })()

  if (stale && !refreshing.has(userId)) {
    // fire-and-forget
    refreshOpenPositions(userId).catch(() => {})
  }

  return { baseCcy, lastUpdated, stale, rows, cash }
}

export async function refreshOpenPositions(userId: number): Promise<{ updated: number }>
{
  if (refreshing.has(userId)) return { updated: 0 }
  refreshing.add(userId)
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw new Error('User not found')
    if (!user.ibkrFlexTokenEnc || !user.ibkrQueryIdEnc) {
      throw new Error('IBKR credentials not set for user')
    }
    const token = decrypt(user.ibkrFlexTokenEnc)
    const queryId = decrypt(user.ibkrQueryIdEnc)

    const xml = await getFlexStatementXML({ token, queryId })
    const parsed = parseFlexXML(xml)
    const when = parsed.info.whenGenerated
    const lastPriceAsOf = parseWhenGenerated(when)

    const fresh = parsed.openPositions
      // equities/stk/etf positions only, keep it simple
      .filter((op) => {
        const cat = String(op.assetCategory || '').toUpperCase()
        return cat === 'STK' || cat === 'ETF' || cat === 'CFD' || cat === 'OPT' || cat === 'FUT' || cat === 'WAR' || cat === 'BOND' || cat === 'FUND' || cat === 'CASH'
      })
      .map((op) => ({
        userId,
        accountId: op.accountId || null,
        conid: op.conid || 0,
        symbol: op.symbol || '',
        name: op.description || null,
        currency: (op.currency || 'USD').toUpperCase(),
        qty: op.position ?? 0,
        longShort: (op.position ?? 0) >= 0 ? 'long' : 'short',
        unitMarkPrice: op.markPrice ?? null,
        unitCostBasisPrice: op.costBasisPrice ?? (op.openPrice ?? null),
        totalCostBasisMoney: op.costBasisMoney ?? null,
        positionValue: op.positionValue ?? null,
        posCcy: (op.currency || undefined)?.toUpperCase() || null,
        fxToBase: op.fxRateToBase ?? null,
        reportDate: op.reportDate || null,
        dateOpen: op.openDateTime || op.holdingPeriodDateTime || null,
        dateAdded: op.openDateTime ? new Date(op.openDateTime) : null,
        lastPriceAsOf: lastPriceAsOf ? new Date(lastPriceAsOf) : null,
        updatedAt: nowUtc(),
      }))
      .filter((r) => r.conid && r.symbol)

    const conids = fresh.map((f) => f.conid)
    const cashFresh = (parsed.cashReport || []).map((r) => ({
      userId,
      accountId: r.accountId || null,
      currency: (r.currency || '').toUpperCase(),
      levelOfDetail: r.levelOfDetail || null,
      endingCash: r.endingCash ?? null,
      endingSettledCash: r.endingSettledCash ?? null,
      updatedAt: nowUtc(),
    })).filter((r) => r.currency)

    let updated = 0
    await db.transaction(async (tx) => {
      // Upsert each position
      for (const p of fresh) {
        await tx
          .insert(openPositions)
          .values(p)
          .onConflictDoUpdate({
            target: [openPositions.userId, openPositions.conid],
            set: {
              accountId: p.accountId,
              symbol: p.symbol,
              name: p.name,
              currency: p.currency,
              qty: p.qty,
              longShort: p.longShort,
              unitMarkPrice: p.unitMarkPrice,
              unitCostBasisPrice: p.unitCostBasisPrice,
              totalCostBasisMoney: p.totalCostBasisMoney,
              positionValue: p.positionValue,
              posCcy: p.posCcy,
              fxToBase: p.fxToBase,
              reportDate: p.reportDate,
              dateOpen: p.dateOpen,
              dateAdded: p.dateAdded,
              lastPriceAsOf: p.lastPriceAsOf,
              updatedAt: p.updatedAt,
            }
          })
        updated++
      }
      // Sweep deletes (two-step to keep Drizzle compatibility)
      const existing = await tx
        .select({ id: openPositions.id, conid: openPositions.conid })
        .from(openPositions)
        .where(eq(openPositions.userId, userId))
      const toDelete = existing.filter((r) => !conids.includes(r.conid))
      for (const d of toDelete) {
        await tx.delete(openPositions).where(eq(openPositions.id, d.id))
      }

      // Upsert cash balances (best-effort: skip if table not present)
      try {
        for (const c of cashFresh) {
          await tx
            .insert(cashBalances)
            .values(c)
            .onConflictDoUpdate({
              target: [cashBalances.userId, cashBalances.currency, cashBalances.levelOfDetail],
              set: {
                accountId: c.accountId,
                endingCash: c.endingCash,
                endingSettledCash: c.endingSettledCash,
                updatedAt: c.updatedAt,
              }
            })
        }
        // Sweep deletes for cash
        const existingCash = await tx
          .select({ id: cashBalances.id, currency: cashBalances.currency, levelOfDetail: cashBalances.levelOfDetail })
          .from(cashBalances)
          .where(eq(cashBalances.userId, userId))
        const presentKeys = new Set(cashFresh.map((c) => `${c.currency}::${c.levelOfDetail || ''}`))
        for (const row of existingCash) {
          const key = `${row.currency}::${row.levelOfDetail || ''}`
          if (!presentKeys.has(key)) {
            await tx.delete(cashBalances).where(eq(cashBalances.id, row.id))
          }
        }
      } catch (_) {
        // relation might not exist yet — ignore so positions still update
      }

      
    })

    return { updated }
  } finally {
    refreshing.delete(userId)
  }
}

export function parseWhenGenerated(s?: string | null): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})$/)
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}Z`
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}
