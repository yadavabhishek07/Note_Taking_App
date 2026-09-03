import { pgTable, uuid, varchar, text, timestamp, boolean, integer, index } from 'drizzle-orm/pg-core';

// 1. Users Table - Stores registered accounts
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Notes Table - Stores notes created by users
export const notes = pgTable('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('notes_user_id_idx').on(table.userId),
}));

// 3. Share Links Table - Controls expiry, one-time burn, password protection, and view count
export const shareLinks = pgTable('share_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  noteId: uuid('note_id').references(() => notes.id, { onDelete: 'cascade' }).notNull(),
  token: varchar('token', { length: 64 }).notNull().unique(), // URL-safe secure token
  shareType: varchar('share_type', { length: 32 }).$type<'ONE_TIME' | 'TIME_BASED'>().notNull(),
  accessType: varchar('access_type', { length: 32 }).$type<'PUBLIC' | 'PASSWORD_PROTECTED'>().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }), // bcrypt hash of dynamic key
  plainKeyHint: varchar('plain_key_hint', { length: 64 }), // Creator reference hint
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isRevoked: boolean('is_revoked').default(false).notNull(), // Creator manual revoke flag
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }), // Set on first view for ONE_TIME
  viewCount: integer('view_count').default(0).notNull(), // Atomic view counter
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index('share_links_token_idx').on(table.token),
  noteIdIdx: index('share_links_note_id_idx').on(table.noteId),
}));
