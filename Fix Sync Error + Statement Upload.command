#!/bin/bash
# Fixes:
# 1. Remote: error in sync bar (gmail vs icloud email mismatch in /api/sync)
# 2. Statement upload crash (React #310 from useMemo in JSX)

set -e
echo "══════════════════════════════════════════════"
echo "  Fix Sync Error + Statement Upload"
echo "══════════════════════════════════════════════"

REPO_DIR=$(mktemp -d)
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

python3 - << 'PYEOF'
import sys, re

# ── Fix 1: /api/sync email→uid fallback ──────────────────────────────────
with open("src/app/api/sync/route.ts") as f:
    src = f.read()

old = '''      if (!userRows) {
        console.warn("[getAuthenticatedUserStorageKey] User not found in app_users:", supabaseUser.email);
        return { ok: false, error: "unauthorized: user not found in app registry" };
      }'''

new = '''      if (!userRows) {
        // Fallback: look up by supabase_user_id (handles email mismatch,
        // e.g. toy.theeranan@gmail.com auth vs toy.theeranan@icloud.com row)
        const { data: byUid } = await adminDb
          .from("app_users").select("*")
          .eq("supabase_user_id", supabaseUser.id).maybeSingle();
        if (byUid) {
          const appUser = rowToAppUser(byUid as any);
          if (!appUser.isActive) return { ok: false, error: "unauthorized: inactive" };
          return { ok: true, storageKey: appUser.storageKey, userId: appUser.id };
        }
        console.warn("[getAuthenticatedUserStorageKey] Not found:", supabaseUser.email);
        return { ok: false, error: "unauthorized: user not found in app registry" };
      }'''

if old not in src:
    print("sync route: already patched or changed — skipping")
else:
    src = src.replace(old, new, 1)
    with open("src/app/api/sync/route.ts", "w") as f:
        f.write(src)
    print("✓ api/sync/route.ts")

# ── Fix 2: actuals page — hoist useMemo out of JSX ───────────────────────
with open("src/app/expenses/actuals/page.tsx") as f:
    src = f.read()

if "statementGroups" in src:
    print("✓ actuals/page.tsx already patched")
else:
    old_anchor = "  }, [monthTxns]);\n\n  // ── Handlers"
    if old_anchor not in src:
        # Try alternate anchor
        old_anchor = "  }, [monthTxns]);"

    new_piece = '''

  const statementGroups = useMemo(() => {
    const sorted = [...statementImports].sort((a, b) => b.statementDate.localeCompare(a.statementDate));
    const groups: { type: "group" | "single"; date: string; items: typeof statementImports }[] = [];
    const lineByDate: Record<string, typeof statementImports> = {};
    for (const s of sorted) {
      if (s.bank === "LINE") {
        if (!lineByDate[s.statementDate]) lineByDate[s.statementDate] = [];
        lineByDate[s.statementDate].push(s);
      } else {
        groups.push({ type: "single", date: s.statementDate, items: [s] });
      }
    }
    for (const [date, items] of Object.entries(lineByDate).sort().reverse()) {
      groups.unshift(items.length > 1 ? { type: "group", date, items } : { type: "single", date, items });
    }
    return groups;
  }, [statementImports]);'''

    src = src.replace(old_anchor, old_anchor + new_piece, 1)
    src = re.sub(
        r'\{useMemo\(\(\) => \{.*?return groups;\s*\}, \[statementImports\]\)\.map\(group =>',
        '{statementGroups.map(group =>',
        src, count=1, flags=re.DOTALL
    )
    with open("src/app/expenses/actuals/page.tsx", "w") as f:
        f.write(src)
    print("✓ actuals/page.tsx (useMemo hoisted)")
PYEOF

git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/app/api/sync/route.ts src/app/expenses/actuals/page.tsx
if git diff --cached --quiet; then
  echo "Already up to date."
else
  git commit -m "fix: sync supabase_user_id fallback + actuals useMemo hoist"
  git push origin main
  echo "✓ Pushed — Vercel deploys in ~1 min"
fi
echo "Done."
