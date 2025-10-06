# IBKR Portfolio Tracker (Next.js + Drizzle + Stripe)

This app pulls account data from the Interactive Brokers (IBKR) Flex Web Service using a Flex Token + Query ID, parses the returned XML, normalizes executions into trades and aggregated positions, enriches with snapshot prices (Alpha Vantage), and serves both a JSON portfolio API and a simple UI.

Scope for v1
- Equities/ETFs only (no options/futures/FX/CFDs)
- Single base currency (e.g., USD)
- On-demand refresh per request (no background jobs)

Key Goals
- One‑click portfolio snapshot with P/L, weights, and dates
- Server‑only IBKR access (no secrets in the browser)
- Deterministic normalization with idempotent upserts

What’s Inside
- Next.js App Router (TypeScript), Tailwind v4, SWR
- Postgres via Drizzle ORM (postgres-js)
- Auth: signed JWT session cookie (server-only)
- Stripe integration (pricing/checkout portal), optional
- New portfolio pipeline (IBKR + Alpha Vantage) and UI

---

Quick Start
1) Prerequisites
- Node 20+, pnpm, Git
- Postgres: either Docker (via `pnpm db:setup`) or your own connection
- Optional (billing): Stripe CLI (`stripe login`)

2) Configure environment
```bash
cp .env.example .env
# Fill in: POSTGRES_URL (use Supabase pooler URL), AUTH_SECRET, BASE_URL
# For portfolio: IBKR_FLEX_TOKEN, IBKR_QUERY_ID, BASE_CCY (default USD)
# Optional: PORTFOLIO_DEBUG=1 to include diagnostics in /api/portfolio
# For billing pages: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
```

3) Database
- Option A: Interactive setup (local Postgres via Docker + Stripe webhook)
  ```bash
  pnpm db:setup
  ```
- Option B: Use an existing Postgres (recommended: Supabase transaction pooler)
  - Ensure `.env` has `POSTGRES_URL=postgresql://postgres.<ref>:[PASSWORD]@<region>.pooler.supabase.com:6543/postgres`
  - If migrations fail against the pooler, set `POSTGRES_URL_NON_POOLING` to your direct DB host on port 5432 and try again

Apply migrations:
```bash
pnpm db:migrate
```

4) Develop
```bash
pnpm dev
# App on http://localhost:3000
```

Sign up/sign in, then visit `/overview` to fetch a portfolio snapshot on demand.

---

How It Works
1) IBKR Flex Fetch (server-only)
- `lib/portfolio/flex.ts` calls `SendRequest` to get a reference code, then `GetStatement` to retrieve XML.
- Errors are surfaced with actionable messages; expired tokens set `needs_action: "RENEW_FLEX_TOKEN"`.

2) Parse & Normalize
- `lib/portfolio/xml.ts` parses: `FlexStatement` info, `Trades/Trade` executions (EXECUTION) for equities/ETFs, and `TransactionTaxes`.
- `lib/portfolio/normalize.ts` creates deterministic trades (`trade_key` prefers `ibExecId`, else `tradeId`), and rebuilds positions using average cost in base currency. Shorts use negative quantity.

3) Persist & Idempotency
- Tables: `trades`, `positions`, `price_cache`, `symbols`, `sync_runs`. See `lib/db/migrations/0001_portfolio_equities.sql`.
- Trade upserts are idempotent by `trade_key`.
- Positions upserted by `(account_id, conid)`.

5) API + UI
- `GET /api/portfolio` triggers the full pipeline per request and returns a JSON snapshot.
- `/overview` renders positions (qty, avg cost, price, P/L $, P/L %, weight %) and latest trades with a Refresh button.

---

