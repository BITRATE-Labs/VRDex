import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutputDirectory = ".tmp-gh-artifacts/preview-developer-runtime";

export const previewDeveloperRuntimeSecretFiles = Object.freeze({
  apiTokenPepper: "api-token-pepper",
  oauthAccessTokenSigningKey: "oauth-access-token-signing-key",
  oauthClientSecretPepper: "oauth-client-secret-pepper",
  oauthRefreshTokenPepper: "oauth-refresh-token-pepper",
});

export function createPreviewDeveloperRuntimeSecrets() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  const randomSecret = () => randomBytes(32).toString("hex");

  return {
    apiTokenPepper: randomSecret(),
    oauthAccessTokenSigningKey: privateKey.trimEnd().replaceAll("\n", "\\n"),
    oauthClientSecretPepper: randomSecret(),
    oauthRefreshTokenPepper: randomSecret(),
  };
}

export async function writePreviewDeveloperRuntimeSecrets(outputDirectory = defaultOutputDirectory, values = createPreviewDeveloperRuntimeSecrets()) {
  const outputPath = path.resolve(outputDirectory);
  await mkdir(outputPath, { recursive: true });
  await Promise.all(
    Object.entries(previewDeveloperRuntimeSecretFiles).map(([key, fileName]) =>
      writeFile(path.join(outputPath, fileName), values[key], { encoding: "utf8", mode: 0o600 }),
    ),
  );

  return { outputPath };
}

export function reuseSandboxRuntimeSecrets(previewName, run = spawnSync) {
  if (previewName !== "sandbox-shared") throw new Error("Secret reuse is restricted to the shared sandbox.");
  const values = createPreviewDeveloperRuntimeSecrets();
  const names = {
    apiTokenPepper: "VRDEX_API_TOKEN_PEPPER", oauthAccessTokenSigningKey: "VRDEX_OAUTH_ACCESS_TOKEN_SIGNING_KEY",
    oauthClientSecretPepper: "VRDEX_OAUTH_CLIENT_SECRET_PEPPER", oauthRefreshTokenPepper: "VRDEX_OAUTH_REFRESH_TOKEN_PEPPER",
  };
  for (const [key, name] of Object.entries(names)) {
    const result = run("pnpm", ["exec", "convex", "env", "get", name, "--preview-name", previewName], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Could not read sandbox setting ${name}.`);
    const value = result.stdout.trim();
    if (value) values[key] = value;
    else {
      if (!result.stderr.includes(`Environment variable "${name}" not found.`)) throw new Error(`Sandbox setting ${name} returned an unexpected response.`);
      const saved = run("pnpm", ["exec", "convex", "env", "set", name, "--preview-name", previewName], { input: values[key], encoding: "utf8" });
      if (saved.status !== 0) throw new Error(`Could not save sandbox setting ${name}.`);
    }
  }
  return values;
}

async function main() {
  if (process.argv.length > 3) {
    throw new Error("Usage: node scripts/generate-preview-developer-runtime-secrets.mjs [output-directory]");
  }

  const reuse = process.argv[2] === "--reuse-sandbox";
  const files = await writePreviewDeveloperRuntimeSecrets(reuse ? undefined : process.argv[2], reuse ? reuseSandboxRuntimeSecrets(process.env.PREVIEW_NAME) : undefined);
  console.log(`[preview-developer-runtime] Wrote ${Object.keys(previewDeveloperRuntimeSecretFiles).length} secret files under ${files.outputPath}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
