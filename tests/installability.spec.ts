import { test, expect } from "@playwright/test";
import { retryAcrossReload } from "./helpers";

type Icon = { src: string; sizes: string; type?: string; purpose?: string };

test.describe("PWA installability (unauthenticated, read-only)", () => {
  test("manifest is served without login, with correct type and required members", async ({ request, baseURL }) => {
    const res = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(res.status(), "manifest must not be redirected to /login").toBe(200);
    expect(res.headers()["content-type"]).toMatch(/application\/(manifest\+json|json)/);

    const m = await res.json();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(m.scope).toBeTruthy();
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{3,8}$/i);
    // start_url must live inside scope
    const start = new URL(m.start_url, baseURL);
    const scope = new URL(m.scope, baseURL);
    expect(start.pathname.startsWith(scope.pathname)).toBe(true);
  });

  test("192 and 512 icons exist for both 'any' and 'maskable' and load as real PNGs of declared size", async ({ request }) => {
    const m = await (await request.get("/manifest.webmanifest")).json();
    const icons: Icon[] = m.icons;
    const find = (size: string, purpose: string) =>
      icons.find((i) => i.sizes === size && (i.purpose ?? "any").split(" ").includes(purpose));

    for (const size of ["192x192", "512x512"]) {
      for (const purpose of ["any", "maskable"]) {
        const icon = find(size, purpose);
        expect(icon, `${size} ${purpose} icon declared`).toBeTruthy();
        const res = await request.get(icon!.src, { maxRedirects: 0 });
        expect(res.status(), `${icon!.src} status`).toBe(200);
        expect(res.headers()["content-type"]).toMatch(/image\/png/);
        const buf = await res.body();
        // PNG signature + IHDR width/height
        expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        const w = buf.readUInt32BE(16);
        const h = buf.readUInt32BE(20);
        expect(`${w}x${h}`, `${icon!.src} real dimensions`).toBe(size);
      }
    }
  });

  test("apple-touch-icon is served unauthenticated as PNG", async ({ request }) => {
    const res = await request.get("/icons/apple-touch-icon.png", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/image\/png/);
  });

  test("/sw.js is served unauthenticated with a JavaScript content-type", async ({ request }) => {
    const res = await request.get("/sw.js", { maxRedirects: 0 });
    expect(res.status(), "sw.js must not redirect to /login").toBe(200);
    expect(res.headers()["content-type"]).toMatch(/(application|text)\/javascript/);
    expect(await res.text()).toContain("addEventListener");
  });

  test("page links the manifest and has viewport-fit=cover", async ({ page }) => {
    await page.goto("/login");
    await retryAcrossReload(page, async () => {
      expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.webmanifest");
    });
    const contents = await retryAcrossReload(page, () =>
      page.locator('meta[name="viewport"]').evaluateAll((els) => els.map((e) => e.getAttribute("content") || ""))
    );
    expect(contents.some((c) => c.includes("viewport-fit=cover")), "a viewport meta carries viewport-fit=cover").toBe(true);
  });

  // KNOWN DEFECT (reported, app code not changed by this suite): layout.tsx hand-writes a viewport
  // <meta> while Next.js also injects its default one, so two conflicting viewport metas ship.
  // test.fail() keeps CI green while the defect exists and turns red once it is fixed (remove it then).
  test("exactly one viewport meta tag", async ({ page }) => {
    test.fail(true, "layout.tsx duplicates Next's default viewport meta (second lacks viewport-fit=cover)");
    await page.goto("/login");
    await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
  });

  test("service worker registers and controls the page", async ({ page, browserName }) => {
    await page.goto("/login");
    // PwaManager registers /sw.js in production builds only.
    const info = await retryAcrossReload(page, () => page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { supported: false } as const;
      const reg = await navigator.serviceWorker.ready;
      // First load: clients.claim() in activate makes it control the page shortly after.
      for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return {
        supported: true,
        scope: reg.scope,
        script: reg.active?.scriptURL ?? null,
        state: reg.active?.state ?? null,
        controlled: !!navigator.serviceWorker.controller,
      } as const;
    }));
    expect(info.supported, `${browserName} supports service workers`).toBe(true);
    if (info.supported) {
      expect(info.script).toMatch(/\/sw\.js$/);
      expect(info.state).toBe("activated");
      expect(info.controlled, "SW controls the page after claim()").toBe(true);
    }
  });
});
