import assert from "node:assert/strict";
import { createPrivateKey } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  createPreviewDeveloperRuntimeSecrets,
  previewDeveloperRuntimeSecretFiles,
  writePreviewDeveloperRuntimeSecrets,
  reuseSandboxRuntimeSecrets,
} from "../../scripts/generate-preview-developer-runtime-secrets.mjs";

describe("preview developer runtime secret generation", () => {
  it("creates independent peppers and an RSA access-token signing key", () => {
    const values = createPreviewDeveloperRuntimeSecrets();
    const peppers = [values.apiTokenPepper, values.oauthClientSecretPepper, values.oauthRefreshTokenPepper];

    for (const pepper of peppers) {
      assert.match(pepper, /^[a-f0-9]{64}$/);
    }
    assert.equal(new Set(peppers).size, peppers.length);
    assert.equal(createPrivateKey(values.oauthAccessTokenSigningKey.replaceAll("\\n", "\n")).asymmetricKeyType, "rsa");
  });

  it("writes each secret to its own file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "vrdex-preview-developer-runtime-"));

    try {
      await writePreviewDeveloperRuntimeSecrets(directory);

      for (const fileName of Object.values(previewDeveloperRuntimeSecretFiles)) {
        assert.notEqual((await readFile(path.join(directory, fileName), "utf8")).trim(), "");
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

it("reuses saved shared-sandbox secrets and fails closed on provider errors", () => {
  const saved = new Map<string, string>();
  const run = (_command: string, args: string[], options: { input?: string }) => {
    assert.equal(args.at(-1), "sandbox-shared");
    const name = args[4]!;
    if (args[3] === "set") { saved.set(name, options.input!); return { status: 0, stdout: "", stderr: "" }; }
    return { status: 0, stdout: saved.get(name) ?? "", stderr: saved.has(name) ? "" : `Environment variable "${name}" not found.` };
  };
  const first = reuseSandboxRuntimeSecrets("sandbox-shared", run);
  assert.equal(saved.size, 4);
  assert.deepEqual(reuseSandboxRuntimeSecrets("sandbox-shared", run), first);
  assert.throws(() => reuseSandboxRuntimeSecrets("sandbox-shared", () => ({ status: 1, stdout: "", stderr: "provider unavailable" })), /Could not read/);
  assert.throws(() => reuseSandboxRuntimeSecrets("sandbox-shared", () => ({ status: 0, stdout: "", stderr: "" })), /unexpected response/);
  assert.throws(() => reuseSandboxRuntimeSecrets("pr-1", run), /restricted/);
});
