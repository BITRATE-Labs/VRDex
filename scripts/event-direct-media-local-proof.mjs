import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { createDirectMediaRelay } from "../workers/restream/direct-media-input.mjs";
import { createInputSupervisor } from "../workers/restream/input-supervisor.mjs";

// Offline synthetic origin only. Production DNS validation still runs before the
// injected transport connects to this fixture; no provider or hosted claim.
const directory = await mkdtemp(join(tmpdir(), "vrdex-direct-media-"));
const common = ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "4", "-threads", "2"];
let server, relay;
try {
  for (const ext of ["mp4", "webm", "ts", "m3u8"]) {
    execFileSync("ffmpeg", [...common, "-c:v", ext === "webm" ? "libvpx-vp9" : "libx264", "-g", "30", "-c:a", ext === "webm" ? "libopus" : "aac", ...(ext === "m3u8" ? ["-f", "hls", "-hls_time", "1", "-hls_list_size", "0"] : ext === "ts" ? ["-f", "mpegts"] : []), "-y", join(directory, `fixture.${ext}`)], { timeout: 30000 });
  }
  server = createServer(async (req, res) => {
    try {
      const data = await readFile(join(directory, basename(req.url)));
      let start = 0, end = data.length - 1;
      if (req.headers.range) {
        const match = req.headers.range.match(/^bytes=(\d+)-(\d*)$/);
        if (!match) return res.writeHead(416).end();
        start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end;
        if (start > end) return res.writeHead(416).end();
        res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${data.length}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
      } else res.writeHead(200, { "Content-Length": data.length, "Accept-Ranges": "bytes" });
      res.end(data.subarray(start, end + 1));
    } catch { res.writeHead(404).end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  relay = await createDirectMediaRelay({ resolveAddresses: async () => [{ address: "93.184.216.34", family: 4 }], requestSource: (url, options, callback) => request(`http://127.0.0.1:${server.address().port}${url.pathname}`, { signal: options.signal, headers: options.headers }, callback) });
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30", "-t", "4", "-c:v", "libx264", "-threads", "2", "-y", join(directory, "silent.mp4")]);
  for (const ext of ["mp4", "webm", "ts", "m3u8", "silent.mp4"]) {
    const file = ext === "silent.mp4" ? ext : `fixture.${ext}`;
    const handle = relay.createInput({ source: { input: { kind: "direct_media", url: `https://media.example.org/${file}` } } });
    const transport = await handle.transportReady;
    let ready = false, ended = false, selected = false;
    const input = createInputSupervisor({ source: { slotKey: "fixture", sourceId: ext, revision: 1, ...transport }, quality: { width: 160, height: 90, frameRate: 30 }, spawnProcess: (command, args, options) => { const child = spawn(command, args, options); let diagnostic = ""; child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk).slice(-6000); }); child.on("close", code => { if (code) console.error(diagnostic); }); return child; }, onObservation: state => { ready ||= state.ready; ended ||= Boolean(state.ended); } });
    try {
      input.start(); const deadline = Date.now() + 20000;
      while (!ended && Date.now() < deadline) { const state = input.getObservation(); ready ||= state.ready; ended ||= Boolean(state.ended); if (state.ready && transport.finite && !selected) {
        const pts = input.buffer.framePts;
        await new Promise(resolve => setTimeout(resolve, 1200));
        assert.equal(input.getObservation().ready, true, `${ext}: lost prepared readiness`);
        assert.equal(input.getObservation().progressing, false, `${ext}: prepared clip keeps playing`);
        assert.equal(input.buffer.framePts, pts, `${ext}: prepared clip advanced`);
        assert.equal(ended, false, `${ext}: clip finished before selection`);
        input.buffer.beginPlayback(); selected = true;
      } await new Promise(resolve => setTimeout(resolve, 20)); }
      assert.ok(ready, `${ext}: no decoded A/V readiness`); assert.ok(ended, `${ext}: no terminal EOF`);
      console.log(JSON.stringify({ format: ext, decodedAudioVideoReady: ready, terminalEof: ended, bytes: (await stat(join(directory, file))).size }));
    } finally { await input.stop(); await handle.dispose(); }
  }
} finally {
  relay?.stop(); server?.closeAllConnections(); server?.close(); await rm(directory, { recursive: true, force: true });
}
