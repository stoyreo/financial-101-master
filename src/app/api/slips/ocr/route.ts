/**
 * POST /api/slips/ocr
 * OCR a Thai payment slip image (PromptPay, bank transfer, QR) using Claude Vision.
 * Returns extracted amount, merchant/recipient, date, and category suggestion.
 * Auto-creates an expense transaction in the caller's store (via client).
 */
import { NextResponse } from "next/server";
import { aiVisionComplete, requestedProvider } from "@/lib/ai-provider";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = getSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { image, mediaType } = (await req.json()) as {
    image: string;          // base64-encoded image
    mediaType: string;      // e.g. "image/jpeg" | "image/png"
  };

  if (!image || !mediaType) {
    return NextResponse.json({ error: "image and mediaType are required" }, { status: 400 });
  }

  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!validTypes.includes(mediaType)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }

  const prompt = `You are a Thai payment slip OCR assistant. Extract information from this payment slip image.

Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "amount": <number in THB, e.g. 1250.00>,
  "merchant": "<merchant name or recipient, max 60 chars>",
  "date": "<YYYY-MM-DD or empty string if not visible>",
  "reference": "<transaction reference or slip ID if visible, else empty string>",
  "category": "<one of: Food & Dining, Shopping, Transport, Utilities, Entertainment, Healthcare, Education, Transfer, Other>",
  "confidence": <0.0 to 1.0>
}

Rules:
- amount must be a positive number (the total paid amount in THB)
- If the slip shows a foreign currency, convert to THB if rate is shown, otherwise use the foreign amount and note it
- date should be in YYYY-MM-DD format; if year shows as Buddhist Era (e.g. 2569), subtract 543
- merchant should be the payee/recipient name, not the sender
- category should best match the merchant/description
- confidence: 1.0 if all fields clearly visible, lower if unsure`;

  // Gemini Flash (free tier) first, Claude Opus as fallback.
  const { text: raw } = await aiVisionComplete({
    prompt,
    media: { mediaType, data: image },
    maxTokens: 512,
    json: true,
    claudeModel: "claude-opus-4-5",
  }, requestedProvider(req));

  let extracted: Record<string, unknown>;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    extracted = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Failed to parse OCR response", raw }, { status: 500 });
  }

  const amount = typeof extracted.amount === "number" ? extracted.amount : parseFloat(String(extracted.amount ?? "0"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Could not extract a valid amount from slip" }, { status: 422 });
  }

  return NextResponse.json({
    amount,
    merchant: String(extracted.merchant ?? "Unknown"),
    date: String(extracted.date ?? new Date().toISOString().slice(0, 10)),
    reference: String(extracted.reference ?? ""),
    category: String(extracted.category ?? "Other"),
    confidence: Number(extracted.confidence ?? 0.8),
  });
}
