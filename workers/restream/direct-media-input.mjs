import { createServer } from "node:http";
import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { once } from "node:events";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isPublicIPv4 } from "./source-relay.mjs";

export function validateDirectMediaEndpoint(value, root = false) {
  if (typeof value !== "string" || value.length > 2048) throw Error("Unsupported direct media endpoint");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || (url.port && url.port !== "443") || isIP(url.hostname) || !url.hostname.includes(".") || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw Error("Unsupported direct media endpoint");
  if (root && !/\.(mp4|webm|ts|m3u8)$/i.test(url.pathname)) throw Error("Unsupported direct media format");
  return url;
}
const publicAddress = (address) => isPublicIPv4(address) && !/^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(address);
/** Every upstream fetch (including redirects, keys, maps, and playlist children)
 * resolves and pins public IPv4. FFmpeg receives opaque loopback URLs only.
 * Two acquisition sessions, eight concurrent requests per session, 1024 child
 * routes, 1 MiB manifests, 512 MiB responses, 16 GiB/session and 12h lifetime.
 */
export async function createDirectMediaRelay({ resolveAddresses = lookup, requestSource = request, preflightHls = true, limits = {} } = {}) {
  const bound = { routes: 1024, parallel: 8, manifestBytes: 1024 * 1024, responseBytes: 512 * 1024 * 1024, sessionBytes: 16 * 1024 ** 3, lifetimeMs: 12 * 3600000, requestMs: 12 * 3600000, ...limits };
  const routes = new Map(), sessions = new Set();
  const suffix = url => url.pathname.match(/\.(m3u8|ts|m4s|mp4|aac|webm|key)$/i)?.[0] ?? ".ts";
  let stopped = false;
  const server = createServer(async (req, res) => {
    const route = routes.get(req.url);
    if (stopped || !route || !["GET", "HEAD"].includes(req.method)) return res.writeHead(404).end();
    const session = route.session;
    if (session.closed || Date.now() >= session.expiresAt || session.active.size >= bound.parallel || session.bytes >= bound.sessionBytes) return res.writeHead(429).end();
    route.lastUsedAt = Date.now();
    route.active = (route.active ?? 0) + 1;
    const abort = new AbortController();
    let completed; abort.closed = new Promise(resolve => { completed = resolve; });
    session.active.add(abort);
    const timer = setTimeout(() => abort.abort(), Math.min(bound.requestMs, session.expiresAt - Date.now())); timer.unref?.();
    const close = () => abort.abort(); res.once("close", close);
    const routeFor = (value) => {
      const url = validateDirectMediaEndpoint(value);
      let path = session.urls.get(url.href);
      if (!path) {
        for (const [oldUrl, oldPath] of session.urls) {
          const old = routes.get(oldPath);
          if (oldPath !== session.root && old && !old.active && Date.now() - old.lastUsedAt > 60000) { routes.delete(oldPath); session.urls.delete(oldUrl); }
        }
        if (session.urls.size >= bound.routes) throw Error("Playlist route limit");
        path = `/${randomUUID()}${suffix(url)}`;
        session.urls.set(url.href, path); routes.set(path, { url, session, lastUsedAt: Date.now(), active: 0 });
      }
      routes.get(path).lastUsedAt = Date.now();
      return `http://127.0.0.1:${server.address().port}${path}`;
    };
    async function fetchPinned(url, redirects = 0) {
      validateDirectMediaEndpoint(url.href);
      const dns = Promise.resolve().then(() => resolveAddresses(url.hostname, { all: true, family: 4 }));
      session.dns.add(dns); dns.then(() => session.dns.delete(dns), () => session.dns.delete(dns));
      let dnsTimer;
      const addresses = await Promise.race([
        dns,
        new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(Error("DNS timeout")), 2000); dnsTimer.unref?.(); }),
        new Promise((_, reject) => abort.signal.addEventListener("abort", () => reject(Error("Request expired")), { once: true })),
      ]);
      clearTimeout(dnsTimer);
      if (abort.signal.aborted || !addresses.length || addresses.some(a => !publicAddress(a.address))) throw Error("Source address denied");
      const response = await new Promise((resolve, reject) => {
        const range = req.headers.range;
        if (range && !/^bytes=\d*-\d*$/.test(range)) return reject(Error("Invalid range"));
        const upstream = requestSource(url, { method: "GET", agent: false, signal: abort.signal,
          headers: range ? { Range: range } : {},
          lookup: (_host, options, callback) => options.all ? callback(null, [{ address: addresses[0].address, family: 4 }]) : callback(null, addresses[0].address, 4),
        }, resolve);
        let closed; const closing = new Promise(resolve => { closed = resolve; }); session.sockets.add(closing);
        upstream.once("close", () => { session.sockets.delete(closing); closed(); });
        upstream.setTimeout(5000, () => upstream.destroy(Error("Source stalled")));
        upstream.once("error", reject); upstream.end();
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (redirects >= 3 || !response.headers.location) throw Error("Redirect limit");
        return fetchPinned(validateDirectMediaEndpoint(new URL(response.headers.location, url).href), redirects + 1);
      }
      if (![200, 206].includes(response.statusCode)) { response.destroy(); throw Error("Source unavailable"); }
      return { response, url };
    }
    try {
      const { response, url } = await fetchPinned(route.url);
      const contentType = String(response.headers["content-type"] ?? "").split(";")[0].toLowerCase();
      if (!response.readableLength && !response.readableEnded) await once(response, "readable", { signal: abort.signal });
      const prefix = response.read(Math.min(1024, response.readableLength));
      if (prefix) response.unshift(prefix);
      const manifest = prefix?.toString("utf8").trimStart().startsWith("#EXTM3U") || /\.m3u8$/i.test(url.pathname) || ["application/vnd.apple.mpegurl", "application/x-mpegurl"].includes(contentType);
      let bytes = 0;
      const meter = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length; session.bytes += chunk.length;
        callback(bytes > (manifest ? bound.manifestBytes : bound.responseBytes) || session.bytes > bound.sessionBytes ? Error("Media byte limit") : null, chunk);
      } });
      if (manifest) {
        let text = "";
        meter.setEncoding("utf8"); meter.on("data", chunk => { text += chunk; });
        await pipeline(response, meter, { signal: abort.signal });
        if (!text.trimStart().startsWith("#EXTM3U")) throw Error("Invalid playlist");
        text = text.split(/\r?\n/).map(line => {
          if (!line.trim()) return line;
          if (!line.startsWith("#")) return routeFor(new URL(line.trim(), url).href);
          // Reject URI forms the rewriter cannot prove safe, rather than allowing
          // a demuxer to follow an unvalidated network reference.
          const rewritten = line.replace(/URI="([^"\r\n]+)"/g, (_match, uri) => `URI="${routeFor(new URL(uri, url).href)}"`);
          if (/(?:^|[, :])URI=(?!")/.test(rewritten) || /(?:https?|file|data|ftp|tcp|udp):/i.test(rewritten.replace(/URI="http:\/\/127\.0\.0\.1:\d+\/[^\"]+"/g, ""))) throw Error("Unsupported playlist reference");
          return rewritten;
        }).join("\n");
        res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" }).end(text);
      } else {
        const headers = { "Content-Type": contentType || "application/octet-stream", "Cache-Control": "no-store" };
        for (const name of ["content-length", "content-range", "accept-ranges"]) if (response.headers[name]) headers[name] = response.headers[name];
        res.writeHead(response.statusCode, headers);
        if (req.method === "HEAD") { response.destroy(); res.end(); }
        else await pipeline(response, meter, res, { signal: abort.signal });
      }
    } catch { if (!res.headersSent) res.writeHead(502).end(); else res.destroy(); }
    finally { clearTimeout(timer); res.removeListener("close", close); session.active.delete(abort); abort.abort(); completed(); route.active--; }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  function dispose(session) {
    if (session.disposal) return session.disposal;
    session.closed = true;
    for (const controller of session.active) controller.abort();
    for (const path of session.urls.values()) routes.delete(path);
    session.disposal = Promise.allSettled([...session.active].map(controller => controller.closed).concat([...session.sockets], [...session.dns])).then(() => { sessions.delete(session); });
    return session.disposal;
  }
  return {
    createInput({ source, signal }) {
      if (stopped || sessions.size >= 2 || source.input?.kind !== "direct_media") throw Error("Direct media acquisition unavailable");
      const url = validateDirectMediaEndpoint(source.input.url, true);
      const session = { urls: new Map(), active: new Set(), sockets: new Set(), dns: new Set(), bytes: 0, closed: false, expiresAt: Date.now() + bound.lifetimeMs };
      const path = `/${randomUUID()}${suffix(url)}`;
      session.root = path;
      session.urls.set(url.href, path); routes.set(path, { url, session, lastUsedAt: Date.now(), active: 0 }); sessions.add(session);
      const release = () => { signal?.removeEventListener("abort", release); return dispose(session); };
      signal?.addEventListener("abort", release, { once: true }); if (signal?.aborted) void release();
      const localUrl = `http://127.0.0.1:${server.address().port}${path}`;
      const classifyFiniteHls = async () => {
        const probeSignal = AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(10000)]);
        let count = 0;
        const visit = async (local, depth = 0) => {
          if (++count > 16 || depth > 4 || !local.startsWith(`http://127.0.0.1:${server.address().port}/`)) throw Error("Playlist classification bound");
          const response = await fetch(local, { signal: probeSignal });
          if (!response.ok) throw Error("Playlist unavailable");
          const text = await response.text();
          if (text.includes("#EXT-X-ENDLIST")) return true;
          if (!text.includes("#EXT-X-STREAM-INF:")) return false;
          const children = text.split("\n").filter(line => line.startsWith("http:"));
          if (!children.length) return false;
          for (const child of children) if (!await visit(child, depth + 1)) return false;
          return true;
        };
        return visit(localUrl);
      };
      const transportReady = Promise.resolve().then(async () => ({ url: `http://127.0.0.1:${server.address().port}${path}`, transport: "direct_media", demuxer: ({ mp4: "mov", webm: "matroska", ts: "mpegts", m3u8: "hls" })[url.pathname.split(".").at(-1).toLowerCase()], finite: preflightHls && /\.m3u8$/i.test(url.pathname) ? await classifyFiniteHls() : /\.(mp4|webm)$/i.test(url.pathname) }));
      void transportReady.catch(() => {});
      return { transportReady, dispose: release };
    },
    stop() { stopped = true; for (const session of sessions) void dispose(session); server.closeAllConnections(); server.close(); },
  };
}
