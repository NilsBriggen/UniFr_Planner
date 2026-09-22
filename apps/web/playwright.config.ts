import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "4173";
const apiPort = process.env.E2E_API_PORT ?? "8001";
const rejectedApiPort = process.env.E2E_REJECTED_API_PORT ?? "8002";
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
        `cd ../.. && PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.catalogue_demo --port ${apiPort}`,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      env: { UNIFR_ACCOUNT_ORIGINS: JSON.stringify([baseURL]) },
    },
    {
      command:
        `cd ../.. && PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.catalogue_demo --port ${rejectedApiPort} --rejected`,
      url: `http://127.0.0.1:${rejectedApiPort}/api/health`,
      reuseExistingServer: false,
      env: { UNIFR_ACCOUNT_ORIGINS: JSON.stringify([baseURL]) },
    },
    {
      command: `npm run dev -- --port ${port} --strictPort`,
      url: baseURL,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
    },
  ],
});
