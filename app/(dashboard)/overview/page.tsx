"use client"

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, RefreshCcw, Search } from 'lucide-react'
import OpenPositionsTable, { type Position as TablePosition } from '@/components/positions/OpenPositionsTable'
import CashReportTable from '@/components/cash/CashReportTable'

type Position = TablePosition

type Trade = {
  id: string
  date: string
  account_id?: string
  symbol: string
  side: 'BUY' | 'SELL'
  qty: number
  fill_price: number
  fees: number
  currency: string
  listing_exchange?: string | null
  raw?: any
}

type PortfolioResponse = {
  base_ccy: string
  as_of_statement: string | null
  positions: Position[]
  trades: Trade[]
  counts: Record<string, number>
  error?: string
  needs_action?: string
  diagnostics?: any
  cash_report?: { currency: string; ending_cash: number | null; level_of_detail?: string | null }[]
  cash_base_summary?: number | null
  fx_rates_derived?: Record<string, number>
  account?: { currency?: string | null } | null
}

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json())

export default function OverviewPage() {
  const sp = useSearchParams()
  const apiUrl = `/api/positions`
  const { data, isLoading, mutate } = useSWR<PortfolioResponse>(apiUrl, fetcher)
  const [query, setQuery] = useState('')

  const quotesAsOf = useMemo(() => {
    const ts = (data?.positions || []).map((p) => p.as_of_price).filter(Boolean) as string[]
    if (ts.length === 0) return null
    return ts.sort().slice(-1)[0]
  }, [data?.positions])

  // Sum of open positions' value in base currency
  const positionsTotalBase = useMemo(() => {
    try {
      const vals = (data?.positions || []).map((u) => {
        const pos = u.positionValue != null
          ? u.positionValue
          : (u.unitMarkPrice != null ? u.unitMarkPrice * u.qty : null)
        const fx = u.fxToBase ?? 1
        return pos != null && Number.isFinite(pos) ? (pos as number) * fx : null
      })
      const sum = vals.reduce((s, v) => (v != null && Number.isFinite(v) ? s + (v as number) : s), 0)
      return Number.isFinite(sum) ? sum : null
    } catch {
      return null
    }
  }, [data?.positions])

  // Cash total in base (prefer server BASE_SUMMARY, else convert per-currency rows)
  const cashTotalBase = useMemo(() => {
    const base = (data?.base_ccy || 'USD').toUpperCase()
    const baseSummary = data?.cash_base_summary
    if (baseSummary != null && Number.isFinite(baseSummary)) return baseSummary as number
    const rows = (data?.cash_report || [])
    const fx = data?.fx_rates_derived || {}
    const vals = rows.map((r) => {
      const code = (r.currency || '').toUpperCase()
      const rate = code === base ? 1 : fx[code]
      const amt = r.ending_cash
      return amt != null && rate != null ? amt * rate : null
    })
    const sum = vals.reduce((s, v) => (v != null && Number.isFinite(v) ? s + (v as number) : s), 0)
    return Number.isFinite(sum) ? sum : null
  }, [data?.cash_report, data?.cash_base_summary, data?.fx_rates_derived, data?.base_ccy])

  const accountTotalBase = useMemo(() => {
    if (positionsTotalBase == null && cashTotalBase == null) return null
    const p = positionsTotalBase || 0
    const c = cashTotalBase || 0
    const total = p + c
    return Number.isFinite(total) ? total : null
  }, [positionsTotalBase, cashTotalBase])

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-muted-foreground">Base: {data?.base_ccy || 'USD'}</div>
          <div className="text-muted-foreground">Statement: {data?.as_of_statement || '—'}</div>
          <div className="flex items-center">
            <div className="ml-2 border rounded px-3 py-1 bg-background">
              <div className="text-[10px] uppercase text-muted-foreground">Account Value</div>
              <div className="text-sm font-medium">
                {accountTotalBase != null
                  ? new Intl.NumberFormat(undefined, { style: 'currency', currency: data?.base_ccy || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(accountTotalBase)
                  : '—'}
              </div>
            </div>
          </div>
          
          <Button variant="outline" onClick={async () => { await fetch('/api/positions/refresh', { method: 'POST' }); mutate() }} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refreshing
              </>
            ) : (
              <>
                <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {data?.error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded">
          <div>
            {data.error}
            {data.needs_action === 'RENEW_FLEX_TOKEN' && ' — Please renew your IBKR Flex token.'}
          </div>
          <Button size="sm" variant="outline" onClick={() => mutate()} disabled={isLoading}>Retry</Button>
        </div>
      )}

      

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Open Positions</h2>
          <div className="w-full max-w-sm">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search positions (ticker or name)" className="pl-8" />
            </div>
          </div>
        </div>
        <OpenPositionsTable positions={data?.positions || []} baseCcy={data?.base_ccy || 'USD'} query={query} accountTotalBase={accountTotalBase ?? null} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cash Balances</h2>
        </div>
        {(() => {
          const reporting = (data?.base_ccy || 'USD').toUpperCase()
          const rows = (data?.cash_report || []).filter((r) => r.currency && r.currency !== 'BASE_SUMMARY')
          const fx = data?.fx_rates_derived || {}
          const enriched = rows.map((r) => {
            const code = r.currency.toUpperCase()
            const rate = code === reporting ? 1 : fx[code]
            const converted = r.ending_cash != null && rate != null ? r.ending_cash * rate : null
            return { currency: code, balance: r.ending_cash, balanceInReporting: converted }
          })
          const total = enriched.reduce((s, r) => (r.balanceInReporting != null ? s + (r.balanceInReporting as number) : s), 0)
          const baseSummary = data?.cash_base_summary ?? null
          const mismatch = baseSummary != null && Number.isFinite(total) && Math.abs((baseSummary as number) - total) > 0.01
          return (
            <div className="space-y-2">
              <CashReportTable
                rows={enriched}
                reportingCcy={reporting}
              />
              <div className="text-sm text-muted-foreground flex items-center justify-between">
                <div>
                  Total: {Number.isFinite(total) ? new Intl.NumberFormat(undefined, { style: 'currency', currency: reporting }).format(total) : '—'}
                </div>
                <div>
                  BASE_SUMMARY: {baseSummary != null ? new Intl.NumberFormat(undefined, { style: 'currency', currency: reporting }).format(baseSummary) : '—'}
                  {mismatch && <span className="ml-2 text-amber-600">(approximate FX — values may not match exactly)</span>}
                </div>
              </div>
            </div>
          )
        })()}
      </section>

      <div className="text-xs text-muted-foreground flex items-center justify-end gap-4">
        <div>Quotes as of {quotesAsOf ? new Date(quotesAsOf).toLocaleTimeString() : '—'}</div>
        <div>Statement generated at {data?.as_of_statement ? new Date(data.as_of_statement).toLocaleString() : '—'}</div>
      </div>
    </main>
  )
}
