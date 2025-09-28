import 'server-only'
import { XMLParser } from 'fast-xml-parser'

export type ParsedTrade = {
  tradeId?: string
  ibExecId?: string
  accountId?: string
  tradeDate?: string
  dateTime?: string
  settleDateTarget?: string
  buySell?: 'BUY' | 'SELL'
  quantity?: number
  tradePrice?: number
  ibCommission?: number
  netCash?: number
  cost?: number
  fifoPnlRealized?: number
  mtmPnl?: number
  symbol?: string
  description?: string
  conid?: number
  assetCategory?: string
  subCategory?: string
  listingExchange?: string
  currency?: string
  fxRateToBase?: number
}

export type ParsedTax = {
  tradeId?: string
  orderId?: string
  taxDescription?: string
  taxAmount?: number
  currency?: string
  conid?: number
  symbol?: string
  date?: string
}

export type ParsedOpenPosition = {
  accountId?: string
  currency?: string
  fxRateToBase?: number
  assetCategory?: string
  subCategory?: string
  symbol?: string
  description?: string
  conid?: number
  listingExchange?: string
  reportDate?: string
  position?: number
  markPrice?: number
  positionValue?: number
  openPrice?: number
  costBasisPrice?: number
  costBasisMoney?: number
  side?: string
  levelOfDetail?: string
  openDateTime?: string
  holdingPeriodDateTime?: string
}

export type StatementInfo = {
  accountId?: string
  fromDate?: string
  toDate?: string
  whenGenerated?: string
}

export type AccountInformation = {
  accountId?: string
  currency?: string
  name?: string
  accountType?: string
  customerType?: string
  masterName?: string
}

export type CashReportCurrency = {
  accountId?: string
  currency?: string
  levelOfDetail?: string
  fromDate?: string
  toDate?: string
  endingCash?: number
  endingSettledCash?: number
}

function arrayify<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function asNum(n: any): number | undefined {
  if (n === '' || n == null) return undefined
  const v = Number(n)
  return Number.isFinite(v) ? v : undefined
}

function asInt(n: any): number | undefined {
  if (n === '' || n == null) return undefined
  const v = parseInt(String(n), 10)
  return Number.isFinite(v) ? v : undefined
}

export function parseFlexXML(xml: string): {
  info: StatementInfo
  account?: AccountInformation
  cashReport: CashReportCurrency[]
  trades: ParsedTrade[]
  taxes: ParsedTax[]
  openPositions: ParsedOpenPosition[]
  stats: { totalTradeTags: number; executionTrades: number; equitiesTrades: number; taxes: number }
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true
  })
  const doc = parser.parse(xml) || {}
  const fs = doc?.FlexQueryResponse?.FlexStatements?.FlexStatement || {}

  const info: StatementInfo = {
    accountId: fs.accountId,
    fromDate: fs.fromDate,
    toDate: fs.toDate,
    whenGenerated: fs.whenGenerated
  }

  const account: AccountInformation | undefined = fs?.AccountInformation
    ? {
        accountId: fs.AccountInformation.accountId,
        currency: fs.AccountInformation.currency,
        name: fs.AccountInformation.name,
        accountType: fs.AccountInformation.accountType,
        customerType: fs.AccountInformation.customerType,
        masterName: fs.AccountInformation.masterName
      }
    : undefined

  const crRaw = arrayify<any>(fs?.CashReport?.CashReportCurrency)
  const cashReport: CashReportCurrency[] = crRaw.map((a) => ({
    accountId: a.accountId,
    currency: a.currency,
    levelOfDetail: a.levelOfDetail,
    fromDate: a.fromDate,
    toDate: a.toDate,
    endingCash: asNum(a.endingCash),
    endingSettledCash: asNum(a.endingSettledCash)
  }))

  const tradesRaw = arrayify<any>(fs?.Trades?.Trade)
  const totalTradeTags = tradesRaw.length
  const execution = tradesRaw.filter((a) => (String(a.levelOfDetail || '')).toUpperCase() === 'EXECUTION')
  const executionTrades = execution.length
  const equitiesOnly = execution.filter((a) => {
    const cat = (String(a.assetCategory || '')).toUpperCase()
    return cat === 'STK' || cat === 'ETF'
  })
  const equitiesTrades = equitiesOnly.length
  const trades: ParsedTrade[] = equitiesOnly.map((a) => ({
    tradeId: a.tradeID || a.tradeId,
    ibExecId: a.ibExecID || a.ibExecId,
    accountId: a.accountId,
    tradeDate: a.tradeDate,
    dateTime: a.dateTime,
    settleDateTarget: a.settleDateTarget,
    buySell: a.buySell,
    quantity: asNum(a.quantity),
    tradePrice: asNum(a.tradePrice),
    ibCommission: asNum(a.ibCommission),
    netCash: asNum(a.netCash),
    cost: asNum(a.cost),
    fifoPnlRealized: asNum(a.fifoPnlRealized),
    mtmPnl: asNum(a.mtmPnl),
    symbol: a.symbol,
    description: a.description,
    conid: asInt(a.conid),
    assetCategory: a.assetCategory,
    subCategory: a.subCategory,
    listingExchange: a.listingExchange,
    currency: a.currency,
    fxRateToBase: asNum(a.fxRateToBase) || 1
  }))

  const taxRaw = arrayify<any>(fs?.TransactionTaxes?.TransactionTax)
  const taxes: ParsedTax[] = taxRaw.map((a) => ({
    tradeId: a.tradeID || a.tradeId,
    orderId: a.orderID || a.orderId,
    taxDescription: a.taxDescription,
    taxAmount: asNum(a.taxAmount),
    currency: a.currency,
    conid: asInt(a.conid),
    symbol: a.symbol,
    date: a.date
  }))

  const openPosRaw = arrayify<any>(fs?.OpenPositions?.OpenPosition)
  const openPositions: ParsedOpenPosition[] = openPosRaw.map((a) => ({
    accountId: a.accountId,
    currency: a.currency,
    fxRateToBase: asNum(a.fxRateToBase),
    assetCategory: a.assetCategory,
    subCategory: a.subCategory,
    symbol: a.symbol,
    description: a.description,
    conid: asInt(a.conid),
    listingExchange: a.listingExchange,
    reportDate: a.reportDate,
    position: asNum(a.position),
    markPrice: asNum(a.markPrice),
    positionValue: asNum(a.positionValue),
    openPrice: asNum(a.openPrice),
    costBasisPrice: asNum(a.costBasisPrice),
    costBasisMoney: asNum(a.costBasisMoney),
    side: a.side,
    levelOfDetail: a.levelOfDetail,
    openDateTime: a.openDateTime,
    holdingPeriodDateTime: a.holdingPeriodDateTime
  }))

  return { info, account, cashReport, trades, taxes, openPositions, stats: { totalTradeTags, executionTrades, equitiesTrades, taxes: taxes.length } }
}
