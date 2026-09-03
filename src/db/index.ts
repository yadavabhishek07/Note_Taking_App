import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let dbInstance: any = null;
let initPromise: Promise<void> | null = null;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes(user_id);

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  share_type VARCHAR(32) NOT NULL,
  access_type VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255),
  plain_key_hint VARCHAR(64),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  used_at TIMESTAMP WITH TIME ZONE,
  view_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS share_links_token_idx ON share_links(token);
CREATE INDEX IF NOT EXISTS share_links_note_id_idx ON share_links(note_id);
`;

export async function getDb() {
  if (dbInstance) {
    if (initPromise) await initPromise;
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && !databaseUrl.startsWith('pglite:')) {
    const { drizzle: drizzlePostgres } = await import('drizzle-orm/postgres-js');
    const postgres = (await import('postgres')).default;
    const client = postgres(databaseUrl);
    dbInstance = drizzlePostgres(client, { schema });
    initPromise = (async () => {
      try {
        await client.unsafe(INIT_SQL);
      } catch (err) {
        console.error('Postgres auto-init error:', err);
      }
    })();
    await initPromise;
    return dbInstance;
  }

  // Embedded PGlite fallback
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');

  const dataDir = path.resolve(process.cwd(), 'data', 'pglite');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const globalObj = globalThis as unknown as { __pglite_client?: any; __pglite_db?: any };
  if (!globalObj.__pglite_client) {
    const client = new PGlite(dataDir);
    const db = drizzlePglite(client, { schema });
    globalObj.__pglite_client = client;
    globalObj.__pglite_db = db;
    initPromise = (async () => {
      try {
        await client.exec(INIT_SQL);
      } catch (err) {
        console.error('PGlite auto-init error:', err);
      }
    })();
  }

  dbInstance = globalObj.__pglite_db;
  if (initPromise) await initPromise;
  return dbInstance;
}

export { schema };
