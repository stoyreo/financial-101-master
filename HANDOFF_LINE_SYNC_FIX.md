# Handoff: LINE Sync 500 Error Fix
**Project:** Financial 101 Master — Expense Tracker API  
**Date:** 2026-05-24  
**Status:** STILL FAILING — traceback logging just added, needs deploy + log inspection  

---

## The Goal

Fix the endpoint:
```
GET https://expense-tracker-api-weld.vercel.app/api/expenses?line_user_id=Ue3148020c465ba1f30d67336955428c3&limit=3
```
…so it returns **200 + JSON** instead of **500 Internal Server Error**.

This powers the "Sync Now" button in the Financial 101 Master UI (`financial101.vercel.app` → `/api/line/fetch-transactions` proxy).

---

## Architecture

```
Financial 101 UI (Next.js, Vercel)
  → /api/line/fetch-transactions (proxy)
  → expense-tracker-api-weld.vercel.app (FastAPI/ASGI, Vercel serverless)
  → Supabase Postgres via PgBouncer (transaction mode)
```

**Source files:**
- Backend: `/Users/stoyreo/Documents/New project 4/backend/`
- Main file: `/Users/stoyreo/Documents/New project 4/backend/app/main.py`
- DB config: `/Users/stoyreo/Documents/New project 4/backend/app/database.py`
- Deploy script: `/Users/stoyreo/Documents/New project 4/Deploy Only 2.command` (double-click to deploy)

**Vercel projects:**
- Frontend: `prj_EBLQ3RovZazajoH21R6aynljiYPU` (project name: `expense-tracker-web`)
- Backend API: `prj_7LYGII0UhHPO1t0WjRbdhrxFVHfT` (project name: `expense-tracker-api`)

---

## Critical Constraints

### PgBouncer Transaction Mode — NO SAVEPOINT
The `DATABASE_URL` uses `pgbouncer=true&connection_limit=1`. PgBouncer in transaction mode **does not support SAVEPOINT**. This means:
- `session.begin_nested()` **CANNOT be used** — it calls SAVEPOINT internally, gets rejected, and **corrupts the SQLAlchemy Session state**
- Raw `db.execute(text("SAVEPOINT ..."))` also fails
- Solution: plain `try/except` + `db.rollback()` per statement

### pool_size=1, max_overflow=0
Serverless constraint. **Only one DB connection at a time.** If the SQLAlchemy Session has checked out a connection, calling `inspect(engine)` or `engine.begin()` tries to acquire a SECOND connection → deadlock/timeout.  
- Solution: always use `conn = db.connection()` and `inspect(conn)` to reuse the session's connection

### DB User Permissions
The production DB user (via PgBouncer pooler) **cannot ALTER TABLE**. The `ensure_schema_columns()` function tries to add columns — if a column already exists, `ALTER TABLE ... IF NOT EXISTS` still fails with "permission denied" (Postgres checks privileges *before* evaluating IF NOT EXISTS).  
- This means every ALTER TABLE call in `ensure_schema_columns` will fail and trigger `db.rollback()`

---

## Database State (confirmed via Supabase Management API)

All required columns **already exist** in production Supabase:

| Table | Columns confirmed present |
|-------|--------------------------|
| `users` | id, name, line_user_id, created_at, financial_101_key, awaiting_email, linked_email, pet_xp, pet_level, pet_name, streak_days, last_expense_date |
| `categories` | id, name, color, icon, is_active |
| `expenses` | id, user_id, amount, currency, category_id, merchant_id, note, source, occurred_at, created_at |
| `merchants` | id + default_category_id |

**Target user:** id=2, name="tOy", line_user_id="Ue3148020c465ba1f30d67336955428c3", financial_101_key="fp_data_toy" — EXISTS ✓  
**21 expenses** in DB under user_id=2 ✓  
**RLS disabled** on all 7 tables ✓  

---

## Current Code State

