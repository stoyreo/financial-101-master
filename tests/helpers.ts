import { expect, type Page, type TestInfo } from "@playwright/test";

export interface SmallTarget {
  tag: string;
  text: string;
  w: number;
  h: number;
  sel: string;
}

/** Horizontal overflow: document must not be wider than the viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(m.scrollWidth, `document.scrollWidth ${m.scrollWidth} > innerWidth ${m.innerWidth}`).toBeLessThanOrEqual(m.innerWidth);
}

/** Visible interactive elements smaller than min x min CSS px. */
export async function findSmallTapTargets(page: Page, min = 44): Promise<SmallTarget[]> {
  return page.evaluate((min) => {
    const sel = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="tab"], summary';
    const out: SmallTarget[] = [];
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className.split(/\s+/).slice(0, 2).join(".") : "";
      return `${el.tagName.toLowerCase()}${id}${cls ? "." + cls : ""}`;
    };
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (r.bottom < 0 || r.right < 0) continue;
      // Skip checkbox/radio hidden inside a larger clickable label.
      const input = el as HTMLInputElement;
      if ((input.type === "checkbox" || input.type === "radio") && el.closest("label")) {
        const lr = el.closest("label")!.getBoundingClientRect();
        if (lr.width >= min && lr.height >= min) continue;
      }
      if (r.width < min - 0.5 || r.height < min - 0.5) {
        out.push({
          tag: el.tagName.toLowerCase(),
          text: ((el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || el.getAttribute("aria-label") || "").trim().slice(0, 30),
          w: Math.round(r.width),
          h: Math.round(r.height),
          sel: describe(el),
        });
      }
    }
    return out;
  }, min) as Promise<SmallTarget[]>;
}

export function formatTargets(t: SmallTarget[]): string {
  return t.map((x) => `${x.sel} "${x.text}" ${x.w}x${x.h}`).join("; ");
}

export async function expectViewportFitCover(page: Page) {
  const contents = await page.locator('meta[name="viewport"]').evaluateAll((els) => els.map((e) => e.getAttribute("content") || ""));
  expect(contents.length, "viewport meta present").toBeGreaterThan(0);
  expect(contents.some((c) => c.includes("viewport-fit=cover")), "viewport-fit=cover present").toBe(true);
}

/** Is this a read-only prod smoke project (no screenshot baselines against live data). */
export function isProd(testInfo: TestInfo): boolean {
  return testInfo.project.name.startsWith("prod-");
}

export function isMobileProject(testInfo: TestInfo): boolean {
  return !!testInfo.project.use.isMobile;
}

/** Wait for fonts + animations to settle before a screenshot. */
export async function settle(page: Page) {
  await page.evaluate(() => (document as any).fonts?.ready);
  // No "networkidle": the app polls /api/ai/status so the network is never idle.
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
}

// ───────────────────────── Supabase mocking ─────────────────────────

export const FAKE_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "uat-fake@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "UAT Fake" },
  created_at: "2026-01-01T00:00:00Z",
};

/** Fake Supabase session. expires_at far in the future => no refresh call is ever attempted. */
export function fakeSession() {
  return {
    access_token: "fake.access.token",
    refresh_token: "fake-refresh-token",
    token_type: "bearer",
    expires_in: 3600 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    user: FAKE_USER,
  };
}

/** Cookie name @supabase/ssr derives from http://localhost:54321 => sb-localhost-auth-token */
export const SB_COOKIE = "sb-localhost-auth-token";

export function sessionCookieValue(): string {
  return "base64-" + Buffer.from(JSON.stringify(fakeSession())).toString("base64url");
}

/**
 * PwaManager hard-reloads the page once on the first service-worker controllerchange, which destroys the
 * JS execution context mid-evaluate (seen on WebKit). Retry an in-page operation across that reload.
 */
export async function retryAcrossReload<T>(page: Page, fn: () => Promise<T>, attempts = 6): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(1000);
    }
  }
  throw last;
}
