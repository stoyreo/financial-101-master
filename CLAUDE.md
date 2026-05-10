# Editing Guidelines for Claude

## Editing TypeScript source — avoid shell-escape artifacts

Never write or modify `.ts`/`.tsx` source via bash heredocs, `sed`, `echo >`, or any shell-redirection pipeline. These routes can escape `!` to `\!` (bash history expansion), `$` to `\$`, and similar — producing invalid TS that SWC rejects with "Expected unicode escape".

Always use direct file editor tools (Write/Edit). If a shell route is truly unavoidable, disable history expansion (`set +H`) and audit the output.

A pre-build check (`scripts/check-shell-escapes.mjs`, wired into `prebuild`) scans for the `\!` artifact and fails the build if it reappears. Do not bypass this check — fix the source instead.

---

## 🔐 Multi-User Data Isolation Checklist

**CRITICAL: Before shipping ANY feature that touches user data, validate:**

### Architecture & Code Review
- [ ] All database queries explicitly filter by `userId` or `accountId` (never omit WHERE clause)
- [ ] No global/shared account IDs—each user must have unique `accountId` (e.g., `session.userId`)
- [ ] Sensitive data uses `sessionStorage` (cleared on tab close), NOT `localStorage` (persists across sessions)
- [ ] Logout handler calls `clearStore()` to reset all in-memory state
- [ ] /api/* endpoints authenticate user and validate they can only access their own `storageKey`

### Testing Requirements
- [ ] Multi-user integration test: User A creates data → User B logs in → User B sees ZERO of User A's data
- [ ] Cross-session test: Login as User A (data appears) → Logout → Login as User B (User A's data gone)
- [ ] Store hydration test: Fresh browser session loads correct user's data (not previous user's cached data)
- [ ] API authorization test: Attempt to read/write another user's storageKey → Returns 403

### Common Blindspots (Lessons from May 10, 2026 incident)
1. **localStorage/sessionStorage cache leakage** — Old user's data persists to next user in same browser tab
2. **Hardcoded/shared account IDs** — All transactions assigned to `id="toy"` meant all users saw all data
3. **Store not cleared on logout** — Even with sessionStorage, same-tab logout→login kept old data
4. **Cache keys without user scope** — Zustand key `"financial-planner-storage-v3"` same for all users

### Files to Check
- `src/lib/store.ts` — Must use sessionStorage, must clear on logout
- `src/lib/accounts.ts` — getCurrentAccount() must return user-specific account
- `src/lib/auth.ts` — clearSession() must call clearStore()
- `src/app/api/sync/route.ts` — POST/GET must authenticate and validate storageKey
- Any `localStorage.setItem()` calls — Convert to sessionStorage or add userId to key