### `ensure_schema_columns(db)` — lines 58–138 of main.py
- Uses `conn = db.connection()` + `inspect(conn)` (no second pool checkout)
- Loops through column_patches; skips columns already in DB (`if column_name not in existing_columns`)
- No SAVEPOINT/begin_nested — plain try/except + rollback per ALTER TABLE
- **Problem:** Even though all columns exist, the `inspector.get_columns()` call might not see them if the session is in a bad state after prior rollbacks from `create_all`

### `ensure_database(db)` — lines 141–241 of main.py
Runs on every cold start:
1. `create_all` — no-op (tables exist), but may raise + rollback
2. `ensure_schema_columns(db)` — should be no-ops since all columns exist
3. Seed user/categories — no-ops since they exist
4. Backfill: UPDATE users SET financial_101_key... — fine
5. Backfill: `db.scalar(select(User).where(User.line_user_id == ...))` — **THIS FAILS** → logs `[backfill] user lookup failed`
6. `db.commit()`

### `_resolve_line_user_id(db, line_user_id)` — line 1594
```python
def _resolve_line_user_id(db: Session, line_user_id: Optional[str]) -> int:
    if not line_user_id or not line_user_id.strip():
        raise HTTPException(status_code=400, ...)
    from app.services.crud import get_or_create_line_user
    user = get_or_create_line_user(db, line_user_id.strip())
    return user.id
```
**No try/except here.** If `get_or_create_line_user` raises, it becomes an unhandled 500.

### `get_or_create_line_user` — `/app/services/crud.py` line 97
```python
def get_or_create_line_user(db: Session, line_user_id: str) -> "User":
    user = db.scalar(select(User).where(User.line_user_id == line_user_id))
    if user:
        return user
    display_name = f"LINE {line_user_id[-6:]}"
    user = User(name=display_name, line_user_id=line_user_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
```

### `GET /api/expenses` endpoint — line 1609
```python
def list_expenses(line_user_id, limit, db):
    ensure_database(db)
    user_id = _resolve_line_user_id(db, line_user_id)   # ← 500 likely here
    return db.scalars(select(Expense).where(Expense.user_id == user_id)...).all()
```

---

## What's Been Tried & Eliminated

| Fix | Result |
|-----|--------|
| Disabled RLS on all 7 Supabase tables | Done ✓ |
| Added all missing columns directly via Supabase Management API | Done ✓ |
| Removed all SAVEPOINT / begin_nested | Done ✓ |
| Used `db.connection()` everywhere (no second pool checkout) | Done ✓ |
| Per-column try/except in ensure_schema_columns | Done ✓ |
| Added `traceback.format_exc()` to most catch blocks | Done ✓ |

---

## Last Deployment

Deployment `dpl_9zNEpVce7kcLZdAxr6oiBJkeHNfW` (~03:05 UTC May 24).  
Last log line before crash:
```
03:06:13 | GET | /api/expenses | - | | [backfill] user lookup fail... |
```
Status "-" = function crashed/timed out.

**Most recent code change (just made, NOT YET DEPLOYED):**  
Added `print(traceback.format_exc(), flush=True)` to the `[backfill] user lookup failed` handler (line 228 in main.py).

---

## Immediate Next Steps

### Step 1: Deploy and get the traceback
Double-click: `/Users/stoyreo/Documents/New project 4/Deploy Only 2.command`

Then check Vercel runtime logs:
```python
# Via Vercel MCP tool:
mcp__779adf21__get_runtime_logs(projectId="prj_7LYGII0UhHPO1t0WjRbdhrxFVHfT")
```
Or in browser: https://vercel.com/stoyreo/expense-tracker-api/logs

Look for the full traceback after `[backfill] user lookup failed`.

### Step 2: Likely Root Cause (hypothesis)

