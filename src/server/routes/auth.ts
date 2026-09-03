import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getDb, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { hashPassword, comparePassword, signSession, verifySession } from '@/lib/auth';

export const authRouter = new Hono();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const db = await getDb();

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase().trim()))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: 'User with this email already exists' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const [newUser] = await db
    .insert(schema.users)
    .values({
      email: email.toLowerCase().trim(),
      passwordHash,
    })
    .returning();

  const token = await signSession({ userId: newUser.id, email: newUser.email });

  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({
    success: true,
    user: { id: newUser.id, email: newUser.email },
  }, 201);
});

authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const db = await getDb();

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase().trim()))
    .limit(1);

  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const token = await signSession({ userId: user.id, email: user.email });

  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({
    success: true,
    user: { id: user.id, email: user.email },
  });
});

authRouter.post('/logout', async (c) => {
  deleteCookie(c, 'session', {
    path: '/',
  });
  return c.json({ success: true });
});

authRouter.get('/me', async (c) => {
  const token = getCookie(c, 'session');
  if (!token) {
    return c.json({ user: null });
  }

  const payload = await verifySession(token);
  if (!payload) {
    return c.json({ user: null });
  }

  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, payload.userId))
    .limit(1);

  return c.json({ user: user || null });
});
