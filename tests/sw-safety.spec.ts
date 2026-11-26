import { test, expect, type Page } from "@playwright/test";

/**
 * Service-worker safety: this app had user-data leak incidents (May 10/11 2026), so the SW
 * must never cache /api/*, /auth/* or HTML navigations. Only /_next/static/ and /icons/.
 */

async function readAllCacheUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) out.push(new URL(req.url).pathname + new URL(req.url).search);
    }
    return out;
  });
}

async function waitForControlled(page: Page) {
  // PwaManager hard-reloads the page once on the first controllerchange, which can abort an
  // in-flight evaluate/navigation. Retry until the context survives and the SW controls it.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100));
      });
      await page.waitForLoadState("load");
      await page.waitForTimeout(1500); // let the one-shot controllerchange reload finish
      if (await page.evaluate(() => !!navigator.serviceWorker.controller)) return;
    } catch {
      await page.waitForLoadState("load").catch(() => {});
    }
  }
  throw new Error("service worker never took control of the page");
}

test.describe("service worker never caches user-sensitive responses", () => {
  test("CacheStorage holds only /_next/static/ and /icons/ after navigation + API + HTML fetches", async ({ page }) => {
    await page.goto("/login");
    await waitForControlled(page);
    // Reload so the page (and its static chunks) load through the SW.
    await page.reload();
    await waitForControlled(page);

    // Drive traffic that a leaky SW would cache.
    await page.evaluate(async () => {
      const targets = [
        "/api/auth/ensure-app-user",
        "/api/sync",
        "/api/sync?storageKey=anything",
        "/auth/callback",
        "/signup",
        "/login",
        "/",
        "/expenses",
      ];
      for (const t of targets) {
        try { await fetch(t, { credentials: "include" }); } catch {}
        try { await fetch(t, { method: "POST", credentials: "include", body: "{}" }); } catch {}
      }
    });
    await page.goto("/signup");
    await page.goto("/login");
    await page.waitForTimeout(500);

    const urls = await readAllCacheUrls(page);
    expect(urls.length, "SW should have precached icons at minimum").toBeGreaterThan(0);

    const forbidden = urls.filter(
      (u) => u.startsWith("/api/") || u.startsWith("/auth/") || !(u.startsWith("/_next/static/") || u.startsWith("/icons/"))
    );
    expect(forbidden, `unexpected cache entries: ${forbidden.join(", ")}`).toEqual([]);
    expect(urls.some((u) => u.startsWith("/icons/"))).toBe(true);

    // No cached response may be HTML.
    const htmlEntries = await page.evaluate(async () => {
      const bad: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          const res = await cache.match(req);
          if ((res?.headers.get("content-type") || "").includes("text/html")) bad.push(req.url);
        }
      }
      return bad;
    });
    expect(htmlEntries).toEqual([]);
  });

  test("offline navigation shows the offline page, never stale user HTML", async ({ page, context }) => {
    await page.goto("/login");
    await waitForControlled(page);
    const loginMarker = await page.locator("body").innerText();
    expect(loginMarker.length).toBeGreaterThan(0);

    await context.setOffline(true);
    // Navigations the SW can intercept: previously-visited and never-visited pages.
    for (const path of ["/login", "/expenses", "/never-visited-" + Date.now()]) {
      await page.goto(path).catch(() => {});
      await expect(page.getByRole("heading", { name: "You're offline" }), `offline page for ${path}`).toBeVisible();
      await expect(page.getByText("Your plan is safe")).toBeVisible();
      // Must not be the real app UI.
      expect(await page.locator("body").innerText()).not.toContain(loginMarker.slice(0, 40));
    }
    await context.setOffline(false);
  });

  test("SW source never matches /api/ or /auth/ for caching (static guard)", async ({ request }) => {
    const src = await (await request.get("/sw.js")).text();
    expect(src).toMatch(/pathname\.startsWith\("\/api\/"\)/);
    expect(src).toMatch(/pathname\.startsWith\("\/auth\/"\)/);
    // Only /_next/static/ and /icons/ are ever put into a cache.
    expect(src).toContain('"/_next/static/"');
    expect(src).toContain('"/icons/"');
  });
});
