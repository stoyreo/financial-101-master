/**
 * POST /api/statements/import
 *
 * Local parser for Thai bank credit-card statements (UOB layout confirmed).
 *
 * Layout per transaction line in extracted PDF text:
 *   <DD MMM><DD MMM><DESCRIPTION>[CCY?][FX_AMT?]<THB_AMT>[CR]
 *
 * - First date is post date, second is transaction date.
 * - Description and amounts are usually concatenated with no space.
 * - Foreign-currency rows: "...SAN FRANCISCO USD21.40726.05".
 * - Refund / payment rows have a trailing "CR".
 *
 * billingMonth = STATEMENT DATE month (e.g. "22 APR 2026" -> "2026-04").
 * All transactions on a statement share that one billing-month bucket.
 */

import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import crypto from "crypto";
import { v4 as uuid } from "uuid";
import {
  buildDedupeKey,
  billingMonthFrom,
  toMerchantKey,
  matchRule,
  buildDefaultMerchantRules,
} from "@/lib/categorize";
import { suggestCategoriesAI } from "@/lib/ai-categorize";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};
const MONTH_NAMES = "(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)";

const KNOWN_CCY = new Set([
  "USD","EUR","GBP","JPY","SGD","HKD","CNY","AUD","CAD","CHF","NZD",
  "KRW","TWD","MYR","IDR","VND","PHP","INR","AED","SAR","ZAR","SEK","NOK","DKK",
]);

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function inferYear(monthIdx: number, statementYear: number, statementMonthIdx: number): number {
  const diff = monthIdx - statementMonthIdx;
  if (diff > 6) return statementYear - 1;
  return statementYear;
}

