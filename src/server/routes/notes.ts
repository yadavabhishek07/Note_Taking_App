import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb, schema } from '@/db';
import { eq, desc, and } from 'drizzle-orm';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { generateDynamicKey, generateShareToken, hashPassword } from '@/lib/auth';

export const notesRouter = new Hono<{ Variables: AuthVariables }>();

// All note routes require authentication
notesRouter.use('*', requireAuth);

// Input validation schema for creating a note
const createNoteSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  content: z.string().min(1, 'Content is required'),
  shareType: z.enum(['ONE_TIME', 'TIME_BASED']),
  accessType: z.enum(['PUBLIC', 'PASSWORD_PROTECTED']),
  expiresAt: z.string().datetime().refine((val) => new Date(val).getTime() > Date.now(), {
    message: 'Expiry date must be in the future',
  }),
  customPassword: z.string().optional(),
});

// 1. GET /api/notes - List notes for the logged-in user
notesRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const db = await getDb();

  const userNotes = await db
    .select()
    .from(schema.notes)
    .where(eq(schema.notes.userId, userId))
    .orderBy(desc(schema.notes.createdAt));

  // Attach latest share link for each note
  const notesWithLinks = await Promise.all(
    userNotes.map(async (note: typeof schema.notes.$inferSelect) => {
      const [latestLink] = await db
        .select()
        .from(schema.shareLinks)
        .where(eq(schema.shareLinks.noteId, note.id))
        .orderBy(desc(schema.shareLinks.createdAt))
        .limit(1);

      return { ...note, shareLink: latestLink || null };
    })
  );

  return c.json({ notes: notesWithLinks });
});

// 2. POST /api/notes - Create a new note and generate its share link
notesRouter.post('/', zValidator('json', createNoteSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');
  const db = await getDb();

  // Insert the note
  const [newNote] = await db
    .insert(schema.notes)
    .values({
      userId,
      title: body.title,
      content: body.content,
    })
    .returning();

  // Generate secure random token
  const token = generateShareToken();

  // If password protected, generate or use key and hash it
  let passwordHash: string | null = null;
  let dynamicPassword: string | null = null;

  if (body.accessType === 'PASSWORD_PROTECTED') {
    dynamicPassword = body.customPassword?.trim() || generateDynamicKey(10);
    passwordHash = await hashPassword(dynamicPassword);
  }

  // Insert the share link
  const [shareLink] = await db
    .insert(schema.shareLinks)
    .values({
      noteId: newNote.id,
      token,
      shareType: body.shareType,
      accessType: body.accessType,
      passwordHash,
      plainKeyHint: dynamicPassword,
      expiresAt: new Date(body.expiresAt),
      isRevoked: false,
      viewCount: 0,
    })
    .returning();

  return c.json({
    success: true,
    note: newNote,
    shareLink: { ...shareLink, dynamicPassword },
  }, 201);
});

// 3. GET /api/notes/:id - Get note details and share status
notesRouter.get('/:id', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const db = await getDb();

  const [note] = await db
    .select()
    .from(schema.notes)
    .where(and(eq(schema.notes.id, noteId), eq(schema.notes.userId, userId)))
    .limit(1);

  if (!note) {
    return c.json({ error: 'Note not found or unauthorized' }, 404);
  }

  const [activeLink] = await db
    .select()
    .from(schema.shareLinks)
    .where(eq(schema.shareLinks.noteId, noteId))
    .orderBy(desc(schema.shareLinks.createdAt))
    .limit(1);

  return c.json({ note, activeLink: activeLink || null });
});

// 4. POST /api/notes/:id/revoke - Force invalidate / revoke share link
notesRouter.post('/:id/revoke', async (c) => {
  const userId = c.get('userId');
  const noteId = c.req.param('id');
  const db = await getDb();

  // Verify ownership
  const [note] = await db
    .select()
    .from(schema.notes)
    .where(and(eq(schema.notes.id, noteId), eq(schema.notes.userId, userId)))
    .limit(1);

  if (!note) {
    return c.json({ error: 'Note not found or unauthorized' }, 404);
  }

  // Invalidate all active links for this note
  await db
    .update(schema.shareLinks)
    .set({ isRevoked: true, revokedAt: new Date() })
    .where(eq(schema.shareLinks.noteId, noteId));

  return c.json({ success: true, message: 'Share link revoked successfully' });
});
