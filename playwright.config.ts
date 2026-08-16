import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_GUI_PORT ?? 5189);
const localOrigin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Pixel 7"],
    baseURL: process.env.E2E_GUI_BASE_URL ?? localOrigin,
    trace: "off",
  },
  webServer: process.env.E2E_GUI_BASE_URL
    ? undefined
    : {
      command: `npm run dev --workspace=frontend -- --host 127.0.0.1 --port ${port} --strictPort`,
      url: localOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
      },
    },
});
