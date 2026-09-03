import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb, schema } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { comparePassword } from '@/lib/auth';

export const shareRouter = new Hono();

// =========================================================================
// 1. In-Memory Brute-Force Rate Limiter
// Prevents automated password guessing on password-protected share links.
// Allows max 5 attempts per 10-minute window per IP/token.
// =========================================================================
const bruteForceStore = new Map<string, { attempts: number; expiresAt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

function checkBruteForce(key: string): boolean {
  const record = bruteForceStore.get(key);
  if (!record || Date.now() > record.expiresAt) return true;
  return record.attempts < MAX_ATTEMPTS;
}

function recordFailedAttempt(key: string) {
  const record = bruteForceStore.get(key);
  if (!record || Date.now() > record.expiresAt) {
    bruteForceStore.set(key, { attempts: 1, expiresAt: Date.now() + LOCKOUT_MS });
  } else {
    record.attempts += 1;
  }
}

// =========================================================================
// 2. Atomic Link Consumption Helper (KEY INTERVIEW CONCEPT!)
//
// HOW IT PREVENTS RACE CONDITIONS ON ONE-TIME LINKS:
// - Executes a single SQL UPDATE with conditional WHERE check:
//     WHERE used_at IS NULL AND is_revoked = FALSE AND expires_at > NOW()
// - PostgreSQL row-level locks serialize concurrent requests.
// - If 2 users hit a one-time link at the exact same millisecond:
//     * User 1: updates the row, sets used_at = NOW(), receives the updated row.
//     * User 2: waits for lock, evaluates WHERE (used_at is now NOT NULL),
//               matches 0 rows!
// - If 0 rows were updated, we return 410 Gone (Link already burned).
// =========================================================================
async function consumeShareLink(db: any, token: string) {
  const [updated] = await db
    .update(schema.shareLinks)
    .set({
      viewCount: sql`${schema.shareLinks.viewCount} + 1`,
      usedAt: sql`CASE WHEN ${schema.shareLinks.shareType} = 'ONE_TIME' THEN NOW() ELSE ${schema.shareLinks.usedAt} END`,
    })
    .where(
      sql`${schema.shareLinks.token} = ${token}
        AND ${schema.shareLinks.isRevoked} = FALSE
        AND ${schema.shareLinks.expiresAt} > NOW()
        AND (${schema.shareLinks.shareType} != 'ONE_TIME' OR ${schema.shareLinks.usedAt} IS NULL)`
    )
    .returning();

  return updated || null;
}

// =========================================================================
// 3. GET /api/share/:token - Inspect Link Status or Open Public Note
// =========================================================================
shareRouter.get('/:token', async (c) => {
  const token = c.req.param('token');
  const db = await getDb();

  // Step 1: Find link in database
  const [link] = await db
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.token, token))
    .limit(1);

  if (!link) {
    return c.json({ error: 'Share link not found or invalid.', code: 'NOT_FOUND' }, 404);
  }

  // Step 2: Validate edge cases (Revoked, Expired, One-time already used)
  if (link.isRevoked) {
    return c.json({ error: 'This share link was revoked by the owner.', code: 'LINK_REVOKED' }, 410);
  }
  if (new Date(link.expiresAt).getTime() <= Date.now()) {
    return c.json({ error: 'This share link has expired.', code: 'LINK_EXPIRED' }, 410);
  }
  if (link.shareType === 'ONE_TIME' && link.usedAt) {
    return c.json({ error: 'This one-time link has already been viewed and expired.', code: 'ONE_TIME_USED' }, 410);
  }

  // Step 3: Fetch note info
  const [note] = await db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.id, link.noteId))
    .limit(1);

  if (!note) {
    return c.json({ error: 'Associated note not found.', code: 'NOTE_DELETED' }, 404);
  }

  // Step 4: If password-protected, DO NOT return content and DO NOT increment count
  if (link.accessType === 'PASSWORD_PROTECTED') {
    return c.json({
      requiresPassword: true,
      title: note.title,
      shareType: link.shareType,
      expiresAt: link.expiresAt,
    });
  }

  // Step 5: If public, atomically consume link and increment view count
  const updatedLink = await consumeShareLink(db, token);
  if (!updatedLink) {
    return c.json({ error: 'This one-time link was just accessed concurrently or expired.', code: 'ONE_TIME_USED' }, 410);
  }

  return c.json({
    requiresPassword: false,
    title: note.title,
    content: note.content,
    viewCount: updatedLink.viewCount,
    shareType: updatedLink.shareType,
    expiresAt: updatedLink.expiresAt,
  });
});

// =========================================================================
// 4. POST /api/share/:token/unlock - Unlock Password-Protected Note
// =========================================================================
const unlockSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

shareRouter.post('/:token/unlock', zValidator('json', unlockSchema), async (c) => {
  const token = c.req.param('token');
  const { password } = c.req.valid('json');
  const ip = c.req.header('x-forwarded-for') || 'local';
  const rateLimitKey = `${ip}:${token}`;

  // Step 1: Check rate limiter
  if (!checkBruteForce(rateLimitKey)) {
    return c.json({ error: 'Too many incorrect attempts. Link temporarily locked for 10 minutes.', code: 'RATE_LIMITED' }, 429);
  }

  const db = await getDb();

  // Step 2: Find link
  const [link] = await db
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.token, token))
    .limit(1);

  if (!link) {
    return c.json({ error: 'Share link not found or invalid.', code: 'NOT_FOUND' }, 404);
  }

  // Step 3: Check edge cases
  if (link.isRevoked) {
    return c.json({ error: 'This share link was revoked by the owner.', code: 'LINK_REVOKED' }, 410);
  }
  if (new Date(link.expiresAt).getTime() <= Date.now()) {
    return c.json({ error: 'This share link has expired.', code: 'LINK_EXPIRED' }, 410);
  }
  if (link.shareType === 'ONE_TIME' && link.usedAt) {
    return c.json({ error: 'This one-time link has already been viewed and expired.', code: 'ONE_TIME_USED' }, 410);
  }

  // Step 4: Verify password with bcrypt
  const isMatch = link.passwordHash ? await comparePassword(password, link.passwordHash) : false;
  if (!isMatch) {
    recordFailedAttempt(rateLimitKey);
    return c.json({ error: 'Incorrect password. View count was NOT incremented.', code: 'INVALID_PASSWORD' }, 401);
  }

  // Password is valid -> clear brute-force record
  bruteForceStore.delete(rateLimitKey);

  // Step 5: Atomically consume link and increment view count
  const updatedLink = await consumeShareLink(db, token);
  if (!updatedLink) {
    return c.json({ error: 'This one-time link was just accessed concurrently or expired.', code: 'ONE_TIME_USED' }, 410);
  }

  // Step 6: Fetch and return note content
  const [note] = await db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.id, link.noteId))
    .limit(1);

  return c.json({
    success: true,
    title: note.title,
    content: note.content,
    viewCount: updatedLink.viewCount,
    shareType: updatedLink.shareType,
    expiresAt: updatedLink.expiresAt,
  });
});
