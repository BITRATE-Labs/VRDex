import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { previewPersistenceBridgeSecret } from "../../apps/web/src/lib/server/oauth-dynamic-client-persistence";

describe("web preview OAuth persistence selection", () => {
  it("returns no bridge secret when the bridge is disabled", () => {
    assert.equal(previewPersistenceBridgeSecret({}), undefined);
    assert.equal(
      previewPersistenceBridgeSecret({
        VRDEX_DEPLOYMENT_ENV: "production",
        VRDEX_PREVIEW_PERSISTENCE_SECRET: "must-not-be-used",
      }),
      undefined,
    );
  });

  it("returns the secret only for a complete preview configuration", () => {
    assert.equal(
      previewPersistenceBridgeSecret({
        VRDEX_DEPLOYMENT_ENV: "preview",
        VRDEX_ENABLE_PREVIEW_PERSISTENCE_BRIDGE: "true",
        VRDEX_PREVIEW_PERSISTENCE_SECRET: " preview-secret ",
      }),
      "preview-secret",
    );
  });

  it("uses normal server authorization when sandbox has its own admin credential", () => {
    const environment = {
      VRDEX_DEPLOYMENT_ENV: "preview", VRDEX_ENABLE_PREVIEW_PERSISTENCE_BRIDGE: "true",
      VRDEX_PREVIEW_PERSISTENCE_SECRET: "preview-secret",
    };
    assert.equal(previewPersistenceBridgeSecret({ ...environment, CONVEX_ADMIN_TOKEN: "sandbox-admin-test" }), undefined);
    assert.equal(previewPersistenceBridgeSecret({ ...environment, CONVEX_ADMIN_TOKEN: "  " }), "preview-secret");
  });

  it("fails closed when an enabled bridge is incomplete or not preview-scoped", () => {
    assert.throws(
      () =>
        previewPersistenceBridgeSecret({
          VRDEX_DEPLOYMENT_ENV: "preview",
          VRDEX_ENABLE_PREVIEW_PERSISTENCE_BRIDGE: "true",
        }),
      /configuration is incomplete/,
    );
    assert.throws(
      () =>
        previewPersistenceBridgeSecret({
          VRDEX_DEPLOYMENT_ENV: "production",
          VRDEX_ENABLE_PREVIEW_PERSISTENCE_BRIDGE: "true",
          VRDEX_PREVIEW_PERSISTENCE_SECRET: "must-not-be-used",
        }),
      /configuration is incomplete/,
    );
  });
});
