"use client";
import { useState } from "react";
import { pct } from "@/lib/utils";
import type { InvestmentAccount, AccountType } from "@/lib/types";
import type { FundInfo, CustomFundInput } from "@/lib/fund-registry";
import {
  Button, Input, NumberInput, Label, Select, Switch, Textarea,
} from "@/components/ui";
import { Plus } from "lucide-react";

export const ACCOUNT_TYPES: AccountType[] = ["PVD", "RMF", "SSF", "SSO", "brokerage", "savings", "crypto", "other"];
export const TYPE_LABELS: Record<AccountType, string> = {
  PVD: "PVD (Provident Fund)", RMF: "RMF", SSF: "SSF", SSO: "SSO",
  brokerage: "Brokerage", savings: "Savings", crypto: "Crypto", other: "Other",
};

// Default expected returns per account type — overridden by AI forecast when
// the account is linked to a specific fund via fundCode.
export const DEFAULT_RETURNS: Record<AccountType, number> = {
  PVD: 0.04,       // placeholder; replaced by AI forecast once a fund is linked
  RMF: 0.07,
  SSF: 0.07,
  SSO: 0.03,
  brokerage: 0.08,
  savings: 0.015,
  crypto: 0.15,
  other: 0.05,
};

export function defaultInvestment(): Omit<InvestmentAccount, "id"> {
  return {
    name: "", accountType: "brokerage", assetDescription: "",
    marketValue: 0, currency: "THB", isTaxAdvantaged: false,
    expectedAnnualReturn: DEFAULT_RETURNS["brokerage"],
    monthlyContribution: 0,
    annualContribution: 0, owner: "Me", notes: "", isActive: true,
    fundCode: undefined,
  };
}

