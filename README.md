# Note-Taking App (Secure Expiring Share Links)

## Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Hono.js (mounted via Next.js Route Handlers)
- **Database & ORM**: PostgreSQL with Drizzle ORM (embedded PGlite fallback for zero-config local run)
- **Authentication**: JWT in HTTP-only cookies, bcryptjs password hashing

---

## Setup Instructions

### 1. Clone & Install
```bash
git clone https://github.com/yadavabhishek07/Note_Taking_App.git
cd Note_Taking_App
npm install
```

### 2. Configure Environment (Optional)
The app runs out-of-the-box using embedded PGlite (WASM Postgres). To connect to an external PostgreSQL database, set `.env`:
```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/note_taking_db"
JWT_SECRET="super-secret-key-12345"
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 4. Build & Production Start
```bash
npm run build
npm start
```

### 5. Run Automated Tests
```bash
npm run test:api
```

---

## Database Schema

```mermaid
erDiagram
    users ||--o{ notes : creates
    notes ||--o{ share_links : owns

    users {
        uuid id PK
        varchar email "UNIQUE"
        varchar password_hash
        timestamp created_at
    }

    notes {
        uuid id PK
        uuid user_id FK
        varchar title
        text content
        timestamp created_at
        timestamp updated_at
    }

    share_links {
        uuid id PK
        uuid note_id FK
        varchar token "UNIQUE, INDEXED"
        varchar share_type "'ONE_TIME' | 'TIME_BASED'"
        varchar access_type "'PUBLIC' | 'PASSWORD_PROTECTED'"
        varchar password_hash "Nullable (bcrypt)"
        varchar plain_key_hint "Nullable (Creator hint)"
        timestamp expires_at
        boolean is_revoked "Default false"
        timestamp revoked_at
        timestamp used_at "Nullable"
        integer view_count "Default 0"
        timestamp created_at
    }
```

---

## Logic & Flow Breakdown

### 1. Share Link Flow
1. **Creation**: User creates note with title, content, expiry deadline, share type (`ONE_TIME` or `TIME_BASED`), and access type (`PUBLIC` or `PASSWORD_PROTECTED`).
2. **Token Generation**: Generates 24-byte crypto random URL-safe token.
3. **Access (`/share/[token]`)**:
   - If **Public**: Content is fetched, view count is atomically incremented (+1). If `ONE_TIME`, `used_at` is set to `NOW()`.
   - If **Password-Protected**: Content is hidden until user submits the key. Once verified, view count is incremented (+1) and content is revealed.

### 2. Password / Key Generation Logic
- **Dynamic Key**: Generated using `crypto.randomBytes()`, producing a 10-character alphanumeric string (~58 bits of entropy) avoiding ambiguous characters.
- **Hashing**: Stored as a bcrypt hash (salt rounds = 10) in `share_links.password_hash`.
- **Hint**: Creator can view the generated key on `/notes/[id]`.

### 3. Expiry Logic
- Verified in database query: `expires_at > NOW()`.
- If current time exceeds `expires_at`, server returns `410 Gone` with code `LINK_EXPIRED`.

### 4. Invalidate / Revoke Logic
- Owner triggers `POST /api/notes/:id/revoke`.
- Sets `is_revoked = true` and `revoked_at = NOW()`.
- Any subsequent access returns `410 Gone` with code `LINK_REVOKED` without incrementing view count.

### 5. View Count Logic
- **Public link viewed**: +1 increment
- **Password link unlocked with valid key**: +1 increment
- **Wrong password submitted**: No increment (+0)
- **Expired / revoked / already-used link accessed**: No increment (+0)

### 6. Race-Condition Handling
- Handled at database level using a single atomic conditional SQL `UPDATE` statement with PostgreSQL row locks:
```sql
UPDATE share_links
SET view_count = view_count + 1,
    used_at = CASE WHEN share_type = 'ONE_TIME' THEN NOW() ELSE used_at END
WHERE token = $token
  AND is_revoked = FALSE
  AND expires_at > NOW()
  AND (share_type != 'ONE_TIME' OR used_at IS NULL)
RETURNING *;
```
- If 2 users open a one-time link at the exact same millisecond, row locking serializes execution. The first transaction updates the row; the second transaction matches 0 rows and is rejected with `410 Gone: ONE_TIME_USED`.

---

## Technical Questions & Answers

### 1. How do you prevent two users from using a one-time link at the same time?
We use a single atomic SQL `UPDATE` with a conditional check (`WHERE used_at IS NULL ... RETURNING *`). PostgreSQL row-level locks ensure serial execution: the first request updates the row and sets `used_at`, while the second request fails the condition, matches 0 rows, and receives `410 Gone: ONE_TIME_USED`.

### 2. How do you update view count safely?
We use an in-database atomic increment (`SET view_count = view_count + 1`) rather than reading and rewriting the count in application memory, preventing lost updates under concurrent access.

### 3. How would this work if 1 million people opened the link?
1. **Edge Caching**: Cache public note responses on CDN edge nodes (Cloudflare/CloudFront) with `Cache-Control: public, s-maxage=60`, serving 99% of requests without touching the origin.
2. **Decoupled View Counting**: Ingest view events in Redis (`INCR`) or Kafka; flush aggregated view counts to PostgreSQL in batches every 5 seconds.
3. **Read Replicas**: Distribute database read traffic across read replicas behind PgBouncer.

### 4. How would you prevent brute-force attempts on password-protected links?
1. **Rate Limiting**: Sliding-window rate limiting allowing max 5 attempts per 10 minutes per IP/token before lockout (`429 Too Many Requests`).
2. **Key Entropy**: 10-character alphanumeric dynamic keys provide ~58 bits of entropy ($3 \times 10^{17}$ combinations).
3. **Timing Safety**: Passwords compared using bcrypt constant-time comparison.
4. **CAPTCHA**: Trigger Cloudflare Turnstile after 3 failed attempts.

---

## Test Credentials
- **Email**: `demo@example.com`
- **Password**: `demo123456`
