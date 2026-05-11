# Investment Simulation: 3-Cluster Architecture

## Overview
The Financial 101 Master AI engine has 6 analysis modules that analyze different aspects of financial planning. These have been organized into **3 strategic clusters** for better UX and scenario organization.

---

## 🎯 Cluster 1: WEALTH ACCUMULATION & GROWTH
**Focus:** Building and optimizing investment returns

### Modules
- **Investment Optimization** (Module 1)
  - Portfolio diversification analysis
  - Tax-advantaged account coverage
  - Asset allocation recommendations
  - Concentration risk detection

- **Tax Planning** (Module 2)
  - Thai tax bracket optimization
  - RMF/SSF contribution strategies
  - Tax deduction maximization
  - Annual tax liability projections

- **Savings & Debt Reduction** (Module 4)
  - Debt payoff timeline projections
  - Emergency fund adequacy
  - Savings rate analysis
  - Cash flow optimization

### Key Metrics
- Total invested value
- Tax-advantaged %
- Debt payoff date
- Emergency fund months

### Scenarios in this cluster
- Bull Market Decade (good)
- FIRE at 50 (good)
- Mega Bonus Year (good)
- Career Surge (good)
- Tax Reform Win (good)
- Inheritance Windfall (good)
- Mortgage Free in 5 (good)
- Dual-Income Household (good)

---

## ⚖️ Cluster 2: RISK MANAGEMENT & STABILITY
**Focus:** Protecting wealth and managing downside risks

### Modules
- **Risk Assessment** (Module 3)
  - Portfolio volatility analysis
  - Debt burden ratios
  - Liquidity stress testing
  - Downside scenario analysis

- **Geopolitical Impact** (Module 5)
  - Market volatility hedging
  - Diversification by region/currency
  - Commodity price sensitivity (gold, energy)
  - Black swan event preparedness

### Key Metrics
- Portfolio volatility (%)
- Debt-to-asset ratio
- Emergency fund coverage
- Hedge effectiveness

### Scenarios in this cluster
- Stagflation (bad)
- Rate Hike Shock (bad)
- Recession (bad)
- 5-Year Bear Market (bad)
- Health Emergency (bad)
- Job Loss (bad)
- Housing Bust (bad)
- Layoff & Restart (bad)
- Hyperinflation (bad)
- Late Retirement at 70 (bad)
- Income Shock (base)
- Falling Rates Refi (good - risk mitigation)

---

## 💼 Cluster 3: INCOME & COMPENSATION
**Focus:** Income stability and career-based growth

### Modules
- **Alstom STI Analysis** (Module 6)
  - Short-term incentive probability
  - Bonus timing and amount
  - Company performance metrics
  - Payout likelihood by scenario

- **Income Projections** (from Forecast Engine)
  - Salary growth trajectories
  - Bonus/STI analysis
  - Income shock recovery paths
  - Career milestone timing

### Key Metrics
- Base salary + STI
- Expected annual income
- Income stability score
- Bonus probability

### Scenarios in this cluster
- Base Case (base - current income plan)
- Aggressive Mortgage Paydown (base - income dependent)
- Refinance in 2 Years (base)
- Retirement First (custom - income optimization)
- Career Surge (good)
- Mega Bonus Year (good)
- Dual-Income Household (good)
- Job Loss (bad)
- Income Shock (base)
- Recession (bad)
- Layoff & Restart (bad)

---

## 📊 Scenario Tagging System

All scenarios should be tagged with:
- **Tag**: "good", "bad", or "custom"
- **Cluster**: Which cluster(s) it primarily affects
- **Risk Level**: Low, Medium, High
- **Time Horizon**: Short (1-2y), Medium (3-5y), Long (5y+)

### Example Scenario Metadata
```json
{
  "id": "bull-decade",
  "name": "Bull Market Decade",
  "tag": "good",
  "clusters": ["Wealth Accumulation & Growth"],
  "riskLevel": "low",
  "timeHorizon": "long",
  "description": "Sustained 10% portfolio returns"
}
```

---

## 🎯 Benefits of This Clustering

1. **User Clarity**: Users understand which areas of their finances each scenario impacts
2. **Targeted Analysis**: Run multiple good/bad scenarios per cluster to stress-test specific concerns
3. **Decision Making**: Compare best-case vs worst-case in each cluster independently
4. **Dashboard Design**: Create 3 dashboard sections, one per cluster
5. **Custom Scenario Builder**: Let users create custom scenarios targeting specific clusters

---

## 🔄 Cluster Interactions

**Wealth → Risk**: Higher wealth accumulation can absorb more risk in Cluster 2
**Risk → Income**: Job loss (Cluster 3 bad) impacts ability to execute Cluster 1 strategies
**Income → Wealth**: Career surge (Cluster 3 good) enables aggressive investing (Cluster 1)

When analyzing scenarios, consider cross-cluster impacts for holistic picture.
