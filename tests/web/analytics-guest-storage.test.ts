import assert from "node:assert/strict";
import { it } from "node:test";
import { ensureGuestReceipt } from "../../apps/web/src/lib/analytics-guest";

it("does not mint a server identity when browser receipt storage cannot be written", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
  const previousFetch = globalThis.fetch;
  let requests = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: () => { throw new Error("quota exhausted"); }, removeItem: () => {} } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name: string, callback: () => Promise<unknown>) => callback() } });
  globalThis.fetch = async () => { requests++; throw new Error("must not request an identity"); };
  try {
    await assert.rejects(ensureGuestReceipt());
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage); else Reflect.deleteProperty(globalThis, "localStorage");
    if (previousLocks) Object.defineProperty(navigator, "locks", previousLocks); else Reflect.deleteProperty(navigator, "locks");
  }
});
