#!/bin/bash
# Fix: React error #310 on /expenses/actuals (useMemo called inside JSX)

set -e
echo "══════════════════════════════════════════════"
echo "  Fix Actuals Crash — React error #310"
echo "══════════════════════════════════════════════"

REPO_DIR=$(mktemp -d)
git clone https://github.com/stoyreo/financial-101-master.git "$REPO_DIR"
cd "$REPO_DIR"

python3 - << 'PYEOF'
import sys

with open("src/app/expenses/actuals/page.tsx") as f:
    src = f.read()

# Hoist useMemo out of JSX
old_anchor = '''  const topMerchants = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of monthTxns) {
      if (t.isCredit) continue;
      map[t.description] = (map[t.description] ?? 0) + t.amount;
    }
    return Object.entries(map)
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [monthTxns]);'''

if old_anchor not in src:
    print("Already patched or structure changed — skipping hoist")
else:
    new_anchor = old_anchor + '''

  const statementGroups = useMemo(() => {
    const sorted = [...statementImports].sort((a, b) => b.statementDate.localeCompare(a.statementDate));
    const groups: { type: "group" | "single"; date: string; items: typeof statementImports }[] = [];
    const lineByDate: Record<string, typeof statementImports> = {};
    for (const s of sorted) {
      if (s.bank === "LINE") {
        const date = s.statementDate;
        if (!lineByDate[date]) lineByDate[date] = [];
        lineByDate[date].push(s);
      } else {
        groups.push({ type: "single", date: s.statementDate, items: [s] });
      }
    }
    for (const [date, items] of Object.entries(lineByDate).sort().reverse()) {
      groups.unshift(items.length > 1
        ? { type: "group", date, items }
        : { type: "single", date, items });
    }
    return groups;
  }, [statementImports]);'''

    src = src.replace(old_anchor, new_anchor, 1)

    old_jsx = '{useMemo(() => {'
    if old_jsx in src:
        # Find and replace the whole inline useMemo block
        import re
        src = re.sub(
            r'\{useMemo\(\(\) => \{.*?return groups;\s*\}, \[statementImports\]\)\.map\(group =>',
            '{statementGroups.map(group =>',
            src,
            count=1,
            flags=re.DOTALL
        )

    with open("src/app/expenses/actuals/page.tsx", "w") as f:
        f.write(src)
    print("✓ actuals/page.tsx patched")
PYEOF

git config user.email "toy.theeranan@gmail.com"
git config user.name "Theeranan"
git add src/app/expenses/actuals/page.tsx
if git diff --cached --quiet; then
  echo "Already patched"
else
  git commit -m "fix(actuals): hoist useMemo out of JSX — fixes React error #310"
  git push origin main
  echo "✓ Pushed — Vercel deploys in ~1 min"
fi
echo "Done."
