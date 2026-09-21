import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

// The complete existing acceptance suite targets the actual Compose Caddy origin.
// Only the rejected-catalogue negative control uses its separate fixture service.
export default defineConfig({
  ...base,
  workers: 2,
  webServer: [
    {
      command:
        "cd ../.. && PYTHONPATH=apps/api:packages/ingest/src .venv/bin/python -m unifr_api.catalogue_demo --port 8002 --rejected",
      url: "http://127.0.0.1:8002/api/health",
      reuseExistingServer: false,
    },
  ],
});
