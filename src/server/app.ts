import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRouter } from './routes/auth';
import { notesRouter } from './routes/notes';
import { shareRouter } from './routes/share';

const app = new Hono().basePath('/api');

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    credentials: true,
  })
);

// Mount sub-routers
app.route('/auth', authRouter);
app.route('/notes', notesRouter);
app.route('/share', shareRouter);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.onError((err, c) => {
  console.error('Unhandled API Error:', err);
  return c.json(
    {
      error: err.message || 'Internal Server Error',
    },
    500
  );
});

export default app;
