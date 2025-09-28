"use client"

import { useMemo } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export type CashRow = {
  currency: string
  balance: number | null
  balanceInReporting: number | null
}

function formatMoney(n: number | null | undefined, ccy: string) {
  if (n == null || !Number.isFinite(n)) return '—'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy }).format(n)
  } catch {
    // Fallback for non-ISO codes like BASE_SUMMARY
    return `${ccy} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
}

function currencyName(code: string) {
  try {
    // Falls back gracefully if not supported
    // @ts-ignore
    const dn = new Intl.DisplayNames(undefined, { type: 'currency' })
    const name = dn.of(code)
    return name || code
  } catch {
    return code
  }
}

export function CashReportTable({ rows, reportingCcy }: { rows: CashRow[]; reportingCcy: string }) {
  const data: CashRow[] = useMemo(() => rows, [rows])

  const columns: ColumnDef<CashRow>[] = [
    {
      header: 'Currency',
      accessorKey: 'currency',
      cell: ({ row }) => {
        const code = row.original.currency
        return (
          <div className="flex flex-col">
            <span className="font-medium">{code}</span>
            <span className="text-xs text-muted-foreground">{currencyName(code)}</span>
          </div>
        )
      },
    },
    {
      header: 'Native Balance',
      accessorKey: 'balance',
      cell: ({ row }) => formatMoney(row.original.balance, row.original.currency),
    },
    {
      header: `Balance in ${reportingCcy}`,
      accessorKey: 'balanceInReporting',
      cell: ({ row }) => formatMoney(row.original.balanceInReporting, reportingCcy),
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((header) => (
              <TableHead key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="text-center text-sm text-muted-foreground py-8">
              No cash rows found
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

export default CashReportTable
