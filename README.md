# Note-Taking App (Secure Expiring Share Links)

> A fullstack note-sharing web app where users can create notes with secure, expiring, password-protected, and self-destructing links.

---

## 🎯 Interview Cheat Sheet (Read This Before Your Interview!)

### 1. The 30-Second Elevator Pitch
> *"I built a secure note-sharing app using Next.js 14, Hono.js, PostgreSQL with Drizzle ORM, and Tailwind CSS. The app allows users to create notes that either expire after a set time or self-destruct after the very first view. It supports both public and password-protected links with dynamic keys. Most importantly, it handles race conditions at the database level using atomic SQL updates so that concurrent users can never double-spend a one-time link."*

---

### 2. The 4 Big Interview Questions & Exact Answers

#### Q1: How do you prevent two users from using a one-time link at the same time?
**Your Answer:**
> *"We avoid the check-then-act race condition by executing a single atomic conditional SQL UPDATE with PostgreSQL row-level locks:*
> ```sql
> UPDATE share_links
> SET view_count = view_count + 1,
>     used_at = NOW()
> WHERE token = $token
>   AND is_revoked = FALSE
>   AND expires_at > NOW()
>   AND used_at IS NULL
> RETURNING *;
> ```
> *When two requests hit the server at the exact same millisecond, PostgreSQL's row-level lock forces one transaction to go first. The first transaction updates `used_at = NOW()` and returns the row. The second transaction then evaluates the `WHERE` clause, sees `used_at IS NOT NULL`, and updates 0 rows. The backend checks if updated rows === 0, and immediately returns `410 Gone: ONE_TIME_USED`. No external distributed locks or Redis required!"*
> *(Show file: `src/server/routes/share.ts` -> `consumeShareLink` function)*

---

#### Q2: How do you update view count safely?
**Your Answer:**
> *"We never read the count into Node.js memory (`count + 1`) and write it back, because concurrent requests would overwrite each other and cause lost updates. Instead, we perform an atomic in-database increment:*
> ```sql
> SET view_count = view_count + 1
> ```
> *This ensures every view is serialized and counted accurately by PostgreSQL's engine. If a password attempt fails or a link is expired/revoked, this query is never executed, ensuring view counts only track confirmed successful views."*

---

#### Q3: How would this work if 1 million people opened the link?
**Your Answer:**
> *"Under 1,000,000 concurrent views, hitting PostgreSQL directly for every read and write would bottleneck the database. We would scale it with 3 layers:*
> 1. **CDN Edge Caching**: Cache public note content at Cloudflare/CloudFront edge nodes with `Cache-Control: public, s-maxage=60`. 99% of requests are served directly from edge memory in under 15ms.
> 2. **Decoupled View Count Ingestion**: Instead of locking the PostgreSQL row on every view, the edge worker runs `INCR share:{token}:views` in Redis (or pushes to a Kafka stream). A background worker flushes batched counts to Postgres every 5–10 seconds (`view_count = view_count + $batch`).
> 3. **Database Read Replicas**: Route read traffic across read replicas with PgBouncer connection pooling."*

---

#### Q4: How would you prevent brute-force attempts on password-protected links?
**Your Answer:**
> *"We implement defense-in-depth:*
> 1. **Sliding-Window Rate Limiting**: Limit attempts to 5 failed tries per 10-minute window per IP and token (`src/server/routes/share.ts`), returning `429 Too Many Requests`.
> 2. **High Entropy Dynamic Keys**: Auto-generated keys are 10 alphanumeric characters ($\approx 58$ bits of entropy, $3 \times 10^{17}$ combinations), making random guessing computationally infeasible.
> 3. **Timing Attack Protection**: Passwords are verified using bcrypt constant-time comparison.
> 4. **CAPTCHA Fallback**: Cloudflare Turnstile or CAPTCHA triggered after 3 failed attempts."*

---

### 3. Code Tour: Which Files to Show the Interviewer

1. **`src/db/schema.ts`** (3 clean tables):
   - `users` — Authentication accounts.
   - `notes` — User's notes (title, content, foreign key to user).
   - `share_links` — Token, `share_type` (ONE_TIME vs TIME_BASED), `access_type` (PUBLIC vs PASSWORD_PROTECTED), `password_hash`, `expires_at`, `is_revoked`, `used_at`, `view_count`.
2. **`src/server/routes/share.ts`**:
   - Show the `consumeShareLink` helper function to demonstrate your understanding of atomic database queries and race-condition prevention.
3. **`scripts/verify-e2e.mjs`**:
   - Show the concurrency test (Step 6) where 10 simultaneous requests are fired concurrently with `Promise.all` and exactly 1 succeeds while 9 fail with 410 Gone.

---

## 🚀 Quick Setup & Run

### 1. Install & Start
```bash
npm install
npm run build
npm start
```
Open [http://localhost:3000](http://localhost:3000).

### 2. Run Automated Tests
```bash
npm run test:api
```

### 3. Test Credentials
- **Email**: `demo@example.com`
- **Password**: `demo123456`
*(Or click "Use Demo Account" on `/login`)*.

---

## 🛠️ Tech Stack Summary

- **Frontend**: Next.js 14 App Router, React, Tailwind CSS (minimal grey palette).
- **Backend API**: Hono.js mounted in Next.js Route Handlers (`src/app/api/[[...route]]`).
- **Database & ORM**: PostgreSQL with Drizzle ORM (supports embedded PGlite for zero-config local running, and standard Postgres via `DATABASE_URL`).
- **Security**: bcryptjs password hashing, Jose JWT cookies, crypto random tokens.
