import 'server-only'

import { getFlexStatementXML, FlexError } from '@/lib/portfolio/flex'

export const dynamic = 'force-dynamic'

export default async function Overview2Page() {
  const token = process.env.IBKR_FLEX_TOKEN
  const queryId = process.env.IBKR_QUERY_ID
  const endpointPref = (process.env.IBKR_FLEX_ENDPOINT || 'web').toLowerCase()

  let xml: string | null = null
  let error: string | null = null

  if (!token || !queryId) {
    error = 'Missing IBKR_FLEX_TOKEN or IBKR_QUERY_ID in environment.'
  } else {
    try {
      xml = await getFlexStatementXML({ token, queryId })
    } catch (e: any) {
      if (e instanceof FlexError) {
        error = `${e.message}${e.code ? ` (code: ${e.code})` : ''}`
      } else {
        error = e?.message || 'Unexpected error while fetching Flex XML.'
      }
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
      <h1 className="text-xl font-semibold">Raw Flex XML</h1>
      <div className="text-sm text-muted-foreground">Endpoint preference: {endpointPref || 'web'}</div>
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : (
        <pre className="text-xs bg-muted/40 p-3 rounded border overflow-x-auto whitespace-pre-wrap break-words">
{xml}
        </pre>
      )}
    </main>
  )
}
