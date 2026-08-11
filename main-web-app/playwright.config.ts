import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl = "postgres://test:testpass@localhost:5433/knogest_test";
const webPort = process.env.E2E_WEB_PORT ?? "3000";
const apiPort = process.env.E2E_API_PORT ?? "3333";
const webServerCommand =
  process.env.E2E_USE_NEXT_START === "true"
    ? `pnpm exec next start -p ${webPort}`
    : `pnpm exec next dev -p ${webPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: `http://piloto.localhost:${webPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: [
    {
      command: webServerCommand,
      url: `http://piloto.localhost:${webPort}/auth/login`,
      reuseExistingServer: false,
      env: {
        API_BASE_URL: `http://localhost:${apiPort}`,
        AUTH_COOKIE_MODE: "local",
      },
      timeout: 120_000,
    },
    {
      command: "pnpm --dir ../main-api dev",
      url: `http://localhost:${apiPort}/docs`,
      reuseExistingServer: false,
      env: {
        PORT: apiPort,
        DATABASE_URL: testDatabaseUrl,
        JWT_SECRET_KEY: "e2e-secret-key-with-at-least-thirty-two-characters",
        NODE_ENV: "test",
      },
      timeout: 120_000,
    },
  ],
});
