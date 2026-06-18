// ============================================================
// CORE DATA TYPES - Financial Planning App
// ============================================================

export type Currency = "THB" | "USD" | "EUR";
export type Frequency = "monthly" | "yearly" | "one-time";
export type RiskProfile = "conservative" | "moderate" | "aggressive";
export type InterestType = "fixed" | "floating";
export type DebtType = "mortgage" | "credit-card" | "personal-loan" | "car-loan" | "other";
export type AccountType = "PVD" | "RMF" | "SSF" | "SSO" | "brokerage" | "savings" | "crypto" | "other";
export type IncomeCategory = "salary" | "bonus" | "freelance" | "rental" | "dividend" | "interest" | "other";

// ── Profile ──────────────────────────────────────────────
export interface Profile {
  id: string;
  fullName: string;
  dateOfBirth: string;           // ISO yyyy-MM-dd
  retirementAge: number;
  lifeExpectancy: number;
  country: string;
  currency: Currency;
  planningStartDate: string;
  maritalStatus: string;
  householdNotes: string;
  emergencyFundTargetMonths: number;
  targetMinCashBalance: number;
  riskProfile: RiskProfile;
  notes: string;
  currentCashBalance: number;
}

// ── Income ───────────────────────────────────────────────
export interface IncomeItem {
  id: string;
  name: string;
  category: IncomeCategory;
  owner: string;
  frequency: Frequency;
  amount: number;                // in frequency units
  startDate: string;
  endDate?: string;
  annualGrowthRate: number;      // decimal e.g. 0.04 = 4%
  isTaxable: boolean;
  notes: string;
  isActive: boolean;
  /** Chance (0-100) this income actually pays out — mainly for STI/bonus items
   *  where `amount` is entered as the maximum possible payout. Undefined = 100%.
   *  Expected value used in all forecasts/totals = amount × (probability / 100). */
  probability?: number;
}

// ── Expenses ─────────────────────────────────────────────
export interface ExpenseItem {
  id: string;
  name: string;
  category: string;
  amount: number;
  frequency: Frequency;
  owner: string;
  startDate: string;
  endDate?: string;
  inflationRate: number;         // decimal
  isEssential: boolean;
  notes: string;
  isActive: boolean;
  /** @deprecated as of 2026-04-28 — `amount` is now the canonical budget. Field kept for backward compat with persisted JSON; do not write to it. */
  budgetAmount?: number;         // for budget vs actual
}

// ── Debts ────────────────────────────────────────────────
/** A planned total monthly payment that applies for a calendar-year range.
 *  Lets a borrower plan incremental step-up payments (e.g. Y2, Y3, Y4...) on
 *  a mortgage instead of a single flat extra payment for the whole term. */
export interface PlannedPayment {
  startYear: number;       // calendar year this payment amount starts applying
  /** Calendar year this amount stops applying (inclusive). Omit/undefined =
   *  open-ended — keep paying this amount until the loan is fully paid off
   *  (or until a later entry's startYear takes over). */
  endYear?: number;
  monthlyPayment: number;  // total planned monthly payment (replaces standard + extra for the range)
}

export interface DebtAccount {
  id: string;
  name: string;
  lender: string;
  debtType: DebtType;
  originalPrincipal: number;
  currentBalance: number;
  annualInterestRate: number;    // decimal e.g. 0.065 = 6.5%
  interestType: InterestType;
  minimumMonthlyPayment: number;
  standardMonthlyPayment: number;
  extraMonthlyPayment: number;
  startDate: string;
  maturityDate?: string;
  paymentDayOfMonth?: number;
  notes: string;
  isActive: boolean;
  // Mortgage-specific
  propertyName?: string;
  loanTermMonths?: number;
  annualPrepayment?: number;
  refinanceDate?: string;
  refinanceNewRate?: number;
  refinanceFee?: number;
  /** Planned total-monthly-payment step-ups by calendar year (mortgage only). */
  plannedPayments?: PlannedPayment[];
}

// ── Investments ──────────────────────────────────────────
export interface InvestmentAccount {
  id: string;
  name: string;
  accountType: AccountType;
  assetDescription: string;
  marketValue: number;
  currency: Currency;
  isTaxAdvantaged: boolean;
  expectedAnnualReturn: number;  // decimal
  monthlyContribution: number;
  annualContribution: number;
  owner: string;
  notes: string;
  isActive: boolean;
}

// ── Retirement ───────────────────────────────────────────
export interface RetirementAssumptions {
  retirementAge: number;
  expectedAnnualExpense: number;
  inflationRate: number;
  portfolioReturnPreRetirement: number;
  portfolioReturnDuringRetirement: number;
  safeWithdrawalRate: number;
  pensionMonthlyAmount: number;
  ssoMonthlyBenefit: number;
}

// ── Tax (Thailand) ───────────────────────────────────────
export interface TaxAssumptions {
  annualGrossIncome: number;
  personalDeduction: number;       // 60,000 standard
  employmentIncomeDeduction: number; // 50% of income, max 100,000
  pvdContribution: number;
  rmfContribution: number;
  ssfContribution: number;
  lifeInsurancePremium: number;    // max 100,000
  healthInsurancePremium: number;  // max 25,000
  mortgageInterestDeduction: number; // max 100,000
  parentalDeduction: number;       // 30,000 per parent
  childDeduction: number;          // 30,000 per child
  otherDeductions: number;
  annualBonus: number;
}

