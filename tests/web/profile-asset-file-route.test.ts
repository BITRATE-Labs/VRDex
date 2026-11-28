import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("individual public asset downloads replace only UUID names with a usable published label", async () => {
  const path = "apps/web/src/app/api/v0/profiles/[slug]/assets/[assetId]/file/route.ts";
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const uuid = "fc0218e6-b53f-4c64-8204-18f009908fc1";
  const metadata = {
    originalFileName: uuid + ".webp",
    label: "BASICBIT Graffiti",
    displayName: "BASICBIT",
    storageKey: "display",
    mimeType: "image/png",
    downloadStorageKey: "download",
    downloadMimeType: "image/webp",
  };
  let asset = metadata;
  const bodies = { display: Uint8Array.of(137, 80, 78, 71), download: Uint8Array.of(82, 73, 70, 70) };
  const dependencies: Record<string, unknown> = {
    "@convex-generated-api": { api: { profileAssets: { getPublicAssetForStorage: "public-asset" } } },
    "@/lib/server/api-v0": {
      rejectBearerTokenQuery: () => null,
      rejectInvalidOrRateLimitedPublicApiRequest: () => null,
    },
    "@/lib/server/convex-http": { convexHttpClient: () => ({ query: () => asset }) },
    "@/lib/server/profile-asset-storage": {
      isProfileAssetStorageConfigured: () => true,
      getProfileAssetObject: (key: keyof typeof bodies) => ({ body: bodies[key] }),
    },
    "@/lib/server/now-playing-artwork": { createNowPlayingArtworkService: () => ({}) },
  };
  const exports: { GET?: (request: Request, context: { params: Promise<{ slug: string; assetId: string }> }) => Promise<Response> } = {};
  vm.runInNewContext(code, {
    exports, Response, URL, require: (name: string) => {
      assert.ok(name in dependencies, name);
      return dependencies[name];
    },
  });
  const get = exports.GET;
  assert.ok(get);
  const context = { params: Promise.resolve({ slug: "basicbit", assetId: "synthetic-asset" }) };
  const url = "https://example.test/api/v0/profiles/basicbit/assets/synthetic-asset/file";

  const cases = [
    { name: "BASICBIT Graffiti.webp" },
    { override: { originalFileName: "BASICBIT_Primary_Logo.png", label: "BASICBIT Primary Logo", downloadMimeType: "image/png" }, name: "BASICBIT_Primary_Logo.png" },
    { override: { originalFileName: uuid + ".jpeg", label: "BASICBIT Graffiti.v2" }, name: "BASICBIT Graffiti.v2.webp" },
    { override: { label: 'Road / show "v2".png' }, name: "Road - show -v2.webp" },
    { override: { label: "---" }, name: uuid + ".webp" },
    { override: { label: uuid + ".webp" }, name: uuid + ".webp" },
  ];
  for (const { override, name } of cases) {
    asset = { ...metadata, ...override };
    const response = await get(new Request(url + "?download=1"), context);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="' + name + '"');
    assert.equal(response.headers.get("content-type"), asset.downloadMimeType);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bodies.download);
  }

  asset = metadata;
  const inline = await get(new Request(url), context);
  assert.equal(inline.headers.get("content-disposition"), 'inline; filename="' + uuid + '.png"');
  assert.equal(inline.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await inline.arrayBuffer()), bodies.display);
});
