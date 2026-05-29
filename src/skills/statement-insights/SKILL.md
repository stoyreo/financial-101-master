---
name: statement-insights
description: Analyze bank statements for spending patterns, anomalies, and savings opportunities. Use this when the user uploads a statement, asks "what does this statement tell us?", "analyze my spending", "find savings opportunities", or "what are my spending trends?" Generates narrative insights including spending trends by category, identifies unusual transactions, suggests budget cuts, and compares to previous statements. Extends the Savings Optimizer with personalized recommendations based on actual transaction data.
compatibility: Node.js, Anthropic API (Claude), access to imported statement data
---

## Overview

This skill analyzes bank statements imported into Financial 101 Master and provides actionable spending insights. It goes beyond simple data visualization to tell the story of where money is going and where it can be saved.

## Analysis Categories

### 1. Spending Trends by Category
For each expense category:
- Total spent this period
- % of total budget
- Trend vs previous period (up/down/stable)
- Top 3 transactions in category
- **Insight:** Where the money is going

**Example output:**
```
Dining & Entertainment: $2,340 (18.5% of spending)
↑ Up 22% from last month
Top transactions:
  • Line: $425 (May 15)
  • Starbucks: $180/month (recurring)
  • Restaurant A: $890 (May 22)
```

### 2. Anomalies & Unusual Transactions
Detect outliers:
- One-time large purchases (>3x avg transaction)
- Unusual merchant types for this user
- Duplicate/similar transactions close together
- Timing anomalies (purchases at odd hours)
- **Insight:** What looks different and why

**Example output:**
```
🚨 Anomalies detected:
  • $3,200 transfer to unknown account (May 18) — 10x typical transfer
  • Double charge from Amazon ($89.99 x2 on May 12) — possible error
  • $1,500 medical charges (May 25) — new category for you
```

### 3. Savings Opportunities
AI-powered suggestions:
- Subscriptions not used (e.g., gym not visited in 90 days)
- Recurring charges that could be negotiated
- Spending leakage (small charges that add up: $5 coffees, $3 apps)
- Spending categories with room to cut
- Comparison to peer averages (if available)
- **Insight:** Where to cut without lifestyle impact

**Example output:**
```
💰 Quick wins (easy cuts, no sacrifice):
  • Gym membership: $49/mo × 3 months unused = $147 easy save
  • Streaming subscriptions: $45/mo combined (Netflix + 3 others) = consolidate
  • Coffee leakage: $180/month on $5-6 coffee runs = batch-prep savings
  
💪 Medium effort (small lifestyle adjustment):
  • Dining & Entertainment: Cut from $2,340 → $1,800 (20% reduction feasible)
  • Fast food: $280/mo → Meal prep: $120/mo = $160/mo savings
```

### 4. Comparisons to Previous Statements
Month-over-month analysis:
- Total spending change
- Which categories grew/shrunk
- Seasonal patterns (higher in winter, lower in summer)
- Budget variance (budgeted vs actual)
- Trend direction (is spending accelerating?)
- **Insight:** Am I on track? What's changing?

**Example output:**
```
May 2026 vs April 2026:
Total: $12,450 → $12,890 (+3.5%)
  • Groceries: +8% (seasonal: warmer weather = more fresh food)
  • Utilities: -5% (cooling season ended)
  • Travel: +35% (vacation planned, expected)
  • Dining: -2% (intentional reduction working!)
Trajectory: Stable overall; watch dining creep
```

### 5. Personalized Recommendations
AI-generated action items:
- Specific to this user's spending patterns
- Prioritized by impact ($$ saved per effort)
- Tied to Financial 101 features (budgets, savings goals)
- Seasonal/timing considerations
- **Insight:** What should I do about this?

**Example output:**
```
🎯 Action items (prioritized by ROI):
1. Set dining budget to $1,800/mo in app — enables auto-alerts
2. Pause gym membership 2 months → $98 saved (easily resume later)
3. Bundle streaming: Keep Netflix+Disney+Spotify, cancel duplicates → $20/mo
4. Enable Savings Optimizer for "Discretionary" category → auto-suggests cuts
5. Schedule monthly review every 1st of month (recurring reminder)
```

## How to use

**Analyze statement after upload:**
```
"I just uploaded my May statement. What does it tell us?"
```

**Compare periods:**
```
"How does my May spending compare to April?"
```

**Find savings:**
```
"Where can I cut expenses without affecting my lifestyle?"
```

**Identify anomalies:**
```
"Are there any unusual transactions I should know about?"
```

## Expected output

A comprehensive narrative report with:
- 📊 **Spending Summary** — Total, breakdown by category, key metrics
- 📈 **Trends** — Category-level changes, trajectory, patterns
- 🚨 **Anomalies** — Unusual transactions flagged + explanations
- 💰 **Savings Ideas** — Specific, actionable, prioritized by ROI
- 🔄 **Comparisons** — vs previous periods, vs budgets, vs trends
- 🎯 **Recommendations** — Next steps tied to Financial 101 features

## Connection to Savings Optimizer

The Savings Optimizer (in /expenses page) shows projected savings if you adjust spending sliders. This skill **explains why** you should make those adjustments, using actual data. Use together:

1. Run Statement Insights → understand current patterns
2. Open Savings Optimizer → model impact of cuts
3. Update budgets → set guardrails in Financial 101
4. Track results → run insights again next month to verify

## Implementation notes

**Data source:** Parsed bank statements via statement import API  
**AI model:** Claude with financial analysis prompt  
**Update frequency:** Manual (run after statement import)  
**Data privacy:** All analysis stays in your account (not shared)

## See also

- [Deployment Validator](../deployment-validator/SKILL.md) — Pre-deploy safety checks
- [Financial Data Auditor](../financial-data-auditor/SKILL.md) — Verify data isolation
- [Savings Optimizer Component](../../src/components/dashboard/SavingsOptimizer.tsx) — Interactive spending projection
