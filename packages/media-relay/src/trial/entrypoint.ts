import { createServer } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { startNativeTrial } from "./runtime";

/** No application/admin credentials are accepted over HTTP. Only existing viewer capabilities. */
export async function bootNativeTrial(env: NodeJS.ProcessEnv = process.env, start = startNativeTrial) {
  const port = Number(env.PORT ?? "3000");
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error("Invalid trial port");
  const runtime = await start(env);
  const origin = JSON.parse(env.MEDIA_RELAY_TRIAL_CONFIG!).origin as string;
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 3000, headersTimeout: 3000 }, (req, res) => {
    if (!req.url || req.url.length > 2048 || !["GET", "OPTIONS"].includes(req.method ?? "")) { res.writeHead(400).end(); return; }
    const headers = new Headers();
    if (typeof req.headers.origin === "string") headers.set("Origin", req.headers.origin);
    void runtime.gateway(new Request(`${origin}${req.url}`, { method: req.method, headers })).then(async reply => {
      const outputHeaders: Record<string, string> = {};
      reply.headers.forEach((value, key) => { outputHeaders[key] = value; });
      res.writeHead(reply.status, outputHeaders);
      res.end(Buffer.from(await reply.arrayBuffer()));
    }).catch(() => { if (!res.headersSent) res.writeHead(503); res.end(); });
  });
  server.maxConnections = 8;
  server.setTimeout(3000, socket => socket.destroy());
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => {
    server.closeAllConnections();
    await Promise.all([runtime.stop(), new Promise<void>(resolve => server.close(() => resolve()))]);
  })();
  try { server.listen(port, "0.0.0.0"); await once(server, "listening"); }
  catch (error) { await stop(); throw error; }
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });
  const config = JSON.parse(env.MEDIA_RELAY_TRIAL_CONFIG!) as { expiresAt: number };
  const deadline = setTimeout(() => { void stop(); }, Math.max(0, config.expiresAt - Date.now()));
  server.once("close", () => clearTimeout(deadline));
  return { ...runtime, stop };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void bootNativeTrial().catch(() => { process.stderr.write('{"kind":"native_trial_boot_failed"}\n'); process.exitCode = 1; });
}


export { createPackager } from "../worker/packager";
export { createNativeTrialSource } from "./source";
export { createNativeTrialStorage } from "./storage";
export { verifyNativeTrialScratch } from "./scratch";
export { createPublisher } from "../worker/publisher";
