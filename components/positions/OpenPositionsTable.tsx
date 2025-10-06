"use client"

import * as React from 'react'
import { useMemo } from 'react'
import * as ReactTable from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { ArrowUpDown } from 'lucide-react'

export type Position = {
  account_id: string
  symbol: string
  conid: number
  name?: string
  side: 'long' | 'short'
  qty: number
  avg_cost: number
  currency: string
  base_ccy: string
  current_price: number | null
  current_price_ccy: string | null
  price_status: 'fresh' | 'stale' | 'unavailable'
  as_of_price: string | null
  mv: number | null
  pl_abs: number | null
  pl_pct: number | null
  weight_pct: number | null
  date_added: string | null
  // OpenPosition sourced fields
  unitMarkPrice: number | null
  unitCostBasisPrice: number | null
  totalCostBasisMoney: number | null
  positionValue: number | null
  posCcy?: string
  fxToBase?: number | null
  report_date?: string | null
  date_open?: string | null
}

type Row = Position

type ColMeta = { align?: 'left' | 'right'; mono?: boolean; colorizePL?: boolean; flex?: boolean }

export function OpenPositionsTable({ positions, baseCcy, query, accountTotalBase }: { positions: Position[]; baseCcy: string, query?: string, accountTotalBase?: number | null }) {
  const rows: Row[] = useMemo(() => {
    const base = (positions || [])
      // non-zero quantity
      .filter((p) => Math.abs(p.qty) !== 0)
      // only include items that clearly came from Flex <OpenPositions>
      .filter((p) => (
        p.unitMarkPrice != null ||
        p.totalCostBasisMoney != null ||
        p.report_date != null ||
        p.date_open != null ||
        p.positionValue != null
      ))
    const q = (query || '').trim().toLowerCase()
    if (!q) return base
    return base.filter((p) =>
      p.symbol.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)
    )
  }, [positions, query])

  const [sorting, setSorting] = React.useState<any>([])
  const [columnVisibility, setColumnVisibility] = React.useState<Record<string, boolean>>({})

  // Breakpoints: xs < 640, sm >=640 <768, md+ >=768
  React.useEffect(() => {
    const apply = () => {
      const w = typeof window !== 'undefined' ? window.innerWidth : 1024
      if (w < 640) {
        setColumnVisibility({ bought: false, side: false, date: false })
      } else if (w < 768) {
        setColumnVisibility({ bought: true, side: false, date: true })
      } else {
        setColumnVisibility({})
      }
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  const columns = React.useMemo(
    () => [
      {
        id: 'ticker',
        header: 'Ticker',
        accessorKey: 'symbol',
        size: 80,
        minSize: 80,
        maxSize: 120,
        cell: ({ row }) => <span className="font-medium">{row.original.symbol}</span>,
        meta: { align: 'left' },
      },
      {
        id: 'name',
        header: 'Stock / Instrument',
        accessorKey: 'name',
        cell: ({ row }) => (
          <span title={row.original.name || row.original.symbol} className="truncate block">
            {row.original.name || '—'}
          </span>
        ),
        size: 280,
        minSize: 280,
        maxSize: 560,
        meta: { align: 'left', flex: true },
      },
      {
        id: 'bought',
        header: 'Bought $',
        accessorKey: 'unitCostBasisPrice',
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.unitCostBasisPrice != null ? fmtCurrencyFixed(row.original.unitCostBasisPrice, row.original.posCcy || row.original.currency, 2) : '—'}
          </div>
        ),
        size: 120,
        minSize: 120,
        maxSize: 160,
        meta: { align: 'right' },
      },
      {
        id: 'current',
        header: 'Current $',
        accessorKey: 'unitMarkPrice',
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {row.original.unitMarkPrice != null ? fmtCurrencyFixed(row.original.unitMarkPrice, row.original.posCcy || row.original.currency, 2) : '—'}
          </div>
        ),
        size: 120,
        minSize: 120,
        maxSize: 160,
        meta: { align: 'right' },
      },
      {
        id: 'position_base',
        header: () => `Value (${baseCcy})`,
        accessorKey: 'position_base_computed',
        accessorFn: (u) => {
          const pos = u.positionValue != null
            ? u.positionValue
            : (u.unitMarkPrice != null ? u.unitMarkPrice * u.qty : null)
          const fx = u.fxToBase ?? 1
          return pos != null ? pos * fx : null
        },
        size: 140,
        minSize: 130,
        maxSize: 200,
        meta: { align: 'right', mono: true },
        cell: ({ row }) => {
          const u = row.original
          const pos = u.positionValue != null
            ? u.positionValue
            : (u.unitMarkPrice != null ? u.unitMarkPrice * u.qty : null)
          const fx = u.fxToBase ?? 1
          const base = pos != null ? pos * fx : null
          return (
            <div className="text-right tabular-nums">{base != null ? fmtCurrencyFixed(base, baseCcy, 2) : '—'}</div>
          )
        },
      },
      {
        id: 'pl_abs',
        header: () => `P/L (${baseCcy})`,
        accessorKey: 'pl_abs_base_computed',
        accessorFn: (u) => {
          const plAbsPos = u.positionValue != null && u.totalCostBasisMoney != null
            ? u.positionValue - u.totalCostBasisMoney
            : (u.unitMarkPrice != null && u.unitCostBasisPrice != null ? (u.unitMarkPrice - u.unitCostBasisPrice) * u.qty : null)
          const fx = u.fxToBase ?? 1
          return plAbsPos != null ? plAbsPos * fx : null
        },
        size: 120,
        minSize: 120,
        maxSize: 160,
        meta: { align: 'right', mono: true, colorizePL: true },
        cell: ({ row }) => {
          const u = row.original
          const plAbsPos = u.positionValue != null && u.totalCostBasisMoney != null
            ? u.positionValue - u.totalCostBasisMoney
            : (u.unitMarkPrice != null && u.unitCostBasisPrice != null ? (u.unitMarkPrice - u.unitCostBasisPrice) * u.qty : null)
          const fx = u.fxToBase ?? 1
          const plAbsBase = plAbsPos != null ? plAbsPos * fx : null
          return (
            <div className={`text-right tabular-nums ${numClass(plAbsBase)}`}>
              {plAbsBase != null ? fmtCurrencyFixed(plAbsBase, baseCcy, 2) : '—'}
            </div>
          )
        },
      },
      {
        id: 'pl_pct',
        header: 'P/L %',
        accessorKey: 'pl_pct_unit_computed',
        accessorFn: (u) => (u.unitMarkPrice != null && u.unitCostBasisPrice != null && u.unitCostBasisPrice !== 0
          ? u.unitMarkPrice / u.unitCostBasisPrice - 1
          : null),
        size: 110,
        minSize: 110,
        maxSize: 140,
        meta: { align: 'right', mono: true },
        cell: ({ row }) => {
          const u = row.original
          const pct = u.unitMarkPrice != null && u.unitCostBasisPrice != null && u.unitCostBasisPrice !== 0
            ? u.unitMarkPrice / u.unitCostBasisPrice - 1
            : null
          return (
            <div className={`text-right tabular-nums ${numClass(pct)}`}>{pct != null ? fmtPct(pct) : '—'}</div>
          )
        },
      },
      {
        id: 'side',
        header: 'Long/Short',
        accessorKey: 'side',
        size: 90,
        minSize: 80,
        maxSize: 120,
        cell: ({ row }) => <span className="capitalize">{row.original.side}</span>,
        meta: { align: 'left' },
      },
      {
        id: 'weight',
        header: 'Weight %',
        accessorKey: 'weight_pct_account',
        accessorFn: (u) => {
          const pos = u.positionValue != null
            ? u.positionValue
            : (u.unitMarkPrice != null ? u.unitMarkPrice * u.qty : null)
          const fx = u.fxToBase ?? 1
          const base = pos != null ? pos * fx : null
          const total = accountTotalBase ?? null
          if (base == null || total == null || !Number.isFinite(total) || total === 0) return null
          return (base as number) / (total as number)
        },
        size: 110,
        minSize: 110,
        maxSize: 140,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const u = row.original
          const pos = u.positionValue != null
            ? u.positionValue
            : (u.unitMarkPrice != null ? u.unitMarkPrice * u.qty : null)
          const fx = u.fxToBase ?? 1
          const base = pos != null ? pos * fx : null
          const total = accountTotalBase ?? null
          const pct = base != null && total != null && Number.isFinite(total) && total !== 0 ? (base as number) / (total as number) : null
          return <div className="text-right tabular-nums">{pct != null ? fmtPct(pct) : '—'}</div>
        },
      },
      {
        id: 'date',
        header: 'Date Added',
        accessorKey: 'date_any',
        accessorFn: (u) => u.date_open || u.date_added || u.report_date || null,
        size: 140,
        minSize: 120,
        maxSize: 180,
        meta: { align: 'right', mono: true },
        cell: ({ row }) => {
          const d = row.original.date_open || row.original.date_added || row.original.report_date
          const fmt = (s: string) => {
            const dt = new Date(s)
            if (Number.isNaN(dt.getTime())) return '—'
            const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
            const dd = String(dt.getUTCDate()).padStart(2, '0')
            const yy = String(dt.getUTCFullYear()).slice(-2)
            return `${mm}/${dd}/${yy}`
          }
          return <span>{d ? fmt(d) : '—'}</span>
        },
      },
    ],
    [baseCcy]
  )

  const table = ReactTable.useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    columnResizeMode: 'onChange',
    getCoreRowModel: (ReactTable as any).getCoreRowModel(),
    getSortedRowModel: (ReactTable as any).getSortedRowModel(),
  })

  // Build grid template columns based on current visible headers/columns
  const headerGroup = table.getHeaderGroups()[0]
  const headers = headerGroup ? headerGroup.headers.filter((h) => h.column.getIsVisible()) : []
  const gridCols = headers
    .map((h) => {
      const c = h.column
      const min = (c.columnDef as any).minSize ?? c.getSize()
      const max = (c.columnDef as any).maxSize ?? c.getSize()
      if ((c.columnDef as any).meta?.flex) {
        return `minmax(${min}px, 1fr)`
      }
      const w = Math.max(c.getSize(), min)
      return `${Math.min(w, max)}px`
    })
    .join(' ')

  const minWidthPx = headers.reduce((s, h) => s + ((h.column.columnDef as any).minSize ?? h.getSize()), 0)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full" style={{ minWidth: `${minWidthPx}px` }}>
        {/* Header */}
        <div className="grid border-b text-xs uppercase text-muted-foreground" style={{ gridTemplateColumns: gridCols }}>
          {headers.map((h) => (
            <div key={h.id} className={`px-2 py-2 ${(h.column.columnDef.meta as ColMeta | undefined)?.align === 'right' ? 'text-right' : 'text-left'} relative select-none`}>
              {h.column.getCanSort() ? (
                <Button
                  variant="ghost"
                  className={`px-0 font-normal h-8 w-full ${(h.column.columnDef.meta as ColMeta | undefined)?.align === 'right' ? 'justify-end' : 'justify-start'}`}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {ReactTable.flexRender(h.column.columnDef.header, h.getContext())}
                  <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                </Button>
              ) : (
                <div className={(h.column.columnDef.meta as ColMeta | undefined)?.align === 'right' ? 'w-full text-right' : undefined}>
                  {ReactTable.flexRender(h.column.columnDef.header, h.getContext())}
                </div>
              )}
              {h.column.getCanResize() && (
                <div
                  onMouseDown={h.getResizeHandler()}
                  onTouchStart={h.getResizeHandler()}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none"
                />
              )}
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y">
          {table.getRowModel().rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No open positions found.</div>
          ) : (
            table.getRowModel().rows.map((row) => (
              <div key={row.id} className="grid items-center" style={{ gridTemplateColumns: gridCols }}>
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className={`px-2 py-2 ${cell.column.columnDef.meta?.align === 'right' ? 'text-right' : 'text-left'} ${cell.column.columnDef.meta?.mono ? 'tabular-nums' : ''}`}
                  >
                    {ReactTable.flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function numClass(n?: number | null) {
  if (n == null) return ''
  if (n > 0) return 'text-green-600'
  if (n < 0) return 'text-red-600'
  return ''
}

function fmtCurrency(n: number, ccy?: string | null) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy || 'USD', maximumFractionDigits: 4 }).format(n)
}
function fmtCurrencyFixed(n: number, ccy?: string | null, digits = 2) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy || 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
}
function fmtPct(x: number) {
  return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(x)
}

export default OpenPositionsTable
