import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "4173";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command:
        "cd ../.. && PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.catalogue_demo --port 8001",
      url: "http://127.0.0.1:8001/api/health",
      reuseExistingServer: false,
      env: { UNIFR_ACCOUNT_ORIGINS: JSON.stringify([baseURL]) },
    },
    {
      command:
        "cd ../.. && PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.catalogue_demo --port 8002 --rejected",
      url: "http://127.0.0.1:8002/api/health",
      reuseExistingServer: false,
      env: { UNIFR_ACCOUNT_ORIGINS: JSON.stringify([baseURL]) },
    },
    {
      command: `npm run dev -- --port ${port} --strictPort`,
      url: baseURL,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: "http://127.0.0.1:8001" },
    },
  ],
});
