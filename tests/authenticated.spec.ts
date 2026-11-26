import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import {
  FAKE_USER,
  SB_COOKIE,
  expectNoHorizontalOverflow,
  sessionCookieValue,
  settle,
} from "./helpers";

/**
 * Authenticated pages rendered against the LOCAL production build with a FAKE Supabase session.
 *
 * Nothing real is touched:
 *  - NEXT_PUBLIC_SUPABASE_URL is http://localhost:54321 (dummy; nothing listens there).
 *  - A fabricated, far-future-expiry session cookie satisfies src/middleware.ts (server-side
 *    getSession() reads the cookie and does not call the network when the token is unexpired)
 *    and the browser client's supabase.auth.getSession() in AuthGuard.
 *  - Every request to the Supabase host and to /api/* is fulfilled by page.route with fake/empty JSON,
 *    and any unmocked request to a non-local host is aborted, so no external traffic can escape.
 */

test.use({ serviceWorkers: "block" });

const PAGES = ["/", "/expenses", "/income", "/investments", "/tax", "/debts", "/forecast", "/accounts", "/profile", "/scenarios"];

const FAKE_APP_USER = {
  id: FAKE_USER.id,
  email: FAKE_USER.email,
  role: "member",
  supabase_user_id: FAKE_USER.id,
  created_at: "2026-01-01T00:00:00Z",
  username: "uatfake",
  displayName: "UAT Fake",
};

async function installMocks(context: BrowserContext, baseURL: string) {
  const host = new URL(baseURL).host;
  await context.addCookies([
    { name: SB_COOKIE, value: sessionCookieValue(), url: baseURL, sameSite: "Lax" },
  ]);

  // Supabase (dummy host :54321)
  await context.route(/localhost:54321/, async (route) => {
    const url = route.request().url();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    if (url.includes("/auth/v1/user")) return json(FAKE_USER);
    if (url.includes("/auth/v1/")) return json({});
    if (url.includes("/rest/v1/")) return json([]);
    return json({});
  });

  // App API routes: fake, empty data. (The real handlers would hit Supabase server-side.)
  await context.route(`**://${host}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/auth/ensure-app-user") return json({ appUser: FAKE_APP_USER });
    if (url.pathname.startsWith("/api/sync")) return json({ data: null, storageKey: "fp_data_00000000", updatedAt: null });
    return json({});
  });

  // Block anything that would leave the machine.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
}

async function openAuthed(page: Page, path: string) {
  await page.goto(path);
  // AuthGuard renders null until getSession resolves; AppShell then mounts.
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, undefined, { timeout: 20_000 }).catch(() => {});
  await settle(page);
  // First-visit "What's New" modal (once per version) would cover every page; dismiss like a user does.
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible().catch(() => false)) {
    await gotIt.click();
    await expect(gotIt).toBeHidden();
  }
  await page.waitForTimeout(300);
}

for (const path of PAGES) {
  test.describe(`authenticated ${path} (mocked Supabase)`, () => {
    // /accounts is gated client-side by a hard-coded allow-list of two real admin e-mail addresses
    // (src/app/accounts/page.tsx:32-35) and redirects everyone else to "/". Rendering it would need a
    // fake session that spoofs one of those real admin identities, which this suite deliberately will
    // not do (no admin identities/credentials). Marked fixme instead of faking a pass.
    test.fixme(path === "/accounts", "admin-only page: needs a spoofed real admin e-mail in the mock session; intentionally not done");

    test.beforeEach(async ({ context, baseURL }) => {
      await installMocks(context, baseURL!);
    });

    test("renders the app shell (not redirected to /login) and has no horizontal overflow", async ({ page }) => {
      await openAuthed(page, path);
      expect(new URL(page.url()).pathname, "mock session must be accepted").toBe(path);
      // AppShell mounted: navigation is present (sidebar on desktop, bottom bar on mobile).
      await expect(page.getByText("Dashboard").filter({ visible: true }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Continue with Google");
      await expectNoHorizontalOverflow(page);
    });

    test("visual baseline", async ({ page }) => {
      await openAuthed(page, path);
      // The floating, draggable "Ask Fin" tab settles at a different spot run to run, so a mask
      // (which only covers its current position) leaves the baseline's copy as a diff. It also mounts
      // late (dynamic, ssr:false), so hide it with a CSS rule that applies whenever it appears.
      await page.addStyleTag({ content: '[aria-label^="Ask Fin"]{visibility:hidden !important}' });
      // Mask text that varies with time/data: dates, currency amounts, version labels, sync status, avatar.
      const dynamic = [
        page.locator("time"),
        page.getByRole("button", { name: /Ask Fin/ }), // floating, draggable AI tab (GlobalAiAvatar)
        // Native <select> (ModelPicker on /income and /forecast): Chrome draws its border/chevron through
        // the host OS theme, so it differs between macOS versions (CI macos-latest vs. a dev Mac).
        page.locator("select"),
        page.locator('[class*="version"], [data-testid="version"]'),
        page.locator('[class*="sync"], [class*="Sync"]'),
        page.locator('[class*="avatar"], [class*="Avatar"]'),
        page.getByText(/\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/),
        page.getByText(/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/),
      ];
      await expect(page).toHaveScreenshot(`${path === "/" ? "home" : path.slice(1)}.png`, { mask: dynamic, maxDiffPixelRatio: 0.001 });
    });
  });
}
