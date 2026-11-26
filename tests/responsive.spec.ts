import { test, expect } from "@playwright/test";
import {
  expectNoHorizontalOverflow,
  expectViewportFitCover,
  findSmallTapTargets,
  formatTargets,
  isMobileProject,
  isProd,
  settle,
} from "./helpers";

// SW is covered by its own spec; blocking it here avoids its one-shot controllerchange reload.
test.use({ serviceWorkers: "block" });

const PUBLIC_PAGES = ["/login", "/signup"];

for (const path of PUBLIC_PAGES) {
  test.describe(`public page ${path}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
      await settle(page);
    });

    test("no horizontal overflow", async ({ page }) => {
      await expectNoHorizontalOverflow(page);
    });

    test("viewport-fit=cover meta and safe-area CSS present", async ({ page }) => {
      await expectViewportFitCover(page);
      const usesSafeArea = await page.evaluate(() => {
        const sheets = Array.from(document.styleSheets);
        for (const s of sheets) {
          try {
            for (const r of Array.from(s.cssRules)) if (r.cssText.includes("safe-area-inset")) return true;
          } catch {}
        }
        return false;
      });
      expect(usesSafeArea, "some stylesheet uses env(safe-area-inset-*)").toBe(true);
    });

    if (path === "/signup") {
      // KNOWN DEFECT (see tap-target test). Expected to fail until providers.tsx lists "/signup".
      test("renders standalone, without the authenticated app shell", async ({ page }) => {
        test.fail(true, "providers.tsx PUBLIC_PATHS omits /signup so AppShell + What's New modal wrap the form");
        await expect(page.getByText("What's New")).toHaveCount(0);
        await expect(page.locator("nav").filter({ hasText: "Dashboard" })).toHaveCount(0);
      });
    }

    test("tap targets are at least 44x44 on mobile sizes", async ({ page }, testInfo) => {
      test.skip(!isMobileProject(testInfo), "tap-target rule applies to touch/mobile viewports only");
      // KNOWN DEFECT: /signup is missing from providers.tsx PUBLIC_PATHS (present in AuthGuard), so it is
      // wrapped in the authenticated AppShell (header, bottom nav, "What's New" modal) and its own
      // "Sign In" link is 39x15. test.fail() flips to red when fixed -> remove it then.
      test.fail(path === "/signup", "signup rendered inside AppShell + undersized targets (see providers.tsx PUBLIC_PATHS)");
      const small = await findSmallTapTargets(page, 44);
      expect(small, `Targets < 44px: ${formatTargets(small)}`).toEqual([]);
    });

    test("visual baseline", async ({ page }, testInfo) => {
      test.skip(isProd(testInfo), "no pixel baselines against the live site (read-only smoke)");
      // Mask anything that can vary run to run (version labels, dates, clocks).
      const dynamic = [
        page.locator('[data-testid="version"], time, [class*="version"], [class*="clock"]'),
        page.getByText(/^\d{1,2} [A-Z][a-z]+ \d{4}$/), // release date in the What's New modal
      ];
      await expect(page).toHaveScreenshot(`${path.replace("/", "")}.png`, {
        fullPage: false,
        mask: dynamic,
        maxDiffPixelRatio: 0.001,
      });
    });
  });
}
