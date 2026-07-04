# Enhancement Proposal — Financial 101 Master
*Scan date: 2026-07-02 · ~34,000 LOC TypeScript · Next.js 14 / React 18 / Zustand / Supabase*

## Snapshot

The app is feature-rich (forecasting, DCA/Monte Carlo simulators, AI coach, LINE integration, statement import) and the May data-isolation fixes are in place: the Zustand store uses sessionStorage, `/api/sync` authenticates and derives `storageKey` server-side, and the admin API verifies the `admin` role. The gaps now are security hardening, zero test coverage, and repo/code hygiene.

---

## P0 — Security hardening

**1. Unauthenticated AI endpoints.** Middleware exempts all `/api/*`, and `/api/ai/chat` (plus the other AI routes: suggest-cuts, forecast, investments/*) calls Anthropic with no session check. Anyone who finds the URL can burn your API credits or use it as a free Claude proxy. Fix: reuse `getAuthenticatedUserStorageKey()` from `/api/sync` as a shared `requireUser()` helper and apply it to every non-public API route. ~1 day.

**2. `fp_storage_key` cookie is a bearer token.** Path B in `/api/sync` trusts an unsigned, client-settable cookie — anyone who knows (or brute-forces) a valid `storage_key` gets full read/write of that user's data. Fix: sign the cookie (HMAC with a server secret) or replace with a server-issued session token stored in `app_users`. ~half day.

**3. Legacy SHA-256 password hashes.** `users.ts` hashes passwords with unsalted SHA-256 into `app_users.password_hash`. Supabase Auth handles real login, so either delete the legacy hash path entirely (preferred) or switch to bcrypt/argon2. ~half day.

**4. No rate limiting.** AI routes especially. Add a simple per-user/IP limiter (Upstash Ratelimit or an in-memory token bucket per Vercel instance). ~half day.

## P1 — Tests + CI (currently zero of both)

There are no test files and no `.github/` workflows, despite CLAUDE.md mandating multi-user isolation tests. Proposal:

- **Vitest** for the pure engine code first — `src/lib/engine/*` (tax, forecast, mortgage, debt-payoff, projection) is deterministic and high-value; regressions here silently corrupt financial numbers.
- **Integration tests** for `/api/sync` auth: wrong user → 403, cookie tampering → 401 (this codifies the May 10 incident checklist).
- **GitHub Actions**: lint + `tsc --noEmit` + tests + `check-shell-escapes` on every push. Git history ("fix", "Push", "push") shows fixes going straight to prod — CI is the cheapest guardrail.
~2–3 days total.

## P2 — Repo and code hygiene

- **Root clutter**: ~50 one-off files (`Fix *.command`, `*.bat`, `HANDOFF_*.md`, `FIX_SUMMARY_*.md`, `.patch`, `.bundle`) sit beside source. Move docs to `docs/archive/`, delete dead scripts, keep the root to config + README + CLAUDE.md. ~1 hour, big clarity win.
- **Monolith pages**: `expenses/actuals/page.tsx` (1,181 lines), `scenarios/page.tsx` (964), `expenses/page.tsx` (808). Extract components/hooks as you next touch them — no big-bang rewrite needed.
- **Uncommitted change**: `src/app/expenses/actuals/page.tsx` is modified but not committed.
- **Broken optionalDependency**: `@next/swc-win32-x64-msvc@^16.2.4` doesn't match Next 14 — remove it.
- **Remaining localStorage**: audit-log, LINE tokens/UID, theme are all userId-keyed (acceptable), but audit logs persist across users on a shared browser — consider clearing on logout like the store.

## P3 — Platform upgrades & features

- **Next 15 + React 19** upgrade (moderate effort; do after tests exist).
- **Supabase RLS**: data sync currently relies entirely on the service-role key + app-level checks. Row-level security policies would make isolation database-enforced — the strongest possible fix for the May incident class.
- **Error monitoring** (Sentry): sync failures currently only surface in console logs.
- **Feature candidates** (from existing specs in repo): finish SCENARIO_EXPANSION_PLAN, INVESTMENTS_AI_SIMULATOR remaining clusters; add CSV/xlsx export of forecasts; PWA/offline mode for mobile use.

---

## Suggested order

Week 1: P0 items 1–4 (all small, all high-impact). Week 2: engine unit tests + CI. Week 3: sync auth integration tests + repo cleanup. Then P3 as capacity allows.
