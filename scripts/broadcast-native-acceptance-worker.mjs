// Local acceptance instrumentation, mounted into the packaged worker image.
import { createInterface } from 'node:readline';
import { lookup } from 'node:dns/promises';
import { createEventWorker, createHttpControl } from '/app/workers/restream/event-worker.mjs';
import { createProgramRenderer } from '/app/workers/restream/program-renderer.mjs';
import { createEventOutputs } from '/app/workers/restream/output-sender.mjs';
import { createInputManager } from '/app/workers/restream/input-manager.mjs';
import { createSourceRelay } from '/app/workers/restream/source-relay.mjs';
import { createDirectMediaRelay } from '/app/workers/restream/direct-media-input.mjs';
import { createTwitchInput } from '/app/workers/restream/twitch-input.mjs';

const lines = createInterface({ input: process.stdin });
let initialized, release, armed = false;
const init = new Promise(resolve => { initialized = resolve; });
lines.on('line', line => {
  const message = JSON.parse(line);
  if (message.init) initialized(message.init);
  if (message.arm) armed = true;
  if (message.release) release?.();
});
const config = await init;
if (config.url !== 'http://127.0.0.1:3210' || !config.token || !config.identity?.sessionId)
  throw Error('Isolated local broadcast acceptance only.');
const addresses=await lookup('ingest.vrcdn.live',{all:true});
if(!addresses.length||addresses.some(entry=>entry.address!=='127.0.0.1'))
  throw Error('Native acceptance receiver must resolve exclusively to loopback.');
const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
const nativeControl = createHttpControl({url: config.url, token: config.token});
const relay = await createSourceRelay();
const direct = await createDirectMediaRelay();
const worker = createEventWorker({
  identity: config.identity,
  control: async (name, args, signal) => {
    let pausedAt;
    if (name === 'observeProgram' && armed && ['live', 'hold'].includes(args.state)) {
      armed = false;
      pausedAt = performance.now();
      await new Promise(resolve => { release = resolve; emit({event:'observation-paused'}); });
    }
    const result = await nativeControl(name, args, signal);
    if (name === 'observeProgram') emit({event:'observation-result',kind:result.kind,...(pausedAt===undefined?{}:{pausedMs:performance.now()-pausedAt})});
    return result;
  },
  createRenderer: createProgramRenderer,
  createOutputs: options => createEventOutputs({...options, env:{
    VRDEX_EVENT_MEDIA_OUTPUT_INGEST_SECRET_JSON: JSON.stringify({rtmpUrl:'rtmp://ingest.vrcdn.live/live',streamKey:'local-acceptance'}),
  }}),
  inputs: createInputManager({
    createVrcdnInput: args => relay.createInput(args),
    createDirectMediaInput: args => direct.createInput(args),
    createTwitchInput: args => createTwitchInput({...args,source:args.source.input}),
  }),
  // SSM/ECS admission remains separately qualified; this loop owns only local processes.
  checkEnabled: async () => true,
  maxSessionMs: 180000,
  metric: emit,
});
const watchdog = setInterval(() => worker.watchdog(), 50);
const poll = setInterval(() => void worker.tick(), 1000);
process.once('SIGTERM', () => { release?.(); void worker.stop(); });
try {
  await worker.start();
  while (!worker.getState().stopped) await new Promise(resolve => setTimeout(resolve, 50));
} finally {
  clearInterval(watchdog); clearInterval(poll);
  release?.(); await worker.stop(); relay.stop(); direct.stop();
  lines.close(); process.stdin.pause();
  emit({event:'native-worker-closed'});
}
