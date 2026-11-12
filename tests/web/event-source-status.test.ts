import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { eventDjTarget } from "../../apps/web/src/lib/event-dj-target";
import { createSourceStatusReader } from "../../apps/web/src/lib/event-source-observations";
import { parseVrcdnStreamLinks } from "../../convex/_vrcdnLinks";

it("the real server reader leaves direct media unprobed while retaining provider failures", async () => {
  let probes = 0;
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "../event-source-observations": { createSourceStatusReader },
    "../event-dj-target": { eventDjTarget },
    "../../../../../convex/_vrcdnLinks": { parseVrcdnStreamLinks },
    "./vrcdn-live": { getVrcdnLiveObservation: async () => {
      probes++;
      return {state:"offline",observedAt:Date.now()};
    } },
    "./twitch-live": { getTwitchLiveObservation: async () => {
      probes++;
      throw Error("Unexpected Twitch probe");
    } },
  };
  const exports: {getEventSourceStatuses?: ReturnType<typeof createSourceStatusReader>} = {};
  const code = ts.transpileModule(readFileSync("apps/web/src/lib/server/event-source-status.ts","utf8"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText;
  vm.runInNewContext(code, {exports,Date,require:(name:string)=>{
    assert.ok(name in dependencies,`Unexpected dependency: ${name}`);
    return dependencies[name];
  }});
  const read = exports.getEventSourceStatuses;
  assert.ok(read);
  for (const url of ["https://media.example.com/video.mp4","https://media.example.com/live.m3u8"]) {
    const target = eventDjTarget(url);
    assert.ok(target);
    const result = await read([target]);
    assert.equal(result[target.key].state,"unknown");
  }
  assert.equal(probes,0);
  const provider = eventDjTarget("vrcdn:aurora");
  assert.ok(provider);
  const result = await read([provider]);
  assert.equal(result[provider.key].state,"offline");
  assert.equal(probes,1);
});
