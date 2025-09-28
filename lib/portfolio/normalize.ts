import 'server-only'
import { ParsedTrade, ParsedTax } from './xml'

export type NormalizedTrade = {
  tradeKey: string
  ibExecId?: string
  tradeId?: string
  accountId: string
  symbol: string
  conid: number
  side: 'BUY' | 'SELL'
  quantity: number
  tradePrice: number
  fees: number // commission + taxes, in trade currency
  currency: string
  fxRateToBase: number
  execTs: Date
  tradeDate?: string
  listingExchange?: string
  raw?: Record<string, unknown>
}

export type PositionCalc = {
  accountId: string
  conid: number
  symbol: string
  currency: string
  quantity: number // signed
  avgCostBase: number // base CCY
  dateAdded?: Date
}

export function normalizeTrades(trades: ParsedTrade[], taxes: ParsedTax[]): NormalizedTrade[] {
  const taxByTradeId = new Map<string, number>()
  for (const t of taxes) {
    const key = (t.tradeId || t.orderId || '').toString()
    if (!key) continue
    const v = Math.abs(t.taxAmount || 0)
    taxByTradeId.set(key, (taxByTradeId.get(key) || 0) + v)
  }

  const out: NormalizedTrade[] = []
  for (const t of trades) {
    if (!t.accountId || !t.symbol || !t.conid || !t.buySell || !t.quantity || !t.tradePrice) continue
    const tradeId = t.tradeId?.toString()
    const ibExecId = t.ibExecId?.toString()
    const tradeKey = (ibExecId && `ibExec:${ibExecId}`) || (tradeId && `trade:${tradeId}`)
    if (!tradeKey) continue
    const commission = Math.abs(t.ibCommission || 0)
    const tax = (tradeId && taxByTradeId.get(tradeId)) || 0
    const when = parseExecTs(t.dateTime || '') || parseTradeDate(t.tradeDate)
    out.push({
      tradeKey,
      ibExecId,
      tradeId,
      accountId: t.accountId,
      symbol: t.symbol,
      conid: t.conid,
      side: t.buySell,
      quantity: t.quantity,
      tradePrice: t.tradePrice,
      fees: commission + Math.abs(tax),
      currency: (t.currency || 'USD').toUpperCase(),
      fxRateToBase: t.fxRateToBase || 1,
      execTs: when || new Date(),
      tradeDate: t.tradeDate,
      listingExchange: t.listingExchange,
      raw: t as unknown as Record<string, unknown>
    })
  }
  return out
}

export function normalizeTradesWithStats(trades: ParsedTrade[], taxes: ParsedTax[]): { normalized: NormalizedTrade[]; skipCounts: Record<string, number> } {
  const skipCounts: Record<string, number> = {
    missingAccountId: 0,
    missingSymbol: 0,
    missingConid: 0,
    missingSide: 0,
    missingQuantity: 0,
    missingPrice: 0,
    missingKey: 0
  }
  const taxByTradeId = new Map<string, number>()
  for (const t of taxes) {
    const key = (t.tradeId || t.orderId || '').toString()
    if (!key) continue
    const v = Math.abs(t.taxAmount || 0)
    taxByTradeId.set(key, (taxByTradeId.get(key) || 0) + v)
  }
  const out: NormalizedTrade[] = []
  for (const t of trades) {
    if (!t.accountId) { skipCounts.missingAccountId++; continue }
    if (!t.symbol) { skipCounts.missingSymbol++; continue }
    if (!t.conid) { skipCounts.missingConid++; continue }
    if (!t.buySell) { skipCounts.missingSide++; continue }
    if (!t.quantity) { skipCounts.missingQuantity++; continue }
    if (!t.tradePrice) { skipCounts.missingPrice++; continue }
    const tradeId = t.tradeId?.toString()
    const ibExecId = t.ibExecId?.toString()
    const tradeKey = (ibExecId && `ibExec:${ibExecId}`) || (tradeId && `trade:${tradeId}`)
    if (!tradeKey) { skipCounts.missingKey++; continue }
    const commission = Math.abs(t.ibCommission || 0)
    const tax = (tradeId && taxByTradeId.get(tradeId)) || 0
    const when = parseExecTs(t.dateTime || '') || parseTradeDate(t.tradeDate)
    out.push({
      tradeKey,
      ibExecId,
      tradeId,
      accountId: t.accountId!,
      symbol: t.symbol!,
      conid: t.conid!,
      side: t.buySell!,
      quantity: t.quantity!,
      tradePrice: t.tradePrice!,
      fees: commission + Math.abs(tax),
      currency: (t.currency || 'USD').toUpperCase(),
      fxRateToBase: t.fxRateToBase || 1,
      execTs: when || new Date(),
      tradeDate: t.tradeDate,
      listingExchange: t.listingExchange,
      raw: t as unknown as Record<string, unknown>
    })
  }
  return { normalized: out, skipCounts }
}

