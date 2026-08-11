import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const apiRoot = resolve(process.cwd(), "../main-api");
const databaseUrl = "postgres://test:testpass@localhost:5433/knogest_test";
const environment: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  TEST_DATABASE_URL: databaseUrl,
  JWT_SECRET_KEY: "e2e-secret-key-with-at-least-thirty-two-characters",
  NODE_ENV: "test" as const,
};

export default function globalSetup() {
  Object.assign(process.env, environment);
  execFileSync("node", ["scripts/reset-test-database.mjs"], {
    cwd: apiRoot,
    env: environment,
    stdio: "inherit",
  });
  const result = spawnSync(
    "pnpm",
    [
      "admin",
      "--",
      "provision",
      "--corporation-name",
      "Pilot E2E Corporation",
      "--domain",
      "piloto.localhost",
      "--admin-email",
      "master@pilot.test",
      "--company",
      "Pilot E2E Company",
      "--password-stdin",
    ],
    {
      cwd: apiRoot,
      env: environment,
      input: "correct e2e password\n",
      encoding: "utf8",
    },
  );
  if (result.status !== 0)
    throw new Error(`E2E provisioning failed: ${result.stderr}`);
  execFileSync("pnpm", ["exec", "tsx", "scripts/seed-e2e-fixtures.ts"], {
    cwd: apiRoot,
    env: environment,
    stdio: "inherit",
  });
}
