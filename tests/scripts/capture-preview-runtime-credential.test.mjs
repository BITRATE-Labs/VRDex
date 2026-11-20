import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPreviewRuntimeTarget, resolvePreviewRuntimeCredential } from "../../scripts/capture-preview-runtime-credential.mjs";

test("sandbox credential matches the exact preview and rejects production or malformed values", () => {
  const url = "https://example-preview.convex.cloud";
  const preview = { url, adminKey: "preview:test-only", deploymentType: "preview" };
  assert.doesNotThrow(() => assertPreviewRuntimeTarget(preview, url));
  assert.throws(() => assertPreviewRuntimeTarget(preview, "https://different.convex.cloud"));
  assert.throws(() => assertPreviewRuntimeTarget({ ...preview, deploymentType: "prod" }, url));
  for (const adminKey of ["", "unsafe\nvalue"]) {
    assert.throws(() => assertPreviewRuntimeTarget({ ...preview, adminKey }, url));
  }
});

test("resolves an existing preview without creating or deploying one", async () => {
  const url = "https://example-preview.convex.cloud";
  const key = await resolvePreviewRuntimeCredential({
    previewName: "sandbox-shared", previewDeployKey: "preview:test-team:test-project|fake-key", expectedUrl: url,
    fetcher: async (endpoint, options) => {
      assert.equal(endpoint, "https://api.convex.dev/api/deployment/authorize_preview");
      assert.equal(options.redirect, "error");
      assert.deepEqual(JSON.parse(options.body), {
        previewName: "sandbox-shared", projectSelection: { kind: "teamAndProjectSlugs", teamSlug: "test-team", projectSlug: "test-project" },
      });
      return Response.json({ url, adminKey: "preview:fake-key", deploymentType: "preview" });
    },
  });
  assert.equal(key, "preview:fake-key");
  await assert.rejects(resolvePreviewRuntimeCredential({
    previewName: "sandbox-shared", previewDeployKey: "prod:test|fake-key", expectedUrl: url,
    fetcher: async () => { throw new Error("must not call the provider"); },
  }), /project preview key/);
});