export function rebuildPositions(baseCcy: string, trades: NormalizedTrade[]): PositionCalc[] {
  // Per account+conid
  const map = new Map<string, PositionCalc>()
  const keyOf = (a: string, c: number) => `${a}:${c}`
  for (const t of trades) {
    const key = keyOf(t.accountId, t.conid)
    const existing = map.get(key) || {
      accountId: t.accountId,
      conid: t.conid,
      symbol: t.symbol,
      currency: t.currency,
      quantity: 0,
      avgCostBase: 0,
      dateAdded: undefined as Date | undefined
    }
    const priceBase = t.tradePrice * (t.fxRateToBase || 1)
    const feesBase = (t.fees || 0) * (t.fxRateToBase || 1)

    if (t.side === 'BUY') {
      if (existing.quantity >= 0) {
        // Increasing long
        const newQty = existing.quantity + t.quantity
        const totalCost = existing.avgCostBase * Math.abs(existing.quantity) + (t.quantity * priceBase + feesBase)
        existing.quantity = newQty
        existing.avgCostBase = newQty !== 0 ? totalCost / Math.abs(newQty) : 0
        if (!existing.dateAdded) existing.dateAdded = t.execTs
      } else {
        // Covering short
        const coverQty = Math.min(t.quantity, Math.abs(existing.quantity))
        const remainingBuy = t.quantity - coverQty
        // Reduce short cost basis proportionally; avg cost unchanged for remaining short
        const newQtyAfterCover = existing.quantity + coverQty // toward zero
        if (remainingBuy > 0) {
          // Crossed to long: reset basis using remaining buy
          existing.quantity = remainingBuy
          existing.avgCostBase = (remainingBuy * priceBase + feesBase) / remainingBuy
          existing.currency = baseCcy
          existing.dateAdded = t.execTs
        } else {
          existing.quantity = newQtyAfterCover
          if (existing.quantity === 0) {
            existing.avgCostBase = 0
            existing.dateAdded = undefined
          }
        }
      }
    } else {
      // SELL
      if (existing.quantity <= 0) {
        // Increasing short (opening/adding)
        const addQty = t.quantity
        const newQty = existing.quantity - addQty
        const proceedsNet = addQty * priceBase - feesBase
        const totalProceeds = existing.avgCostBase * Math.abs(existing.quantity) + proceedsNet
        existing.quantity = newQty
        existing.avgCostBase = Math.abs(newQty) !== 0 ? totalProceeds / Math.abs(newQty) : 0
        if (!existing.dateAdded) existing.dateAdded = t.execTs
      } else {
        // Selling long (reducing/closing)
        const sellQty = Math.min(t.quantity, existing.quantity)
        const remainingSell = t.quantity - sellQty
        const newQtyAfterSell = existing.quantity - sellQty
        existing.quantity = newQtyAfterSell
        if (existing.quantity === 0 && remainingSell === 0) {
          existing.avgCostBase = 0
          existing.dateAdded = undefined
        }
        if (remainingSell > 0) {
          // Crossed to short: set new short basis from remaining sell
          const proceedsNet = remainingSell * priceBase // ignoring sell fees for basis; fees realized
          const addQty = remainingSell
          existing.quantity = -addQty
          existing.avgCostBase = proceedsNet / addQty
          existing.dateAdded = t.execTs
        }
      }
    }
    map.set(key, existing)
  }
  return Array.from(map.values())
}

function parseExecTs(s: string | undefined): Date | undefined {
  if (!s) return undefined
  // IBKR often uses yyyymmdd;HHmmss format
  const m = s.match(/^(\d{8});(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    const y = Number(m[1].slice(0, 4))
    const mo = Number(m[1].slice(4, 6)) - 1
    const d = Number(m[1].slice(6, 8))
    const hh = Number(m[2])
    const mm = Number(m[3])
    const ss = Number(m[4])
    return new Date(Date.UTC(y, mo, d, hh, mm, ss))
  }
  // try ISO
  const dt = new Date(s)
  if (!isNaN(dt.getTime())) return dt
  return undefined
}

function parseTradeDate(s: string | undefined): Date | undefined {
  if (!s) return undefined
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return undefined
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  return new Date(Date.UTC(y, mo, d, 0, 0, 0))
}