// ── Scenarios ────────────────────────────────────────────
export interface ScenarioAssumptions {
  incomeGrowthRate?: number;
  inflationRate?: number;
  investmentReturnRate?: number;
  mortgageExtraMonthlyPayment?: number;
  annualLumpSumPrepayment?: number;
  annualBonusAmount?: number;
  taxReliefInvestmentAmount?: number;
  retirementAge?: number;
  emergencyFundTargetMonths?: number;
  incomeShockYear?: number;       // year when income shock happens
  incomeShockFactor?: number;     // e.g. 0.5 = income drops 50%
  incomeShockDuration?: number;   // months
  refinanceYear?: number;
  refinanceRate?: number;
  mortgageRateChange?: number;    // applied from given year
  mortgageRateChangeYear?: number;
  oneTimeExpenses?: { year: number; amount: number; description: string }[];
  // New fields for Feature 2
  expenseInflationOverride?: number;     // default = inflationRate
  salaryRaiseYear?: number;              // year of one-time pay bump
  salaryRaiseFactor?: number;            // e.g. 1.15 = +15%
  investmentVolatility?: number;         // sigma for ± band, default 0.12
  windfallYear?: number;                 // lump cash inflow year
  windfallAmount?: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  isBase: boolean;
  color: string;
  assumptions: ScenarioAssumptions;
  createdAt: string;
  tag?: "good" | "bad" | "custom";
  clusters?: string[];                           // e.g. ["Wealth Accumulation & Growth"]
  riskLevel?: "low" | "medium" | "high";        // Low/Med/High
  timeHorizon?: "short" | "medium" | "long";    // 1-2y / 3-5y / 5y+
}

// ── Forecast Results ─────────────────────────────────────
export interface AmortizationRow {
  month: number;              // 1-indexed from loan start
  calendarYear: number;
  calendarMonth: number;      // 1-12
  openingBalance: number;
  scheduledPayment: number;
  extraPrincipal: number;
  totalPayment: number;
  interestPaid: number;
  principalPaid: number;
  closingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}

export interface MonthlyForecastRow {
  year: number;
  month: number;              // 1-12
  label: string;              // "Jan 2025"
  totalIncome: number;
  totalExpenses: number;
  mortgagePayment: number;
  otherDebtPayments: number;
  totalDebtPayments: number;
  netCashFlow: number;
  mortgageBalance: number;
  totalDebtBalance: number;
  investmentBalance: number;
  netWorth: number;
  isNegativeCashFlow: boolean;
}

export interface YearlyForecastRow {
  year: number;
  age: number;
  totalIncome: number;
  totalExpenses: number;
  totalDebtPayments: number;
  netCashFlow: number;
  mortgageBalance: number;
  totalDebtBalance: number;
  investmentBalance: number;
  netWorth: number;
  debtToIncomeRatio: number;
  debtServiceRatio: number;
  isMortgagePaidOff: boolean;
  isRetired: boolean;
  retirementWithdrawal: number;
  milestones: string[];
}

export interface MortgageSummary {
  originalBalance: number;
  monthlyPayment: number;
  payoffMonth: number;          // months from now
  payoffDate: string;
  totalInterestPaid: number;
  totalPaid: number;
  monthsSaved: number;          // vs no extra payments
  interestSaved: number;        // vs no extra payments
  schedule: AmortizationRow[];
}

export interface DebtPayoffSummary {
  debtId: string;
  debtName: string;
  payoffDate: string;
  totalInterestPaid: number;
  monthsToPayoff: number;
}

export interface AppState {
  profile: Profile;
  incomes: IncomeItem[];
  expenses: ExpenseItem[];
  debts: DebtAccount[];
  investments: InvestmentAccount[];
  retirement: RetirementAssumptions;
  tax: TaxAssumptions;
  scenarios: Scenario[];
  activeScenarioId: string;
  // Derived / cached
  yearlyForecast: YearlyForecastRow[];
  monthlyForecast: MonthlyForecastRow[];
}


// ── Actuals: imported transactions from credit card statements ─────
export interface Transaction {
  accountId: string;  // NEW — required, identifies owner account
  id: string;
  postDate: string;
  transDate: string;
  billingMonth: string;
  description: string;
  merchantKey: string;
  amount: number;
  currency: Currency;
  fxAmount?: number;
  fxCurrency?: string;
  category: string;
  matchedExpenseId?: string;
  source: "uob" | "kbank" | "scb" | "kept" | "tmb" | "manual" | "line" | "other";
  cardLast4?: string;
  statementImportId?: string;
  confidence: number;
  isCredit: boolean;
  notes?: string;
  dedupeKey: string;
}

export interface MerchantRule {
  id: string;
  pattern: string;
  category: string;
  isEssential?: boolean;
  createdAt: string;
  source: "default" | "user" | "ai";
  hits: number;
}

export interface StatementImport {
  accountId: string;  // NEW
  id: string;
  fileName: string;
  importedAt: string;
  bank: string;
  statementDate: string;
  billingMonth: string;
  periodStart: string;
  periodEnd: string;
  totalCharges: number;
  totalCredits: number;
  transactionCount: number;
  duplicatesSkipped: number;
  cardholderName?: string;
  fileHash?: string;
  notes?: string;
}
