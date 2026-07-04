/**
 * SERVER-ONLY guard for AI-powered API routes.
 *
 * Combines the two P0 fixes from ENHANCEMENT_PROPOSAL_2026-07-02:
 *  1. Require an authenticated app user (previously these routes had no
 *     session check at all — anyone who found the URL could burn API
 *     credits or use the app as a free Claude proxy).
 *  2. Apply a simple per-user rate limit on top of auth, so even a
 *     legitimate signed-in user can't hammer the endpoint in a loop.
 *
 * Usage in a route handler:
 *
 *   const guard = await requireAiUser(req);
 *   if (!guard.ok) return guard.response;
 *   // guard.userId / guard.storageKey available below
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server-auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// 20 AI requests/minute/user is generous for interactive use (chat, coach,
// investment tools) while still bounding worst-case Anthropic spend from a
// single compromised or misbehaving session.
const DEFAULT_LIMIT = 20;
const DEFAULT_WINDOW_MS = 60_000;

export async function requireAiUser(
  req: Request,
  opts: { limit?: number; windowMs?: number } = {},
): Promise<
  | { ok: true; userId: string; storageKey: string }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const limit = opts.limit ?? DEFAULT_LIMIT;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const rl = checkRateLimit(`ai:${auth.userId}`, limit, windowMs);
  if (!rl.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "rate_limited", message: "Too many AI requests — please slow down." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      ),
    };
  }

  // Also cap per-IP, independent of user, as a coarse defense against many
  // accounts hitting the same route from one source.
  const ip = getClientIp(req);
  const rlIp = checkRateLimit(`ai-ip:${ip}`, limit * 3, windowMs);
  if (!rlIp.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "rate_limited", message: "Too many AI requests from this network — please slow down." },
        { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSeconds) } },
      ),
    };
  }

  return { ok: true, userId: auth.userId, storageKey: auth.storageKey };
}
