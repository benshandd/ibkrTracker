import 'server-only'

// IBKR exposes two Flex endpoints. We'll support both per docs:
// - Universal Servlet: https://gdcdyn.interactivebrokers.com/Universal/servlet
//   - SendRequest:   /FlexStatementService.SendRequest?t=TOKEN&q=QUERY_ID
//   - GetStatement:  /FlexStatementService.GetStatement?t=TOKEN&v=REFERENCE_CODE
//   Responses may be plain text "200|... Reference Code: XYZ" or XML error wrappers.
// - Flex Web Service: https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService
//   - SendRequest:   /SendRequest?t=TOKEN&q=QUERY_ID&v=3
//   - GetStatement:  /GetStatement?t=TOKEN&q=REFERENCE_CODE&v=3
//   Responses are XML like <FlexWebServiceResponse><Status>Success</Status>...</FlexWebServiceResponse>
const FLEX_BASE_UNIVERSAL = 'https://gdcdyn.interactivebrokers.com/Universal/servlet'
const FLEX_BASE_WEBSERVICE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService'

type SendRequestOK = {
  referenceCode: string
}

export class FlexError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

const DEFAULT_UA = process.env.IBKR_USER_AGENT || 'IBKRFinanceTracker/1.0.0'

async function fetchWithTimeout(url: string, opts: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 12000, ...rest } = opts
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = new Headers(rest.headers || {})
    if (!headers.has('User-Agent')) headers.set('User-Agent', DEFAULT_UA)
    if (!headers.has('Accept')) headers.set('Accept', 'application/xml, text/plain;q=0.9, */*;q=0.8')
    const res = await fetch(url, { ...rest, headers, signal: controller.signal, cache: 'no-store' })
    return res
  } finally {
    clearTimeout(id)
  }
}

function parseSendRequestBody(body: string): SendRequestOK {
  const text = (body || '').trim()

  // Detect HTML/login responses early
  if (/<!DOCTYPE\s+html/i.test(text) || /<html[\s>]/i.test(text)) {
    throw new FlexError('Flex endpoint returned HTML (possible auth/routing issue). Check token/IP and try again.', 'HTML_RESPONSE')
  }

  // Pattern: numeric code pipe message (official format)
  const pipeMatch = text.match(/^(\d+)\|(.*)$/s)
  if (pipeMatch) {
    const statusCode = parseInt(pipeMatch[1], 10)
    const message = pipeMatch[2]?.trim() || ''
    if (statusCode !== 200) {
      if (/expired/i.test(message)) throw new FlexError('Flex token expired', 'TOKEN_EXPIRED')
      throw new FlexError(`SendRequest error ${statusCode}: ${message}`, String(statusCode))
    }
    // Try to extract reference code from message
    const ref1 = message.match(/reference\s*code[^A-Za-z0-9]{0,3}(?:is)?\s*[:=]?\s*([A-Za-z0-9-]+)/i)
    if (ref1?.[1]) return { referenceCode: ref1[1] }
    const ref2 = message.match(/\b([A-Za-z0-9]{6,})\b/g)
    if (ref2 && ref2.length) return { referenceCode: ref2[ref2.length - 1] }
  }

  // Flex Web Service XML wrapper
  if (/<FlexWebServiceResponse/i.test(text)) {
    const status = text.match(/<Status>([^<]+)<\/Status>/i)?.[1]?.trim()
    if (/fail/i.test(status || '')) {
      const msg = text.match(/<ErrorMessage>([\s\S]*?)<\/ErrorMessage>/i)?.[1]?.trim()
      const code = text.match(/<ErrorCode>([^<]+)<\/ErrorCode>/i)?.[1]?.trim()
      throw new FlexError(msg || 'IBKR Flex error', code)
    }
    const ref = text.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/i)?.[1]?.trim()
    if (ref) return { referenceCode: ref }
  }

  // XML formats (other variants)
  const xmlAttr = text.match(/referenceCode\s*=\s*"([^"]+)"/i)
  if (xmlAttr?.[1]) return { referenceCode: xmlAttr[1] }
  const xmlNode = text.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/i)
  if (xmlNode?.[1]) return { referenceCode: xmlNode[1] }

  // Plain text variants
  const refPlain = text.match(/reference\s*code[^A-Za-z0-9]{0,3}(?:is)?\s*[:=]?\s*([A-Za-z0-9-]+)/i)
  if (refPlain?.[1]) return { referenceCode: refPlain[1] }

  // Explicit Flex error XML
  if (text.includes('<FlexErrorResponse')) {
    const msg = text.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/)?.[1]
    const code = text.match(/<ErrorCode>([^<]+)<\/ErrorCode>/)?.[1]
    throw new FlexError(msg || 'IBKR Flex error', code)
  }

  if (/expired/i.test(text)) {
    throw new FlexError('Flex token expired', 'TOKEN_EXPIRED')
  }

  throw new FlexError('Unexpected SendRequest response format', 'UNEXPECTED_FORMAT')
}

