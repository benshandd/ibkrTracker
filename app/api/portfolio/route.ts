import { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { getUser } from '@/lib/db/queries'
import { db } from '@/lib/db/drizzle'
import { positions, trades as tradesTable } from '@/lib/db/schema'
import { getFlexStatementXML, FlexError } from '@/lib/portfolio/flex'
import { parseFlexXML } from '@/lib/portfolio/xml'
import { normalizeTradesWithStats, rebuildPositions } from '@/lib/portfolio/normalize'
import { desc, eq } from 'drizzle-orm'

const qSchema = z.object({
  accountId: z.string().optional(),
  since: z.string().optional(),
  symbols: z.array(z.string()).optional()
})

export async function GET(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const paramsRaw: any = { symbols: url.searchParams.getAll('symbols') }
    for (const [k, v] of url.searchParams.entries()) {
      if (k !== 'symbols') paramsRaw[k] = v
    }
    const params = qSchema.parse(paramsRaw)

    const token = process.env.IBKR_FLEX_TOKEN
    const queryId = process.env.IBKR_QUERY_ID
    const baseCcy = (process.env.BASE_CCY || 'USD').toUpperCase()
    const debugFlag = url.searchParams.get('debug') === '1' || process.env.PORTFOLIO_DEBUG === '1'
    // Fetch statement XML from IBKR or local file (debug only)
    const diagnostics: any = { stages: {} }
    let xml: string
    const xmlPath = url.searchParams.get('xml_path')
    const allowFile = (process.env.PORTFOLIO_ALLOW_FILE === '1') && (process.env.NODE_ENV !== 'production')
    // If not using local file path, enforce IBKR env presence
    if (!(debugFlag && allowFile && xmlPath) && (!token || !queryId)) {
      return Response.json({ error: 'Missing IBKR_FLEX_TOKEN or IBKR_QUERY_ID' }, { status: 500 })
    }
    if (debugFlag && allowFile && xmlPath) {
      xml = await readFile(xmlPath, 'utf8')
      diagnostics.stages.flex = { ok: true, xmlBytes: xml.length, source: 'file', xmlPath }
    } else {
      xml = await getFlexStatementXML({ token: token!, queryId: queryId! })
      diagnostics.stages.flex = { ok: true, xmlBytes: xml.length, source: 'ibkr' }
    }
    const parsed = parseFlexXML(xml)
    diagnostics.stages.parse = { ok: true, info: parsed.info, stats: parsed.stats }
    const { normalized, skipCounts } = normalizeTradesWithStats(parsed.trades, parsed.taxes)
    diagnostics.stages.normalize = { ok: true, skipCounts, normalizedCount: normalized.length }

    // Try DB writes/reads; if unavailable (e.g., migrations not run), fall back to in-memory only
    let inserted = 0
    let allTrades: any[] | null = null
    let dbAvailable = true
    try {
      for (const t of normalized) {
        if (params.accountId && t.accountId !== params.accountId) continue
        try {
          await db
            .insert(tradesTable)
            .values({
              tradeKey: t.tradeKey,
              ibExecId: t.ibExecId,
              tradeId: t.tradeId,
              accountId: t.accountId,
              symbol: t.symbol,
              conid: t.conid,
              side: t.side,
              quantity: t.quantity,
              tradePrice: t.tradePrice,
              fees: t.fees,
              currency: t.currency,
              fxRateToBase: t.fxRateToBase,
              execTs: t.execTs,
              tradeDate: t.tradeDate,
              listingExchange: t.listingExchange,
              raw: t.raw as any
            })
            .onConflictDoNothing()
          inserted++
        } catch (_) {
          // ignore duplicates or minor issues
        }
      }

      if (params.accountId) {
        allTrades = await db
          .select()
          .from(tradesTable)
          .where(eq(tradesTable.accountId, params.accountId))
          .orderBy(desc(tradesTable.execTs))
      } else {
        allTrades = await db
          .select()
          .from(tradesTable)
          .orderBy(desc(tradesTable.execTs))
      }
    } catch (e: any) {
      dbAvailable = false
      diagnostics.stages.db = { ok: false, error: e?.message || String(e) }
      allTrades = null
    }

    const tradeSource = allTrades ?? normalized.map((t) => ({
      tradeKey: t.tradeKey,
      ibExecId: t.ibExecId,
      tradeId: t.tradeId,
      accountId: t.accountId,
      symbol: t.symbol,
      conid: t.conid,
      side: t.side,
      quantity: t.quantity,
      tradePrice: t.tradePrice,
      fees: t.fees,
      currency: t.currency,
      fxRateToBase: t.fxRateToBase,
      execTs: t.execTs,
      tradeDate: t.tradeDate,
      listingExchange: t.listingExchange,
      raw: t.raw
    }))

    const posCalcs = rebuildPositions(baseCcy, tradeSource)

    // Upsert positions
    if (dbAvailable) {
      for (const p of posCalcs) {
        await db
          .insert(positions)
          .values({
            accountId: p.accountId,
            conid: p.conid,
            symbol: p.symbol,
            currency: p.currency,
            quantity: p.quantity,
            avgCostBase: p.avgCostBase,
            dateAdded: p.dateAdded
          })
          .onConflictDoUpdate({
            target: [positions.accountId, positions.conid],
            set: {
              symbol: p.symbol,
              currency: p.currency,
              quantity: p.quantity,
              avgCostBase: p.avgCostBase,
              dateAdded: p.dateAdded
            }
          })
      }
    }
    diagnostics.stages.positions = { ok: true, count: posCalcs.length, dbAvailable }

    // Price enrichment from OpenPositions markPrice (no external quotes)
    const asOfIso = parseWhenGenerated(parsed.info.whenGenerated)
    const priceByConid = new Map<number, { priceBase: number; sourceCcy: string; fx: number }>()
    const nameByConid = new Map<number, string>()
    const opByConid = new Map<number, any>()
    for (const op of parsed.openPositions) {
      if (op.conid != null && op.markPrice != null) {
        const fx = op.fxRateToBase || 1
        priceByConid.set(op.conid, { priceBase: op.markPrice * fx, sourceCcy: (op.currency || baseCcy).toUpperCase(), fx })
      }
      if (op.conid != null && op.description) {
        nameByConid.set(op.conid, op.description)
      }
      if (op.conid != null) {
        opByConid.set(op.conid, op)
      }
    }
    diagnostics.stages.pricing = { ok: true, source: 'open_positions', priced: priceByConid.size }

    // Compute MV/PL/weights
    const enriched = posCalcs.map((p) => {
      const q = p.conid != null ? priceByConid.get(p.conid) : undefined
      const price = q?.priceBase
      const priceCcy = baseCcy
      const asOfPrice = asOfIso
      const priceStatus: 'fresh' | 'stale' | 'unavailable' = q ? 'fresh' : 'unavailable'
      const mv = price != null ? price * p.quantity : null
      const plAbs = price != null ? (price - p.avgCostBase) * p.quantity : null
      const plPct = price != null && p.avgCostBase !== 0 ? price / p.avgCostBase - 1 : null
      return {
        account_id: p.accountId,
        symbol: p.symbol,
        conid: p.conid,
        name: (p.conid != null ? nameByConid.get(p.conid) : undefined) || undefined,
        side: p.quantity >= 0 ? 'long' : 'short',
        qty: p.quantity,
        avg_cost: p.avgCostBase,
        currency: p.currency,
        base_ccy: baseCcy,
        current_price: price ?? null,
        current_price_ccy: priceCcy,
        price_status: priceStatus,
        as_of_price: asOfPrice || null,
        mv,
        pl_abs: plAbs,
        pl_pct: plPct,
        date_added: p.dateAdded ? p.dateAdded.toISOString() : null,
        // OpenPosition sourced fields for UI calculations/mapping to IBKR
        unitMarkPrice: (p.conid != null ? opByConid.get(p.conid)?.markPrice : undefined) ?? null,
        unitCostBasisPrice: (p.conid != null ? opByConid.get(p.conid)?.costBasisPrice : undefined) ?? null,
        totalCostBasisMoney: (p.conid != null ? opByConid.get(p.conid)?.costBasisMoney : undefined) ?? null,
        positionValue: (p.conid != null ? opByConid.get(p.conid)?.positionValue : undefined) ?? (p.conid != null && opByConid.get(p.conid)?.markPrice != null ? (opByConid.get(p.conid).markPrice as number) * p.quantity : null),
        posCcy: (p.conid != null ? opByConid.get(p.conid)?.currency : undefined) || p.currency,
        fxToBase: (p.conid != null ? opByConid.get(p.conid)?.fxRateToBase : undefined) ?? 1,
        report_date: (p.conid != null ? opByConid.get(p.conid)?.reportDate : undefined) ?? null,
        date_open: (p.conid != null ? (opByConid.get(p.conid)?.openDateTime || opByConid.get(p.conid)?.holdingPeriodDateTime) : undefined) ?? null
      }
    })

    const mvSum = enriched.filter((e) => e.mv != null && e.price_status === 'fresh').reduce((s, e) => s + (e.mv as number), 0)
    const withWeights = enriched.map((e) => ({
      ...e,
      weight_pct: e.mv != null && mvSum > 0 ? (e.mv as number) / mvSum : null
    }))

    // Prefer reporting currency from AccountInformation if present
    const reportingCcy = (parsed.account?.currency || baseCcy).toUpperCase()

    // Derive rough FX rates from OpenPositions (median fxRateToBase by source currency)
    const fxSamples: Record<string, number[]> = {}
    for (const op of parsed.openPositions) {
      const c = (op.currency || '').toUpperCase()
      const fx = op.fxRateToBase
      if (!c || fx == null || !Number.isFinite(fx)) continue
      fxSamples[c] = fxSamples[c] || []
      fxSamples[c].push(fx)
    }
    const fxDerived: Record<string, number> = {}
    for (const [c, arr] of Object.entries(fxSamples)) {
      const sorted = arr.slice().sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
      fxDerived[c] = median
    }
    fxDerived[reportingCcy] = 1

    // Extract cash report, keep only currency + endingCash; BASE_SUMMARY row captured for cross-check
    const cashReport = (parsed.cashReport || []).map((r) => ({
      currency: (r.currency || '').toUpperCase(),
      ending_cash: r.endingCash ?? null,
      level_of_detail: r.levelOfDetail || null
    }))
    const baseSummary = cashReport.find((r) => r.currency === 'BASE_SUMMARY')?.ending_cash ?? null

    const resp: any = {
      base_ccy: reportingCcy,
      as_of_statement: parsed.info.whenGenerated || null,
      positions: withWeights,
      trades: normalized.map((t) => {
        const q = t.conid != null ? priceByConid.get(t.conid) : undefined
        const price = q?.priceBase
        const priceCcy = baseCcy
        const asOfPrice = asOfIso
        const priceStatus: 'fresh' | 'stale' | 'unavailable' = q ? 'fresh' : 'unavailable'
        return {
          id: t.tradeKey,
          date: t.execTs.toISOString(),
          account_id: t.accountId,
          symbol: t.symbol,
          side: t.side,
          qty: t.quantity,
          fill_price: t.tradePrice,
          fees: t.fees,
          currency: t.currency,
          listing_exchange: t.listingExchange,
          current_price: price ?? null,
          current_price_ccy: priceCcy,
          as_of_price: asOfPrice || null,
          price_status: priceStatus,
          raw: t.raw
        }
      }),
      counts: { parsed_trades: normalized.length, upserted_trades: inserted, positions: withWeights.length },
      cash_report: cashReport,
      cash_base_summary: baseSummary,
      fx_rates_derived: fxDerived,
      account: parsed.account || null
    }
    if (normalized.length === 0) {
      resp.warning = 'No equities executions found. Ensure your Flex Query includes Trades with levelOfDetail=EXECUTION and assetCategory STK/ETF.'
    }
    if (debugFlag) resp.diagnostics = diagnostics

    return Response.json(resp)
  } catch (e: any) {
    if (e instanceof FlexError) {
      const needsAction = /expired/i.test(e.message) || e.code === 'TOKEN_EXPIRED' ? 'RENEW_FLEX_TOKEN' : undefined
      return Response.json({ error: e.message, needs_action: needsAction }, { status: 400 })
    }
    return Response.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

function parseWhenGenerated(s?: string | null): string | null {
  if (!s) return null
  // Format: YYYYMMDD;HHMMSS
  const m = s.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})$/)
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  // Treat as UTC; IBKR times are not timezone-annotated
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}Z`
  const dt = new Date(iso)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}
