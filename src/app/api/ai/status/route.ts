import { NextResponse } from "next/server";
import { probeProviders } from "@/lib/ai-provider";

export const runtime = "nodejs";
// Don't statically cache: local Ollama availability changes as the user's
// machine sleeps/wakes. We still send a short s-maxage so the client poll
// (every 10 min) doesn't hammer the model.
export const dynamic = "force-dynamic";

export async function GET() {
  const probe = await probeProviders();

  return NextResponse.json(
    {
      available: probe.available,
      provider: probe.provider,
      model: probe.model,
      reason: probe.reason,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
      },
    }
  );
}
