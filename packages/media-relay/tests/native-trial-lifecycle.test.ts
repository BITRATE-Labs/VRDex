import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { test } from "node:test";
import { bootNativeTrial } from "../src/trial/entrypoint";

async function unusedPort() {
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const address = probe.address(); assert(address && typeof address !== "string");
  const port = address.port; await new Promise<void>(resolve => probe.close(() => resolve())); return port;
}
function fakeRuntime() {
  let stopped = 0;
  return { gateway: async () => new Response("ok"), stop: async () => { stopped++; },
    upstreamBytes: () => 0, retainedBytes: () => 0, acquisitions: () => 0, stopped: () => stopped };
}
test("absolute trial expiry stops the actual HTTP server and owned runtime once", async () => {
  const port = await unusedPort(), fake = fakeRuntime();
  const handle = await bootNativeTrial({ PORT: String(port), MEDIA_RELAY_TRIAL_CONFIG: JSON.stringify({ origin: `http://127.0.0.1:${port}`, expiresAt: Date.now() + 100 }) }, async () => fake);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/`)).text(), "ok");
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(fake.stopped(), 1);
  await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
  await handle.stop(); assert.equal(fake.stopped(), 1);
});
test("failed HTTP startup cleans the already started runtime", async () => {
  const occupied = createServer(); occupied.listen(0, "0.0.0.0"); await once(occupied, "listening");
  const address = occupied.address(); assert(address && typeof address !== "string");
  const fake = fakeRuntime();
  try {
    await assert.rejects(bootNativeTrial({ PORT: String(address.port), MEDIA_RELAY_TRIAL_CONFIG: JSON.stringify({ origin: "https://trial.invalid", expiresAt: Date.now() + 10000 }) }, async () => fake));
    assert.equal(fake.stopped(), 1);
  } finally { await new Promise<void>(resolve => occupied.close(() => resolve())); }
});
