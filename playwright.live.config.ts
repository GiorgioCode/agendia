import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "node:child_process";
// Deliberately resolve credentials only from the local CLI; never load DATABASE_URL.
const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const api = status.API_URL;
if (
  !api ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(api).hostname)
)
  throw new Error("Live tests require an isolated local Supabase instance.");
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!key) throw new Error("Local Supabase API key missing.");
process.env.AGENDIA_LOCAL_SUPABASE_URL = api;
process.env.AGENDIA_LOCAL_SUPABASE_KEY = key;
export default defineConfig({
  testDir: "tests/live",
  workers: 1,
  timeout: 60000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5175 --strictPort",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: api,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
      VITE_APP_BASE_URL: "http://127.0.0.1:5175",
      VITE_ROOT_DOMAIN: "",
    },
  },
});
