import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function assertPreviewRuntimeTarget(deployment, expectedUrl) {
  if (!expectedUrl || deployment.url !== expectedUrl || deployment.deploymentType !== "preview") {
    throw new Error("Sandbox runtime credential must match the exact preview backend.");
  }
  if (!deployment.adminKey || /[\r\n]/.test(deployment.adminKey)) {
    throw new Error("Sandbox runtime credential is missing or malformed.");
  }
}

export async function resolvePreviewRuntimeCredential({ previewName, previewDeployKey, expectedUrl, fetcher = fetch }) {
  const [kind, teamSlug, projectSlug] = (previewDeployKey ?? "").split("|")[0].split(":");
  if (kind !== "preview" || !teamSlug || !projectSlug || previewName !== "sandbox-shared" || !/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(expectedUrl ?? "")) {
    throw new Error("A project preview key, preview name and exact backend URL are required.");
  }
  // shortcut: this is the authorization endpoint used by the pinned Convex CLI; replace when its export command exists.
  const response = await fetcher("https://api.convex.dev/api/deployment/authorize_preview", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${previewDeployKey}`, "content-type": "application/json" },
    body: JSON.stringify({ previewName, projectSelection: { kind: "teamAndProjectSlugs", teamSlug, projectSlug } }),
  });
  if (!response.ok) throw new Error("Could not authorize the sandbox preview backend.");
  const deployment = await response.json();
  assertPreviewRuntimeTarget(deployment, expectedUrl);
  return deployment.adminKey;
}

async function main() {
  if (!process.env.GITHUB_OUTPUT) throw new Error("GitHub output file is required.");
  const adminKey = await resolvePreviewRuntimeCredential({
    previewName: process.env.PREVIEW_NAME,
    previewDeployKey: process.env.CONVEX_DEPLOY_KEY,
    expectedUrl: process.env.EXPECTED_CONVEX_PREVIEW_URL,
  });
  console.log(`::add-mask::${adminKey}`);
  appendFileSync(process.env.GITHUB_OUTPUT, `deployment_key=${adminKey}\n`);
  console.log("Authorized the exact shared preview for the Convex deploy step.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Could not authorize the pinned sandbox Convex preview.");
    process.exitCode = 1;
  });
}
