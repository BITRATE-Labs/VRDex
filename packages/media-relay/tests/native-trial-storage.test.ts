import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNativeTrialStorage } from "../src/trial/storage";
import { parseSourceDescriptor } from "../src/contracts";

const source = parseSourceDescriptor({ streamKey: "vrcdn/Alpha/1", streamId: "Alpha", inputFormat: "vrcdn_fmp4", packagingVersion: 1 });
const prefix = `${source.streamKey}/epochs/1/attempt-1-fixture/`;

test("trial object storage reserves physical file bytes before concurrent reads and rejects unrelated source keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "native-trial-storage-"));
  try {
    const filePath = join(directory, "video-0.ts"); await writeFile(filePath, Buffer.alloc(8));
    const storage = createNativeTrialStorage({ streamKey: source.streamKey, maxBytes: 12 });
    const args = { filePath, signal: new AbortController().signal, retireAfterMs: 600000 };
    const result = await Promise.allSettled([storage.putSegment({ ...args, objectKey: prefix + "video-0.ts" }),
      storage.putSegment({ ...args, objectKey: prefix + "video-1.ts" })]);
    assert.equal(result.filter(value => value.status === "fulfilled").length, 1);
    assert(storage.bytes() <= 12);
    await assert.rejects(storage.putSegment({ ...args, objectKey: "vrcdn/Beta/1/epochs/1/attempt-1-fixture/video-0.ts" }), /source|key/);
    storage.close(); assert.equal(storage.bytes(), 0);
    assert.equal(storage.readSegment(prefix + "video-0.ts"), undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
