import { NextRequest } from 'next/server'
import { getUser } from '@/lib/db/queries'
import { getOpenPositionsCached } from '@/lib/portfolio/cache'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const me = await getUser()
  if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { baseCcy, lastUpdated, stale, rows, cash } = await getOpenPositionsCached(me.id)

  // Compute weights and transform to UI-friendly shape
  const mvs = rows.map((r) => r.positionValue ?? (r.unitMarkPrice != null ? r.unitMarkPrice * r.qty : null))
  const mvSum: number = mvs.reduce((s: number, v) => (v != null ? s + (v as number) : s), 0)
  const positions = rows.map((r) => {
    const unitMark = r.unitMarkPrice ?? null
    const unitCost = r.unitCostBasisPrice ?? null
    const mv = r.positionValue ?? (unitMark != null ? unitMark * r.qty : null)
    const plAbs = (r.totalCostBasisMoney != null && r.positionValue != null)
      ? (r.positionValue as number) - (r.totalCostBasisMoney as number)
      : (unitMark != null && unitCost != null ? (unitMark - unitCost) * r.qty : null)
    const plPct = (unitMark != null && unitCost != null && unitCost !== 0) ? unitMark / unitCost - 1 : null
    const weightPct = mv != null && mvSum > 0 ? (mv as number) / mvSum : null
    return {
      account_id: r.accountId || '',
      symbol: r.symbol,
      conid: r.conid,
      name: r.name || undefined,
      side: r.longShort as 'long' | 'short',
      qty: r.qty,
      avg_cost: unitCost ?? 0,
      currency: r.currency,
      base_ccy: baseCcy,
      current_price: unitMark,
      current_price_ccy: r.posCcy || r.currency,
      price_status: r.lastPriceAsOf ? 'fresh' as const : 'unavailable' as const,
      as_of_price: r.lastPriceAsOf ? r.lastPriceAsOf.toISOString() : null,
      mv,
      pl_abs: plAbs,
      pl_pct: plPct,
      weight_pct: weightPct,
      date_added: r.dateAdded ? r.dateAdded.toISOString() : null,
      unitMarkPrice: unitMark,
      unitCostBasisPrice: unitCost,
      totalCostBasisMoney: r.totalCostBasisMoney ?? null,
      positionValue: r.positionValue ?? null,
      posCcy: r.posCcy || r.currency,
      fxToBase: r.fxToBase ?? null,
      report_date: r.reportDate || null,
      date_open: r.dateOpen || null,
    }
  })

  // Build cash report from DB rows
  const cash_report = cash
    .filter((c) => c.currency && c.currency !== 'BASE_SUMMARY')
    .map((c) => ({ currency: c.currency, ending_cash: c.endingCash ?? null, level_of_detail: c.levelOfDetail || null }))
  const baseSummary = cash.find((c) => c.currency === 'BASE_SUMMARY')?.endingCash ?? null

  // Derive FX from stored open positions (median of fxToBase by currency)
  const fxSamples: Record<string, number[]> = {}
  for (const r of rows) {
    const c = (r.posCcy || r.currency || '').toUpperCase()
    const fx = r.fxToBase
    if (!c || fx == null || !Number.isFinite(fx)) continue
    fxSamples[c] = fxSamples[c] || []
    fxSamples[c].push(fx)
  }
  const fx_rates_derived: Record<string, number> = {}
  for (const [c, arr] of Object.entries(fxSamples)) {
    const sorted = arr.slice().sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    fx_rates_derived[c] = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  }
  fx_rates_derived[baseCcy] = 1

  return Response.json({
    base_ccy: baseCcy,
    as_of_statement: lastUpdated,
    positions,
    trades: [],
    counts: { positions: positions.length },
    cash_report,
    cash_base_summary: baseSummary,
    fx_rates_derived,
    account: { currency: baseCcy },
    stale,
  })
}
