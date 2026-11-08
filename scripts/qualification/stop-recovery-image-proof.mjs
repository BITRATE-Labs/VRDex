// External qualification driver. Never copied into the runtime image.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(process.env.PROOF_MODULE_ROOT ?? '/app');
const directory = resolve(process.env.PROOF_DIRECTORY ?? '/tmp/stop-recovery-proof');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const workerHash = digest(await readFile(join(root, 'workers/restream/event-worker.mjs')));
assert.equal(workerHash, 'ac0d2a604a8db900ca9c5af9bdc4565247ef2a17112b8da4acf368209a506b91', 'Wrong worker bytes');
const load = name => import(pathToFileURL(join(root, name)).href);
const { createEventWorker, createHttpControl } = await load('workers/restream/event-worker.mjs');
const { createProgramRenderer } = await load('workers/restream/program-renderer.mjs');
const { createEventOutputs } = await load('workers/restream/output-sender.mjs');
const { createProofControl, syntheticInputs } = await load('scripts/event-proof-fixtures.mjs');
const { createProcessOwner, processTable } = await load('scripts/event-proof-processes.mjs');
const { verifyProgramPackets } = await load('scripts/event-proof-metrics.mjs');
const { readTaskMetadata } = await load('workers/restream/task-metadata.mjs');
assert.equal(process.platform, 'linux', 'Qualification requires Linux process receipts');
const metadata = await readTaskMetadata();
assert.equal(metadata.container.ImageID, 'sha256:e51e2ac0708d5bd80583aa235d9c9f63809aca1fa1c2e2840381cec638441194', 'Wrong actual image');
await mkdir(directory, { recursive: false, mode: 0o700 });
const deadline = performance.now() + 170000;
const result = {
  schemaVersion: 1, sourceRevision: '89e2811e1c534e5cde172e8944528c4ab03eac2b',
  expectedImageDigest: 'sha256:e51e2ac0708d5bd80583aa235d9c9f63809aca1fa1c2e2840381cec638441194',
  workerHash, driverHash: digest(await readFile(new URL(import.meta.url))),
  actual: { imageId: metadata.container.ImageID, image: metadata.container.Image, taskArn: metadata.task.TaskARN, taskLimits: metadata.task.Limits, containerLimits: metadata.container.Limits },
  settings: { videoPreset: '720p30', audioBitrateKbps: 320, simulcast: false },
  scope: 'Real packaged worker, HTTP transport, renderer, decoder and sender; synthetic loopback authority, input and destination. No hosted Convex or provider acceptance.',
  passed: false, cases: [],
};
let interrupted = false;
process.once('SIGTERM', () => { interrupted = true; });
process.once('SIGINT', () => { interrupted = true; });
function alive() {
  assert(!interrupted, 'Interrupted');
  assert(performance.now() < deadline, 'Overall time bound');
}
async function until(test, step = async () => {}, timeout = 15000) {
  const end = performance.now() + timeout;
  while (!test()) {
    alive();
    assert(performance.now() < end, 'Phase time bound');
    await step();
    await sleep(50);
  }
}
async function descendants() {
  const rows = await processTable(), ids = new Set([process.pid]);
  for (let i = 0; i < rows.length; i++) {
    const before = ids.size;
    for (const row of rows) if (ids.has(row.parent)) ids.add(row.pid);
    if (before === ids.size) break;
  }
  return rows.filter(row => row.live && row.pid !== process.pid && ids.has(row.pid));
}