Environment Variables
Copy `.env.example` to `.env` and fill:
- Core: `BASE_URL`, `AUTH_SECRET`
- Database: `POSTGRES_URL` (Supabase pooler URL). Optional: `POSTGRES_URL_NON_POOLING` (direct 5432 host for migrations), `DATABASE_URL` (tooling compatibility)
- IBKR: `IBKR_FLEX_TOKEN`, `IBKR_QUERY_ID`, `BASE_CCY` (default `USD`), `PRICE_TTL_SECONDS` (quote cache TTL), `IBKR_USER_AGENT` (optional custom UA, defaults to `IBKRFinanceTracker/1.0.0`), `IBKR_FLEX_ENDPOINT` (`web` or `universal`)
- Pricing: `ALPHAVANTAGE_API_KEY` (required for live pricing), `ALPHAVANTAGE_MAX_PER_REQUEST` (default `5`), `PRICE_USER_AGENT` (optional UA header)
- Stripe (optional): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

API: GET /api/portfolio
Debugging: add `?debug=1` (or set `PORTFOLIO_DEBUG=1`) to include a `diagnostics` object with per‑stage counts (Flex fetch size, parse stats, normalize skip reasons, pricing coverage).
Query params (optional):
- `accountId` — filter to a specific account
- `since` — reserved for future use
- `symbols[]` — reserved for future use

Response (example fields):
```jsonc
{
  "base_ccy": "USD",
  "as_of_statement": "2025-09-21T12:00:00Z",
  "positions": [
    {
      "account_id": "U1234567",
      "symbol": "AAPL",
      "conid": 12345,
      "side": "long",
      "qty": 10,
      "avg_cost": 170.12,
      "current_price": 189.34,
      "price_status": "fresh",
      "mv": 1893.4,
      "pl_abs": 192.2,
      "pl_pct": 0.1127,
      "weight_pct": 0.25,
      "as_of_price": "2025-09-21T12:34:56Z"
    }
  ],
  "trades": [
    { "id": "ibExec:abc123", "date": "2025-09-20T15:31:00Z", "symbol": "AAPL", "side": "BUY", "qty": 10, "fill_price": 170.12, "fees": 1.0 }
  ],
  "counts": { "parsed_trades": 10, "upserted_trades": 2, "positions": 5 },
  "needs_action": null
}
```

Errors return descriptive messages; an expired Flex token includes `needs_action: "RENEW_FLEX_TOKEN"`.

---

Data Model (new tables)
- `trades`: IBKR executions (idempotent by `trade_key`)
- `positions`: aggregate per `(account_id, conid)` with signed qty and base-currency avg cost
- `price_cache`: last quote with `as_of`, `currency`, `source`
- `symbols`: mapping and notes (placeholder for future ticker suffix logic)
- `sync_runs`: future use for audit/logging

Runbook: Common Tasks
- Start dev: `pnpm dev`
- Build prod: `pnpm build && pnpm start`
- DB migrate: `pnpm db:migrate`; studio: `pnpm db:studio`

Manual Validation / Testing
1) Portfolio API
```bash
curl -s http://localhost:3000/api/portfolio | jq .
```
- Verify latency (<2s for small accounts), positions count > 0, and `price_status` present.
2) Idempotency
- Run the same call multiple times; confirm no duplicate trades in `trades` table and stable positions.
3) Price coverage
- Expect most US symbols to be `price_status: "fresh"`; unavailable symbols are flagged and excluded from weights.
4) Shorts
- Negative quantities display and P/L signs compute correctly.
5) UI
- Visit `/overview`, click Refresh, verify positions and trades render.

Troubleshooting
- 401 from `/api/portfolio`: sign in first (`/sign-in`).
- `Missing IBKR_FLEX_TOKEN or IBKR_QUERY_ID`: fill `.env`.
- `needs_action: RENEW_FLEX_TOKEN`: regenerate your Flex token and update `.env`.
- No prices: ensure `ALPHAVANTAGE_API_KEY` is set; note free tier rate limits (5/min). Only up to `ALPHAVANTAGE_MAX_PER_REQUEST` symbols are fetched per refresh to avoid timeouts; increase if needed. Symbol mapping uses simple uppercase with dots kept (e.g., `BRK.B`).

Notes & Constraints (v1)
- US equities focus. Non‑US exchanges may need suffix mapping.
- Snapshot quotes only; no intraday streaming.
- Corporate actions are not processed; splits may require manual adjustment.

More Detail
- See `docs/PORTFOLIO.md` for a concise reference.
