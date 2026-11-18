import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const web = new URL("../apps/web/", import.meta.url);
const port = "43148";
const origin = `http://127.0.0.1:${port}`;
console.log(`Discord intake sandbox: ${origin}/playwright/event-intake?source=discord-lineup`);

// Blank inherited auth and backend bindings even when Next loads .env.local.
const child = spawn(process.execPath, [
  fileURLToPath(new URL("node_modules/next/dist/bin/next", web)),
  "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port,
], {
  cwd: web,
  stdio: "inherit",
  env: {
    ...process.env,
    VRDEX_ENABLE_PLAYWRIGHT_FIXTURES: "true",
    VRDEX_ENABLE_E2E_HELPERS: "false",
    VRDEX_ENABLE_E2E_AUTH_HELPERS: "false",
    VRDEX_ENABLE_E2E_ADAPTER_HELPERS: "false",
    NEXT_PUBLIC_CONVEX_URL: "",
    CONVEX_URL: "",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
    CLERK_SECRET_KEY: "",
    NEXT_PUBLIC_POSTHOG_KEY: "",
    NEXT_PUBLIC_POSTHOG_FOUNDATION_ENABLED: "false",
    SITE_URL: origin,
  },
});
child.once("error", error => { console.error(error.message); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