async function runCase(name, index) {
  const owner = createProcessOwner(), token = randomBytes(24).toString('hex');
  const port = 19661 + index * 3, recording = join(directory, `${name}.ts`);
  const started = performance.now(), events = [], metrics = [];
  const state = { reports: 0, leaseAt: 0, enabledAt: 0, ttl: 30000, fault: null, stop: null, ack: null, held: null };
  let worker, renderer, outputs, watchdog, enqueued = 0, fenceBytes, fenceAt, cleanup, failure;
  let server;
  const row = { name, passed: false };
  const mark = event => {
    assert(events.length < 500, 'Event bound');
    events.push({ event, atMs: Math.round(performance.now() - started) });
  };
  const configuration = {
    outputId: 'primary', mediaSettings: result.settings,
    outputs: [{ id: 'primary', type: 'vrcdn', credential: { secretRef: 'synthetic' },
      compliance: { sourceConsent: 'accepted', destinationAuthority: 'accepted', providerRules: 'accepted', rightsClearedMedia: 'accepted' } }],
    sessionDeadline: Date.now() + 160000, mode: 'automatic', policy: {}, currentSourceId: 'test',
    sources: [{ id: 'test', type: 'vrcdn_link', publicUrl: 'synthetic-only' }],
    slots: [{ slotKey: 'test', sourceId: 'test', startAt: Date.now() - 60000, endAt: Date.now() + 160000, available: true }],
  };
  const response = (res, value) => {
    if (!res.destroyed) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'success', value })); }
  };
  try {
    server = createServer(async (req, res) => {
      try {
        assert.equal(req.method, 'POST'); assert.equal(req.url, '/api/mutation');
        let body = '';
        for await (const chunk of req) { body += chunk; assert(Buffer.byteLength(body) <= 8192, 'Request byte bound'); }
        const request = JSON.parse(body), args = request.args;
        assert.equal(args.bridgeToken, token); assert.equal(args.protocolVersion, 2);
        const op = request.path.replace(/^eventMediaWorker:/, '');
        if (op === 'acquireSession' || op === 'renewSession') {
          state.leaseAt = performance.now();
          response(res, { granted: true, epoch: 1, serverNow: Date.now(), expiresAt: Date.now() + state.ttl, renewAfterMs: 5000, configuration });
        } else if (op === 'refreshConfiguration') {
          response(res, { granted: true, serverNow: Date.now(), configuration: { ...configuration, stopped: state.stop === 'configuration' } });
        } else if (op === 'claimCommands') {
          if (state.stop) mark('stop-claim');
          response(res, { granted: true, commands: state.stop ? [{ _id: 'stop-1', sequence: 1, commandType: 'stop_program' }] : [] });
        } else if (op === 'acknowledgeCommand') {
          mark('stop-ack-start');
          state.ack = { commandId: args.commandId, sequence: args.sequence, outcome: args.outcome, observedState: args.observedState };
          await sleep(450);
          response(res, { accepted: true });
          mark('stop-ack-response');
        } else if (op === 'observeProgram') {
          if (state.fault === 'deny') { state.fault = null; mark('denial'); res.writeHead(403); res.end(); }
          else if (state.fault === 'hold') { state.fault = null; state.held = res; mark('http-held'); }
          else { state.reports++; response(res, { accepted: true }); }
        } else if (op === 'observeOutputs') response(res, { accepted: true });
        else throw Error('Unexpected control operation');
      } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    owner.start('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-listen', '1', '-i', `rtmp://127.0.0.1:${port}/live/test-key`, '-c', 'copy', '-fs', '33554432', '-f', 'mpegts', '-y', recording], { stdio: 'ignore' });
    owner.start('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-re', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '30', '-c:a', 'aac', '-f', 'mpegts', `udp://127.0.0.1:${port + 1}?pkt_size=1316`], { stdio: 'ignore' });
    renderer = createProgramRenderer({ quality: '720p30', audioBitrateKbps: 320 });
    outputs = createEventOutputs({ configuration,
      resolveCredential: () => JSON.stringify({ rtmpUrl: 'rtmp://uk.ingest.vrcdn.live/live', streamKey: 'test-key' }),
      spawnForDestination: () => (command, args, options) => owner.start(command, [...args.slice(0, -1), `rtmp://127.0.0.1:${port}/live`], options),
    });
    const enqueue = outputs.enqueue.bind(outputs), stopNow = outputs.stopNow.bind(outputs);
    outputs.enqueue = chunk => { assert(fenceAt === undefined, 'Enqueue after publication fence'); enqueued += chunk.length; assert(enqueued < 33554432, 'Media byte bound'); enqueue(chunk); };
    outputs.stopNow = () => { if (fenceAt === undefined) { fenceAt = performance.now(); fenceBytes = enqueued; mark('publication-fence'); } stopNow(); };
    worker = createEventWorker({ identity: { eventId: 'synthetic', sessionId: name, workerId: name, epoch: 0 }, renderer, outputs,
      control: createProofControl(createHttpControl({ url: `http://127.0.0.1:${server.address().port}`, token })),
      inputs: syntheticInputs(async () => `udp://127.0.0.1:${port + 1}?fifo_size=1024&overrun_nonfatal=1`),
      checkEnabled: async () => { state.enabledAt = performance.now(); return true; },
      metric: metric => { assert(metrics.length < 500, 'Metric bound'); metrics.push({ ...metric, atMs: Math.round(performance.now() - started) }); },
    });
    await sleep(300);
    await worker.start();
    watchdog = setInterval(() => worker.watchdog(), 25);
    const tick = () => worker.tick();
    await until(() => state.reports >= 2 && renderer.getState().renderedSourceId === 'test' && outputs.getState().publishing, tick);
    assert(!worker.getState().stopped, 'Healthy startup required');
    mark('healthy');
    // Arm after both authority checks refreshed, leaving room for 3s timeout + 1s retry.
    await until(() => performance.now() - state.leaseAt < 750 && performance.now() - state.enabledAt < 750, tick, 12000);
    if (name === 'recovery-config-stop') {
      const before = { authorityUntil: worker.getState().authorityUntil, enabledAt: state.enabledAt, outputMs: renderer.getState().outputMs, enqueued, reports: state.reports };
      state.fault = 'hold';
      await tick();
      assert(state.held, 'Real HTTP request was held');
      const timeout = metrics.find(m => m.event === 'event_worker_control_failure' && m.operation === 'observeProgram' && m.category === 'timeout' && m.retrying);
      assert(timeout, 'Retryable HTTP timeout required');
      assert.equal(worker.getState().stopped, false);
      assert.equal(worker.getState().authorityUntil, before.authorityUntil, 'Failure extended lease');
      assert.equal(state.enabledAt, before.enabledAt, 'Failure refreshed kill-switch');
      assert(renderer.getState().outputMs > before.outputMs + 1500 && enqueued > before.enqueued, 'Encoded media must progress during timeout');
      const failedAt = performance.now();
      await until(() => state.reports > before.reports, tick, 2500);
      assert(!worker.getState().stopped, 'Recovery stayed active');
      assert(performance.now() < before.enabledAt + 10000 && performance.now() < before.authorityUntil, 'Recovered outside original authority');
      row.recovery = { timeoutMs: timeout.atMs, retryWaitMs: Math.round(performance.now() - failedAt), encodedAdvanceMs: renderer.getState().outputMs - before.outputMs, originalLeaseUnchangedAtFailure: true, originalKillCheckUnchangedAtFailure: true };
    }
    if (name === 'recovery-config-stop' || name === 'claimed-stop') {
      state.stop = name === 'claimed-stop' ? 'command' : 'configuration';
      let settled = false;
      const stopping = tick().finally(() => { settled = true; });
      await until(() => state.ack !== null, async () => {}, 2000);
      assert.equal(settled, false, 'Tick returned before delayed acknowledgment');
      assert.equal(worker.getState().stopped, true);
      assert(fenceAt !== undefined);
      assert.deepEqual(state.ack, { commandId: 'stop-1', sequence: 1, outcome: 'succeeded', observedState: 'ended' });
      await stopping;
      mark('stop-tick-complete');
      const eventAt = type => events.find(e => e.event === type)?.atMs;
      assert(eventAt('publication-fence') <= eventAt('stop-ack-start'));
      if (state.stop === 'configuration') assert(eventAt('publication-fence') <= eventAt('stop-claim'));
      assert(eventAt('stop-tick-complete') >= eventAt('stop-ack-response'));
      row.stop = { path: state.stop, acknowledged: state.ack, waitedForAcknowledgment: true };
    } else if (name === 'denial') {
      state.fault = 'deny';
      await tick();
      assert(worker.getState().stopped, 'Explicit denial must fence');
      assert(metrics.some(m => m.event === 'event_worker_control_failure' && m.category === 'request-rejected' && !m.retrying));
    } else {
      state.ttl = 1500;
      const previousLease = state.leaseAt;
      await until(() => state.leaseAt > previousLease, tick, 7000);
      const authorityUntil = worker.getState().authorityUntil;
      state.fault = 'hold';
      await tick();
      assert(worker.getState().stopped, 'Expired authority must fence during pending HTTP');
      assert.equal(worker.getState().authorityUntil, authorityUntil);
      assert(metrics.some(m => m.event === 'event_worker_authority_expired' && m.authority === 'lease'));
      row.expiry = { expiredByMs: metrics.find(m => m.event === 'event_worker_authority_expired').expiredByMs };
    }
    if (state.held) { response(state.held, { accepted: true }); mark('late-success-attempt'); }
    await sleep(500);
    await tick();
    assert(worker.getState().stopped && enqueued === fenceBytes, 'Late response revived publication');
    assert(metrics.some(m => m.event === 'event_worker_stopped' && m.reason === (name === 'denial' ? 'control-failed' : name === 'expiry' ? 'authority-expired' : 'operator-stop')));
    row.passed = true;
  } catch (error) {
    failure = error;
    row.failure = String(error.message).slice(0, 300);
  } finally {
    clearInterval(watchdog);
    if (state.held) response(state.held, { accepted: true });
    await worker?.stop();
    await outputs?.stop();
    await renderer?.stop();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    cleanup = await owner.close();
    const live = await descendants();
    assert.equal(live.length, 0, 'Live descendant after cleanup');
    row.cleanup = { ...cleanup, liveDescendants: live.length };
    row.enqueuedBytes = enqueued;
    row.events = events;
    row.metrics = metrics;
    row.wallMs = Math.round(performance.now() - started);
    if (!failure) {
      const bytes = await readFile(recording);
      assert(bytes.length > 0 && bytes.length <= 33554432);
      const probe = await verifyProgramPackets(recording);
      assert(probe.streams.some(s => s.codec_name === 'h264' && s.width === 1280 && s.height === 720));
      assert(probe.streams.some(s => s.codec_name === 'aac'));
      assert(probe.maxGap < 0.2, 'Packet discontinuity');
      assert(probe.maxGop <= 1.05, 'GOP bound');
      row.recording = { name: `${name}.ts`, bytes: bytes.length, sha256: digest(bytes), ...probe };
    }
    result.cases.push(row);
  }
  if (failure) throw failure;
}

try {
  for (const [index, name] of ['recovery-config-stop', 'claimed-stop', 'denial', 'expiry'].entries()) {
    alive();
    await runCase(name, index);
    console.log(JSON.stringify({ event: 'case-passed', name }));
  }
  result.passed = true;
} catch (error) {
  result.failure = String(error.message).slice(0, 300);
  process.exitCode = 1;
} finally {
  result.terminal = true;
  result.interrupted = interrupted;
  const json = JSON.stringify(result, null, 2);
  assert(Buffer.byteLength(json) < 262144, 'Receipt byte bound');
  await writeFile(join(directory, 'receipt.json'), json, { mode: 0o600 });
  console.log(JSON.stringify({ event: 'proof-terminal', passed: result.passed, cases: result.cases.map(c => ({ name: c.name, passed: c.passed })), failure: result.failure }));
}
