// R: Run the isolated real-backend V3 local browser integration without shared servers.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "v3-local-integration.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  outputDir: "/tmp/kshiai-vt103-playwright-results",
  reporter: "list",
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE },
    trace: "retain-on-failure",
  },
});
