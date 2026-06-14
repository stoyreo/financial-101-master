"use client";

/**
 * SlipUpload
 * Drag-and-drop / file-picker for Thai payment slips.
 * Calls /api/slips/ocr, then auto-logs the extracted transaction to the store.
 */

import { useState, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";

import { thb } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from "@/components/ui";
import {
  Upload, Camera, CheckCircle, AlertCircle, Loader2, X, Receipt,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import type { Transaction } from "@/lib/types";
import { getCurrentAccount } from "@/lib/accounts";
import { buildDedupeKey, toMerchantKey, matchRule, buildDefaultMerchantRules } from "@/lib/categorize";

interface SlipResult {
  amount: number;
  merchant: string;
  date: string;
  reference: string;
  category: string;
  confidence: number;
}

interface LoggedSlip {
  id: string;
  fileName: string;
  result: SlipResult;
  loggedAt: string;
}

export function SlipUpload() {
  const { importStatement } = useStore();
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SlipResult | null>(null);
  const [recentSlips, setRecentSlips] = useState<LoggedSlip[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, WebP).");
      setState("error");
      return;
    }

    setState("processing");
    setError("");
    setResult(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type;

      try {
        const res = await fetch("/api/slips/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mediaType }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "OCR failed");
        }

        const data: SlipResult = await res.json();
        setResult(data);
        setState("done");

        // Auto-log as transaction
        const account = getCurrentAccount();
        const rules = buildDefaultMerchantRules();
        const merchantKey = toMerchantKey(data.merchant);
        const rule = matchRule(merchantKey, rules);
        const category = rule ? rule.category : data.category;
        const today = new Date().toISOString().slice(0, 10);
        const billingMonth = (data.date || today).slice(0, 7);

        const txn: Transaction = {
          accountId: account?.id ?? "default",
          id: uuid(),
          postDate: data.date || today,
          transDate: data.date || today,
          billingMonth,
          description: data.merchant,
          merchantKey,
          amount: data.amount,
          currency: "THB",
          category,
          source: "other" as const,
          confidence: data.confidence,
          isCredit: false,
          dedupeKey: "",
        };
        txn.dedupeKey = buildDedupeKey(txn);

        const slipStatement = {
          fileName: file.name,
          fileHash: txn.id,
          bank: "SLIP",
          statementDate: txn.postDate,
          billingMonth,
          periodStart: txn.postDate,
          periodEnd: txn.postDate,
          cardholderName: undefined,
          totalCharges: data.amount,
          totalCredits: 0,
        };
        importStatement(slipStatement as any, [txn]);

        setRecentSlips(prev => [
          { id: uuid(), fileName: file.name, result: data, loggedAt: new Date().toLocaleTimeString("th-TH") },
          ...prev.slice(0, 4),
        ]);
      } catch (e: any) {
        setError(e.message ?? "Unknown error");
        setState("error");
      }
    };
    reader.readAsDataURL(file);
  }, [importStatement]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const reset = () => { setState("idle"); setResult(null); setError(""); };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Receipt size={15} className="text-primary" /> Slip Upload (PromptPay / QR)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => state !== "processing" && inputRef.current?.click()}
          className={[
            "relative border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 py-8 cursor-pointer transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
            state === "processing" ? "pointer-events-none" : "",
          ].join(" ")}
        >
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

          {state === "processing" && (
            <>
              <Loader2 size={28} className="text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Reading slip…</p>
            </>
          )}
          {(state === "idle" || state === "error") && (
            <>
              <div className="flex gap-3">
                <Upload size={24} className="text-muted-foreground" />
                <Camera size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Drop slip image here or tap to browse</p>
              <p className="text-xs text-muted-foreground">JPG · PNG · WebP · screenshot</p>
            </>
          )}
          {state === "done" && result && (
            <>
              <CheckCircle size={28} className="text-emerald-500" />
              <p className="text-sm font-medium">Logged as expense</p>
              <p className="text-xs text-muted-foreground">Drop another slip to add more</p>
            </>
          )}
        </div>

        {/* Error */}
        {state === "error" && (
          <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={reset} className="ml-auto"><X size={13} /></button>
          </div>
        )}

        {/* Last result */}
        {state === "done" && result && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{result.merchant}</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">{thb(result.amount)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge className="text-[10px] py-0">{result.category}</Badge>
              <span>{result.date}</span>
              {result.reference && <span className="font-mono truncate max-w-[120px]">{result.reference}</span>}
              <span className="ml-auto">{Math.round(result.confidence * 100)}% conf.</span>
            </div>
          </div>
        )}

        {/* Recent slips */}
        {recentSlips.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">This session</p>
            {recentSlips.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-0">
                <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                <span className="truncate flex-1">{s.result.merchant}</span>
                <span className="font-medium tabular-nums">{thb(s.result.amount)}</span>
                <span className="text-muted-foreground">{s.loggedAt}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
