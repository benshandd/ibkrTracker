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

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Portfolio Trades</h1>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-muted-foreground">Base: {data?.base_ccy || 'USD'}</div>
          <div className="text-muted-foreground">Statement: {data?.as_of_statement || '—'}</div>
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
          <h2 className="text-lg font-semibold">Open Positions (Summary)</h2>
          <div className="w-full max-w-sm">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search positions (ticker or name)" className="pl-8" />
            </div>
          </div>
        </div>
        <OpenPositionsTable positions={data?.positions || []} baseCcy={data?.base_ccy || 'USD'} query={query} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cash Balances</h2>
          <div className="text-sm text-muted-foreground">
            Reporting currency: {data?.base_ccy || 'USD'}
          </div>
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
                  Total (converted): {Number.isFinite(total) ? new Intl.NumberFormat(undefined, { style: 'currency', currency: reporting }).format(total) : '—'}
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
