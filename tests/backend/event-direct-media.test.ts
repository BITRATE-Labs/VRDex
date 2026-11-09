import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { createDirectMediaRelay, validateDirectMediaEndpoint } from "../../workers/restream/direct-media-input.mjs";
import { canonicalDirectMediaUrl } from "../../convex/_directMediaUrl";

test("canonical direct media admits four containers and rejects unsafe and unsupported references", () => {
  for (const ext of ["mp4", "webm", "ts", "m3u8"]) {
    const url = `https://media.example.org/watch.${ext}`;
    assert.equal(canonicalDirectMediaUrl(url), url);
    assert.equal(validateDirectMediaEndpoint(url, true).href, url);
  }
  for (const url of ["http://media.example.org/a.mp4", "https://user:pass@media.example.org/a.mp4", "https://127.1/a.mp4", "https://[::1]/a.mp4", "https://localhost/a.mp4", "https://service.internal/a.mp4", "https://media.example.org/a.mp4?secret=token", "https://media.example.org/a.mp4#x", "https://media.example.org:444/a.mp4", "https://youtube.com/watch?v=1", "file:///a.mp4"]) {
    assert.throws(() => canonicalDirectMediaUrl(url)); assert.throws(() => validateDirectMediaEndpoint(url, true));
  }
});
async function fixture(handler: Parameters<typeof createServer>[0], options: Record<string, unknown> = {}) {
  const provider = createServer(handler); provider.listen(0, "127.0.0.1"); await once(provider, "listening");
  const calls: string[] = [], pins: unknown[][] = [];
  const relay = await createDirectMediaRelay({
    preflightHls: false,
    resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }],
    requestSource: (url: URL, opts: any, callback: (response: IncomingMessage) => void) => {
      calls.push(url.href);
      opts.lookup(url.hostname, { all: true }, (...args: unknown[]) => pins.push(args));
      return httpRequest(new URL(url.pathname, `http://127.0.0.1:${(provider.address() as any).port}`), { agent: false, signal: opts.signal, headers: opts.headers }, callback);
    }, ...options,
  });
  const handle = relay.createInput({ source: { input: { kind: "direct_media", url: "https://media.example.org/root.m3u8" } } });
  const { url } = await handle.transportReady;
  return { relay, handle, url, calls, pins, async close() { await handle.dispose(); relay.stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); } };
}
test("HLS rewrites nested playlists, segments, initialization maps and keys, pinning each fetch", async () => {
  const f = await fixture((req, res) => {
    if (req.url === "/root.m3u8") res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nchild.m3u8');
    else if (req.url === "/child.m3u8") res.end('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST');
    else res.end("safe bytes");
  });
  try {
    const root = await (await fetch(f.url)).text(); assert.ok(!root.includes("media.example.org"));
    const child = root.split("\n").at(-1)!; assert.match(child, /^http:\/\/127\.0\.0\.1:/);
    const manifest = await (await fetch(child)).text();
    for (const local of [...manifest.matchAll(/URI="([^"]+)"/g)].map(x => x[1]!).concat(manifest.split("\n").filter(x => x.startsWith("http:")))) assert.equal(await (await fetch(local)).text(), "safe bytes");
    assert.equal(f.calls.length, 5); assert.equal(f.pins.length, 5);
    for (const pin of f.pins) assert.deepEqual(pin, [null, [{ address: "93.184.216.34", family: 4 }]]);
  } finally { await f.close(); }
});
test("redirects and nested requests cannot reach private or rebound DNS answers", async () => {
  let resolutions = 0;
  const f = await fixture((req, res) => {
    if (req.url === "/root.m3u8") res.end("#EXTM3U\nprivate.ts"); else res.end("must not reach");
  }, { resolveAddresses: async () => [{ address: ++resolutions === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }] });
  try {
    const manifest = await (await fetch(f.url)).text(); assert.equal((await fetch(manifest.split("\n")[1]!)).status, 502); assert.equal(f.calls.length, 1);
  } finally { await f.close(); }
  const redirect = await fixture((_req, res) => res.writeHead(302, { location: "https://127.0.0.1/private.ts" }).end());
  try { assert.equal((await fetch(redirect.url)).status, 502); assert.equal(redirect.calls.length, 1); } finally { await redirect.close(); }
});
test("mixed DNS answers, malformed playlist references and resource bounds fail closed", async () => {
  const mixed = await fixture((_req, res) => res.end("bad"), { resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }] });
  try { assert.equal((await fetch(mixed.url)).status, 502); assert.equal(mixed.calls.length, 0); } finally { await mixed.close(); }
  for (const playlist of ['#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=file:///etc/passwd', '#EXTM3U\nhttp://127.0.0.1/private.ts', '#EXTM3U\na.ts\nb.ts']) {
    const f = await fixture((_req, res) => res.end(playlist), { limits: { routes: 2 } });
    try { assert.equal((await fetch(f.url)).status, 502); } finally { await f.close(); }
  }
  const big = await fixture((_req, res) => res.end('#EXTM3U\n' + 'x'.repeat(100)), { limits: { manifestBytes: 32 } });
  try { assert.equal((await fetch(big.url)).status, 502); } finally { await big.close(); }
});
test("acquisition disposal preserves local transport ownership", async () => {
  const f = await fixture((_req, res) => res.end("unused"));
  const second = f.relay.createInput({ source: { input: { kind: "direct_media", url: "https://media.example.org/video.mp4" } } });
  try {
    assert.throws(() => f.relay.createInput({ source: { input: { kind: "direct_media", url: "https://media.example.org/third.mp4" } } }));
    assert.equal((await second.transportReady).finite, true);
    const url = (await second.transportReady).url; await second.dispose(); assert.equal((await fetch(url)).status, 404);
  } finally { await second.dispose(); await f.close(); }
});
test("HLS finite classification follows master variants and leaves live playlists streaming", async () => {
  for (const finite of [false, true]) {
    const f = await fixture((req, res) => res.end(req.url === "/root.m3u8" ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nchild.m3u8' : '#EXTM3U\n#EXTINF:1,\na.ts\n' + (finite ? '#EXT-X-ENDLIST' : '')), { preflightHls: true });
    try { assert.equal((await f.handle.transportReady).finite, finite); assert.equal(f.calls.length, 2); } finally { await f.close(); }
  }
});
test("disposal retains acquisition capacity while physical DNS is pending", async () => {
  let finish!: (value: { address: string; family: number }[]) => void;
  let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const f = await fixture((_req, res) => res.end("unused"), { resolveAddresses: () => { began(); return new Promise(resolve => { finish = resolve; }); } });
  try {
    const response = fetch(f.url).catch(() => undefined); await started;
    let closed = false; const disposal = f.handle.dispose().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(closed, false);
    finish([{ address: "93.184.216.34", family: 4 }]); await disposal; await response;
    assert.equal(closed, true); assert.equal(f.calls.length, 0);
  } finally { await f.close(); }
});
test("redirect loops, steering and stalled requests have bounded failure", async () => {
  const loop = await fixture((_req, res) => res.writeHead(302, { location: "/root.m3u8" }).end());
  try { assert.equal((await fetch(loop.url)).status, 502); assert.equal(loop.calls.length, 4); } finally { await loop.close(); }
  const steering = await fixture((_req, res) => res.end('#EXTM3U\n#EXT-X-CONTENT-STEERING:SERVER-URI="steering.json"'));
  try { assert.equal((await fetch(steering.url)).status, 502); } finally { await steering.close(); }
  const stalled = await fixture((_req, _res) => {}, { limits: { requestMs: 25 } });
  try { assert.equal((await fetch(stalled.url)).status, 502); } finally { await stalled.close(); }
});
test("chunked HLS disguised as a segment is rewritten at the actual fetch boundary", async () => {
  const f = await fixture((req, res) => {
    if (req.url === "/root.m3u8") res.end('#EXTM3U\n#EXTINF:1,\nchild.ts');
    else { res.write('#'); setTimeout(() => res.end('EXTM3U\nhttps://127.0.0.1/private.ts'), 5); }
  });
  try { const root = await (await fetch(f.url)).text(); assert.equal((await fetch(root.split("\n").at(-1)!)).status, 502); } finally { await f.close(); }
});
test("finite video-only preroll resumes on selection and never reconnects after completion", async () => {
  const { createInputSupervisor } = await import("../../workers/restream/input-supervisor.mjs");
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  let now = 0;
  const children: any[] = [], signals: string[] = [], argumentsByChild: string[][] = [];
  const input = createInputSupervisor({ source: { slotKey: "clip", sourceId: "clip", url: "http://127.0.0.1:1234/clip.mp4", transport: "direct_media", demuxer: "mov", finite: true }, quality: { width: 2, height: 2, frameRate: 30 }, clock: () => now, spawnProcess: (_command: string, args: string[]) => {
    const child = new EventEmitter() as any; children.push(child); argumentsByChild.push(args);
    child.stdio = [null, null, ...Array.from({ length: 4 }, () => new PassThrough())];
    child.kill = (signal: string) => { signals.push(signal); if (signal === "SIGKILL") queueMicrotask(() => child.emit("close", null)); return true; };
    return child;
  } });
  try {
    input.start(); children[0].stdio[2].write("Stream map '0:a:0' matches no streams.\n"); children[0].emit("close", 1);
    assert.equal(children.length, 2); assert.equal(argumentsByChild[1]!.includes("0:a:0"), false);
    const frame = (index: number) => { children[1].stdio[2].write(`[Parsed_showinfo_1 @ fixture] n: ${index} pts: ${index * 3000} pts_time:0\n`); children[1].stdio[3].write(Buffer.alloc(6)); };
    frame(0); now = 34; frame(1); assert.equal(input.getObservation().ready, true); assert.deepEqual(signals, ["SIGSTOP"]);
    now = 10000; assert.equal(input.getObservation().ready, true); assert.equal(input.getObservation().progressing, false);
    input.buffer.beginPlayback(); assert.deepEqual(signals, ["SIGSTOP", "SIGCONT"]);
    now++; frame(2); assert.equal(input.getObservation().progressing, true);
    children[1].emit("close", 1); assert.equal(input.getObservation().ended, true); assert.equal(input.getObservation().ready, false);
    input.start(); assert.equal(children.length, 2);
  } finally { await input.stop(); }
});