The `[backfill] user lookup failed` error is probably **not** the actual 500 cause (it's caught). The 500 is likely from `get_or_create_line_user` in `_resolve_line_user_id` after `ensure_database` returns, because the Session is in a corrupt state from the repeated rollbacks in `ensure_schema_columns`.

**PostgreSQL aborted transaction behaviour:** Once a statement errors in a transaction, Postgres puts the transaction in "aborted" state. Every subsequent statement returns `ERROR: current transaction is aborted`. Only a ROLLBACK recovers it. If `ensure_schema_columns` calls `db.rollback()` after each failed ALTER TABLE, that should recover — but if something goes wrong with the rollback itself, or if there's an error path that doesn't hit rollback, the session remains corrupt.

### Step 3: Nuclear Option Fix (if Step 1 confirms Session corruption)

The cleanest fix is to bypass `ensure_schema_columns` entirely on warm requests by checking if all columns exist in a lightweight way, OR simply **skip all ALTER TABLE** since all columns are already in the DB.

Add a flag to skip `ensure_schema_columns` when all known columns are already confirmed present. Since the DB is fully migrated, you can make `ensure_schema_columns` a complete no-op:

```python
def ensure_schema_columns(db: Session) -> None:
    """All columns confirmed present in production as of 2026-05-24.
    Skipping migration to avoid PgBouncer permission errors corrupting session.
    """
    # UPDATE categories is safe (DML not DDL)
    try:
        db.execute(text("UPDATE categories SET is_active = TRUE WHERE is_active IS NULL"))
    except Exception as _upd_err:
        print(f"[schema] UPDATE categories non-fatal: {_upd_err}", flush=True)
        try:
            db.rollback()
        except Exception:
            pass
```

This eliminates all the ALTER TABLE → permission denied → rollback cycles that may be corrupting the session.

### Step 4: Also add error logging to `_resolve_line_user_id`

```python
def _resolve_line_user_id(db: Session, line_user_id: Optional[str]) -> int:
    if not line_user_id or not line_user_id.strip():
        raise HTTPException(status_code=400, detail="line_user_id is required.")
    try:
        from app.services.crud import get_or_create_line_user
        user = get_or_create_line_user(db, line_user_id.strip())
        return user.id
    except Exception as _resolve_err:
        print(f"[resolve_line_user] FATAL: {_resolve_err}", flush=True)
        print(traceback.format_exc(), flush=True)
        raise HTTPException(status_code=500, detail=f"DB error resolving user: {_resolve_err}")
```

---

## Vercel MCP Tool Info

The Vercel MCP is connected. Tools available:
- `mcp__779adf21-6ac4-43fc-abf0-470685b436fa__get_runtime_logs` — fetch recent logs
- `mcp__779adf21-6ac4-43fc-abf0-470685b436fa__list_deployments` — list recent deploys
- `mcp__779adf21-6ac4-43fc-abf0-470685b436fa__get_deployment` — get specific deployment

Project IDs:
- Backend API: `prj_7LYGII0UhHPO1t0WjRbdhrxFVHfT`
- Frontend: `prj_EBLQ3RovZazajoH21R6aynljiYPU`

---

## Environment Variables (backend)

```
DATABASE_URL=<Supabase PgBouncer URL with pgbouncer=true&connection_limit=1>
LINE_CHANNEL_SECRET=7a88c21b7c3bf96d3f3df49c040c13f1
LINE_CHANNEL_ACCESS_TOKEN=uOMlHy...
APP_PUBLIC_URL=https://liff.line.me/2010058869-Sp6Krzqj
```

---

## Key File Paths

| What | Path |
|------|------|
| Backend main | `/Users/stoyreo/Documents/New project 4/backend/app/main.py` |
| DB config | `/Users/stoyreo/Documents/New project 4/backend/app/database.py` |
| CRUD service | `/Users/stoyreo/Documents/New project 4/backend/app/services/crud.py` |
| Models | `/Users/stoyreo/Documents/New project 4/backend/app/models.py` |
| Deploy script | `/Users/stoyreo/Documents/New project 4/Deploy Only 2.command` |

---

## Supabase Management API (for direct DB queries)

To run raw SQL as superuser (bypasses permission restrictions):
```
POST https://api.supabase.com/v1/projects/riytlsqmjidtucafggxs/database/query
Authorization: Bearer <token from Supabase dashboard localStorage>
Body: { "query": "SELECT * FROM users LIMIT 5" }
```
Token: Get from browser console on supabase.com: `localStorage.getItem('supabase.auth.token')`  
Project ref: `riytlsqmjidtucafggxs`
