# SONNET HANDOFF — Finish LINE Alert Setup + Deploy (Short-Term Radar)

**Date:** 2026-07-04
**Prepared by:** Fable session (feature build complete; ops/setup remaining)
**Owner decision already made:** Create a NEW dedicated "Financial 101" Messaging API bot (NOT reusing BurnMaCal / TC Collectibles).

---

## 1. Context — what is already DONE (do not rebuild)

The Investments tab now has a complete AI Short-Term Radar feature set. All code is written, typechecked (`npx tsc --noEmit`), and passes `scripts/check-shell-escapes.mjs`. Nothing is deployed yet.

New/changed files:

| File | Purpose |
|---|---|
| `src/app/api/investments/short-term-picks/route.ts` | Haiku + capped web_search → 7–14d US picks JSON |
| `src/app/investments/_components/ShortTermAIRadar.tsx` | Radar UI: pulse gauge, pick cards, Monte Carlo sim ($ levels), scan cache, pin buttons |
| `src/app/investments/_components/WatchlistCard.tsx` | Pinned picks, Refresh prices, **LINE alerts toggle** |
| `src/app/investments/_components/watchlist.ts` | Watchlist model; sessionStorage cache + Supabase sync |
| `src/app/investments/_components/ScorecardCard.tsx` | Calibration scorecard UI |
| `src/app/api/investments/watchlist-quotes/route.ts` | Free quote proxy (Yahoo/stooq via `src/lib/quotes.ts`) |
| `src/app/api/investments/radar-store/route.ts` | Per-user blob: watchlist + scans + alerts (`user_data` key `${storageKey}__radar`) |
| `src/app/api/investments/scorecard/route.ts` | Grades matured scans vs actual closes |
| `src/app/api/cron/watchlist-alerts/route.ts` | Daily cron → LINE Messaging API push (CRON_SECRET guarded) |
| `src/lib/quotes.ts`, `src/lib/line-push.ts` | Shared quote fetchers; Messaging API push helper |
| `src/app/api/line/notify/route.ts`, `src/lib/line-notify.ts` | MIGRATED off dead LINE Notify → Messaging API |
| `vercel.json` | Added cron: `/api/cron/watchlist-alerts` at `15 21 * * 1-5` |
| `.env.local.example` | Documents `LINE_CHANNEL_ACCESS_TOKEN` + `CRON_SECRET` |
| `Set CRON_SECRET.command` | Sets CRON_SECRET on Vercel (secret already baked in) + `.env.local` |
| `Set LINE_CHANNEL_ACCESS_TOKEN.command` | Prompts for token, sets Vercel prod+preview + `.env.local` |

Key facts:
- LINE Notify is DISCONTINUED (2025-03-31). All pushes go through `api.line.me/v2/bot/message/push` using server env `LINE_CHANNEL_ACCESS_TOKEN` and the user's `lineUserId` (captured at LINE Login; lives in Zustand store + Supabase `user_metadata.line_user_id`).
- Alerts are opt-in per user via the WatchlistCard toggle; opt-out wipes the stored `lineUserId` from the radar blob.
- LINE Developers console: provider **StOyReO** (`https://developers.line.biz/console/provider/2004845831`). Existing channels: Financial 101 Master (LINE Login, Published), BurnMaCal Login, BurnMaCal (Messaging API), Pocket Expense, TC Collectibles (Messaging API). **No Financial 101 Messaging API channel yet — that's your job.**

## 2. Remaining work (in order)

### A. Create the "Financial 101" Messaging API bot (browser; user authorizes)
1. Since 2024 you CANNOT create a Messaging API channel directly in LINE Developers console — create a LINE Official Account instead at `https://manager.line.biz/` (LINE Official Account Manager) → Create new account. Suggested: name "Financial 101 Master", category: Finance (any sensible subcategory), Thailand.
2. In OA Manager: Settings → Messaging API → **Enable Messaging API**, choose provider **StOyReO**. This creates the Messaging API channel that then appears in the LINE Developers console.
3. In LINE Developers console → StOyReO → the new channel → **Messaging API tab** → issue a long-lived **Channel access token**. Copy it.
4. Same tab: show the bot's **QR code** — the user must scan it with their phone and ADD THE BOT AS A FRIEND (pushes are rejected otherwise). Pause and tell the user when to scan.

### B. Set env vars on Vercel (project `financial-101-master`, scope `stoyreo`)
Preferred: user double-clicks the two `.command` scripts (they handle everything):
- `Set CRON_SECRET.command` (secret pre-generated inside)
- `Set LINE_CHANNEL_ACCESS_TOKEN.command` (paste token from step A3)
Alternative: Vercel dashboard → financial-101-master → Settings → Environment Variables (production + preview).

### C. Deploy
Follow the repo's normal release protocol (see `RELEASE_PROTOCOL.md` / `push.command`). The cron registers from `vercel.json` on deploy. Bump version per `CHANGELOG.md` conventions if the protocol requires it.

### D. Verify end-to-end
1. `GET /api/cron/watchlist-alerts` with header `Authorization: Bearer <CRON_SECRET>` → expect `{ ok: true, usersChecked, alertsSent }` (503 means missing LINE token env; 401 means wrong secret).
2. In the app: sign in with LINE → Investments tab → run a radar scan → pin a pick → flip **LINE alerts on** (must NOT show the "sign in with LINE first" message).
3. Optional live test: temporarily set a pinned item's `expectedHighPct` very low in the radar blob, re-run the cron call, confirm a LINE push arrives from the new bot, then undo.
4. Vercel dashboard → Cron Jobs: confirm `/api/cron/watchlist-alerts` is listed.

## 3. Constraints — read before touching anything

- **CLAUDE.md rules apply**: never edit `.ts`/`.tsx` via heredoc/sed/echo (use editor tools); never introduce `localStorage` for user data; all per-user storage is sessionStorage or the server blob keyed server-side.
- Do NOT put the channel access token in git, chat logs, or any file other than `.env.local` (which is gitignored) / Vercel env vars.
- Do not ask the user for LINE or Vercel passwords — they authorize in the browser themselves.
- The radar-store authorization model (server derives the storage key; client never passes one) must not be weakened.

## 4. Definition of done

- [ ] New Financial 101 Messaging API channel exists under StOyReO
- [ ] Long-lived channel access token issued
- [ ] User has friended the bot (QR scanned)
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` + `CRON_SECRET` set on Vercel (prod + preview) and in `.env.local`
- [ ] Deployed; cron visible in Vercel dashboard
- [ ] Manual cron call returns `ok: true`; test LINE push received
