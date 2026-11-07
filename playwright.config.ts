import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5183",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
  ],
  webServer: [
    {
      command: "npx tsx apps/server/src/index.ts",
      url: "http://127.0.0.1:4321/api/health",
      reuseExistingServer: false,
      env: {
        PORT: "4321",
        JINGXU_DATA_DIR: process.env.JINGXU_E2E_DATA_DIR ?? ".data-e2e",
        JINGXU_ALLOWED_ORIGINS: "http://127.0.0.1:5183",
      },
    },
    {
      command: "npx vite --host 127.0.0.1 --port 5183",
      url: "http://127.0.0.1:5183",
      reuseExistingServer: false,
      env: { VITE_API_PROXY: "http://127.0.0.1:4321" },
    },
  ],
});