function fmtDate(year: number, monthIdx: number, day: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface ParsedTxn {
  postDate: string;
  transDate: string;
  description: string;
  amount: number;
  isCredit: boolean;
  currency: string;
  fxAmount?: number;
  fxCurrency?: string;
  cardLast4?: string;
}

interface ParsedStatement {
  bank: string;
  statementDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  cardholderName: string | null;
  transactions: ParsedTxn[];
}

function splitBodyAmounts(body: string): {
  amount: number;
  fxAmount?: number;
  fxCurrency?: string;
  description: string;
} | null {
  const tokens: { value: string; idx: number; end: number }[] = [];
  const re = /[\d,]+\.\d{2}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    tokens.push({ value: m[0], idx: m.index, end: m.index + m[0].length });
  }
  if (tokens.length === 0) return null;

  const last = tokens[tokens.length - 1];
  const amount = parseFloat(last.value.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let descEnd = last.idx;
  let fxAmount: number | undefined;
  let fxCurrency: string | undefined;

  if (tokens.length >= 2) {
    const prev = tokens[tokens.length - 2];
    const between = body.slice(prev.end, last.idx);
    if (between === "") {
      const fxVal = parseFloat(prev.value.replace(/,/g, ""));
      if (Math.abs(fxVal - amount) <= 0.01) {
        // Identical adjacent amounts = installment-plan duplicate display.
        descEnd = prev.idx;
      } else {
        // Real FX row. Only strip currency code if it's a known ISO code AND
        // word-bounded (preceded by space or start) to avoid corrupting names
        // like "...CANNETEUR29.04" by stealing a trailing "EUR".
        const ccyStart = prev.idx - 3;
        const ccyChars = ccyStart >= 0 ? body.slice(ccyStart, prev.idx) : "";
        const charBefore = ccyStart > 0 ? body.charAt(ccyStart - 1) : " ";
        const ccyOk =
          /^[A-Z]{3}$/.test(ccyChars) &&
          KNOWN_CCY.has(ccyChars) &&
          /\s/.test(charBefore);
        if (ccyOk) {
          fxCurrency = ccyChars;
          descEnd = ccyStart;
        } else {
          descEnd = prev.idx;
        }
        fxAmount = fxVal;
      }
    }
  }

  return {
    amount,
    fxAmount,
    fxCurrency,
    description: body.slice(0, descEnd).replace(/\s+/g, " ").trim(),
  };
}

function parseThaiStatement(text: string): ParsedStatement {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  let bank = "OTHER";
  if (/UOB ROP|UNITED OVERSEAS|TMRW(\s|82%)/i.test(text)) bank = "UOB";
  else if (/KBANK|KASIKORN/i.test(text)) bank = "KBANK";
  else if (/\bSCB\b|SIAM COMMERCIAL/i.test(text)) bank = "SCB";
  else if (/\bKTC\b/i.test(text)) bank = "KTC";
  else if (/\bTMB\b|THAI MILITARYBANK/i.test(text)) bank = "TMB";

  // STATEMENT DATE: line immediately following the label.
  let statementDate: string | null = null;
  const stmtDateLineRe = new RegExp("^(\\d{1,2})\\s+" + MONTH_NAMES + "\\s+(\\d{4})$", "i");
  const monthInLineRe = /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i;
  for (let i = 0; i < lines.length; i++) {
    if (/STATEMENT DATE/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const dm = lines[j].match(stmtDateLineRe);
        if (dm) {
          const dnum = parseInt(dm[1]);
          const mn = lines[j].match(monthInLineRe)![1].toUpperCase();
          const ynum = parseInt(dm[2]);
          statementDate = fmtDate(ynum, MONTHS[mn], dnum);
          break;
        }
      }
      if (statementDate) break;
    }
  }
  if (!statementDate) {
    const fb = text.match(new RegExp("(\\d{1,2})\\s+(" + MONTH_NAMES + ")\\s+(\\d{4})", "i"));
    if (fb) {
      const mn = fb[2].toUpperCase().replace(/[^A-Z]/g, "");
      statementDate = fmtDate(parseInt(fb[3]), MONTHS[mn], parseInt(fb[1]));
    } else {
      statementDate = new Date().toISOString().slice(0, 10);
    }
  }

  const stYear = parseInt(statementDate.slice(0, 4));
  const stMonth = parseInt(statementDate.slice(5, 7)) - 1;

  let cardholderName: string | null = null;
  const nameMatch = text.match(/\b(?:MR|MRS|MS|MISS)\.?\s+([A-Z][A-Z][A-Z\s]{2,40})/);
  if (nameMatch) cardholderName = nameMatch[1].trim();

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  {
    const start = new Date(stYear, stMonth - 1, parseInt(statementDate.slice(8, 10)) + 1);
    periodStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    periodEnd = statementDate;
  }

  const txns: ParsedTxn[] = [];
  let currentCardLast4: string | undefined;
  const seenLines = new Set<string>();

  // ── UOB format: "DD MMM DD MMM <description> <amount> [CR]"
  const cardRe = /^\d{4}\s+\d{2}XX\s+XXXX\s+(\d{4})$/;
  const txnRe = new RegExp(
    "^(\\d{1,2})\\s+(" + MONTH_NAMES + ")(\\d{1,2})\\s+(" + MONTH_NAMES + ")(.+?)(CR)?$",
    "i",
  );

  // ── SCB / KBank format: "DD/MM/YY[YY] DD/MM/YY[YY] <description> <amount> [CR]"
  // Example: "10/05/26 10/05/26 SHOPEE PAYMENT 1,250.00"
  const scbTxnRe = /^(\d{2}\/\d{2}\/\d{2,4})\s+(\d{2}\/\d{2}\/\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(CR)?$/i;

  function parseSlashDate(ds: string): string {
    const parts = ds.split("/");
    if (parts.length !== 3) return new Date().toISOString().slice(0, 10);
    const [d, m, y] = parts;
    const year = y.length === 2 ? (parseInt(y) + 2000) : parseInt(y);
    return fmtDate(year, parseInt(m) - 1, parseInt(d));
  }

  for (const line of lines) {
    if (seenLines.has(line)) continue;

    const cardMatch = line.match(cardRe);
    if (cardMatch) { currentCardLast4 = cardMatch[1]; continue; }

    if (/^(TOTAL|SUB\s*TOTAL|PREVIOUS BALANCE|VAT|FEE|MINIMUM|PAYMENT DUE|CREDIT LIMIT)/i.test(line)) continue;

    // Try UOB-style first
    const tm = line.match(txnRe);
    if (tm) {
      seenLines.add(line);
      const pd = tm[1];
      const pm = tm[2].toUpperCase();
      const td = tm[3];
      const tmo = tm[4].toUpperCase();
      const body = tm[5];
      const crFlag = tm[6];

      const split = splitBodyAmounts(body);
      if (!split || !split.description) continue;

      const postYear = inferYear(MONTHS[pm], stYear, stMonth);
      const transYear = inferYear(MONTHS[tmo], stYear, stMonth);
      const postDate = fmtDate(postYear, MONTHS[pm], parseInt(pd));
      const transDate = fmtDate(transYear, MONTHS[tmo], parseInt(td));

      txns.push({
        postDate,
        transDate,
        description: split.description.slice(0, 100),
        amount: split.amount,
        isCredit: !!crFlag,
        currency: "THB",
        fxAmount: split.fxAmount,
        fxCurrency: split.fxCurrency,
        cardLast4: currentCardLast4,
      });
      continue;
    }

    // Try SCB/KBank DD/MM/YY style
    if (bank === "SCB" || bank === "KBANK" || bank === "KTC" || bank === "OTHER") {
      const sm = line.match(scbTxnRe);
      if (sm) {
        seenLines.add(line);
        const postDate = parseSlashDate(sm[1]);
        const transDate = parseSlashDate(sm[2]);
        const desc = sm[3].trim();
        const amount = parseFloat(sm[4].replace(/,/g, ""));
        const isCredit = !!sm[5];

        if (Number.isFinite(amount) && amount > 0 && desc) {
          txns.push({
            postDate,
            transDate,
            description: desc.slice(0, 100),
            amount,
            isCredit,
            currency: "THB",
            cardLast4: currentCardLast4,
          });
        }
      }
    }
  }

  return {
    bank,
    statementDate: statementDate!,
    periodStart,
    periodEnd,
    cardholderName,
    transactions: txns,
  };
}

export async function POST(req: Request) {
  try {
    // Authenticate user
    const supabase = getSupabaseServer();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mediaType, data, fileName, activeAccountId } = (await req.json()) as {
      mediaType: string;
      data: string;
      fileName?: string;
      activeAccountId?: string;
    };

    if (!activeAccountId) {
      return NextResponse.json(
        { error: "activeAccountId_required", message: "activeAccountId is required" },
        { status: 400 },
      );
    }

    // Note: activeAccountId is the app's local account key (e.g. "toy"), not the
    // Supabase UUID. Equality check against session.user.id would always fail.
    // Authentication is enforced above (401 if no session).

    if (!data) return NextResponse.json({ error: "no_data" }, { status: 400 });
    if (mediaType !== "application/pdf") {
      return NextResponse.json(
        { error: "unsupported_media", message: "Only PDF statements are supported." },
        { status: 400 },
      );
    }

    const fileBuf = Buffer.from(data, "base64");
    const fileHash = sha256(fileBuf);

    let pdfData: any;
    try {
      pdfData = await pdfParse(fileBuf);
    } catch {
      return NextResponse.json(
        { error: "pdf_parse_failed", message: "Could not read PDF file." },
        { status: 400 },
      );
    }

    const text = (pdfData.text as string) || "";
    if (!text.trim()) {
      return NextResponse.json(
        { error: "no_text", message: "PDF contains no readable text (it may be a scanned image)." },
        { status: 400 },
      );
    }

    const parsed = parseThaiStatement(text);

    if (parsed.transactions.length === 0) {
      return NextResponse.json(
        { error: "no_transactions", message: "Recognized the PDF but couldn't extract any transaction rows. The bank layout may have changed." },
        { status: 400 },
      );
    }

    const defaultRules = buildDefaultMerchantRules();
    const billingMonth = billingMonthFrom(parsed.statementDate);
    const sourceTag = parsed.bank.toLowerCase();

    const transactions = parsed.transactions.map(t => {
      const merchantKey = toMerchantKey(t.description);
      const rule = matchRule(merchantKey, defaultRules);
      const category = rule ? rule.category : "Other";

      const txn = {
        accountId: activeAccountId,
        id: uuid(),
        postDate: t.postDate,
        transDate: t.transDate,
        billingMonth,
        description: t.description,
        merchantKey,
        amount: Math.abs(t.amount),
        currency: t.currency as any,
        fxAmount: t.fxAmount,
        fxCurrency: t.fxCurrency,
        category,
        source: sourceTag,
        cardLast4: t.cardLast4,
        confidence: rule ? 1.0 : 0.6,
        isCredit: t.isCredit,
        dedupeKey: "",
      };
      txn.dedupeKey = buildDedupeKey(txn);
      return txn;
    });

    // AI fallback pass: anything the rule matcher left as "Other" gets one
    // shot at an AI-suggested category before it ever reaches the store.
    // Best-effort — if the AI call fails (no API key, rate limit, etc.) the
    // transactions just stay "Other" at the original 0.6 confidence, same as
    // before this feature existed.
    const unmatched = transactions.filter(t => t.category === "Other");
    if (unmatched.length > 0) {
      try {
        const suggestions = await suggestCategoriesAI(
          unmatched.map(t => ({ merchantKey: t.merchantKey, description: t.description }))
        );
        const byKey = new Map(suggestions.map(s => [s.merchantKey, s]));
        for (const txn of unmatched) {
          const s = byKey.get(txn.merchantKey);
          if (!s || s.category === "Other") continue;
          txn.category = s.category;
          // AI guesses are unconfirmed — keep them visibly below the
          // "rule matched" (1.0) and "user confirmed" tiers so the UI's
          // low-confidence badge still nudges a human to double-check.
          txn.confidence = Math.min(0.69, Math.max(0.5, s.confidence));
        }
      } catch (err) {
        console.error("statement import: AI categorize fallback failed", err);
      }
    }

    const totalCharges = transactions
      .filter(t => !t.isCredit)
      .reduce((s, t) => s + t.amount, 0);
    const totalCredits = transactions
      .filter(t => t.isCredit)
      .reduce((s, t) => s + t.amount, 0);

    return NextResponse.json({
      statement: {
        fileName: fileName ?? "statement.pdf",
        fileHash,
        bank: parsed.bank,
        statementDate: parsed.statementDate,
        billingMonth,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        cardholderName: parsed.cardholderName,
        totalCharges: Math.round(totalCharges),
        totalCredits: Math.round(totalCredits),
      },
      transactions,
    });
  } catch (e: any) {
    console.error("statement import error:", e);
    return NextResponse.json(
      { error: e?.message ?? "import_failed" },
      { status: 500 },
    );
  }
}
