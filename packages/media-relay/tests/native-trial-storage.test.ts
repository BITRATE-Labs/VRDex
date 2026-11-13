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

import { snapshotObjectKey, type RenditionSnapshot } from "../src/contracts";
import { NATIVE_TRIAL_SEGMENT_GRACE_MS } from "../src/trial/policy";
test("storage retains a retired advertised window for the bounded segment grace",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"native-trial-storage-"));
  let now=0;
  const storage=createNativeTrialStorage({streamKey:source.streamKey,maxBytes:4096,clock:()=>now});
  try {
    const filePath=join(directory,"segment.ts");await writeFile(filePath,Buffer.alloc(8));
    const signal=new AbortController().signal;
    for(let sequence=0;sequence<5;sequence++) await storage.putSegment({objectKey:prefix+`video-${sequence}.ts`,filePath,signal,retireAfterMs:600000});
    for(let sequence=0;sequence<3;sequence++){
      now=sequence*2000;
      const snapshot:RenditionSnapshot={streamKey:source.streamKey,epoch:1,rendition:"video",targetDurationSeconds:2,sequence,discontinuitySequence:0,generatedAt:now,
        segments:[sequence,sequence+1,sequence+2].map(sequence=>({sequence,objectKey:prefix+`video-${sequence}.ts`,durationSeconds:2,programDateTime:sequence*2000,discontinuity:false}))};
      await storage.putSnapshot({objectKey:snapshotObjectKey(snapshot),snapshot,signal,retireAfterMs:600000});
    }
    assert(storage.readSegment(prefix+"video-0.ts"));
    now+=NATIVE_TRIAL_SEGMENT_GRACE_MS+1;
    await storage.retire({before:now,limit:100,signal});
    assert.equal(storage.readSegment(prefix+"video-0.ts"),undefined);
  }finally{storage.close();assert(directory.startsWith(join(tmpdir(),"native-trial-storage-")));await rm(directory,{recursive:true,force:true});}
});
