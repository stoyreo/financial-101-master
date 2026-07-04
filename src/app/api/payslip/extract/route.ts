import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
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

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Anthropic supports image_url or base64 for images and document for PDFs.
    const isPdf = mediaType === "application/pdf";
    const contentBlock = isPdf
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image"    as const, source: { type: "base64" as const, media_type: mediaType as any, data } };

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          contentBlock,
          { type: "text", text: `Extract the payslip. ${SCHEMA_HINT} Output JSON only.` },
        ],
      }],
    });

    const text = msg.content
      .filter(b => b.type === "text")
      .map(b => (b as any).text)
      .join("");

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
