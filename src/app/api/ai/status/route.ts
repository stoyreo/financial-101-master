import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { available: false, reason: "ANTHROPIC_API_KEY not configured" },
      { status: 200 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });

    return NextResponse.json(
      { available: true },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    const creditExhausted =
      error?.status === 400 &&
      typeof error?.message === "string" &&
      error.message.toLowerCase().includes("credit balance");

    const overloaded = error?.status === 529;

    return NextResponse.json(
      {
        available: false,
        reason: creditExhausted
          ? "credits_exhausted"
          : overloaded
          ? "overloaded"
          : `api_error_${error?.status ?? "unknown"}`,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        },
      }
    );
  }
}