export async function getFlexStatementXML({ token, queryId }: { token: string; queryId: string }) {
  const prefer = (process.env.IBKR_FLEX_ENDPOINT || '').toLowerCase() as 'web' | 'universal' | ''

  const tryUniversal = async () => {
    // Step 1: SendRequest -> referenceCode
    const sendUrl = `${FLEX_BASE_UNIVERSAL}/FlexStatementService.SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}`
    const sendRes = await fetchWithTimeout(sendUrl, { method: 'GET' })
    const sendBody = await sendRes.text()
    if (!sendRes.ok) throw new FlexError(`SendRequest failed: ${sendRes.status} ${sendRes.statusText}`)
    let referenceCode: string
    try {
      ;({ referenceCode } = parseSendRequestBody(sendBody))
    } catch (_) {
      // One quick retry in case IBKR needs a moment
      const retryRes = await fetchWithTimeout(sendUrl, { method: 'GET' })
      const retryBody = await retryRes.text()
      if (!retryRes.ok) throw new FlexError(`SendRequest failed: ${retryRes.status} ${retryRes.statusText}`)
      ;({ referenceCode } = parseSendRequestBody(retryBody))
    }

    // Step 2: GetStatement -> XML
    const getUrl = `${FLEX_BASE_UNIVERSAL}/FlexStatementService.GetStatement?t=${encodeURIComponent(token)}&v=${encodeURIComponent(referenceCode)}`
    const getRes = await fetchWithTimeout(getUrl, { method: 'GET' })
    const xml = await getRes.text()
    if (!getRes.ok) throw new FlexError(`GetStatement failed: ${getRes.status} ${getRes.statusText}`)
    if (xml.includes('<FlexErrorResponse')) {
      const msg = xml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/)?.[1]
      const code = xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/)?.[1]
      throw new FlexError(msg || 'IBKR Flex error', code)
    }
    // Web Service "Fail" wrapper won't be here, but just in case
    const status = xml.match(/<Status>([^<]+)<\/Status>/i)?.[1]
    if (/fail/i.test(status || '')) {
      const msg = xml.match(/<ErrorMessage>([\s\S]*?)<\/ErrorMessage>/i)?.[1]?.trim()
      const code = xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/i)?.[1]?.trim()
      throw new FlexError(msg || 'IBKR Flex error', code)
    }
    return xml
  }

  const tryWebService = async () => {
    // Step 1: SendRequest -> referenceCode (v=3 required)
    const sendQs = new URLSearchParams({ t: token, q: queryId, v: '3' })
    const sendUrl = `${FLEX_BASE_WEBSERVICE}/SendRequest?${sendQs.toString()}`
    const sendRes = await fetchWithTimeout(sendUrl, { method: 'GET' })
    const sendBody = await sendRes.text()
    if (!sendRes.ok) throw new FlexError(`SendRequest failed: ${sendRes.status} ${sendRes.statusText}`)
    const { referenceCode } = parseSendRequestBody(sendBody)

    // Step 2: GetStatement -> XML; WebService uses q for reference code
    const getQs = new URLSearchParams({ t: token, q: referenceCode, v: '3' })
    const getUrl = `${FLEX_BASE_WEBSERVICE}/GetStatement?${getQs.toString()}`

    // Poll a couple of times if IBKR says "please try again shortly"
    let attempt = 0
    while (true) {
      const getRes = await fetchWithTimeout(getUrl, { method: 'GET' })
      const xml = await getRes.text()
      if (!getRes.ok) throw new FlexError(`GetStatement failed: ${getRes.status} ${getRes.statusText}`)
      const status = xml.match(/<Status>([^<]+)<\/Status>/i)?.[1]
      if (/fail/i.test(status || '')) {
        const msg = xml.match(/<ErrorMessage>([\s\S]*?)<\/ErrorMessage>/i)?.[1]?.trim()
        const code = xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/i)?.[1]?.trim()
        // Error 1019 or "try again" — wait briefly and retry
        if (attempt < 2 && (code === '1019' || /try again/i.test(msg || ''))) {
          attempt++
          await new Promise((r) => setTimeout(r, 800 * attempt))
          continue
        }
        throw new FlexError(msg || 'IBKR Flex error', code)
      }
      return xml
    }
  }

  // Try preferred endpoint first, then the other.
  const order: Array<'web' | 'universal'> = prefer === 'web' ? ['web', 'universal'] : prefer === 'universal' ? ['universal', 'web'] : ['web', 'universal']
  let lastErr: unknown
  for (const mode of order) {
    try {
      return mode === 'web' ? await tryWebService() : await tryUniversal()
    } catch (e) {
      lastErr = e
      // continue to next mode
    }
  }
  throw lastErr instanceof Error ? lastErr : new FlexError('Failed to fetch Flex statement', 'UNKNOWN')
}
