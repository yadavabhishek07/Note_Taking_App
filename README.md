# Note-Taking App (Secure Expiring Share Links)

> A simple, secure note-sharing web application featuring time-based expiration, one-time self-destruct links, dynamic password protection, and atomic race-condition prevention.

---

## 📑 Table of Contents
1. [Tech Stack](#-tech-stack)
2. [Setup Instructions](#-setup-instructions)
3. [Database Schema](#-database-schema)
4. [Share Link Flow](#-share-link-flow)
5. [Key & Expiry Logic](#-key--expiry-logic)
6. [Invalidate & Revoke Logic](#-invalidate--revoke-logic)
7. [View Count Logic](#-view-count-logic)
8. [Race-Condition Handling](#-race-condition-handling)
9. [Technical Questions & Answers](#-technical-questions--answers)
10. [Test Credentials](#-test-credentials)

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS** | Clean minimalist UI, fast client/server components, responsive routing |
| **Backend API** | **Hono.js** (in Next.js Route Handlers) | High-performance modular API endpoints with sub-millisecond dispatch |
| **Database** | **PostgreSQL** with **Drizzle ORM** | ACID transactions, row-level locking, and atomic query execution |
| **Local DB Engine** | **@electric-sql/pglite** (Embedded WASM Postgres) | Zero-config embedded PostgreSQL running in-process; connects to external Postgres via `DATABASE_URL` |
| **Authentication** | **jose** (JWT cookies) & **bcryptjs** | HTTP-only session cookies and secure password/key hashing |

---

## 🚀 Setup Instructions

### 1. Clone & Install
```bash
git clone https://github.com/yadavabhishek07/Note_Taking_App.git
cd Note_Taking_App
npm install
```

### 2. Configure Environment (Optional)
The application works immediately with **zero setup** using embedded PGlite (WASM PostgreSQL).

To connect to an external PostgreSQL database instead, add your connection string to `.env`:
```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/note_taking_db"
JWT_SECRET="super-secret-key-12345"
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build & Run Production Server
```bash
npm run build
npm start
```

### 5. Run Automated Tests
```bash
npm run test:api
```

---

## 🗄️ Database Schema

```mermaid
erDiagram
    users ||--o{ notes : creates
    notes ||--o{ share_links : owns

    users {
        uuid id PK "gen_random_uuid()"
        varchar email "UNIQUE, NOT NULL"
        varchar password_hash "NOT NULL"
        timestamp created_at "DEFAULT now()"
    }

    notes {
        uuid id PK "gen_random_uuid()"
        uuid user_id FK "REFERENCES users(id) ON DELETE CASCADE"
        varchar title "NOT NULL"
        text content "NOT NULL"
        timestamp created_at "DEFAULT now()"
        timestamp updated_at "DEFAULT now()"
    }

    share_links {
        uuid id PK "gen_random_uuid()"
        uuid note_id FK "REFERENCES notes(id) ON DELETE CASCADE"
        varchar token "UNIQUE, INDEXED (24-byte base64url)"
        varchar share_type "'ONE_TIME' | 'TIME_BASED'"
        varchar access_type "'PUBLIC' | 'PASSWORD_PROTECTED'"
        varchar password_hash "Nullable (bcrypt)"
        varchar plain_key_hint "Nullable (Creator dashboard hint)"
        timestamp expires_at "NOT NULL"
        boolean is_revoked "DEFAULT false"
        timestamp revoked_at "Nullable"
        timestamp used_at "Nullable (set on first view if ONE_TIME)"
        integer view_count "DEFAULT 0, NOT NULL"
        timestamp created_at "DEFAULT now()"
    }
```

---

## 🔄 Share Link Flow

```mermaid
flowchart LR
    A[Creator creates note] --> B{Access Type?}
    B -->|Public| C[Generate Share Link]
    B -->|Password Protected| D[Generate Dynamic Key + Hash] --> C
    
    C --> E[Recipient opens link /share/:token]
    E --> F{Access Type?}
    
    F -->|Public| G[Atomic DB Check & Increment]
    F -->|Password| H[Prompt for Key] --> I{Key Valid?}
    I -->|No| J[Reject 401: Count Unchanged]
    I -->|Yes| G
    
    G --> K{Valid & Unused?}
    K -->|Yes| L[Reveal Note Content]
    K -->|No| M[Reject 410: Expired / Revoked / Burned]
```

---

## 🔐 Key & Expiry Logic

### Password / Key Generation Logic
1. **Entropy**: When `PASSWORD_PROTECTED` is selected, an alphanumeric key is generated using `crypto.randomBytes()`.
2. **Readability**: Excludes ambiguous characters (`0`, `O`, `I`, `l`) to avoid user typos.
3. **Storage**: The plain key is hashed with **bcrypt (cost factor 10)**. Only the hash is stored in `password_hash`.
4. **Creator Hint**: The plain key is displayed to the creator on `/notes/[id]` so they can share it separately.

### Expiry Logic
- Expiration is enforced in SQL queries using `expires_at > NOW()`.
- If the current time is past `expires_at`, access is rejected with `410 Gone` and error code `LINK_EXPIRED`.

---

## 🚫 Invalidate & Revoke Logic

- The note owner can invalidate a share link at any time from `/notes/[id]` by clicking **"Revoke link"**.
- This sends a `POST /api/notes/:id/revoke` request, updating `is_revoked = true` and `revoked_at = NOW()`.
- Once revoked, all subsequent access attempts return `410 Gone` with error code `LINK_REVOKED`.
- Revoked links **never** increment the view count.

---

## 📊 View Count Logic

View counts are updated directly in the database engine using atomic increments (`SET view_count = view_count + 1`).

| Scenario | Link State | Password Result | Count Incremented? | HTTP Status |
|---|---|---|:---:|:---:|
| **Public View** | Active | N/A | **Yes (+1)** | `200 OK` |
| **Password Unlock** | Active | Correct Key | **Yes (+1)** | `200 OK` |
| **Wrong Password** | Active | Incorrect Key | **No (+0)** | `401 Unauthorized` |
| **Expired Link** | Past Expiry | Any | **No (+0)** | `410 Gone` |
| **Revoked Link** | Revoked by Owner | Any | **No (+0)** | `410 Gone` |
| **One-Time Re-access** | Already Burned | Any | **No (+0)** | `410 Gone` |

---

## ⚡ Race-Condition Handling

### The Problem
If two users open a one-time link at the exact same millisecond, an application using naive "check-then-act" (`SELECT` then `UPDATE`) would let both users view the note.

### The Solution: Atomic Conditional UPDATE
We execute link consumption and view incrementing in a **single atomic SQL statement**:

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

### Execution Timeline Under Concurrency:
```
Time   User A (Thread 1)                User B (Thread 2)               Database State
t0     GET /share/:token                GET /share/:token               used_at = NULL
t1     Acquires PostgreSQL row lock     Waits for row lock              Lock held by Thread 1
t2     Executes UPDATE (used_at = NOW)  -                               used_at = NOW
t3     Returns updated row (200 OK)     Acquires lock, evaluates WHERE  Lock released
t4     -                                Matches 0 rows! (used_at NOT NULL)
t5     -                                Returns 410 Gone (Burned)       used_at unchanged
```

---

## 💬 Technical Questions & Answers

### 1. How do you prevent two users from using a one-time link at the same time?
We eliminate the check-then-act vulnerability by using a **single atomic SQL UPDATE with a conditional WHERE clause** (`WHERE used_at IS NULL ... RETURNING *`). PostgreSQL's row-level lock evaluates concurrent requests sequentially: the first request updates the row and sets `used_at = NOW()`, while the second request fails the condition, matches 0 rows, and is rejected with `410 Gone: ONE_TIME_USED`.

### 2. How do you update view count safely?
We update view counts using an **in-database atomic increment**:
```sql
SET view_count = view_count + 1
```
We never read the count into Node.js memory (`count + 1`) and write it back, which avoids lost updates under concurrent traffic.

### 3. How would this work if 1 million people opened the link?
1. **CDN Edge Caching**: Cache public note content at Cloudflare/CloudFront edge nodes (`s-maxage=60`). Over 99% of requests are served directly from edge memory in under 15ms without touching origin databases.
2. **Decoupled View Count Ingestion**: Instead of locking database rows on every hit, write view events to Redis (`INCR share:{token}:views`) or a Kafka/SQS stream. A background worker batches and flushes counts to PostgreSQL every 5 seconds.
3. **Read Replicas**: Distribute database read queries across read replicas using connection pooling (PgBouncer).

### 4. How would you prevent brute-force attempts on password-protected links?
1. **Sliding-Window Rate Limiting**: Limit attempts to 5 failed tries per 10 minutes per IP/token before a 429 lockout (`src/server/routes/share.ts`).
2. **High Dynamic Key Entropy**: Auto-generated 10-character alphanumeric keys provide ~58 bits of entropy ($3 \times 10^{17}$ combinations).
3. **Timing-Safe Comparison**: Passwords are verified using bcrypt's constant-time comparison.
4. **CAPTCHA Protection**: Trigger Cloudflare Turnstile after 3 failed attempts.

---

## 🔑 Test Credentials
- **Email**: `demo@example.com`
- **Password**: `demo123456`
