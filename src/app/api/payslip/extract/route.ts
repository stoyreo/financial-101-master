import { NextResponse } from "next/server";
import { aiVisionComplete, requestedProvider } from "@/lib/ai-provider";
import { requireAiUser } from "@/lib/ai-route-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You extract structured payslip data. Return STRICT JSON matching the schema.
Never add prose. If a field is missing, set it to null. Currency codes are ISO 4217.
Net amount = take-home pay AFTER all taxes and deductions.`;

const SCHEMA_HINT = `
JSON schema (return EXACTLY these keys):
{
  "name": string,                     // a short label, e.g. "Acme Corp Payroll - Apr 2026"
  "employer": string|null,
  "periodStart": "YYYY-MM-DD"|null,
  "periodEnd":   "YYYY-MM-DD"|null,
  "grossAmount": number|null,
  "netAmount":   number|null,         // REQUIRED if anything is extractable
  "currency":    "THB"|"USD"|"EUR"|...,
  "isMonthly":   boolean,
  "taxesWithheld": number|null,
  "confidence": number,               // 0..1
  "notes": string|null                // anything noteworthy (overtime, bonus split, etc.)
}`;

export async function POST(req: Request) {
  try {
    const guard = await requireAiUser(req);
    if (!guard.ok) return guard.response;

    const { mediaType, data } = await req.json() as { mediaType: string; data: string };
    if (!data) return NextResponse.json({ error: "no_data" }, { status: 400 });

    // Gemini Flash (free tier) first, Claude Haiku as fallback. Both handle
    // base64 images and PDFs.
    const { text } = await aiVisionComplete({
      system: SYSTEM,
      prompt: `Extract the payslip. ${SCHEMA_HINT} Output JSON only.`,
      media: { mediaType, data },
      maxTokens: 800,
      json: true,
      claudeModel: "claude-haiku-4-5-20251001",
    }, requestedProvider(req));

    // Strip ``` fences if Claude added them
    const jsonStr = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    let parsed: any;
    try { parsed = JSON.parse(jsonStr); }
    catch { return NextResponse.json({ error: "parse_failed", raw: text }, { status: 502 }); }

    return NextResponse.json(parsed);
  } catch (e: any) {
    console.error("payslip extract error:", e);
    return NextResponse.json({ error: e?.message ?? "extract_failed" }, { status: 500 });
  }
}
