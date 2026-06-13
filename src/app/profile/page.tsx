"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { calcAge, yearAtAge, thb } from "@/lib/utils";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Label,
  Select, Textarea, Switch, Separator, StatCard, PageHeader, Badge, Alert
} from "@/components/ui";
import { User, Calendar, Target, Shield, Save, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { TouchIDButton } from "@/components/TouchIDButton";

export default function ProfilePage() {
  const { profile, setProfile } = useStore();
  const [form, setForm] = useState({ ...profile });
  const [saved, setSaved] = useState(false);
  const [passkeyMsg, setPasskeyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const age = calcAge(form.dateOfBirth);
  const yearsToRetirement = Math.max(0, form.retirementAge - age);
  const retirementYear = yearAtAge(form.dateOfBirth, form.retirementAge);
  const lifeExpectancyYear = yearAtAge(form.dateOfBirth, form.lifeExpectancy);
  const planningHorizon = form.lifeExpectancy - age;

  const handleSave = () => {
    setProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => setForm({ ...profile });

  const field = (key: keyof typeof form) => ({
    value: String(form[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.type === "number" ? Number(e.target.value) : e.target.value })),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Profile & Settings"
        subtitle="Your personal planning parameters. Changes affect all forecasts."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw size={14} /> Reset
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save size={14} /> Save Changes
            </Button>
          </div>
        }
      />

      {saved && (
        <Alert variant="success" className="mb-4">
          <div className="flex items-center gap-2"><CheckCircle size={14} /> Profile saved successfully.</div>
        </Alert>
      )}

      {/* Summary chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Current Age", value: `${age} years` },
          { label: "Years to Retirement", value: `${yearsToRetirement} years` },
          { label: "Retirement Year", value: retirementYear.toString() },
          { label: "Planning Horizon", value: `${planningHorizon} years` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-muted rounded-lg p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-bold text-lg tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <User size={15} className="text-primary" /> Personal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" {...field("fullName")} className="mt-1" placeholder="Your full name" />
            </div>
            <div>
              <Label htmlFor="dob">Date of Birth</Label>
              <Input id="dob" type="date" {...field("dateOfBirth")} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Age is calculated dynamically from DOB</p>
            </div>
            <div>
              <Label htmlFor="marital">Marital / Household Status</Label>
              <Input id="marital" {...field("maritalStatus")} className="mt-1" placeholder="e.g. Single, Married" />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...field("country")} className="mt-1" disabled />
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Select id="currency" {...field("currency")} className="mt-1">
                <option value="THB">THB – Thai Baht</option>
                <option value="USD">USD – US Dollar</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Retirement & Planning */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Target size={15} className="text-primary" /> Retirement & Planning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="retAge">Target Retirement Age</Label>
              <Input id="retAge" type="number" min={40} max={80} {...field("retirementAge")} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Retirement in {retirementYear} · {yearsToRetirement} years away</p>
            </div>
            <div>
              <Label htmlFor="lifeExp">Life Expectancy (planning horizon)</Label>
              <Input id="lifeExp" type="number" min={60} max={110} {...field("lifeExpectancy")} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Plan through year {lifeExpectancyYear}</p>
            </div>
            <div>
              <Label htmlFor="planStart">Planning Start Date</Label>
              <Input id="planStart" type="date" {...field("planningStartDate")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="riskProfile">Risk Profile</Label>
              <Select id="riskProfile" {...field("riskProfile")} className="mt-1">
                <option value="conservative">Conservative – Lower risk, stable returns</option>
                <option value="moderate">Moderate – Balanced growth</option>
                <option value="aggressive">Aggressive – Higher risk, higher return target</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Financial Safety */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield size={15} className="text-primary" /> Financial Safety Targets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="efMonths">Emergency Fund Target (months of expenses)</Label>
              <Input id="efMonths" type="number" min={1} max={24} {...field("emergencyFundTargetMonths")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="minCash">Target Minimum Cash Balance (฿)</Label>
              <Input id="minCash" type="number" {...field("targetMinCashBalance")} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cash">Current Cash Balance (฿)</Label>
              <Input id="cash" type="number" {...field("currentCashBalance")} className="mt-1" />
            </div>

            <Separator />
            <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash Balance</span>
                <span className="font-medium tabular-nums">{thb(form.currentCashBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Min Cash Target</span>
                <span className="font-medium tabular-nums">{thb(form.targetMinCashBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash Cushion</span>
                <span className={`font-medium tabular-nums ${form.currentCashBalance >= form.targetMinCashBalance ? "text-emerald-600" : "text-red-600"}`}>
                  {thb(form.currentCashBalance - form.targetMinCashBalance)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar size={15} className="text-primary" /> Planning Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="hhNotes">Household Notes</Label>
              <Textarea id="hhNotes" {...field("householdNotes")} className="mt-1" placeholder="Household context, dependents, etc." />
            </div>
            <div>
              <Label htmlFor="notes">Personal Notes & Goals</Label>
              <Textarea id="notes" {...field("notes")} className="mt-1" rows={5}
                placeholder="e.g. Priority goals, financial strategy, important assumptions..." />
            </div>
            <Button className="w-full" onClick={handleSave}>
              <Save size={14} /> Save Profile
            </Button>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield size={15} className="text-primary" /> Security &amp; Sign-in
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Register your Mac&apos;s Touch ID as a passkey so you can sign in with a fingerprint instead of a password.
            </p>
            {passkeyMsg && (
              <div className={`text-xs rounded-lg px-3 py-2 ${passkeyMsg.ok ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" : "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400"}`}>
                {passkeyMsg.text}
              </div>
            )}
            <TouchIDButton
              mode="register"
              onSuccess={() => {
                setPasskeyMsg({ ok: true, text: "Touch ID registered! You can now sign in with your fingerprint." });
                setTimeout(() => setPasskeyMsg(null), 5000);
              }}
              onError={(msg) => setPasskeyMsg({ ok: false, text: msg })}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