export function InvestmentForm({
  item,
  onChange,
  funds,
  aiReturnByFundCode,
  onAddFund,
}: {
  item: Omit<InvestmentAccount, "id">;
  onChange: (k: string, v: any) => void;
  funds: FundInfo[];
  aiReturnByFundCode: Record<string, number>;
  onAddFund: (input: CustomFundInput) => string;
}) {
  const [showAddFund, setShowAddFund] = useState(false);
  const [newFund, setNewFund] = useState<CustomFundInput>({ code: "", nameEN: "", fundType: "other", assetClass: "other" });

  const linkedFund = item.fundCode ? funds.find(f => f.code === item.fundCode) : undefined;
  const aiReturn = item.fundCode ? aiReturnByFundCode[item.fundCode] : undefined;

  // Only offer funds whose fundType roughly matches the selected AccountType,
  // plus always show every fund so users aren't blocked by a mismatch.
  const relevantFunds = funds.filter(f => f.fundType === item.accountType);
  const otherFunds = funds.filter(f => f.fundType !== item.accountType);

  const handleSubmitNewFund = () => {
    if (!newFund.code.trim() || !newFund.nameEN.trim()) return;
    const code = onAddFund(newFund);
    onChange("fundCode", code);
    setShowAddFund(false);
    setNewFund({ code: "", nameEN: "", fundType: "other", assetClass: "other" });
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label>Account Name</Label>
        <Input value={item.name} onChange={e => onChange("name", e.target.value)} className="mt-1" placeholder="e.g. SCB Masterplan PVD" />
      </div>
      <div>
        <Label>Account Type</Label>
        <Select value={item.accountType} onChange={e => {
          const t = e.target.value as AccountType;
          onChange("accountType", t);
          onChange("expectedAnnualReturn", DEFAULT_RETURNS[t] ?? 0.05);
        }} className="mt-1">
          {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </Select>
      </div>
      <div>
        <Label>Owner</Label>
        <Input value={item.owner} onChange={e => onChange("owner", e.target.value)} className="mt-1" />
      </div>

      <div className="col-span-2">
        <Label>Linked Fund (optional)</Label>
        <div className="flex items-center gap-2 mt-1">
          <Select
            value={item.fundCode || ""}
            onChange={e => {
              const code = e.target.value;
              onChange("fundCode", code || undefined);
              if (code && aiReturnByFundCode[code] !== undefined) {
                onChange("expectedAnnualReturn", aiReturnByFundCode[code]);
              }
            }}
            className="flex-1"
          >
            <option value="">No specific fund (free-text description only)</option>
            {relevantFunds.length > 0 && (
              <optgroup label={`${TYPE_LABELS[item.accountType]} funds`}>
                {relevantFunds.map(f => <option key={f.code} value={f.code}>{f.code} — {f.nameEN}</option>)}
              </optgroup>
            )}
            {otherFunds.length > 0 && (
              <optgroup label="Other registered funds">
                {otherFunds.map(f => <option key={f.code} value={f.code}>{f.code} — {f.nameEN}</option>)}
              </optgroup>
            )}
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowAddFund(s => !s)}>
            <Plus size={13} /> New fund
          </Button>
        </div>
        {linkedFund && aiReturn !== undefined && (
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
            ✦ AI estimate available for {linkedFund.code}: {pct(aiReturn)}
          </p>
        )}

        {showAddFund && (
          <div className="mt-2 p-3 border border-border rounded-lg grid grid-cols-2 gap-2 bg-muted/30">
            <div>
              <Label>Fund Code</Label>
              <Input value={newFund.code} onChange={e => setNewFund(f => ({ ...f, code: e.target.value }))} className="mt-1" placeholder="e.g. KFGOLD" />
            </div>
            <div>
              <Label>Fund Type</Label>
              <Select value={newFund.fundType} onChange={e => setNewFund(f => ({ ...f, fundType: e.target.value as CustomFundInput["fundType"] }))} className="mt-1">
                <option value="PVD">PVD</option>
                <option value="RMF">RMF</option>
                <option value="SSF">SSF</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Fund Name</Label>
              <Input value={newFund.nameEN} onChange={e => setNewFund(f => ({ ...f, nameEN: e.target.value }))} className="mt-1" placeholder="e.g. K-GOLD Fund" />
            </div>
            <div>
              <Label>Asset Class</Label>
              <Select value={newFund.assetClass} onChange={e => setNewFund(f => ({ ...f, assetClass: e.target.value as CustomFundInput["assetClass"] }))} className="mt-1">
                <option value="thai_equity">Thai Equity</option>
                <option value="gold">Gold</option>
                <option value="bond">Bond</option>
                <option value="mixed">Mixed</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div>
              <Label>Manager (optional)</Label>
              <Input value={newFund.manager || ""} onChange={e => setNewFund(f => ({ ...f, manager: e.target.value }))} className="mt-1" />
            </div>
            <div className="col-span-2 flex justify-end gap-2 mt-1">
              <Button type="button" size="sm" variant="outline" onClick={() => setShowAddFund(false)}>Cancel</Button>
              <Button type="button" size="sm" onClick={handleSubmitNewFund} disabled={!newFund.code.trim() || !newFund.nameEN.trim()}>Add fund</Button>
            </div>
          </div>
        )}
      </div>

      <div className="col-span-2">
        <Label>Asset Description</Label>
        <Input
          value={item.assetDescription}
          onChange={e => onChange("assetDescription", e.target.value)}
          className="mt-1"
          placeholder={linkedFund ? linkedFund.nameEN : "e.g. Thai equity fund, 60/40 mix"}
        />
      </div>
      <div>
        <Label>Current Market Value (฿)</Label>
        <NumberInput value={item.marketValue} onChange={v => onChange("marketValue", v)} className="mt-1" />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Label className="mb-0">Expected Annual Return (%)</Label>
        </div>
        <NumberInput step="0.5" value={parseFloat((item.expectedAnnualReturn * 100).toFixed(1))}
          onChange={v => onChange("expectedAnnualReturn", v / 100)} className="mt-1" />
        {aiReturn !== undefined && Math.abs(item.expectedAnnualReturn - aiReturn) > 0.001 && (
          <button
            type="button"
            onClick={() => onChange("expectedAnnualReturn", aiReturn)}
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline mt-1"
          >
            Reset to AI estimate ({pct(aiReturn)})
          </button>
        )}
      </div>
      <div>
        <Label>Monthly Contribution (฿)</Label>
        <NumberInput value={item.monthlyContribution} onChange={v => onChange("monthlyContribution", v)} className="mt-1" />
      </div>
      <div>
        <Label>Annual Contribution (฿)</Label>
        <NumberInput value={item.annualContribution} onChange={v => onChange("annualContribution", v)} className="mt-1" />
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Label>Tax Advantaged</Label>
        <Switch checked={item.isTaxAdvantaged} onCheckedChange={v => onChange("isTaxAdvantaged", v)} />
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Label>Active</Label>
        <Switch checked={item.isActive} onCheckedChange={v => onChange("isActive", v)} />
      </div>
      <div className="col-span-2">
        <Label>Notes</Label>
        <Textarea value={item.notes} onChange={e => onChange("notes", e.target.value)} className="mt-1" />
      </div>
    </div>
  );
}
