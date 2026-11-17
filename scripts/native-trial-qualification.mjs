import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer, request as requestHttp } from 'node:http';
import { once } from 'node:events';
import { readdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { createPackager, createNativeTrialSource, createNativeTrialStorage, createPublisher, verifyNativeTrialScratch, completeNativeTrialStop, createNativeTrialGateway, bootNativeTrial } = await import(pathToFileURL(resolve(process.argv[2])).href);
const directory = process.argv[3];
await verifyNativeTrialScratch(directory);
const source = { streamKey: 'vrcdn/Alpha/1', streamId: 'Alpha', inputFormat: 'vrcdn_fmp4', packagingVersion: 1 };
const children = new Set(); let connections = 0;
const server = createServer((_req, res) => {
  connections++;
  const child = spawn('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-re','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','35','-c:v','libx264','-preset','ultrafast','-threads','1','-b:v','300k','-g','50','-keyint_min','50','-sc_threshold','0','-bf','0','-c:a','aac','-b:a','96k','-frag_duration','200000','-movflags','frag_keyframe+empty_moov+default_base_moof','-f','mp4','pipe:1'], { stdio: ['ignore','pipe','ignore'] });
  children.add(child); child.once('close', () => children.delete(child));
  res.writeHead(200, {'Content-Type':'video/mp4'}); child.stdout.pipe(res);
  res.once('close', () => child.kill('SIGTERM'));
});
server.listen(0,'127.0.0.1'); await once(server,'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const relay = async () => ({ createInput() { return { transportReady: Promise.resolve({ url: origin }), async dispose() {} }; }, stop() {} });
const results = [];
try {
  for (const limited of [false,true]) {
    const snapshots = new Map(), failures = [];
    const abort = new AbortController(); let limitHits = 0, handle;
    const input = createNativeTrialSource({ source, maxBytes: limited ? 32768 : 8*1024**2, createRelay: relay, onLimit() { limitHits++; abort.abort(); } });
    const storage = createNativeTrialStorage({ streamKey: source.streamKey, maxBytes: 32*1024**2 });
    const now = Date.now();
    const lease = { streamKey: source.streamKey, workerId:'fixture', epoch:1, serverNow:now, expiresAt:now+60000, renewAfterMs:10000 };
    const publisher = createPublisher({ storage, isCurrent: () => !abort.signal.aborted, commitSnapshot: async ({snapshot}) => { snapshots.set(snapshot.rendition,snapshot); } });
    const deadline = setTimeout(() => abort.abort(), 20000);
    try {
      handle = await createPackager({ createRelay: input.create })({ source, epoch:1, directory, signal:abort.signal,
        onSnapshot: (snapshot,signal) => publisher.publishSnapshot({ lease, snapshot, segments:{directory}, signal }),
        onFailure: failure => failures.push(failure.kind),
      });
      while (!abort.signal.aborted && (limited || [...snapshots.values()].filter(s => s.segments.length >= 3).length !== 2)) await new Promise(r => setTimeout(r,100));
      if (limited) assert.equal(limitHits,1);
      else {
        assert.equal(snapshots.size,2); assert.deepEqual(failures,[]);
        for (const [rendition,snapshot] of snapshots) {
          const data = storage.readSegment(snapshot.segments.at(-1).objectKey); assert(data);
          const path = join(directory,`probe-${rendition}.ts`); await writeFile(path,data);
          const probe = JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name','-of','json',path],{timeout:5000}));
          assert(probe.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'));
          assert.equal(probe.streams.some(s=>s.codec_type==='video'),rendition==='video');
          execFileSync('ffmpeg',['-v','error','-i',path,'-t','1','-f','null','-'],{timeout:5000});
          await unlink(path);
        }
      }
      results.push({ limited, limitHits, acquisitions: input.acquisitions(), forwardedBytes: input.upstreamBytes(), retainedBytes: storage.bytes(), renditions: [...snapshots.keys()] });
    } finally {
      clearTimeout(deadline); abort.abort();
      await completeNativeTrialStop({stopWorker:async()=>{},attempts:handle?[Promise.resolve(handle)]:[],
        acknowledge:async()=>{assert.deepEqual(await readdir(directory),[]);},close:storage.close});
    }
    for (let i=0;i<20&&children.size;i++) await new Promise(r=>setTimeout(r,50));
    assert.equal(children.size,0); assert.deepEqual(await readdir(directory),[]);
  }
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const now=Date.now();let authority=0,exhausted=0;
  const config={version:1,trialId:'trial',operatorUserId:'operator',source,context:{kind:'profile',profileId:'profile',linkId:'Alpha'},origin:'https://trial.invalid',origins:['https://app.invalid'],startsAt:now-1,expiresAt:now+10000,limits:{upstreamBytes:1024,payloadBytes:1024,requests:3,retainedBytes:1024},worker:{workerId:'worker',workerEpoch:1,allocation:{cpuUnits:1024,memoryMiB:2048,evidenceId:'trial-proof'},maxSources:1,draining:false}};
  const gateway=createNativeTrialGateway({config,clock:Date.now,authorize:async()=>{authority++;return{kind:'denied'};},readSnapshot:()=>undefined,readSegment:()=>undefined,recordDemand:async()=>{},onExhausted:()=>{exhausted++;}});
  const http=await bootNativeTrial({PORT:String(port),MEDIA_RELAY_TRIAL_CONFIG:JSON.stringify(config)},async()=>({gateway,stop:async()=>{},upstreamBytes:()=>0,retainedBytes:()=>0,acquisitions:()=>0}));
  try{
    const malformed=await new Promise((resolve,reject)=>{
      const request=requestHttp({hostname:'127.0.0.1',port,path:'*%',method:'GET'},response=>{response.resume();response.once('end',()=>resolve(response.statusCode));});
      request.once('error',reject);request.end();
    });
    assert.equal(malformed,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/p/grant/audio/index.m3u8`,{method:'POST'})).status,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/${'x'.repeat(2049)}`)).status,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/p/grant/audio/index.m3u8`)).status,429);
    assert.equal(authority,0);assert.equal(exhausted,1);
  }finally{await http.stop();}
  assert.equal(connections,2);
  console.log(JSON.stringify({ kind:'native_trial_synthetic', results, httpCapPassed:true, cleanup:true, nodeRssBytes:process.memoryUsage().rss }));
} finally {
  for (const child of children) child.kill('SIGKILL');
  server.closeAllConnections(); await new Promise(r=>server.close(r));
}
