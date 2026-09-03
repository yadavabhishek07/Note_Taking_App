import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifySession } from '@/lib/auth';

export type AuthVariables = {
  userId: string;
  userEmail: string;
};

export async function requireAuth(c: Context<{ Variables: AuthVariables }>, next: Next) {
  const token = getCookie(c, 'session');
  if (!token) {
    return c.json({ error: 'Unauthorized. Please login.' }, 401);
  }

  const payload = await verifySession(token);
  if (!payload) {
    return c.json({ error: 'Session expired or invalid. Please login again.' }, 401);
  }

  c.set('userId', payload.userId);
  c.set('userEmail', payload.email);
  await next();
}
