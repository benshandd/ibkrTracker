import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  // Portfolio settings & credentials (encrypted)
  baseCcy: varchar('base_ccy', { length: 8 }),
  ibkrFlexTokenEnc: text('ibkr_flex_token_enc'),
  ibkrQueryIdEnc: text('ibkr_query_id_enc'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripeProductId: text('stripe_product_id'),
  planName: varchar('plan_name', { length: 50 }),
  subscriptionStatus: varchar('subscription_status', { length: 20 }),
});

export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
});

export const invitations = pgTable('invitations', {
  id: serial('id').primaryKey(),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  invitedBy: integer('invited_by')
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
});

export const teamsRelations = relations(teams, ({ many }) => ({
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, 'id' | 'name' | 'email'>;
  })[];
};

export enum ActivityType {
  SIGN_UP = 'SIGN_UP',
  SIGN_IN = 'SIGN_IN',
  SIGN_OUT = 'SIGN_OUT',
  UPDATE_PASSWORD = 'UPDATE_PASSWORD',
  DELETE_ACCOUNT = 'DELETE_ACCOUNT',
  UPDATE_ACCOUNT = 'UPDATE_ACCOUNT',
  CREATE_TEAM = 'CREATE_TEAM',
  REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',
  INVITE_TEAM_MEMBER = 'INVITE_TEAM_MEMBER',
  ACCEPT_INVITATION = 'ACCEPT_INVITATION',
}

// --- Portfolio/IBKR schema (v1 equities only) ---

export const symbols = pgTable('symbols', {
  symbol: varchar('symbol', { length: 32 }).primaryKey(),
  exchange: varchar('exchange', { length: 32 }),
  assetClass: varchar('asset_class', { length: 16 }),
  yahooTicker: varchar('yahoo_ticker', { length: 64 }),
  notes: text('notes')
});

export const priceCache = pgTable('price_cache', {
  ticker: varchar('ticker', { length: 64 }).primaryKey(),
  asOf: timestamp('as_of').notNull(),
  price: doublePrecision('price').notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  source: varchar('source', { length: 32 }).notNull()
});

export const trades = pgTable('trades', {
  // Deterministic key: prefer ibExecId, falling back to tradeId
  tradeKey: varchar('trade_key', { length: 128 }).primaryKey(),
  ibExecId: varchar('ib_exec_id', { length: 64 }),
  tradeId: varchar('trade_id', { length: 64 }),
  accountId: varchar('account_id', { length: 32 }).notNull(),
  symbol: varchar('symbol', { length: 32 }).notNull(),
  conid: integer('conid').notNull(),
  side: varchar('side', { length: 4 }).notNull(), // BUY/SELL
  quantity: doublePrecision('quantity').notNull(),
  tradePrice: doublePrecision('trade_price').notNull(),
  fees: doublePrecision('fees').notNull().default(0),
  currency: varchar('currency', { length: 8 }).notNull(),
  fxRateToBase: doublePrecision('fx_rate_to_base').notNull().default(1),
  execTs: timestamp('exec_ts').notNull(),
  tradeDate: varchar('trade_date', { length: 16 }),
  listingExchange: varchar('listing_exchange', { length: 32 }),
  raw: jsonb('raw')
});

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  accountId: varchar('account_id', { length: 32 }).notNull(),
  conid: integer('conid').notNull(),
  symbol: varchar('symbol', { length: 32 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull(),
  quantity: doublePrecision('quantity').notNull(), // signed: negative for shorts
  avgCostBase: doublePrecision('avg_cost_base').notNull(),
  dateAdded: timestamp('date_added'),
});

export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  status: varchar('status', { length: 16 }).notNull(),
  counts: jsonb('counts'),
  error: text('error')
});

export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
export type PriceCache = typeof priceCache.$inferSelect;
export type NewPriceCache = typeof priceCache.$inferInsert;
export type Symbol = typeof symbols.$inferSelect;
export type NewSymbol = typeof symbols.$inferInsert;
export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;

// --- Cached Open Positions snapshot per user (stale-while-revalidate) ---

export const openPositions = pgTable(
  'open_positions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    accountId: varchar('account_id', { length: 32 }),
    conid: integer('conid').notNull(),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    name: text('name'),
    currency: varchar('currency', { length: 8 }).notNull(),
    qty: doublePrecision('qty').notNull(),
    longShort: varchar('long_short', { length: 8 }).notNull(),
    // OpenPosition-sourced pricing/cost fields in position currency
    unitMarkPrice: doublePrecision('unit_mark_price'),
    unitCostBasisPrice: doublePrecision('unit_cost_basis_price'),
    totalCostBasisMoney: doublePrecision('total_cost_basis_money'),
    positionValue: doublePrecision('position_value'),
    posCcy: varchar('pos_ccy', { length: 8 }),
    fxToBase: doublePrecision('fx_to_base'),
    reportDate: varchar('report_date', { length: 32 }),
    dateOpen: varchar('date_open', { length: 64 }),
    dateAdded: timestamp('date_added'),
    lastPriceAsOf: timestamp('last_price_asof'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    byUserConid: uniqueIndex('open_positions_user_conid_idx').on(t.userId, t.conid),
  })
);

export type OpenPositionRow = typeof openPositions.$inferSelect;
export type NewOpenPositionRow = typeof openPositions.$inferInsert;

// --- Cached Cash Balances per user ---

export const cashBalances = pgTable(
  'cash_balances',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id),
    accountId: varchar('account_id', { length: 32 }),
    currency: varchar('currency', { length: 16 }).notNull(),
    levelOfDetail: varchar('level_of_detail', { length: 32 }),
    endingCash: doublePrecision('ending_cash'),
    endingSettledCash: doublePrecision('ending_settled_cash'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    byUserCurrencyLod: uniqueIndex('cash_balances_user_ccy_lod_idx').on(t.userId, t.currency, t.levelOfDetail),
  })
)

export type CashBalanceRow = typeof cashBalances.$inferSelect
export type NewCashBalanceRow = typeof cashBalances.$inferInsert
