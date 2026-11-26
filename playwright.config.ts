import { defineConfig, devices } from "@playwright/test";

/**
 * PWA UAT suite for Financial 101 Master.
 *
 * Local mode (default): builds nothing itself; expects `npm run build` to have run with
 * dummy NEXT_PUBLIC_SUPABASE_* values, then starts `next start` on :3100. No real
 * Supabase is ever contacted (all Supabase traffic is mocked via page.route).
 *
 * PROD_SMOKE=1: runs ONLY read-only unauthenticated checks against the live site.
 */
const PROD = process.env.PROD_SMOKE === "1";
const PROD_URL = process.env.PROD_URL || "https://financial101.vercel.app";
const PORT = Number(process.env.UAT_PORT || 3100);
const LOCAL_URL = `http://localhost:${PORT}`;

const DUMMY_SUPABASE_URL = "http://localhost:54321";
const DUMMY_SUPABASE_KEY = "dummy-anon-key-for-uat";

const foldCover = {
  deviceScaleFactor: 2.6,
  isMobile: true,
  hasTouch: true,
};

type VP = { name: string; use: Record<string, unknown> };

// Viewport matrix shared by local and prod projects.
const viewports = (prefix: string): VP[] => [
  {
    name: `${prefix}fold-cover-344`,
    use: { ...devices["Desktop Chrome"], ...foldCover, viewport: { width: 344, height: 882 }, userAgent: devices["Pixel 7"].userAgent },
  },
  {
    name: `${prefix}fold-cover-412`,
    use: { ...devices["Desktop Chrome"], ...foldCover, viewport: { width: 412, height: 915 }, userAgent: devices["Pixel 7"].userAgent },
  },
  {
    name: `${prefix}fold-inner-884`,
    use: { ...devices["Desktop Chrome"], deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, viewport: { width: 884, height: 1104 }, userAgent: devices["Pixel 7"].userAgent },
  },
  { name: `${prefix}mac-1440`, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  { name: `${prefix}mac-1280`, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
];

const localProjects = [
  // Installability + service-worker safety (Chromium desktop; SW needs a real browser engine).
  {
    name: "pwa-chromium",
    testMatch: /installability\.spec\.ts|sw-safety\.spec\.ts/,
    use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  },
  ...viewports("").map((v) => ({
    name: v.name,
    testMatch: /responsive\.spec\.ts/,
    use: v.use,
  })),
  ...viewports("auth-").map((v) => ({
    name: v.name,
    testMatch: /authenticated\.spec\.ts/,
    use: v.use,
  })),
  // macOS Safari case (WebKit engine) on the public pages.
  {
    name: "mac-safari-webkit-1440",
    testMatch: /responsive\.spec\.ts|installability\.spec\.ts/,
    use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
  },
];

const prodProjects = [
  {
    name: "prod-installability",
    testMatch: /installability\.spec\.ts/,
    use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  },
  ...viewports("prod-").map((v) => ({ name: v.name, testMatch: /responsive\.spec\.ts/, use: v.use })),
];

export default defineConfig({
  testDir: "./tests",
  outputDir: "./tests/.output/results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}-{platform}{ext}",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled", caret: "hide" },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/.output/report" }]],
  use: {
    baseURL: PROD ? PROD_URL : LOCAL_URL,
    trace: "retain-on-failure",
    serviceWorkers: "allow",
  },
  projects: (PROD ? prodProjects : localProjects) as never,
  webServer: PROD
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `${LOCAL_URL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: DUMMY_SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: DUMMY_SUPABASE_KEY,
        },
      },
});
